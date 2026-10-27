import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {parseRosterRows,csvRows,importRoster} from '../core.js';
import {validEmail,emailPlan,deliveryKey,emailConnection,hashText,sendEmailJob,pdfBase64} from '../email.js';
import {createMailer} from '../mail-service/worker.mjs';

const student='01234567',token='eg_'+'a'.repeat(45),origin='https://navinbio.github.io';
const batch=()=>({id:'exam1',exam:'BI 301 exam 1',key:'A',count:1,bonusKey:'',roster:{students:{[student]:'Example Student'},emails:{[student]:'student@example.edu'}}});
const photo=()=>({id:'photo1',status:'done',answers:{1:'A'},result:{identity:{status:'clear',value:student},side:1,rows:[{question:1,status:'clear',selected:'A'}],bonus_rows:[]}});
const job=()=>({jobId:'a'.repeat(64),studentId:student,to:'student@example.edu',name:'Example Student',exam:'BI 301 exam 1',pdf:btoa('%PDF-1.7\n synthetic testing only')});
async function fixture(provider=async()=>Response.json({id:'provider-1'})){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../mail-service/schema.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO devices (id,token_hash,reply_to) VALUES (?,?,?)').run('device1',await hashText(token),'professor@example.edu');
 const DB={prepare(sql){return {bind(...values){return {async first(){return db.prepare(sql).get(...values)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}};}};}};
 const env={DB,ALLOWED_ORIGINS:origin,FROM_ADDRESS:'Exam Grader <grades@example.edu>',RESEND_API_KEY:'TEST_ONLY'},handler=createMailer(provider);
 const send=(body=job(),access=token,site=origin)=>handler.fetch(new Request('https://mail.example.edu/send',{method:'POST',headers:{Origin:site,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
 return {db,env,send,handler};
}
test('roster import retains email columns and leading zeros without changing existing name-only parser',async()=>{
 const raw='Student ID,Full Name,Email Address\n01234567,Example Student,student@example.edu';
 assert.deepEqual(parseRosterRows(csvRows(raw)),{[student]:'Example Student'});
 assert.deepEqual(parseRosterRows(csvRows(raw),true).emails,{[student]:'student@example.edu'});
 const [roster]=await importRoster({name:'class.csv',size:raw.length,text:async()=>raw});assert.equal(roster.emails[student],'student@example.edu');
 assert.throws(()=>parseRosterRows(csvRows('ID,Name,Email,Student Email\n01234567,Name,a@b.edu,c@d.edu'),true),/one student email/);
});
test('email plan includes only matched complete students with valid unique roster emails',()=>{
 const b=batch(),p=photo();assert.equal(emailPlan([p],b).recipients[0].to,'student@example.edu');
 for(const value of ['', 'bad', 'x@example.edu\nBcc: other@example.edu']){b.roster.emails[student]=value;assert.equal(emailPlan([p],b).recipients.length,0);}
 b.roster.emails={[student]:'same@example.edu','12345678':'SAME@example.edu'};assert.match(emailPlan([p],b).skipped[0].reason,/shared/);
 b.roster.emails[student]='student@example.edu';p.result.identity.status='review';assert.equal(emailPlan([p],b).recipients.length,0);
 p.result.identity.status='clear';b.guest=true;assert.equal(emailPlan([p],b).recipients.length,0);
});
test('delivery identity is stable for unchanged grades and changes with recipient, grade or answer visibility',async()=>{
 const b=batch(),g=emailPlan([photo()],b).recipients[0].group,k=await deliveryKey(b,g,'student@example.edu',true);
 assert.equal(k,await deliveryKey(b,g,'STUDENT@example.edu',true));assert.notEqual(k,await deliveryKey(b,g,'student@example.edu',false));
 assert.notEqual(k,await deliveryKey(b,{...g,answers:['B']},'student@example.edu',true));assert.notEqual(k,await deliveryKey(b,g,'other@example.edu',true));
 assert.equal(k,await deliveryKey({...b,id:'restored',emailIdentity:b.id},{...g,signature:'new photo IDs'},'student@example.edu',true));
});
test('email rejects multiple addresses, header injection and insecure connections',()=>{
 for(const email of ['a@b.edu,c@d.edu','a@b.edu\n','a@b.edu\rBcc:x@y.edu','a..b@example.edu'])assert.equal(validEmail(email),false);
 assert.throws(()=>emailConnection({url:'http://bad.example',token}),/secure/);assert.throws(()=>emailConnection(null),/not connected/);
 assert.equal(pdfBase64(new TextEncoder().encode('%PDF-1.7')),btoa('%PDF-1.7'));
});
test('mail service requires authorized device and permitted origin, with no provider call on rejection',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return Response.json({id:'x'});});
 assert.equal((await f.send(job(),'invalid')).status,401);assert.equal((await f.send(job(),token,'https://evil.example')).status,403);
 assert.equal((await f.send({...job(),to:'a@b.edu,c@d.edu'})).status,400);assert.equal(calls,0);f.db.close();
});
test('each send contains only one recipient, one PDF and a server-controlled sender and reply address',async()=>{
 let payload,headers;const f=await fixture(async(url,options)=>{payload=JSON.parse(options.body);headers=options.headers;assert.equal(url,'https://api.resend.com/emails');return Response.json({id:'x'});});
 assert.equal((await f.send()).status,200);assert.deepEqual(payload.to,['student@example.edu']);assert.equal(payload.attachments.length,1);assert.equal(payload.attachments[0].content,job().pdf);assert.equal(payload.from,f.env.FROM_ADDRESS);assert.equal(payload.reply_to,'professor@example.edu');assert.ok(headers['Idempotency-Key']);assert.equal(payload.cc,undefined);assert.equal(payload.bcc,undefined);f.db.close();
});
test('repeated clicks and retries after acceptance never call the provider again',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;return Response.json({id:'x'});});
 assert.equal((await f.send()).status,200);assert.equal((await f.send()).status,200);assert.equal(calls,1);assert.equal((await(await f.send()).json()).alreadyAccepted,true);f.db.close();
});
test('lost provider response safely retries the same idempotency key and blocks changed payloads',async()=>{
 const keys=[];const f=await fixture(async(url,o)=>{keys.push(o.headers['Idempotency-Key']);if(keys.length===1)throw Error('lost response');return Response.json({id:'x'});});
 assert.equal((await f.send()).status,503);assert.equal((await f.send({...job(),to:'other@example.edu'})).status,409);assert.equal((await f.send()).status,200);assert.equal(keys[0],keys[1]);f.db.close();
});
test('concurrent submissions cannot send the same sheet twice',async()=>{
 let finish,calls=0;const f=await fixture(async()=>{calls++;return new Promise(resolve=>{finish=()=>resolve(Response.json({id:'x'}));});});
 const a=f.send();while(!finish)await new Promise(resolve=>setImmediate(resolve));const b=await f.send();assert.equal(b.status,409);finish();assert.equal((await a).status,200);assert.equal(calls,1);f.db.close();
});
test('uncertain email outcomes are never blindly retried outside the provider deduplication window',async()=>{
 let calls=0;const f=await fixture(async()=>{calls++;throw Error('offline');});await f.send();f.db.prepare('UPDATE deliveries SET created_at = ?').run(Date.now()-24*3600000);assert.equal((await f.send()).status,409);assert.equal(calls,1);f.db.close();
});
test('provider rejection is not reported as sent and a busy provider remains retryable',async()=>{
 const rejected=await fixture(async()=>Response.json({error:'bad sender'},{status:403}));assert.equal((await rejected.send()).status,422);assert.equal((await rejected.send()).status,422);rejected.db.close();
 let calls=0;const busy=await fixture(async()=>++calls===1?Response.json({error:'busy'},{status:429}):Response.json({id:'ok'}));assert.equal((await busy.send()).status,503);assert.equal((await busy.send()).status,200);busy.db.close();
});
test('device quota limits new sends and disabling a device prevents further provider access',async()=>{
 const f=await fixture();const insert=f.db.prepare("INSERT INTO deliveries VALUES (?,?,?,'accepted','test',?,0)");for(let i=0;i<500;i++)insert.run('device1',String(i),'hash',Date.now());assert.equal((await f.send()).status,429);f.db.prepare('UPDATE devices SET enabled=0').run();assert.equal((await f.send()).status,401);f.db.close();
});
test('browser client requires an explicit accepted result, never treats errors as successful delivery',async()=>{
 const c={url:'https://mail.example.edu',token};assert.equal((await sendEmailJob(c,job(),async()=>Response.json({status:'accepted',id:'ok'}))).id,'ok');
 await assert.rejects(sendEmailJob(c,job(),async()=>Response.json({status:'sent'})),/did not confirm/);
 await assert.rejects(sendEmailJob(c,job(),async()=>Response.json({error:'not configured'},{status:503})),/not configured/);
});

import test from 'node:test';import assert from 'node:assert/strict';
import {GMAIL_SCOPE,validGoogleClientId,gmailMessage,createGmailConnector,gmailDeliveryPlan,GmailSendError} from '../gmail.js';
const clientId='12345-testclient.apps.googleusercontent.com';
const payload=()=>({from:'professor@example.edu',to:'student@example.edu',name:'José Example',studentId:'01234567',exam:'Biology é exam',score:{score:48,total:50,percent:96},pdf:new TextEncoder().encode('%PDF-1.7\nSYNTHETIC_GRADED_SHEET')});
const decode=raw=>Buffer.from(raw,'base64url').toString('utf8');
function oauthFixture({scope=true,response={access_token:'TEST_TOKEN',expires_in:3600}}={}){let config,requests=[];return {requests,configs:()=>config,api:{initTokenClient(c){config=c;return {requestAccessToken(options){requests.push(options);queueMicrotask(()=>c.callback(response));}};},hasGrantedAllScopes(r,s){assert.equal(s,GMAIL_SCOPE);return scope;},revoke(token,cb){requests.push('revoked');cb();}}};}
async function connected(sendResponse=()=>Response.json({id:'gmail-message-1'})){
 const o=oauthFixture(),requests=[];let clock=0;
 const fetcher=async(url,options)=>{requests.push({url,options});if(url.includes('userinfo'))return Response.json({sub:'account1',email:'professor@example.edu',email_verified:true});return sendResponse(url,options);};
 const connector=createGmailConnector({fetcher,oauth:()=>o.api,now:()=>clock});await connector.connect(clientId);return {connector,o,requests,expire(){clock=4000000;}};
}
test('Google configuration accepts only a public web client ID',()=>{assert.equal(validGoogleClientId(clientId),true);for(const value of ['',null,'SECRET','https://example.edu',clientId+'\n'])assert.equal(validGoogleClientId(value),false);});
test('Gmail MIME contains one recipient and one exact graded PDF, with Unicode text and no class-wide CC/BCC',()=>{
 const raw=gmailMessage(payload()),mime=decode(raw);assert.match(mime,/From: professor@example.edu\r\nTo: student@example.edu/);assert.doesNotMatch(mime,/\r\n(?:Cc|Bcc):/i);assert.equal((mime.match(/Content-Disposition: attachment/g)||[]).length,1);
 const pdf=mime.split('Content-Disposition: attachment; filename="Graded_Sheet.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];assert.deepEqual(Buffer.from(pdf,'base64'),Buffer.from(payload().pdf));
 const body=mime.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];assert.match(Buffer.from(body,'base64').toString('utf8'),/José Example[\s\S]*01234567[\s\S]*48\/50 \(96%\)/);assert.match(mime,/Subject: =\?UTF-8\?B\?/);assert.ok(!/[+/=]/.test(raw));
});
test('MIME validation refuses header injection, unmatched identity, incomplete grades and non-PDF data',()=>{
 for(const change of [{to:'a@example.edu\r\nBcc:other@example.edu'},{from:''},{exam:'Exam\nBcc: other'},{studentId:'1234567'},{score:null},{pdf:new Uint8Array([1,2,3])}])assert.throws(()=>gmailMessage({...payload(),...change}));
});
test('connection requests send-only Gmail permission plus basic identity and keeps tokens out of returned account data',async()=>{
 const f=await connected(),c=f.o.configs();assert.equal(c.scope,'openid email '+GMAIL_SCOPE);assert.equal(c.include_granted_scopes,false);assert.doesNotMatch(c.scope,/readonly|modify|mail\.google\.com/);assert.deepEqual(f.connector.account(),{id:'account1',email:'professor@example.edu'});assert.equal(f.connector.connected(),true);assert.equal(f.o.requests[0].prompt,'select_account');
});
test('denied permission and unverified identity cannot connect or send',async()=>{
 const o=oauthFixture({scope:false});let calls=0;const g=createGmailConnector({oauth:()=>o.api,fetcher:async()=>{calls++;return Response.json({});}});await assert.rejects(g.connect(clientId),/not granted/);assert.equal(calls,0);await assert.rejects(g.send('raw'),e=>e.reauthorize&&!e.uncertain);
 const o2=oauthFixture(),g2=createGmailConnector({oauth:()=>o2.api,fetcher:async()=>Response.json({sub:'account1',email:'professor@example.edu',email_verified:false})});await assert.rejects(g2.connect(clientId),/details could not load/);assert.equal(g2.connected(),false);
});
test('accepted send goes directly to Gmail with the exact MIME payload and no third-party relay',async()=>{
 const f=await connected(),raw=gmailMessage(payload());assert.deepEqual(await f.connector.send(raw),{status:'accepted',id:'gmail-message-1'});const r=f.requests.at(-1);assert.equal(r.url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.deepEqual(JSON.parse(r.options.body),{raw});assert.equal(r.options.headers.Authorization,'Bearer TEST_TOKEN');assert.equal(r.options.credentials,'omit');
});
test('expired authorization does not submit another request and disconnect clears the token',async()=>{
 const f=await connected();f.expire();const n=f.requests.length;await assert.rejects(f.connector.send('raw'),e=>e.reauthorize&&!e.uncertain);assert.equal(f.requests.length,n);f.connector.disconnect();assert.equal(f.connector.account(),null);assert.equal(f.connector.connected(),false);assert.ok(f.o.requests.includes('revoked'));
});
test('lost responses, 5xx and missing message IDs are uncertain and must not be blindly retried',async()=>{
 for(const response of [()=>{throw Error('network');},()=>Response.json({}, {status:503}),()=>Response.json({})]){const f=await connected(response);await assert.rejects(f.connector.send('raw'),e=>e instanceof GmailSendError&&e.uncertain);}
});
test('explicit Gmail rejection remains retryable, and 401 requires reconnecting',async()=>{
 const f=await connected(()=>Response.json({}, {status:429}));await assert.rejects(f.connector.send('raw'),e=>!e.uncertain&&/limiting/.test(e.message));
 const f2=await connected(()=>Response.json({}, {status:401}));await assert.rejects(f2.connector.send('raw'),e=>e.reauthorize&&!e.uncertain);assert.equal(f2.connector.connected(),false);
});
test('delivery plans skip accepted and uncertain records, preserve retryable failures and separate professors',async()=>{
 const b={id:'b',exam:'Exam',count:1,key:'A',bonusKey:'',roster:{students:{'01234567':'Example'},emails:{'01234567':'student@example.edu'}}},p={id:'p',status:'done',answers:{1:'A'},result:{identity:{status:'clear',value:'01234567'},side:1,rows:[{question:1,status:'clear',selected:'A'}],bonus_rows:[]}};
 const first=await gmailDeliveryPlan([p],b,'professor1',true),key=first.candidates[0].key;assert.equal(first.candidates.length,1);
 for(const status of ['accepted','submitting','unknown']){b.gmailDeliveries={[key]:{status}};const plan=await gmailDeliveryPlan([p],b,'professor1',true);assert.equal(plan.candidates.length,0);assert.equal(status==='accepted'?plan.accepted:plan.uncertain,1);}
 b.gmailDeliveries={[key]:{status:'pending'}};assert.equal((await gmailDeliveryPlan([p],b,'professor1',true)).candidates.length,1);
 b.gmailDeliveries={[key]:{status:'accepted'}};assert.equal((await gmailDeliveryPlan([p],b,'professor2',true)).candidates.length,1);
 const restored={...structuredClone(b),id:'restored',emailIdentity:b.id,emailOriginalExam:b.exam,exam:b.exam+' (restored)'};assert.equal((await gmailDeliveryPlan([{...p,id:'restored-photo'}],restored,'professor1',true)).accepted,1);
});

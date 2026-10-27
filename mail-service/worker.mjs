import {validEmail,hashText} from '../email.js';

const json=(body,status=200,origin='')=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{})}});
async function boundedJSON(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('Use JSON.');
 const reader=request.body?.getReader();if(!reader)throw Error('Missing sheet.');let length=0,chunks=[];
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>12*1024*1024){await reader.cancel();throw Error('This graded PDF is too large to email.');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export function validateJob(job){
 if(!job||!/^[a-f0-9]{64}$/.test(job.jobId||'')||!/^\d{8}$/.test(job.studentId||'')||!validEmail(job.to))throw Error('Invalid student or recipient.');
 for(const field of ['name','exam'])if(typeof job[field]!=='string'||!job[field].trim()||job[field].length>120||/[\r\n\x00-\x1f]/.test(job[field]))throw Error('Invalid name or exam.');
 if(typeof job.pdf!=='string'||job.pdf.length>11*1024*1024||!/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(job.pdf)||job.pdf.length%4)throw Error('Attach one PDF graded sheet.');
 return {jobId:job.jobId,studentId:job.studentId,to:job.to,name:job.name,exam:job.exam,pdf:job.pdf};
}
export function createMailer(providerFetch=fetch){return {async fetch(request,env){
 const origin=request.headers.get('Origin')||'',allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim());
 if(!origin||!allowed.includes(origin))return json({error:'This app is not authorized to use email.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type',Vary:'Origin'}});
 if(request.method!=='POST'||new URL(request.url).pathname!=='/send')return json({error:'Not found.'},404,origin);
 if(!env.DB||!env.RESEND_API_KEY||!env.FROM_ADDRESS)return json({error:'Email delivery has not been configured yet.'},503,origin);
 try{
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 if(!/^eg_[A-Za-z0-9_-]{40,}$/.test(token))return json({error:'Connect an authorized professor device first.'},401,origin);
 const device=await env.DB.prepare('SELECT id, reply_to FROM devices WHERE token_hash = ? AND enabled = 1').bind(await hashText(token)).first();
 if(!device)return json({error:'This email connection is not authorized. Contact the app administrator.'},401,origin);
 let job;try{job=validateJob(await boundedJSON(request));}catch{return json({error:'Invalid recipient or graded PDF. Check the roster and download the sheet if needed.'},400,origin);}
 const now=Date.now(),digest=await hashText(JSON.stringify(job));
 await env.DB.prepare("INSERT OR IGNORE INTO deliveries (device_id, job_id, payload_hash, status, created_at, lease_until) SELECT ?, ?, ?, 'pending', ?, 0 WHERE (SELECT COUNT(*) FROM deliveries WHERE device_id = ? AND created_at > ?) < 500").bind(device.id,job.jobId,digest,now,device.id,now-86400000).run();
 let row=await env.DB.prepare('SELECT * FROM deliveries WHERE device_id = ? AND job_id = ?').bind(device.id,job.jobId).first();
 if(!row)return json({error:'Daily email limit reached. Contact the administrator.'},429,origin);
 if(row.status==='accepted')return json({status:'accepted',id:row.provider_id,alreadyAccepted:true},200,origin);
 if(row.payload_hash!==digest)return json({error:'This sheet has a different saved email payload. Restore the original send attempt or contact the administrator.'},409,origin);
 if(row.status==='failed')return json({error:'The email service rejected this send attempt. Contact the administrator before retrying.'},422,origin);
 // Do not resend an uncertain outcome after the provider’s 24-hour deduplication window.
 if(now-row.created_at>23*3600000)return json({error:'This send attempt is too old to retry safely. Ask the administrator to check its delivery status.'},409,origin);
 const claim=await env.DB.prepare("UPDATE deliveries SET status = 'sending', lease_until = ? WHERE device_id = ? AND job_id = ? AND status IN ('pending','sending') AND lease_until <= ?").bind(now+90000,device.id,job.jobId,now).run();
 if(!claim.meta.changes)return json({error:'This sheet is already being submitted. Wait a moment before retrying.'},409,origin);
 const payload={from:env.FROM_ADDRESS,to:[job.to],subject:job.exam+' — graded sheet',text:`Hello ${job.name},\n\nYour graded sheet for ${job.exam} is attached.\n\nExam Grader`,attachments:[{filename:'Graded_Sheet.pdf',content:job.pdf}],...(validEmail(device.reply_to)?{reply_to:device.reply_to}:{})};
 let response;
 try{response=await providerFetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':device.id+'/'+job.jobId},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});}
 catch{await env.DB.prepare('UPDATE deliveries SET lease_until = 0 WHERE device_id = ? AND job_id = ?').bind(device.id,job.jobId).run();return json({error:'Connection interrupted. Retry the same email attempt to check its status safely.'},503,origin);}
 const result=await response.json().catch(()=>({}));
 if(!response.ok||typeof result.id!=='string'){
  const retryable=response.status===429||response.status>=500||response.ok;
  await env.DB.prepare('UPDATE deliveries SET status = ?, lease_until = 0 WHERE device_id = ? AND job_id = ?').bind(retryable?'sending':'failed',device.id,job.jobId).run();
  return json({error:retryable?'Email service is busy. Retry shortly; previously accepted sheets will not be resent.':'The email service rejected this message. Ask the administrator to check the sender configuration.'},retryable?503:422,origin);
 }
 await env.DB.prepare("UPDATE deliveries SET status = 'accepted', provider_id = ?, lease_until = 0 WHERE device_id = ? AND job_id = ?").bind(result.id,device.id,job.jobId).run();
 return json({status:'accepted',id:result.id},200,origin);
 }catch{return json({error:'Email service is temporarily unavailable. Your grading work is saved; retry the same send attempt later.'},503,origin);}
}};}
export default createMailer();

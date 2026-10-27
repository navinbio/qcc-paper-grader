import {readyStudents} from './core.js';
export const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(value)&&!value.includes('..');
export function emailPlan(photos,batch){
 const ready=batch&&!batch.guest?readyStudents(photos,batch):[],emails=batch?.roster?.emails||{},uses=new Map(),recipients=[],skipped=[];
 for(const [id,value] of Object.entries(emails)){const address=String(value).trim().toLowerCase();if(address)uses.set(address,[...(uses.get(address)||[]),id]);}
 for(const group of ready){const to=String(emails[group.id]||'').trim();let reason=!to?'No email in roster':!validEmail(to)?'Invalid email in roster':uses.get(to.toLowerCase()).length>1?'Email shared by multiple student IDs':null;
  if(reason)skipped.push({id:group.id,reason});else recipients.push({group,to});
 }
 return {recipients,skipped};
}
export async function hashText(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function deliveryKey(batch,group,to,showAnswers){return hashText(JSON.stringify([batch.emailIdentity||batch.id,batch.emailOriginalExam||batch.exam,batch.key,batch.bonusKey,group.id,group.name,group.answers,group.bonus,to.toLowerCase(),showAnswers]));}
export function emailConnection(value){
 let url;try{url=new URL(value?.url);}catch{throw Error('Email sending is not connected yet. Set up the email service first.');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^https:\/\//.test(value.url)||!/^eg_[A-Za-z0-9_-]{40,}$/.test(value.token||''))throw Error('Use the secure email service address and device access code supplied during setup.');
 return {url:url.href.replace(/\/$/,''),token:value.token};
}
export function pdfBase64(bytes){let result='';for(let i=0;i<bytes.length;i+=24576)result+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)));return result;}
export async function sendEmailJob(config,job,fetcher=fetch){
 const c=emailConnection(config),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 try{const response=await fetcher(c.url+'/send',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.token},body:JSON.stringify(job),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error||'Email service could not accept this sheet. Try again; previously accepted sheets will not be resent.');
 if(body.status!=='accepted')throw Error('Email service did not confirm acceptance.');return body;
 }catch(e){if(e.name==='AbortError')throw Error('Connection timed out. Tap the email button again to check and continue safely.');throw e;}finally{clearTimeout(timer);}
}

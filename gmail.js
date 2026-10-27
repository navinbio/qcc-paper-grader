import {validEmail,pdfBase64,emailPlan,deliveryKey} from './email.js';
export const GMAIL_SCOPE='https://www.googleapis.com/auth/gmail.send';
export function validGoogleClientId(value){return typeof value==='string'&&value.length<250&&/^\d+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);}
export function loadGoogleIdentity(){
 if(globalThis.google?.accounts?.oauth2)return Promise.resolve();
 if(loadGoogleIdentity.pending)return loadGoogleIdentity.pending;
 loadGoogleIdentity.pending=new Promise((resolve,reject)=>{
 const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;
 const timer=setTimeout(()=>fail(),20000);
 function fail(){clearTimeout(timer);script.remove();loadGoogleIdentity.pending=null;reject(Error('Google sign-in could not load. Check your connection and open the app in Safari or Chrome.'));}
 script.onload=()=>{clearTimeout(timer);if(!globalThis.google?.accounts?.oauth2){fail();return;}resolve();};script.onerror=fail;document.head.append(script);
 });return loadGoogleIdentity.pending;
}
export class GmailSendError extends Error{constructor(message,uncertain=false,reauthorize=false){super(message);this.uncertain=uncertain;this.reauthorize=reauthorize;}}
export async function gmailDeliveryPlan(photos,batch,accountId,showAnswers){
 const plan=emailPlan(photos,batch),candidates=[];let accepted=0,uncertain=0;
 for(const recipient of plan.recipients){const key=accountId+':'+await deliveryKey(batch,recipient.group,recipient.to,showAnswers),old=batch.gmailDeliveries?.[key];
 if(old?.status==='accepted'){accepted++;continue;}
 if(['submitting','unknown'].includes(old?.status)){uncertain++;continue;}
 candidates.push({...recipient,key});
 }return {candidates,accepted,uncertain,skipped:plan.skipped.length};
}
const encoded=value=>pdfBase64(new TextEncoder().encode(value));
const wrap=value=>(value.match(/.{1,76}/g)||[]).join('\r\n');
function subjectHeader(value){let chunks=[],part='';for(const char of value){if(new TextEncoder().encode(part+char).length>42){chunks.push(part);part='';}part+=char;}if(part)chunks.push(part);return chunks.map(s=>'=?UTF-8?B?'+encoded(s)+'?=').join('\r\n ');}
export function gmailMessage({from,to,name,studentId,exam,score,pdf}){
 if(!validEmail(from)||!validEmail(to)||!/^\d{8}$/.test(studentId||''))throw Error('A matched student ID and valid roster email are required.');
 for(const value of [name,exam])if(typeof value!=='string'||!value.trim()||value.length>120||/[\x00-\x1f\x7f]/.test(value))throw Error('Student name and exam must be plain text of 1–120 characters.');
 if(!score||![score.score,score.total,score.percent].every(Number.isFinite)||score.total<1||score.score<0||score.score>score.total)throw Error('A complete grade is required.');
 if(!(pdf instanceof Uint8Array)||pdf.length>8*1024*1024||new TextDecoder().decode(pdf.subarray(0,5))!=='%PDF-')throw Error('Use a graded PDF smaller than 8 MB.');
 const boundary='exam_grader_'+crypto.randomUUID().replaceAll('-','');
 const text=`Hello ${name},\n\nExam: ${exam}\nStudent ID: ${studentId}\nScore: ${score.score}/${score.total} (${score.percent}%)\n\nYour individual graded sheet is attached.\n`;
 const mime=['From: '+from,`To: ${to}`,`Subject: ${subjectHeader(exam+' — graded sheet')}`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(encoded(text)),`--${boundary}`,'Content-Type: application/pdf; name="Graded_Sheet.pdf"','Content-Disposition: attachment; filename="Graded_Sheet.pdf"','Content-Transfer-Encoding: base64','',wrap(pdfBase64(pdf)),`--${boundary}--`,''].join('\r\n');
 return encoded(mime).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function createGmailConnector({fetcher=fetch,oauth=()=>globalThis.google?.accounts?.oauth2,now=Date.now}={}){
 let accessToken='',expires=0,account=null,connecting=false;
 const clear=()=>{accessToken='';expires=0;account=null;};
 return {
 account(){return account?{...account}:null;},
 connected(){return !!accessToken&&expires>now();},
 clear,
 connect(clientId){
  if(!validGoogleClientId(clientId))return Promise.reject(Error('The app needs its Google client ID before Gmail can connect.'));
  if(connecting)return Promise.reject(Error('Google sign-in is already open.'));
  const api=oauth();if(!api)return Promise.reject(Error('Wait for Google sign-in to finish loading.'));
  connecting=true;clear();
  return new Promise((resolve,reject)=>{
   const fail=message=>{connecting=false;clear();reject(Error(message));};
   try{const client=api.initTokenClient({client_id:clientId,scope:'openid email '+GMAIL_SCOPE,include_granted_scopes:false,
    error_callback:()=>fail('Google sign-in was closed or blocked. No emails were sent. Try Safari or Chrome.'),
    callback:async response=>{
     if(response.error||!response.access_token||!api.hasGrantedAllScopes(response,GMAIL_SCOPE)){fail('Permission to send Gmail was not granted. No emails were sent.');return;}
     try{const result=await fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+response.access_token},credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(20000)});
      const profile=await result.json();if(!result.ok||!profile.sub||profile.email_verified!==true||!validEmail(profile.email))throw Error('Google could not verify the connected email account.');
      accessToken=response.access_token;expires=now()+Math.max(0,Math.min(3600,Number(response.expires_in)||0)-60)*1000;account={id:String(profile.sub),email:profile.email};connecting=false;resolve({...account});
     }catch{fail('Google account details could not load. Connect again; no emails were sent.');}
    }});client.requestAccessToken({prompt:'select_account'});
   }catch{fail('Google sign-in could not open. Try again in Safari or Chrome.');}
  });
 },
 disconnect(){const token=accessToken;clear();if(token&&oauth()?.revoke)oauth().revoke(token,()=>{});},
 async send(raw){
  if(!accessToken||expires<=now())throw new GmailSendError('Reconnect Gmail to continue. No request was submitted for this sheet.',false,true);
  let response;try{response=await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({raw}),credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(45000)});}
  catch{throw new GmailSendError('The connection was interrupted after submission. Check Gmail Sent before attempting to send this sheet again.',true);}
  if(response.status===401){clear();throw new GmailSendError('Google authorization expired. Reconnect Gmail to continue.',false,true);}
  if(response.status>=500)throw new GmailSendError('Gmail returned an uncertain result. Check Gmail Sent; this sheet will not be automatically resent.',true);
  if(!response.ok)throw new GmailSendError(response.status===429?'Gmail is limiting sending. Wait and try again later.':'Gmail rejected this request. Check the account permissions and sending limits.');
  const result=await response.json().catch(()=>({}));if(!result.id)throw new GmailSendError('Gmail did not return a message identifier. Check Gmail Sent; this sheet will not be automatically resent.',true);
  return {status:'accepted',id:result.id};
 }
 };
}

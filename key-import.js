import {keyFromSheets,reviewedKey} from './core.js?v=1.3.3';

// Key photos use the same local reader, without requiring a student ID or roster.
// A key is changed only after all choices are valid and the professor confirms it.
export function setupKeyImport({read,optimize,isReady,isProcessing,setBusy,message}){
const $=id=>document.getElementById(id);let draft=null;
const clear=()=>{draft=null;$('keyVerified').checked=false;$('keyChoices').replaceChildren();};
function choices(){return [...$('keyChoices').querySelectorAll('select')].map(s=>({question:Number(s.dataset.question),value:s.value}));}
function update(){
const missing=choices().filter(r=>!r.value).length;
$('keyReviewStatus').textContent=missing?`${missing} answer(s) need a choice before this key can be used.`:'Every question has one answer. Check the choices against your master sheet.';
$('applyKey').disabled=missing>0||!$('keyVerified').checked;
}
$('uploadKey').onclick=()=>{if(!isReady()||isProcessing())return;$('keyPhotos').click();};
$('keyPhotos').onchange=async()=>{
const files=[...$('keyPhotos').files];$('keyPhotos').value='';if(!files.length)return;
if(!isReady()||isProcessing()){message('Wait for the reader or finish processing the student batch first.',true);return;}
const count=Number($('count').value),bonus=Number($('bonus').value);
if(files.length!==(count===100?2:1)){message(count===100?'Select one photo of Sheet 1 and one of Sheet 2 together.':'Select one photo of Sheet 1.',true);return;}
setBusy(true);clear();
try{
const results=[];
for(let i=0;i<files.length;i++){
if(files[i].size>30*1024*1024)throw Error('Use answer-key photos smaller than 30 MB.');
message(`Reading answer-key photo ${i+1} of ${files.length} on this device…`);
const result=await read(await optimize(files[i]));
// Keep only readings; key photos are not saved as student submissions.
results.push({side:result.side,rows:result.rows,bonus_rows:result.bonus_rows});
}
const entries=keyFromSheets(results,count,bonus);draft={count,bonus};
$('keyChoices').replaceChildren();
for(const entry of entries){
const wrap=document.createElement('label');wrap.className='key-choice'+(!entry.value?' flag':'');
const label=document.createElement('strong');label.textContent=entry.label;
const select=document.createElement('select');select.dataset.question=entry.question;select.setAttribute('aria-label','Correct answer '+entry.label);
select.add(new Option('Choose…',''));for(const c of 'ABCDE')select.add(new Option(c,c));select.value=entry.value;
const status=document.createElement('small');status.textContent=entry.value?'Read from sheet':entry.status==='blank'?'Blank — choose an answer':entry.status==='multiple'?'Multiple marks — choose one':'Not clear — choose an answer';
select.onchange=()=>{wrap.classList.toggle('flag',!select.value);status.textContent=select.value?'Selected for key':'Choose an answer';update();};
wrap.append(label,select,status);$('keyChoices').append(wrap);
}
$('keyReviewIntro').textContent=`Review ${count} correct answers${bonus?' and '+bonus+' extra-credit answer(s)':''}. Student ID is not needed for an answer-key sheet. This sets the key for a new exam; previous exams keep their existing keys.`;
update();$('keyDialog').showModal();message('Answer key read. Review it before applying.');
}catch(e){clear();message(e.message||'Could not read the answer-key photo. Try a clearer JPEG or PNG.',true);}
finally{setBusy(false);}
};
$('keyVerified').onchange=update;
$('cancelKey').onclick=()=>{$('keyDialog').close();};
$('keyDialog').addEventListener('close',clear);
$('applyKey').onclick=()=>{
try{
if(!draft||!$('keyVerified').checked)throw Error('Verify the extracted key first.');
if(Number($('count').value)!==draft.count||Number($('bonus').value)!==draft.bonus)throw Error('Exam settings changed. Upload the key again.');
const values=reviewedKey(choices(),draft.count,draft.bonus);
$('key').value=values.key.match(/.{1,10}/g).join(' ');
if(draft.bonus)$('ec1').value=values.bonusKey[0];if(draft.bonus===2)$('ec2').value=values.bonusKey[1];
$('keyEditor').open=false;$('key').dispatchEvent(new Event('input',{bubbles:true}));$('keyDialog').close();message('Reviewed answer key applied. Choose the class and add grading-sheet photos when ready.');
}catch(e){message(e.message,true);$('keyReviewStatus').textContent=e.message;}
};
}

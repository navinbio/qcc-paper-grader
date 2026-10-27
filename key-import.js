import {detectedExamSettings,keyFromSheets,reviewedKey} from './core.js?v=1.9.0';

export function setupKeyImport({read,optimize,isGuest=()=>false,isReady,isProcessing,setBusy,message,onSave,onCancel}){
const $=id=>document.getElementById(id);let draft=null,saving=false;
const clear=()=>{draft=null;$('keyChoices').replaceChildren();};
const status=(text,error=false)=>{$('savedKeyStatus').textContent=text;$('savedKeyStatus').className=error?'small error':text.startsWith('Reading key photo')?'small busy':'small';};
const choices=()=>[...$('keyChoices').querySelectorAll('select')].map(s=>({question:Number(s.dataset.question),value:s.value}));
function update(preserveMessage=false){
const missing=choices().filter(r=>!r.value).length;
if(preserveMessage!==true)$('keyReviewStatus').textContent=missing?`${missing} answer(s) need a choice before this key can be saved.`:(isGuest()?'Check any highlighted answers, then use this key.':'Question count and extra credit were read automatically. Name and save your key.');
$('applyKey').disabled=saving||missing>0||(!isGuest()&&!$('keyName').value.trim());
}
$('cancelKeyUpload').onclick=onCancel;
$('keyPhotos').onchange=async()=>{
const files=[...$('keyPhotos').files];$('keyPhotos').value='';if(!files.length)return;
if(!isReady()||isProcessing()){status('Wait for the grader or finish the student batch first.',true);return;}
if(files.length<1||files.length>2){status('Upload Sheet 1 for up to 50 questions, or both pages for 51–100.',true);return;}
setBusy(true);clear();
try{
const results=[];
for(let i=0;i<files.length;i++){
if(files[i].size>30*1024*1024)throw Error('Use key photos smaller than 30 MB.');
status(`Reading key photo ${i+1} of ${files.length}…`);
const result=await read(await optimize(files[i]));results.push({side:result.side,rows:result.rows,bonus_rows:result.bonus_rows});
}
const {count,bonus}=detectedExamSettings(results),usedResults=count<=50?results.filter(r=>r.side===1):results,entries=keyFromSheets(usedResults,count,bonus),extraAnswers=keyFromSheets(usedResults,count,2).slice(count).map(r=>r.value);draft={count,bonus,extraAnswers};
if(isGuest()&&entries.every(e=>e.value)){const values=reviewedKey(entries,count,bonus);await onSave('',count,values.key,values.bonusKey,extraAnswers);clear();message('Key read. Capture or select grading sheets.');return;}
for(const entry of entries){
const wrap=document.createElement('label');wrap.className='key-choice'+(!entry.value?' flag':'');
const label=document.createElement('strong');label.textContent=entry.label;
const select=document.createElement('select');select.dataset.question=entry.question;select.setAttribute('aria-label','Correct answer '+entry.label);
select.add(new Option('Choose…',''));for(const c of 'ABCDE')select.add(new Option(c,c));select.value=entry.value;
const hint=document.createElement('small');hint.textContent=entry.value?'Read from sheet':entry.status==='blank'?'Blank — choose an answer':entry.status==='multiple'?'Multiple marks — choose one':'Not clear — choose an answer';
select.onchange=()=>{wrap.classList.toggle('flag',!select.value);hint.textContent=select.value?'Selected for key':'Choose an answer';update();};wrap.append(label,select,hint);$('keyChoices').append(wrap);
}
$('keyReviewIntro').textContent=`Detected ${count} questions${bonus?' + '+bonus+' extra credit':''} from the marked answers.${isGuest()?' Correct the highlighted answers to continue.':' Give this key a unique name.'}`;

$('keyReadingDetails').open=entries.some(e=>!e.value);update();$('keyDialog').showModal();status(isGuest()?'Check the highlighted key answers.':'Key read. Name and save it to continue.');
}catch(e){clear();status(e.message||'Could not read this key photo. Try a clearer JPEG or PNG.',true);}
finally{setBusy(false);}
};
$('keyName').oninput=update;
$('cancelKey').onclick=()=>{if(!saving){$('keyDialog').close();onCancel();}};
$('keyDialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();else onCancel();});
$('keyDialog').addEventListener('close',clear);
$('applyKey').onclick=async()=>{
if(saving)return;
try{
if(!draft)throw Error('Check the detected key first.');
const values=reviewedKey(choices(),draft.count,draft.bonus);saving=true;update();$('cancelKey').disabled=true;
const extraAnswers=draft.extraAnswers.map((v,i)=>values.bonusKey[i]||v);await onSave($('keyName').value,draft.count,values.key,values.bonusKey,extraAnswers);
$('keyDialog').close();message(isGuest()?'Key ready. Capture or select grading sheets.':'Answer key saved and selected. Add grading sheets when ready.');
}catch(e){$('keyReviewStatus').textContent=e.message;}
finally{saving=false;$('cancelKey').disabled=false;if(draft)update(true);}
};
}

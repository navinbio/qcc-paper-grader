function setupSheetPreview(){
const $=id=>document.getElementById(id),dialog=$('blankSheetDialog');
let file=null,loading=null;
const status=(message,error=false)=>{$('sheetActionStatus').textContent=message;$('sheetActionStatus').className=error?'error':'small';};
async function prepare(){
if(file)return;if(loading)return loading;
loading=(async()=>{
const images=[...dialog.querySelectorAll('.blank-sheet-page img')];
await Promise.all(images.map(img=>img.decode()));$('printBlank').disabled=false;
try{const response=await fetch('./sheets/100-bonus.pdf?v=1.9.1');if(!response.ok)throw Error('PDF unavailable');file=new File([await response.blob()],'Blank_Grading_Sheet.pdf',{type:'application/pdf'});$('shareBlank').disabled=false;}
catch{status('The preview is ready. Download PDF needs an internet connection until offline files are ready.',true);}
})();
try{await loading;}catch{status('The sheet preview could not load. Reconnect and try again, or use Download PDF.',true);}finally{loading=null;}
}
$('sheet').onclick=e=>{e.preventDefault();status('Loading grading sheets…');dialog.showModal();prepare().then(()=>{if($('sheetActionStatus').textContent==='Loading grading sheets…')status('');});};
$('backFromSheet').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>document.body.classList.remove('printing-sheet'));
$('printBlank').onclick=()=>{if(typeof window.print!=='function'){status('Printing is unavailable here. Use Share or Download PDF instead.',true);return;}document.body.classList.add('printing-sheet');window.print();};
window.addEventListener('beforeprint',()=>{if(dialog.open)document.body.classList.add('printing-sheet');});
window.addEventListener('afterprint',()=>document.body.classList.remove('printing-sheet'));
$('shareBlank').onclick=async()=>{
if(!file)return;
if(!navigator.canShare?.({files:[file]})||!navigator.share){status('Sharing is unavailable in this browser. Use Download PDF, then open the file to print or share.',true);return;}
try{$('shareBlank').disabled=true;await navigator.share({files:[file],title:'Blank grading sheet'});status('');}
catch(e){if(e.name!=='AbortError')status('Sharing could not open. Use Download PDF to save and print the sheet.',true);}
finally{$('shareBlank').disabled=false;}
};

}

import {openDB,memoryDB,get,all,put,remove} from './db.js?v=1.9.1';
import {automatic,parseKey,groups,importRoster,namedKey,readyStudents,extraAnswersForKey,selectedBonusKey} from './core.js?v=1.9.1';
import {download,clearDownloads,zipFiles,csvExport,feedbackPDF,combinedPDF} from './exports.js?v=1.9.1';
import {setupKeyImport} from './key-import.js?v=1.9.1';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const helpTitles={session:'Session information',print:'Print grading sheets',class:'Choose a class',key:'Answer key',capture:'Capture grading sheets',export:'Export results'};
for(const button of document.querySelectorAll('[data-help]'))button.onclick=()=>{const topic=button.dataset.help;$('infoTitle').textContent=helpTitles[topic];for(const panel of $('infoDialog').querySelectorAll('[data-info]'))panel.hidden=panel.dataset.info!==topic;$('infoDialog').showModal();};
$('closeInfo').onclick=()=>$('infoDialog').close();
setupSheetPreview();
let db,state={id:'app',rosters:[],batches:[],keys:[]},batch=null,photos=[],active=null,processing=false,rosterImporting=false,adding=false,paused=false,ready=false,keyBusy=false,keySaving=false,stream=null,retakeId=null,previewURL=null,deletedPhoto=null,activeKeyId='',keyExtraAnswers=['',''],mode=null,guestExported=false,exporting=false,opening=false,archiving=false;
const worker=new Worker(new URL('./worker.js?v=1.9.1',import.meta.url));let pending=null;
worker.onmessage=e=>{if(e.data.ready){ready=true;if(db)render();$('runtime').className='small';$('runtime').textContent='Ready to grade on this device.';return;}if(e.data.fatal){$('runtime').className='error';$('runtime').textContent='Reader could not load: '+e.data.fatal;return;}if(pending){const p=pending;pending=null;e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result);}};
worker.onerror=e=>{if(pending){pending.reject(Error('The reader stopped. Pause and reload to resume the saved queue.'));pending=null;}ready=false;$('runtime').className='error';$('runtime').textContent='Reader stopped. Reload this page to resume safely.';};
const read=blob=>new Promise((resolve,reject)=>{if(pending)return reject(Error('The sheet reader is busy. Wait for the current photo.'));pending={resolve,reject};worker.postMessage({id:crypto.randomUUID(),blob});});
function message(text,error=false){$('message').textContent=text;$('message').className=error?'error':'success';}
async function save(){await put(db,'state',state);}
function settings(){const n=Number($('bonus').value);$('keySummary').textContent=$('key').value?`${$('count').value} questions${n?' + '+n+' extra credit':''} · Read from answer key`:'';}settings();
function keyMenu(selected=activeKeyId){
const keys=(state.keys||[]).slice().sort((a,b)=>a.name.localeCompare(b.name)),options=[new Option('Choose key',''),...keys.map(k=>new Option(`${k.name} · ${k.count} questions`,k.id))];
if(batch&&!keys.some(k=>k.name===batch.exam&&k.key===batch.key&&k.bonusKey===batch.bonusKey))options.push(new Option(batch.exam+' (previous exam)','__exam_key__'));
options.push(new Option('Upload new answer key…','__upload_key__'));$('savedKey').replaceChildren(...options);$('savedKey').value=selected;
}
function useKey(k,id){
keyExtraAnswers=extraAnswersForKey(k);activeKeyId=id;$('exam').value=k.name;$('count').value=String(k.count);$('key').value=k.key;$('bonus').value=String(k.bonusKey.length);$('ec1').value=keyExtraAnswers[0];$('ec2').value=keyExtraAnswers[1];
keyMenu(id);settings();$('message').textContent='';$('keyUpload').hidden=mode!=='guest';$('savedKeyStatus').className='small success';$('savedKeyStatus').textContent=`Using “${k.name}”.`;
}
$('savedKey').onchange=()=>{
try{const id=$('savedKey').value;
if(id==='__upload_key__'){$('keyUpload').hidden=false;$('keyName').value='';$('savedKeyStatus').className='small';$('savedKeyStatus').textContent='Choose key photos below. You will name the key after it is read.';return;}
$('keyUpload').hidden=true;
const stored=id==='__exam_key__'&&batch?{name:batch.exam,count:batch.count,key:batch.key,bonusKey:batch.bonusKey}:(state.keys||[]).find(k=>k.id===id);
if(!stored){$('savedKeyStatus').className='small';activeKeyId='';keyExtraAnswers=['',''];$('ec1').value='';$('ec2').value='';$('exam').value='';$('key').value='';settings();$('savedKeyStatus').textContent='Choose a saved key, or upload a new answer key.';return;}
useKey({...namedKey(stored.name,stored.count,stored.key,stored.bonusKey),extraAnswers:stored.extraAnswers},id);
}catch(e){$('savedKeyStatus').className='small error';$('savedKeyStatus').textContent=e.message;}
};
function cancelKeyUpload(){
$('keyUpload').hidden=true;$('keyPhotos').value='';
const previous=state.keys.find(k=>k.id===activeKeyId)||(activeKeyId==='__exam_key__'&&batch?{name:batch.exam,count:batch.count,key:batch.key,bonusKey:batch.bonusKey}:null);
if(previous)useKey(previous,activeKeyId);else{keyMenu(activeKeyId);$('savedKeyStatus').className='small';$('savedKeyStatus').textContent='Choose a saved key, or upload a new answer key.';settings();}
}
async function saveUploadedKey(name,count,key,bonusKey,extraAnswers){
const record={...namedKey(mode==='guest'?'Guest exam':name,count,key,bonusKey,mode==='guest'?[]:state.keys||[]),extraAnswers,id:crypto.randomUUID(),created:new Date().toISOString()};
guestExported=false;const next={...state,keys:mode==='guest'?[record]:[...(state.keys||[]),record]};await put(db,'state',next);state=next;useKey(record,record.id);$('message').textContent='';return record;
}
function rosterMenu(selected=$('roster').value){
const options=[new Option('Choose a Class',''),...state.rosters.map(r=>new Option(r.name,r.id))];
if(batch&&batch.roster.id===selected&&!state.rosters.some(r=>r.id===selected))options.push(new Option(batch.roster.name+' (previous exam)',selected));
options.push(new Option('Upload new class roster…','__upload__'));$('roster').replaceChildren(...options);$('roster').value=selected;
const list=$('classList');list.replaceChildren();for(const r of state.rosters){const row=el('div');row.className='class-manage';const name=el('input');name.value=r.name;name.maxLength=120;name.setAttribute('aria-label','Class name '+r.name);const rename=el('button','Rename');rename.className='secondary compact';rename.onclick=()=>safe(async()=>{const value=name.value.trim();if(!value)throw Error('Enter a class name.');r.name=value;await save();rosterMenu(r.id);});const remove=el('button','Delete');remove.className='secondary compact';remove.onclick=()=>safe(async()=>{state.deletedRosters??=[];state.deletedRosters.push(r);state.rosters=state.rosters.filter(x=>x.id!==r.id);await save();rosterMenu(selected===r.id?'':selected);$('classStatus').textContent='Class deleted. Previous exams are preserved. You can undo this deletion.';});row.append(name,rename,remove);list.append(row);}$('undoClass').hidden=!state.deletedRosters?.length;
}
$('roster').onchange=()=>{
const upload=$('roster').value==='__upload__';$('rosterUpload').hidden=!upload;$('classStatus').textContent='';
if(!upload){state.lastRoster=$('roster').value;safe(save);}
};
$('cancelRosterUpload').onclick=()=>{$('rosterUpload').hidden=true;$('rosterFiles').value='';$('classStatus').textContent='';rosterMenu(state.lastRoster||batch?.roster.id||'');};
$('undoClass').onclick=()=>safe(async()=>{const r=state.deletedRosters?.pop();if(r&&!state.rosters.some(x=>x.id===r.id))state.rosters.push(r);await save();rosterMenu(r?.id||'');$('classStatus').textContent='Class restored.';});
function batchMenu(){const select=$('batchSelect');select.replaceChildren(new Option('Choose a previous exam',''),...state.batches.map(b=>new Option(`${b.exam} · ${b.count} questions · ${new Date(b.created).toLocaleDateString()}`,b.id)));select.value=batch?.id||'';}
async function selectBatch(id){if(processing)throw Error('Pause processing before switching batches.');batch=state.batches.find(b=>b.id===id)||null;active=null;deletedPhoto=null;$('reviewDialog').close();photos=batch?(await all(db,'photos',id)).filter(p=>p.batchId===id):[];for(const p of photos)if(p.status==='reading'){p.status='pending';await put(db,'photos',p);}state.activeBatch=id;await save();batchMenu();if(batch){keyExtraAnswers=extraAnswersForKey(batch);$('exam').value=batch.exam;$('count').value=String(batch.count);$('key').value=batch.key;$('bonus').value=String(batch.bonusKey.length);$('ec1').value=batch.bonusKey[0]||'';$('ec2').value=batch.bonusKey[1]||'';settings();const saved=(state.keys||[]).find(k=>k.name===batch.exam&&k.key===batch.key&&k.bonusKey===batch.bonusKey);activeKeyId=saved?.id||'__exam_key__';keyMenu(activeKeyId);$('savedKeyStatus').className='small';$('savedKeyStatus').textContent=`Using “${batch.exam}”.`;rosterMenu(batch.roster.id);}render();}
function render(){
const keyUploaded=mode==='guest'&&!!$('key').value;$('keyFileLabel').textContent=keyBusy?'Reading key…':keyUploaded?'Key uploaded':'Upload key';$('keyFileLabel').parentElement.classList.toggle('key-uploaded',keyUploaded);
$('progress').hidden=!photos.length;$('progressText').hidden=!photos.length;$('photoList').hidden=!photos.length;$('exportStatus').classList.toggle('busy',exporting);
$('endSession').disabled=processing||adding||keyBusy||exporting||archiving;

const included=photos.filter(p=>!p.excluded),done=included.filter(p=>['done','error'].includes(p.status)).length,result=batch?groups(photos,batch):{students:[],issues:[]},graded=result.students.filter(g=>g.ready),attention=result.issues.length+result.students.filter(g=>!g.ready).length;
$('batchInfo').textContent=mode==='guest'?(batch?`${batch.count} questions${batch.bonusKey.length?' + '+batch.bonusKey.length+' extra credit':''} · Temporary guest session`:'Upload a key, then capture or select grading sheets.'):(batch?`${batch.exam} · ${batch.roster.name} · ${batch.count} questions`:'Choose a class and key, then add photos. Your exam saves automatically.');
$('progress').max=Math.max(included.length,1);$('progress').value=done;$('progressText').textContent=`${done} of ${included.length} photos processed`;
$('summary').textContent=batch?`${graded.length} ${graded.length===1?'student':'students'} graded · ${attention} need attention`:'';
const table=el('table'),head=el('tr');['Photo','Student','Result','Actions'].forEach(v=>head.append(el('th',v)));table.append(head);
for(const p of photos){const g=result.students.find(g=>g.photos.some(x=>x.id===p.id)),issue=result.issues.find(x=>x.photo.id===p.id),tr=el('tr');tr.append(el('td',p.name),el('td',g?`${g.name}${batch.guest?'':' · '+g.id} · Sheet ${p.result.side}`:p.result?.identity.value||'—'),el('td',p.excluded?'Excluded':g?.ready?`${g.score.score}/${g.score.total} (${g.score.percent}%)`:issue?.message||g?.issues.join('; ')||p.error||p.status));const td=el('td'),button=(label,fn)=>{const b=el('button',label);b.className='secondary';b.disabled=processing||adding||archiving;b.onclick=()=>safe(fn);td.append(b);};button('Review',()=>review(p.id));button('Retake',()=>{retakeId=p.id;$('retake').click();});button(p.excluded?'Include':'Exclude',async()=>{p.excluded=!p.excluded;guestExported=false;await put(db,'photos',p);render();});button('Delete',()=>deletePhoto(p.id));if(g?.sides[p.result?.side]?.length>1)button('Keep this copy',async()=>{for(const other of g.sides[p.result.side]){other.excluded=other.id!==p.id;await put(db,'photos',other);}render();});tr.append(td);table.append(tr);}$('photoList').replaceChildren(table);
$('openCamera').disabled=processing||keyBusy||adding||archiving;$('process').disabled=!batch||processing||keyBusy||adding||archiving||!ready||!included.length;$('process').textContent=adding?'Saving sheets…':processing?`Grading ${included.length} ${included.length===1?'sheet':'sheets'}…`:included.length?`Grade ${included.length} ${included.length===1?'sheet':'sheets'}`:'Grade sheets';$('undoPhoto').hidden=!deletedPhoto;$('undoPhoto').disabled=processing||adding;$('pause').hidden=!processing;$('pause').disabled=!processing;$('backup').disabled=!batch||processing||adding||keyBusy||archiving||exporting;$('backup').textContent=archiving?'Preparing backup…':'Download backup';$('restore').disabled=processing||adding||keyBusy||archiving||exporting;
for(const id of ['count','bonus'])$(id).disabled=processing||keyBusy||adding||archiving;$('keyPhotos').disabled=!ready||processing||keyBusy||adding||archiving||(mode==='guest'&&photos.length>0);$('cancelKeyUpload').disabled=keyBusy;for(const id of ['savedKey','keyName'])$(id).disabled=!db||processing||keyBusy||keySaving||adding||archiving;
for(const id of ['exportPdf','exportCsv'])$(id).disabled=processing||adding||exporting||archiving||!graded.length;
for(const id of ['photos','batchSelect','roster','newExam','exam'])$(id).disabled=processing||adding||keyBusy||archiving;
$('roster').disabled=processing||adding||keyBusy||rosterImporting||archiving;$('rosterFiles').disabled=processing||adding||rosterImporting||archiving;$('cancelRosterUpload').disabled=rosterImporting;
$('exportStatus').textContent=graded.length?`${graded.length} ${graded.length===1?'student':'students'} ready to download.${attention?' Items needing attention are left out until resolved.':''}`:'Process sheets to prepare downloads. Resolve any identity, page or answer issues.';
}
async function deletePhoto(id){
if(processing||adding)throw Error('Wait for photos to finish saving or grading before deleting.');
const index=photos.findIndex(p=>p.id===id);if(index<0)return;const photo=photos[index];
guestExported=false;await remove(db,'photos',id);photos=photos.filter(p=>p.id!==id);deletedPhoto={photo,index};
if(active?.id===id){active=null;$('reviewDialog').close();if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('preview').removeAttribute('src');}
if(retakeId===id)retakeId=null;render();message(`Deleted ${photo.name}. Use Undo delete to restore it.`);
}
$('undoPhoto').onclick=()=>safe(async()=>{
if(!deletedPhoto||processing||adding)return;const {photo,index}=deletedPhoto;if(photo.batchId!==batch?.id)return;
await put(db,'photos',photo);guestExported=false;photos.splice(Math.min(index,photos.length),0,photo);deletedPhoto=null;render();message('Deleted photo restored.');
});
async function safe(fn){try{await fn();}catch(e){message(e.message||'Something went wrong. Your saved work is unchanged.',true);}}
$('rosterFiles').onchange=async()=>{
const files=[...$('rosterFiles').files];if(!files.length||rosterImporting)return;
rosterImporting=true;render();$('classStatus').className='small busy';$('classStatus').textContent='Reading class roster…';
try{
const imported=[];for(const file of files)imported.push(...await importRoster(file));
const next={...state,rosters:[...state.rosters,...imported],lastRoster:imported[0]?.id||''};
await put(db,'state',next);state=next;rosterMenu(state.lastRoster);$('rosterUpload').hidden=true;
$('classStatus').className='small success';$('classStatus').textContent=imported.length===1?`Class roster saved: ${imported[0].name}.`:`${imported.length} class rosters saved. Choose the class above.`;
}catch(e){$('classStatus').className='small error';$('classStatus').textContent=e.message||'Could not read this roster. Choose an Excel (.xlsx) or CSV file.';$('rosterUpload').hidden=false;}
finally{rosterImporting=false;$('rosterFiles').value='';render();}
};
async function ensureBatch(){
if(processing)throw Error('Pause processing first.');const roster=mode==='guest'?(batch?.roster||{id:'guest',name:'Guest session',students:{}}):state.rosters.find(r=>r.id===$('roster').value)||(batch?.roster.id===$('roster').value?batch.roster:null);if(!roster)throw Error('Choose a class first.');const exam=$('exam').value.trim();if(!exam)throw Error('Choose an answer key first.');const count=Number($('count').value),key=parseKey($('key').value,count),n=Number($('bonus').value),bonusKey=selectedBonusKey(keyExtraAnswers,n);
if(batch&&batch.exam===exam&&batch.roster.id===roster.id&&batch.count===count&&batch.key===key&&batch.bonusKey===bonusKey)return;
const next={id:crypto.randomUUID(),guest:mode==='guest',exam,count,key,bonusKey,extraAnswers:[...keyExtraAnswers],roster:structuredClone(roster),created:new Date().toISOString(),confirmed:{}};state.batches.unshift(next);await selectBatch(next.id);if(mode!=='guest')await navigator.storage?.persist?.();
}
$('newExam').onclick=()=>safe(async()=>{await selectBatch('');$('exam').value='';$('key').value='';activeKeyId='';keyMenu('');settings();message('Choose a class and answer key, then add photos.');});
$('batchSelect').onchange=()=>safe(()=>selectBatch($('batchSelect').value));
async function optimize(blob){let bitmap;try{bitmap=await createImageBitmap(blob);}catch{throw Error('This image format could not be opened. Choose JPEG/PNG or use the in-app camera.');}let scale=Math.min(1,2800/Math.max(bitmap.width,bitmap.height)),c=document.createElement('canvas');c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();return new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.94));}
async function addPhoto(blob,name,replace){if(!replace)await ensureBatch();if(!batch)throw Error('Choose an exam first.');if(processing)throw Error('Pause the queue before adding or replacing photos.');if(blob.size>30*1024*1024)throw Error('Use a photo smaller than 30 MB.');const bytes=await blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(!replace&&photos.some(p=>p.hash===hash&&!p.excluded)){message('That exact photo is already in the batch; it was skipped.');return;}const original=await optimize(blob),p={id:crypto.randomUUID(),batchId:batch.id,name,hash,original,status:'pending',created:new Date().toISOString(),excluded:false};await put(db,'photos',p);photos.push(p);guestExported=false;if(replace){let old=photos.find(p=>p.id===replace);if(old){old.excluded=true;await put(db,'photos',old);}}render();$('captureCount').textContent=`${photos.filter(p=>!p.excluded).length} photos saved. Keep capturing or tap Done.`;}
$('photos').onchange=()=>safe(async()=>{const files=[...$('photos').files];if(!files.length)return;adding=true;render();try{for(let i=0;i<files.length;i++){message(`Saving photo ${i+1} of ${files.length}…`);await addPhoto(files[i],files[i].name);}message('Photos saved. Tap Grade sheets when you finish capturing.');}finally{adding=false;$('photos').value='';render();}});
$('retake').onchange=()=>safe(async()=>{const file=$('retake').files[0];if(file)await addPhoto(file,file.name,retakeId);retakeId=null;$('retake').value='';message('Replacement saved; the previous photo is excluded.');});
$('openCamera').onclick=()=>safe(async()=>{await ensureBatch();if(!navigator.mediaDevices?.getUserMedia){retakeId=null;$('retake').click();return;}stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2800},height:{ideal:2100}},audio:false});$('video').srcObject=stream;$('cameraDialog').showModal();$('captureCount').textContent=`${photos.filter(p=>!p.excluded).length} photos saved. Capture one side at a time.`;});
function closeCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('cameraDialog').close();}
$('closeCamera').onclick=closeCamera;$('cameraDialog').oncancel=closeCamera;
$('shutter').onclick=()=>safe(async()=>{$('shutter').disabled=true;try{const v=$('video');if(!v.videoWidth)throw Error('Wait for the camera preview.');const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.95));await addPhoto(blob,`Camera ${new Date().toLocaleTimeString()} · ${photos.length+1}.jpg`);}finally{$('shutter').disabled=false;}});
$('pause').onclick=()=>{paused=true;message('Pausing after the current photo is saved.');};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&processing)paused=true;});
$('process').onclick=()=>safe(async()=>{if(adding)throw Error('Wait for all photos to finish saving.');if(!batch||!ready)throw Error('Wait for the reader and add grading-sheet photos.');processing=true;paused=false;let wake;try{try{wake=await navigator.wakeLock?.request('screen');}catch{}render();for(const p of photos.filter(p=>!p.excluded&&['pending','error'].includes(p.status))){if(paused)break;guestExported=false;p.status='reading';p.error='';await put(db,'photos',p);render();try{p.result=await read(p.original);p.answers={};for(const row of [...p.result.rows,...p.result.bonus_rows])p.answers[row.question]=automatic(row);p.status='done';}catch(e){p.status='error';p.error=e.message;}await put(db,'photos',p);render();}message(paused?'Queue paused safely. Tap Grade sheets to resume.':'Grading finished. Downloads are ready for complete students; review any items needing attention.');}finally{processing=false;await wake?.release();render();}});
async function review(id){const p=photos.find(p=>p.id===id);if(!p)return;active=p;$('review').hidden=false;if(!$('reviewDialog').open)$('reviewDialog').showModal();$('responseEditor').open=false;$('identity').textContent=p.result?`Student ID: ${p.result.identity.value||'unreadable'} · Sheet ${p.result.side}`:p.name;$('reviewIssue').textContent=p.error||p.result?.identity.reason||'';await showGraded(p);const box=$('answerReview');box.replaceChildren();if(p.result)for(const row of [...p.result.rows.filter(r=>r.question<=batch.count),...p.result.bonus_rows.filter((_,i)=>i<batch.bonusKey.length)]){const wrap=el('div');wrap.className='answer'+(p.answers[row.question]==='pending'?' flag':'');wrap.append(el('strong',row.question>100?'EC'+(row.question-100):'Q'+row.question));const s=el('select');s.dataset.q=row.question;s.setAttribute('aria-label','Answer '+row.question);s.add(new Option('Review…','pending'));s.add(new Option('Blank — 0 points',''));s.add(new Option('Multiple — 0 points','MULTIPLE'));let multiple=row.strong_marks?.join('');if(multiple?.length>1)s.add(new Option(multiple+' — 0 points',multiple));for(const c of 'ABCDE')s.add(new Option(c,c));s.value=p.answers[row.question]??'';wrap.append(s,el('small',row.status));box.append(wrap);}$('saveReview').disabled=!p.result;if(!p.result||!groups(photos,batch).students.find(g=>g.ready&&g.photos.some(x=>x.id===p.id)))$('responseEditor').open=true;}
function showImage(blob){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);$('preview').src=previewURL;}
$('viewOriginal').onclick=()=>active&&showImage(active.original);$('viewCorrected').onclick=()=>active&&safe(()=>showGraded(active));
$('closeReview').onclick=()=>$('reviewDialog').close();
async function showGraded(p){const g=batch&&groups(photos,batch).students.find(g=>g.ready&&g.photos.some(x=>x.id===p.id));$('reviewTitle').textContent=g?'Graded Sheet':'Needs attention';$('reviewIssue').textContent=g?`${g.score.score}/${g.score.total} · ${g.score.percent}%`:p.error||'Resolve the ID, page or response issue before a final grade is available.';showImage(g?await feedbackPDF(g,batch,$('showAnswers').checked,p.id):p.result?.corrected||p.original);}
$('saveReview').onclick=()=>safe(async()=>{if(!active?.result)return;guestExported=false;for(const select of $('answerReview').querySelectorAll('select'))active.answers[select.dataset.q]=select.value===''?null:select.value;await put(db,'photos',active);render();await showGraded(active);message('Responses saved. Complete students are ready to download.');});
function exportable(){if(!batch)throw Error('Choose an exam.');const students=readyStudents(photos,batch);if(!students.length)throw Error('No complete students are ready. Resolve the listed issues.');return students;}
$('exportCsv').onclick=()=>safe(()=>{download(csvExport(exportable(),batch),'Class_results.csv');guestExported=true;});
$('exportPdf').onclick=()=>safe(async()=>{const students=exportable();exporting=true;render();$('exportPdf').disabled=true;try{download(await combinedPDF(students,batch,$('showAnswers').checked,(i,n)=>{$('exportStatus').textContent=`Creating combined PDF: ${i} of ${n} students…`;}),'Combined_Graded_Sheets.pdf');guestExported=true;message('Combined PDF created.');}finally{exporting=false;render();}});
$('backup').onclick=()=>safe(async()=>{
if(!batch||processing||adding||keyBusy||archiving)throw Error('Finish adding photos or pause grading before downloading a backup.');
archiving=true;render();try{
const manifest={format:'qcc-phone-backup-v1',batch,options:{showAnswers:$('showAnswers').checked},photos:photos.map(({original,result,...p})=>({...p,result:result?{...result,corrected:undefined}:undefined}))};
async function* files(){yield ['backup.json',JSON.stringify(manifest)];for(const p of photos){yield [`photos/${p.id}.jpg`,p.original];if(p.result?.corrected)yield [`corrected/${p.id}.jpg`,p.result.corrected];}}
const name='Exam_Backup_'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';download(await zipFiles(files()),name);guestExported=true;message('Backup downloaded. Download a new one after more grading.');
}finally{archiving=false;render();}
});
$('restore').onchange=()=>safe(async()=>{const restoreFile=$('restore').files[0];$('restore').value='';if(!restoreFile)return;if(processing||adding||keyBusy||archiving)throw Error('Pause grading and finish adding photos before restoring.');if(mode==='guest'&&photos.length)throw Error('Download a backup of this session, then start a fresh guest session before restoring another exam.');const file=restoreFile;archiving=true;render();try{if(file.size>150*1024*1024)throw Error('This backup is too large to restore on this device. Use a backup under 150 MB.');const backupBytes=new Uint8Array(await file.arrayBuffer());let expanded=0;fflate.unzipSync(backupBytes,{filter:f=>{expanded+=f.originalSize;if(expanded>250*1024*1024)throw Error('Expanded backup exceeds this device limit.');return false;}});const files=fflate.unzipSync(backupBytes),manifest=JSON.parse(fflate.strFromU8(files['backup.json']||new Uint8Array()));if(manifest.format!=='qcc-phone-backup-v1'||!Array.isArray(manifest.photos)||!manifest.batch?.roster?.students)throw Error('Not a supported Exam Grader backup.');const b=manifest.batch;parseKey(b.key,b.count);if(!Number.isInteger(b.count)||b.count<1||b.count>100||manifest.photos.length>1000)throw Error('Invalid backup settings.');if(!/^[ABCDE]{0,2}$/.test(b.bonusKey)||Object.entries(b.roster.students).some(([id,name])=>!/^\d{8}$/.test(id)||typeof name!=='string'||!name||name.length>120))throw Error('Invalid roster or bonus key in backup.');b.id=crypto.randomUUID();b.exam+=' (restored)';const restored=[];for(const old of manifest.photos){const original=files[`photos/${old.id}.jpg`];if(!original)throw Error('Backup is missing a photo.');const p={...old,id:crypto.randomUUID(),batchId:b.id,original:new Blob([original],{type:'image/jpeg'})};if(p.result){const corrected=files[`corrected/${old.id}.jpg`];if(!corrected)throw Error('Backup is missing a straightened photo.');p.result.corrected=new Blob([corrected],{type:'image/jpeg'});}if(p.status==='reading')p.status='pending';restored.push(p);}const oldConfirmed=b.confirmed||{};b.confirmed={};for(const g of groups(restored,b).students)if(g.ready&&oldConfirmed[g.id])b.confirmed[g.id]={...oldConfirmed[g.id],signature:g.signature};for(const p of restored)await put(db,'photos',p);state.batches.unshift(b);await selectBatch(b.id);if(typeof manifest.options?.showAnswers==='boolean')$('showAnswers').checked=manifest.options.showAnswers;guestExported=false;message('Backup restored. Continue grading the remaining sheets.');}finally{$('restore').value='';archiving=false;render();}});
setupKeyImport({read,optimize,isGuest:()=>mode==='guest',onSave:saveUploadedKey,onCancel:cancelKeyUpload,isReady:()=>ready,isProcessing:()=>processing||keyBusy||adding,setBusy:value=>{keyBusy=value;render();},message});
async function startWorkspace(nextMode){
if(opening||mode)return;opening=true;for(const id of ['guestStart','workspaceStart'])$(id).disabled=true;
try{mode=nextMode;guestExported=false;state={id:'app',rosters:[],batches:[],keys:[]};db=mode==='guest'?memoryDB():await openDB();
if(mode!=='guest')state=await get(db,'state','app')||state;state.keys??=[];
document.body.classList.toggle('guest-mode',mode==='guest');$('landing').hidden=true;$('workspace').hidden=false;$('deviceStatus').hidden=false;
$('modeLabel').textContent=mode==='guest'?'Guest mode':'My workspace';$('endSession').textContent=mode==='guest'?'End guest session':'Back to start';
$('savedKeyStatus').className='small';$('classStatus').className='small';$('classStatus').textContent='';keyMenu();rosterMenu();await selectBatch(mode==='guest'?'':state.activeBatch);
$('keyUpload').hidden=mode!=='guest';$('keyNameField').hidden=mode==='guest';$('applyKey').textContent=mode==='guest'?'Use key':'Save and use key';$('keyTitle').textContent=mode==='guest'?'Check answer key':'Save new answer key';
$('keyHeading').textContent=mode==='guest'?'1 · Upload key':'2 · Answer Key';$('captureHeading').textContent=mode==='guest'?'2 · Capture Grading Sheets':'3 · Capture Grading Sheets';$('exportHeading').textContent=mode==='guest'?'3 · Export':'4 · Export';
$('savedKeyStatus').textContent=mode==='guest'?'Upload your marked instructor key. No name or saving needed.':$('savedKeyStatus').textContent;
$('sessionFooter').textContent=mode==='guest'?'Guest work stays in temporary memory. Download results or a backup before leaving.':'Saved classes, keys and grades stay in this browser on this device.';
render();
}catch(e){db?.close?.();db=null;mode=null;$('workspace').hidden=true;$('deviceStatus').hidden=true;$('landing').hidden=false;$('workspaceErrorStatus').textContent='Could not open this workspace: '+e.message;$('workspaceErrorDialog').showModal();}
finally{opening=false;for(const id of ['guestStart','workspaceStart'])$(id).disabled=false;}
}
$('guestStart').onclick=()=>startWorkspace('guest');
$('workspaceStart').onclick=()=>startWorkspace('local');
$('closeWorkspaceError').onclick=()=>$('workspaceErrorDialog').close();
$('endSession').onclick=()=>{if(processing||adding||keyBusy||exporting||archiving)return;if(mode==='guest'&&($('key').value||photos.length)){$('endSessionMessage').textContent=guestExported?'End this guest session? Its temporary key, photos and grades will be cleared. Your downloaded files will remain.':'Download your results or a backup before leaving. Ending this guest session clears its temporary key, photos and grades.';$('endDialog').showModal();}else endSession();};
$('keepSession').onclick=()=>$('endDialog').close();$('confirmEnd').onclick=endSession;
function endSession(){
if(processing||adding||keyBusy||exporting||archiving)return;closeCamera();$('blankSheetDialog').close();$('infoDialog').close();$('endDialog').close();$('reviewDialog').close();$('keyDialog').close();clearDownloads();
if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;$('preview').removeAttribute('src');
if(db?.memory)for(const store of Object.values(db.memory))store.clear();else db?.close();db=null;mode=null;
state={id:'app',rosters:[],batches:[],keys:[]};batch=null;photos=[];active=null;deletedPhoto=null;retakeId=null;activeKeyId='';keyExtraAnswers=['',''];guestExported=false;
for(const id of ['exam','key','ec1','ec2','keyName','keyPhotos','photos','retake','restore'])$(id).value='';$('bonus').value='0';$('count').value='50';
for(const id of ['photoList','answerReview','keyChoices','summary','message','keySummary','batchInfo','downloadLinks','classList'])$(id).replaceChildren();
$('workspace').hidden=true;$('deviceStatus').hidden=true;$('landing').hidden=false;document.body.classList.remove('guest-mode');$('guestStart').focus();
}
window.addEventListener('beforeunload',e=>{if(mode==='guest'&&!guestExported&&($('key').value||photos.length)){e.preventDefault();e.returnValue='';}});
(async()=>{try{if('serviceWorker'in navigator){const registration=await navigator.serviceWorker.register('./sw.js?v=1.9.1',{updateViaCache:'none'});const check=()=>{const sw=registration.active||registration.waiting;sw?.postMessage({type:'CACHE_STATUS'});};navigator.serviceWorker.addEventListener('message',e=>{if(e.data.type==='OFFLINE_READY')$('offline').textContent='Offline access ready.';if(e.data.type==='OFFLINE_ERROR')$('offline').textContent='Offline files could not be saved. Keep internet available and retry later.';});check();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',check));}else $('offline').textContent='Offline installation is not available in this browser.';}catch(e){$('offline').textContent='Offline access is unavailable. Keep internet available.';}})();

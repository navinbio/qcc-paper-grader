export const automatic=r=>r.status==='clear'?r.selected:r.status==='blank'?null:r.status==='multiple'?(r.strong_marks?.join('')||'MULTIPLE'):'pending';
export function parseKey(raw,count){const key=raw.toUpperCase().replace(/[\s,]+/g,'');if(key.length!==count||/[^ABCDE]/.test(key))throw Error(`Enter exactly ${count} answer letters, A–E.`);return key;}
export function detectedKeyCount(results){
if(results.length===1&&results[0].side===1)return 50;
if(results.length===2&&results.filter(r=>r.side===1).length===1&&results.filter(r=>r.side===2).length===1)return 100;
throw Error('For 50 questions, upload Sheet 1. For 100 questions, upload one Sheet 1 and one Sheet 2 together.');
}
export function extraAnswersForKey(key){return [0,1].map(i=>{const value=key.extraAnswers?.[i]||key.bonusKey?.[i]||'';return /^[ABCDE]$/.test(value)?value:'';});}
export function selectedBonusKey(answers,count){
if(![0,1,2].includes(count)||Array.from({length:count},(_,i)=>answers[i]).some(v=>!/^[ABCDE]$/.test(v||'')))throw Error('Add the correct answer for each selected extra-credit question.');
return answers.slice(0,count).join('');
}
export function namedKey(name,count,raw,bonusKey,existing=[]){
const clean=String(name??'').trim().replace(/\s+/g,' ');
if(!clean||clean.length>120)throw Error('Give this key a name of 1–120 characters.');
if(existing.some(k=>String(k.name).trim().replace(/\s+/g,' ').toLowerCase()===clean.toLowerCase()))throw Error('That key name is already saved. Choose a unique name to save a new key.');
if(![50,100].includes(count))throw Error('Choose 50 or 100 questions.');
if(typeof bonusKey!=='string'||!/^[ABCDE]{0,2}$/.test(bonusKey))throw Error('Choose one A–E answer for each enabled extra-credit question.');
return {name:clean,count,key:parseKey(raw,count),bonusKey};
}
export function keyFromSheets(results,count,bonusCount){
if(![50,100].includes(count)||![0,1,2].includes(bonusCount))throw Error('Choose 50 or 100 questions and up to two extra-credit questions.');
const sides=count===100?[1,2]:[1];
if(results.length!==sides.length)throw Error(count===100?'Select one photo of Sheet 1 and one of Sheet 2 together.':'Select one photo of Sheet 1.');
for(const side of sides)if(results.filter(r=>r.side===side).length!==1)throw Error(`Upload exactly one photo of Sheet ${side}. Check for duplicate or incorrect pages.`);
const entries=[];
for(const side of sides){const rows=results.find(r=>r.side===side).rows||[];for(let q=(side-1)*50+1;q<=side*50;q++){
const matches=rows.filter(r=>r.question===q),r=matches.length===1?matches[0]:null;
entries.push({question:q,label:'Q'+q,value:r?.status==='clear'&&/^[ABCDE]$/.test(r.selected||'')?r.selected:'',status:r?.status||'unreadable'});
}}
const bonus=results.find(r=>r.side===1).bonus_rows||[];
for(let i=0;i<bonusCount;i++){const matches=bonus.filter(r=>r.question===101+i),r=matches.length===1?matches[0]:null;entries.push({question:101+i,label:'EC'+(i+1),value:r?.status==='clear'&&/^[ABCDE]$/.test(r.selected||'')?r.selected:'',status:r?.status||'unreadable'});}
return entries;
}
export function reviewedKey(entries,count,bonusCount){
const expected=[...Array.from({length:count},(_,i)=>i+1),...Array.from({length:bonusCount},(_,i)=>101+i)];
if(entries.length!==expected.length||entries.some((r,i)=>r.question!==expected[i]||!/^[ABCDE]$/.test(r.value||'')))throw Error('Choose one correct answer, A–E, for every question and selected extra-credit question.');
return {key:entries.slice(0,count).map(r=>r.value).join(''),bonusKey:entries.slice(count).map(r=>r.value).join('')};
}
export function calculate(answers,key,bonus,bonusKey){let regular=answers.filter((a,i)=>a===key[i]).length,earned=bonus.filter((a,i)=>a===bonusKey[i]).length,score=Math.min(key.length,regular+earned);return {regular,earned,score,total:key.length,percent:Math.round(1000*score/key.length)/10};}
export function readyStudents(photos,batch){return groups(photos,batch).students.filter(g=>g.ready);}
export function groups(photos,batch){let byId=new Map(),issues=[];for(const photo of photos.filter(p=>!p.excluded)){if(photo.status!=='done'){issues.push({photo,message:photo.error||'Not processed'});continue;}let r=photo.result,id=r.identity.value;if(r.identity.status!=='clear'||!/^\d{8}$/.test(id||'')){issues.push({photo,message:'Student ID is unreadable. Retake the ID grid; no identity was guessed.'});continue;}const name=batch.roster.students[id];if(!name){issues.push({photo,message:`ID ${id} is not in ${batch.roster.name}. Check the class and ID marks.`});continue;}if(batch.count===50&&r.side===2){issues.push({photo,message:'Sheet 2 is not needed for this 50-question exam.'});continue;}if(!byId.has(id))byId.set(id,{id,name,sides:{},issues:[]});let g=byId.get(id);(g.sides[r.side]??=[]).push(photo);}
for(const g of byId.values()){for(const side of batch.count===100?[1,2]:[1]){const p=g.sides[side]||[];if(p.length===0)g.issues.push(`Missing Sheet ${side}`);if(p.length>1)g.issues.push(`Duplicate Sheet ${side}: choose the photo to keep`);}g.photos=Object.values(g.sides).flat().sort((a,b)=>a.result.side-b.result.side);g.answers=[];g.bonus=[];for(const p of g.photos){for(const row of p.result.rows)g.answers[row.question-1]=p.answers[row.question];if(p.result.side===1)for(let n=0;n<batch.bonusKey.length;n++){let row=p.result.bonus_rows[n];if(!row){g.issues.push('Extra-credit bubbles are missing. Use the bonus template.');continue;}g.bonus[n]=p.answers[row.question];}}
if(g.answers.some(a=>a==='pending')||g.bonus.some(a=>a==='pending'))g.issues.push('Uncertain responses need review');
if(g.answers.length!==batch.count||Array.from({length:batch.count},(_,i)=>g.answers[i]).some(a=>a===undefined)||g.bonus.length!==batch.bonusKey.length||Array.from({length:batch.bonusKey.length},(_,i)=>g.bonus[i]).some(a=>a===undefined))g.issues.push('Incomplete response set');
g.ready=g.issues.length===0;g.signature=JSON.stringify(g.photos.map(p=>[p.id,p.answers]));g.confirmed=g.ready&&batch.confirmed?.[g.id]?.signature===g.signature;g.score=g.ready?calculate(g.answers,batch.key,g.bonus,batch.bonusKey):null;}
return {students:[...byId.values()].sort((a,b)=>a.name.localeCompare(b.name)),issues};}
export function parseRosterRows(rows){let columns,students={};const normalize=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');for(let n=0;n<rows.length;n++){const row=rows[n];if(!row.some(v=>String(v??'').trim()))continue;if(!columns){const h=row.map(normalize),ids=h.map((k,i)=>['orgdefinedid','studentid','studentnumber','emplid','id'].includes(k)?i:-1).filter(i=>i>=0),first=h.findIndex(k=>['firstname','givenname'].includes(k)),last=h.findIndex(k=>['lastname','surname','familyname'].includes(k)),full=h.findIndex(k=>['name','fullname','studentname'].includes(k));if(ids.length===1&&(full>=0||(first>=0&&last>=0)))columns={id:ids[0],first,last,full};else if(n>=29)return null;continue;}const id=String(row[columns.id]??'').trim(),name=columns.full>=0?String(row[columns.full]??'').trim():[row[columns.first],row[columns.last]].map(v=>String(v??'').trim()).filter(Boolean).join(' ');if(!/^\d{8}$/.test(id))throw Error(`Row ${n+1}: ID must contain eight digits. Keep leading zeros as text.`);if(!name||name.length>120||name.startsWith('='))throw Error(`Row ${n+1}: provide a name of 1–120 characters as plain text.`);if(Object.hasOwn(students,id))throw Error(`Row ${n+1}: duplicate student ID ${id}.`);students[id]=name;}return columns&&Object.keys(students).length?students:null;}
export function csvRows(raw){let rows=[],row=[],field='',quoted=false;for(let i=0;i<raw.length;i++){let c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error('CSV contains an unclosed quoted field.');if(field||row.length){row.push(field);rows.push(row);}return rows;}
export async function importRoster(file){if(file.size>10*1024*1024)throw Error('Use roster files smaller than 10 MB.');let sheets=[];if(/\.csv$/i.test(file.name)){sheets=[{name:file.name.replace(/\.csv$/i,''),rows:csvRows((await file.text()).replace(/^\uFEFF/,''))}];}else if(/\.xlsx$/i.test(file.name)){const data=new Uint8Array(await file.arrayBuffer());let expanded=0;fflate.unzipSync(data,{filter:f=>{expanded+=f.originalSize;if(expanded>50*1024*1024)throw Error('Workbook is too large. Export a smaller class roster.');return false;}});const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(data);if(workbook.worksheets.length>50)throw Error('Use at most 50 worksheets.');for(const ws of workbook.worksheets){if(ws.rowCount>20001||ws.columnCount>200)throw Error('Roster worksheet is too large.');let rows=[];ws.eachRow({includeEmpty:true},r=>{let values=[];for(let i=1;i<=ws.columnCount;i++){let c=r.getCell(i),v=c.value;if(v?.formula)v='[formula]';else if(v?.richText)v=v.richText.map(x=>x.text).join('');if(typeof v==='number'&&c.numFmt==='00000000')v=String(v).padStart(8,'0');values.push(v??'');}rows.push(values);});sheets.push({name:ws.name,rows});}}else throw Error('Choose an .xlsx or UTF-8 .csv roster.');let result=[],seen=new Set();for(const sheet of sheets){const students=parseRosterRows(sheet.rows);if(!students)continue;const signature=JSON.stringify(Object.entries(students).sort());if(seen.has(signature))continue;seen.add(signature);result.push({id:crypto.randomUUID(),name:sheet.name===file.name.replace(/\.[^.]+$/,'')?sheet.name:`${file.name.replace(/\.[^.]+$/,'')} · ${sheet.name}`,students});}if(!result.length)throw Error('No roster found. Include Student ID and First Name/Last Name or Full Name.');return result;}

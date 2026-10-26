import {mkdir,cp,copyFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),target=resolve(root,'site');
await mkdir(target,{recursive:true});
for(const name of ['index.html','style.css','app.js','core.js','db.js','reader.js','worker.js','exports.js','sw.js','templates.json','manifest.webmanifest','icon.svg','icon-180.png','icon-192.png','icon-512.png'])await copyFile(resolve(root,name),resolve(target,name));
for(const dir of ['vendor','sheets'])await cp(resolve(root,dir),resolve(target,dir),{recursive:true});
console.log('Static deployment built in site/. No rosters, photos or runtime data are included.');

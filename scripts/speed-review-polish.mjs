import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const review=resolve('.codex-backups/speed-source-identity-20261023/review');
const assets=join(review,'scripts/zubayd-assets.mjs');let s=readFileSync(assets,'utf8');s=s.replace('x.fillStyle=color;x.fillRect(0,0,size,size);if(logoData)','x.fillStyle=logoData?"#ffffff":color;x.fillRect(0,0,size,size);if(logoData)');writeFileSync(assets,s);
const center=join(review,'src/components/access-center.tsx');let c=readFileSync(center,'utf8').replace('defaultValue="skyline"','placeholder="اسم حساب البرنامج"');writeFileSync(center,c);
for(const file of ['setup.html','maintenance.html','connection.html']){const p=join(review,'desktop',file);let h=readFileSync(p,'utf8').replaceAll('#1d5ed8','#0b2242').replaceAll('#f3f6fb','#f4f6f8').replaceAll('#142b4b','#0b2242').replaceAll('#51657f','#64748b').replaceAll('#cbd8e8','#dbe1e6');writeFileSync(p,h);}
console.log('Review logo icon uses a white source-theme surface, preserving the complete original image.');

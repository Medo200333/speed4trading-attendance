import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const review=resolve('.codex-backups/speed-source-identity-20261023/review');
for(const name of ['src/components/configuration-studio.tsx','src/components/configuration-live.tsx','android/app/src/main/java/com/zubayd/accesscontrol/MainActivity.java']){const p=join(review,name);writeFileSync(p,readFileSync(p,'utf8').replaceAll('Zubayd-','Speed-Maintenance-'));}
const descriptor=join(review,'public/zubayd-server.json'),value=JSON.parse(readFileSync(descriptor));value.name='Speed Maintenance';value.ownerName='Speed for Training';writeFileSync(descriptor,JSON.stringify(value,null,2));
const main=join(review,'desktop/main.cjs');let m=readFileSync(main,'utf8').replace('Zubayd-backup.zubayd','Speed-Maintenance-backup.speedbackup').replaceAll('name: "Zubayd encrypted backup", extensions: ["zubayd"]','name: "نسخة البرنامج المشفرة", extensions: ["speedbackup", "zubayd"]');m=m.replace('!backupTarget.toLowerCase().endsWith(".zubayd")','!(/.(speedbackup|zubayd)$/i.test(backupTarget))');writeFileSync(main,m);
console.log('Visible artifact and backup names corrected in review; legacy IDs and archive compatibility remain intact.');

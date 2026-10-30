import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const review=resolve('.codex-backups/speed-source-identity-20261023/review');
const company=join(review,'src/components/company-workspace.tsx');let c=readFileSync(company,'utf8');if(!c.includes('import { BRAND }'))c='import { BRAND } from "@/lib/brand";\n'+c;c=c.replace('Speed Maintenance هو مالك البرنامج.','{BRAND.ownerName} هي الشركة المالكة للبرنامج {BRAND.name}.');writeFileSync(company,c);
const guide=join(review,'src/lib/access/guide.ts');let g=readFileSync(guide,'utf8').replaceAll('Zubayd-Setup','Speed-Maintenance-Review-Setup').replaceAll('Zubayd-debug.apk','Speed-Maintenance-review.apk').replaceAll('هوية مالك البرنامج Speed Maintenance','هوية مالك البرنامج Speed for Training').replaceAll('المالك: Speed Maintenance','المالك: Speed for Training');writeFileSync(guide,g);
console.log('Owner, product and customer names are independent in the review UI and guide.');

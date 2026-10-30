import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const review=resolve('.codex-backups/speed-source-identity-20261023/review');
const main=join(review,'desktop/main.cjs');let source=readFileSync(main,'utf8');
const marker='app.setName(brand.name);';
if(!source.includes('SPEED_DESKTOP_TEST_PROFILE'))source=source.replace(marker,marker+`
// Acceptance tests use an explicitly selected, isolated temporary profile only.
const testProfile=process.env.SPEED_DESKTOP_E2E==='1'?process.env.SPEED_DESKTOP_TEST_PROFILE:'';
if(testProfile){const target=resolve(testProfile),temporary=resolve(require('node:os').tmpdir());if(!target.startsWith(temporary+require('node:path').sep)||!require('node:path').basename(target).startsWith('speed-acceptance-'))throw new Error('TEST_PROFILE');app.setPath('userData',target);}
`);
source=source.replace('width: 1280,','show: !testProfile,\n    width: 1280,');writeFileSync(main,source);
const pdf=join(review,'src/lib/sheet-pdf.ts');let p=readFileSync(pdf,'utf8');
p=p.replace('const PT = 2.83465;','const PT = 2.83465;\nconst PDF_NAVY = BRAND.palette.navy.match(/[0-9a-f]{2}/gi)!.map(part=>(parseInt(part,16)/255).toFixed(4)).join(" ");');
p=p.replaceAll('0.047 0.239 0.4','${PDF_NAVY}').replaceAll('"#0c3d66"','BRAND.palette.navy');
writeFileSync(pdf,p);
console.log('Native acceptance profile and report palette prepared in review only.');

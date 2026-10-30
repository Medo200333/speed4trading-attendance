import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const review=resolve('.codex-backups/speed-source-identity-20261023/review');
for(const root of [process.cwd(),review]){
 const file=join(root,'desktop/package.json'),pkg=JSON.parse(readFileSync(file));
 const publisher=pkg.build.win.publisherName||pkg.author;delete pkg.build.win.publisherName;
 pkg.build.win.signtoolOptions={...pkg.build.win.signtoolOptions,publisherName:publisher};
 writeFileSync(file,JSON.stringify(pkg,null,2));
 const assets=join(root,'scripts/zubayd-assets.mjs');let s=readFileSync(assets,'utf8').replace('desktop.build.win.publisherName=brand.publisher;','delete desktop.build.win.publisherName;desktop.build.win.signtoolOptions={...desktop.build.win.signtoolOptions,publisherName:brand.publisher};');writeFileSync(assets,s);
}
console.log('Corrected publisherName placement for the installed electron-builder schema; live branding is unchanged.');

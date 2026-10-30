import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const roots=[process.cwd(),resolve('.codex-backups/speed-source-identity-20261023/review')];
for(const root of roots){
 const config=join(root,'desktop/desktop-config.cjs');let source=readFileSync(config,'utf8');
 if(!source.includes('function safeDataDirectory(')){
 source=source.replace('function createInstallation(directory, input) {',`function safeDataDirectory(directory, installationRoot) {
  const selected=resolve(directory), installed=resolve(installationRoot), normalize=value=>process.platform==='win32'?value.toLowerCase():value;
  if(normalize(selected)===normalize(installed)||normalize(selected).startsWith(normalize(installed)+require('node:path').sep))throw new Error('DATA_INSIDE_INSTALLATION');
  return selected;
}
function createInstallation(directory, input) {`);
 source=source.replace('  createInstallation,','  safeDataDirectory,\n  createInstallation,');writeFileSync(config,source);
 }
 const main=join(root,'desktop/main.cjs');let m=readFileSync(main,'utf8');if(!m.includes('  safeDataDirectory,'))m=m.replace('  createInstallation,','  safeDataDirectory,\n  createInstallation,');
 m=m.replace('    input.dataDirectory || join(app.getPath("userData"), "data"),','    safeDataDirectory(input.dataDirectory || join(app.getPath("userData"), "data"), require("node:path").dirname(process.execPath)),');writeFileSync(main,m);
}
console.log('Data directories inside the installation folder are rejected. Live web data is untouched.');

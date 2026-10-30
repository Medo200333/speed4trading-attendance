import {readFileSync,existsSync} from 'node:fs';
const file='.codex-backups/speed-source-identity-20261023/windows-toolchain.log';if(existsSync(file))console.log(readFileSync(file,'utf8').split(/\r?\n/).slice(-55).join('\n'));

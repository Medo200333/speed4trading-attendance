import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {writeFileSync,createWriteStream} from 'node:fs';
// Installer-only compatibility with the host OpenSSL accelerated GCM failure.
// Certificate verification, HTTPS, registry integrity checks and TLS protocols remain enabled.
const npm=join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
const log=createWriteStream('.codex-backups/zubayd-platform-20261023/windows-download.log');
// ChaCha20-Poly1305 avoids the host's failing accelerated AES-GCM TLS path.
const child=spawn(process.execPath,[npm,'install','--prefix','desktop','--save-dev','--save-exact','electron@latest','electron-builder@latest','--maxsockets=1','--fetch-retries=2'],{stdio:['ignore','pipe','pipe'],windowsHide:true,env:{...process.env,NODE_OPTIONS:[process.env.NODE_OPTIONS||'','--tls-cipher-list=TLS_CHACHA20_POLY1305_SHA256'].join(' ').trim()}});
child.stdout.on('data',chunk=>{process.stdout.write(chunk);log.write(chunk);});child.stderr.on('data',chunk=>{process.stderr.write(chunk);log.write(chunk);});
child.on('exit',code=>{writeFileSync('.codex-backups/zubayd-platform-20261023/windows-download-result.json',JSON.stringify({exitCode:code,tlsVerification:true,cipher:'TLS_CHACHA20_POLY1305_SHA256'}));log.end();process.exit(code||0);});

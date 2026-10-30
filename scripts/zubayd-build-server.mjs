import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.zubayd-desktop.config.ts'],{stdio:'inherit',windowsHide:true,env:{...process.env,VITE_AUTH_ENABLED:'false',VITE_GROK_EXTENSIONS:'0'}});
child.on('exit',code=>process.exit(code||0));

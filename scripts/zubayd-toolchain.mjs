import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const sdk=join(process.env.LOCALAPPDATA||'','Android','Sdk');
const directories=[['platforms',join(sdk,'platforms')],['buildTools',join(sdk,'build-tools')],['commandLineTools',join(sdk,'cmdline-tools')],['java',join(process.env.ProgramFiles||'C:/Program Files','Java')]];
const result=Object.fromEntries(directories.map(([name,path])=>[name,existsSync(path)?readdirSync(path):[]]));
result.jdkCandidates=['C:/Program Files/Android/Android Studio/jbr','C:/Program Files/Microsoft/jdk-21','C:/Program Files/Java/jdk-21'].filter(p=>existsSync(join(p,'bin','javac.exe')));
console.log(JSON.stringify(result));

import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const release=process.env.SPEED_RELEASE_KEYSTORE||'';
const sdk=process.env.ANDROID_HOME||join(process.env.LOCALAPPDATA||'','Android','Sdk'),jdk=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
const tools=join(sdk,'build-tools','36.1.0'),jar=join(sdk,'platforms','android-36.1','android.jar'),root=resolve('android'),out=join(root,'build','manual-debug');
if(!existsSync(jar)||!existsSync(join(jdk,'bin','javac.exe')))throw new Error('Android SDK API 36.1 and JDK17+ are required. Set ANDROID_HOME and JAVA_HOME.');
for(const d of [out,join(out,'generated'),join(out,'classes'),join(out,'dex'),'releases/android','.codex-backups/zubayd-platform-20261023/android-signing'])mkdirSync(d,{recursive:true});
function run(exe,args,env={}){const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,env:{...process.env,JAVA_HOME:jdk,...env},maxBuffer:10_000_000});if(r.status!==0)throw new Error(`${exe.split(/[\\/]/).at(-1)} failed\n${r.stdout||''}\n${r.stderr||r.error?.message||''}`);if(r.stderr)console.log(r.stderr.trim());}
const manifest=readFileSync(join(root,'app','src','main','AndroidManifest.xml'),'utf8').replace('<application ',release?'<application ':'<application android:debuggable="true" ');writeFileSync(join(out,'AndroidManifest.xml'),manifest);
run(join(tools,'aapt2.exe'),['compile','--dir',join(root,'app','src','main','res'),'-o',join(out,'resources.zip')]);
run(join(tools,'aapt2.exe'),['link','-o',join(out,'resources.apk'),'-I',jar,'--manifest',join(out,'AndroidManifest.xml'),'--java',join(out,'generated'),'--min-sdk-version','26','--target-sdk-version','35','--version-code','7','--version-name','1.1.1',join(out,'resources.zip')]);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
run(join(jdk,'bin','javac.exe'),['-source','8','-target','8','-encoding','UTF-8','-cp',jar,'-d',join(out,'classes'),...walk(join(root,'app','src','main','java')).filter(f=>f.endsWith('.java')),...walk(join(out,'generated')).filter(f=>f.endsWith('.java'))]);
run(join(jdk,'bin','java.exe'),['-cp',join(tools,'lib','d8.jar'),'com.android.tools.r8.D8','--lib',jar,'--min-api','26','--output',join(out,'dex'),...walk(join(out,'classes')).filter(f=>f.endsWith('.class'))]);
run(join(jdk,'bin','jar.exe'),['uf',join(out,'resources.apk'),'-C',join(out,'dex'),'classes.dex']);
run(join(tools,'zipalign.exe'),['-p','-f','4',join(out,'resources.apk'),join(out,'aligned.apk')]);
const key=resolve('.codex-backups/zubayd-platform-20261023/android-signing/debug.keystore');
if(!existsSync(key))run(join(jdk,'bin','keytool.exe'),['-genkeypair','-keystore',key,'-storepass','android','-keypass','android','-alias','androiddebugkey','-dname','CN=Android Debug,O=Android,C=US','-keyalg','RSA','-keysize','2048','-validity','3650']);
const apk=resolve(release?'releases/android/SpeedForTraining-1.1.1.apk':'releases/android/SpeedForTraining-debug.apk');
if(release){if(!process.env.SPEED_RELEASE_STORE_PASSWORD||!process.env.SPEED_RELEASE_KEY_PASSWORD)throw new Error('Release keystore passwords missing');run(join(jdk,'bin','java.exe'),['-jar',join(tools,'lib','apksigner.jar'),'sign','--ks',release,'--ks-key-alias','speed','--ks-pass','env:SPEED_RELEASE_STORE_PASSWORD','--key-pass','env:SPEED_RELEASE_KEY_PASSWORD','--out',apk,join(out,'aligned.apk')]);}
else run(join(jdk,'bin','java.exe'),['-jar',join(tools,'lib','apksigner.jar'),'sign','--ks',key,'--ks-key-alias','androiddebugkey','--ks-pass','env:ZUBAYD_DEBUG_STORE_PASSWORD','--out',apk,join(out,'aligned.apk')],{ZUBAYD_DEBUG_STORE_PASSWORD:'android'});
run(join(jdk,'bin','java.exe'),['-jar',join(tools,'lib','apksigner.jar'),'verify','--verbose',apk]);
run(join(tools,'aapt2.exe'),['dump','badging',apk]);console.log(JSON.stringify({artifact:apk,type:release?'release':'debug',productionSigning:Boolean(release),containsDeviceCredentials:false,requiresHttpsServer:true}));

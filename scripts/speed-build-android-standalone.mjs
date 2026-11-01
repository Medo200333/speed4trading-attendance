// Standalone APK: thin WebView client + nodejs-mobile running the bundled dist-server on 127.0.0.1 (no Gradle).
// Inputs: Android SDK 36.1 build-tools, NDK (ANDROID_NDK_HOME or newest under Sdk/ndk), NODEJS_MOBILE_DIR (default C:/tools/nodejs-mobile-v18.20.4),
// dist-server/ (npm run build) or releases/windows/win-unpacked/resources/server. Release signing uses the same env vars as zubayd-build-android.mjs.
import {existsSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,cpSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const VERSION_CODE='26',VERSION_NAME='1.2.9',ALL_ABIS={'arm64-v8a':'aarch64-linux-android','armeabi-v7a':'armv7a-linux-androideabi','x86_64':'x86_64-linux-android'};
// Phones: arm64-v8a + armeabi-v7a. Add x86_64 (emulator tests) with SPEED_ANDROID_ABIS=arm64-v8a,armeabi-v7a,x86_64
const ABIS=Object.fromEntries((process.env.SPEED_ANDROID_ABIS||'arm64-v8a,armeabi-v7a').split(',').map(a=>[a,ALL_ABIS[a]]));
const release=process.env.SPEED_RELEASE_KEYSTORE||'';
const sdk=process.env.ANDROID_HOME||join(process.env.LOCALAPPDATA||'','Android','Sdk'),jdk=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
const ndk=process.env.ANDROID_NDK_HOME||join(sdk,'ndk',readdirSync(join(sdk,'ndk')).sort().at(-1));
const nm=process.env.NODEJS_MOBILE_DIR||'C:/tools/nodejs-mobile-v18.20.4';
const tools=join(sdk,'build-tools','36.1.0'),jar=join(sdk,'platforms','android-36.1','android.jar'),root=resolve('android'),out=join(root,'build','standalone');
const serverSrc=[resolve('dist-server'),resolve('releases/windows/win-unpacked/resources/server')].find(d=>existsSync(join(d,'server','index.mjs')));
if(!existsSync(jar)||!existsSync(join(jdk,'bin','javac.exe')))throw new Error('Android SDK API 36.1 and JDK17+ are required.');
if(!existsSync(join(nm,'bin','arm64-v8a','libnode.so')))throw new Error('nodejs-mobile not found; set NODEJS_MOBILE_DIR.');
if(!serverSrc)throw new Error('dist-server bundle missing: run the Windows/server build first.');
rmSync(out,{recursive:true,force:true});
for(const d of [out,join(out,'generated'),join(out,'classes'),join(out,'dex'),join(out,'assets'),join(out,'native'),'releases/android'])mkdirSync(d,{recursive:true});
function run(exe,args,env={}){const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,env:{...process.env,JAVA_HOME:jdk,...env},maxBuffer:50_000_000});if(r.status!==0)throw new Error(`${exe.split(/[\\/]/).at(-1)} failed\n${r.stdout||''}\n${r.stderr||r.error?.message||''}`);if(r.stderr)console.log(r.stderr.trim().slice(0,2000));return r.stdout;}
// 1. native: JNI shim per ABI + libnode + libc++_shared
const llvm=join(ndk,'toolchains','llvm','prebuilt','windows-x86_64');
for(const [abi,triple] of Object.entries(ABIS)){
  const dir=join(out,'native','lib',abi);mkdirSync(dir,{recursive:true});
  run(join(llvm,'bin','clang++.exe'),[`--target=${triple}26`,'-shared','-fPIC','-O2','-std=c++17','-I',join(nm,'include','node'),join(root,'app','src','main','jni','speednode.cpp'),'-L',join(nm,'bin',abi),'-lnode','-llog','-o',join(dir,'libspeednode.so')]);
  copyFileSync(join(nm,'bin',abi,'libnode.so'),join(dir,'libnode.so'));
  const libTriple=triple.replace('armv7a','arm');copyFileSync(join(llvm,'sysroot','usr','lib',libTriple,'libc++_shared.so'),join(dir,'libc++_shared.so'));
}
// 2. assets: the same server bundle the Windows EXE runs
// added with jar (forward slashes, keeps _ssr/_chunks dirs that aapt2 -A would skip or mangle on Windows)
cpSync(join(serverSrc),join(out,'pkg','assets','server'),{recursive:true});
// 3. resources, java, dex (same pipeline as zubayd-build-android.mjs)
const manifest=readFileSync(join(root,'app','src','main','AndroidManifest.xml'),'utf8').replace('<application ',release?'<application android:extractNativeLibs="true" ':'<application android:extractNativeLibs="true" android:debuggable="true" ');writeFileSync(join(out,'AndroidManifest.xml'),manifest);
run(join(tools,'aapt2.exe'),['compile','--dir',join(root,'app','src','main','res'),'-o',join(out,'resources.zip')]);
run(join(tools,'aapt2.exe'),['link','-o',join(out,'resources.apk'),'-I',jar,'--manifest',join(out,'AndroidManifest.xml'),'--java',join(out,'generated'),'--min-sdk-version','26','--target-sdk-version','35','--version-code',VERSION_CODE,'--version-name',VERSION_NAME,join(out,'resources.zip')]);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(d,e.name)):[join(d,e.name)]);
run(join(jdk,'bin','javac.exe'),['-source','8','-target','8','-encoding','UTF-8','-cp',jar,'-d',join(out,'classes'),...walk(join(root,'app','src','main','java')).filter(f=>f.endsWith('.java')),...walk(join(out,'generated')).filter(f=>f.endsWith('.java'))]);
run(join(jdk,'bin','java.exe'),['-cp',join(tools,'lib','d8.jar'),'com.android.tools.r8.D8','--lib',jar,'--min-api','26','--output',join(out,'dex'),...walk(join(out,'classes')).filter(f=>f.endsWith('.class'))]);
run(join(jdk,'bin','jar.exe'),['uf',join(out,'resources.apk'),'-C',join(out,'dex'),'classes.dex','-C',join(out,'native'),'lib','-C',join(out,'pkg'),'assets']);
run(join(tools,'zipalign.exe'),['-p','-f','4',join(out,'resources.apk'),join(out,'aligned.apk')]);
const apk=resolve(release?`releases/android/SpeedForTraining-${VERSION_NAME}-standalone.apk`:'releases/android/SpeedForTraining-standalone-debug.apk');
const key=resolve('.codex-backups/zubayd-platform-20261023/android-signing/debug.keystore');
if(release){if(!process.env.SPEED_RELEASE_STORE_PASSWORD||!process.env.SPEED_RELEASE_KEY_PASSWORD)throw new Error('Release keystore passwords missing');run(join(jdk,'bin','java.exe'),['-jar',join(tools,'lib','apksigner.jar'),'sign','--ks',release,'--ks-key-alias','speed','--ks-pass','env:SPEED_RELEASE_STORE_PASSWORD','--key-pass','env:SPEED_RELEASE_KEY_PASSWORD','--out',apk,join(out,'aligned.apk')]);}
else run(join(jdk,'bin','java.exe'),['-jar',join(tools,'lib','apksigner.jar'),'sign','--ks',key,'--ks-key-alias','androiddebugkey','--ks-pass','env:ZUBAYD_DEBUG_STORE_PASSWORD','--out',apk,join(out,'aligned.apk')],{ZUBAYD_DEBUG_STORE_PASSWORD:'android'});
run(join(jdk,'bin','java.exe'),['-jar',join(tools,'lib','apksigner.jar'),'verify',apk]);
console.log(JSON.stringify({artifact:apk,type:release?'release':'debug',versionCode:VERSION_CODE,abis:Object.keys(ABIS),server:serverSrc}));

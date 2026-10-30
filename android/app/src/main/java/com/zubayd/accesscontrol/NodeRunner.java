package com.zubayd.accesscontrol;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Runs the bundled Speed server (dist-server) inside the app with nodejs-mobile on 127.0.0.1 only. */
final class NodeRunner {
 static final int PORT=8790;
 static final String ORIGIN="http://127.0.0.1:"+PORT;
 private static boolean started;
 private static WifiManager.MulticastLock multicast;
 private static Boolean available;
 /** True only in the standalone build (libnode bundled); the thin client build stays a remote-server WebView. */
 static synchronized boolean available(){if(available==null){try{System.loadLibrary("c++_shared");System.loadLibrary("node");System.loadLibrary("speednode");available=true;}catch(Throwable t){available=false;}}return available;}
 private static native int startNode(String[] args,String[] env);
 interface Progress{void on(int percent,String text);}
 interface Tick{void on(int percent);}
 private static volatile Integer exitCode;
 static String lastLog(Context c){File f=new File(c.getFilesDir(),"node-error.log");if(!f.exists())return "(no node log; see logcat tag SpeedNode)";try{byte[] b=java.nio.file.Files.readAllBytes(f.toPath());int s=Math.max(0,b.length-4000);return new String(b,s,b.length-s,"UTF-8");}catch(Exception e){return String.valueOf(e);}}

 static synchronized void start(Context context,Progress progress) throws Exception {
  if(started)return;if(!available())throw new IllegalStateException("NO_NODE");
  Context app=context.getApplicationContext();
  if(multicast==null){WifiManager w=(WifiManager)app.getSystemService(Context.WIFI_SERVICE);if(w!=null){multicast=w.createMulticastLock("speed-sadp");multicast.setReferenceCounted(false);multicast.acquire();}}
  File root=new File(app.getFilesDir(),"server-"+BuildConfigInfo.versionCode(app));
  if(!new File(root,"server/index.mjs").exists()){progress.on(5,"تجهيز البرنامج لأول مرة بعد التثبيت…");deleteTree(app.getFilesDir(),"server-");File tmp=new File(app.getFilesDir(),"server-tmp");deleteRec(tmp);copyAssets(app.getAssets(),"server",tmp);if(!tmp.renameTo(root))throw new IOException("SERVER_COPY");}
  progress.on(30,"تشغيل خادم البرنامج على الهاتف…");new File(app.getFilesDir(),"node-error.log").delete();File data=new File(app.getFilesDir(),"data");data.mkdirs();
  String id=deviceId(app);
  final String[] env={"NODE_ENV=production","VITE_AUTH_ENABLED=false","VITE_GROK_EXTENSIONS=0","SKYLINE_ACCESS_DATA_DIR="+data.getAbsolutePath(),"SKYLINE_EMPTY_INSTALL=1","SKYLINE_LICENSE_ENFORCE=1","SKYLINE_LICENSE_NO_REGISTRY=1","SKYLINE_VAULT_KEY="+vaultKey(app),"NITRO_HOST=127.0.0.1","NITRO_PORT="+PORT,"ZUBAYD_INSTANCE_ID="+hex(random(24)),"SPEED_DEVICE_ID="+id,"SPEED_DEVICE_NAME="+(Build.MANUFACTURER+" "+Build.MODEL).trim(),"HOME="+app.getFilesDir().getAbsolutePath(),"TMPDIR="+app.getCacheDir().getAbsolutePath(),"SPEED_NODE_ERROR_LOG="+new File(app.getFilesDir(),"node-error.log").getAbsolutePath(),"SPEED_OFFLINE_FIRST=1"};
  File boot=new File(root,"speed-boot.mjs");try(java.io.FileOutputStream bo=new java.io.FileOutputStream(boot)){bo.write(BOOT.getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        final String[] args={"node",boot.getAbsolutePath()};
  started=true;
  new Thread(null,()->{int code=startNode(args,env);exitCode=code;android.util.Log.e("SpeedApp","node exited "+code);},"speed-node",32*1024*1024).start();
 }
 /** Polls the local server until it answers; returns null when ready or an error text (node exited / timeout after 90s). */
 static String waitReady(Tick tick){long t0=System.currentTimeMillis();for(int i=0;;i++){if(exitCode!=null)return "Node exited with code "+exitCode;long el=System.currentTimeMillis()-t0;if(el>90000)return "Timeout: local server did not answer within 90s";tick.on(30+(int)Math.min(65,el/300));try{HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+"/zubayd-server.json").openConnection();c.setConnectTimeout(300);c.setReadTimeout(3000);int code=c.getResponseCode();c.disconnect();if(code>0&&code<500)return null;}catch(Exception ignored){}try{Thread.sleep(150);}catch(InterruptedException e){return "interrupted";}}}
 /** 12-hex licence id: sha256(ANDROID_ID + manufacturer + model), stable per app-signing key and device. */
 static String deviceId(Context c){try{String a=Settings.Secure.getString(c.getContentResolver(),Settings.Secure.ANDROID_ID);MessageDigest d=MessageDigest.getInstance("SHA-256");byte[] h=d.digest(("speed|"+a+"|"+Build.MANUFACTURER+"|"+Build.MODEL).getBytes("UTF-8"));return hex(h).substring(0,12);}catch(Exception e){return "";}}
 private static String vaultKey(Context c) throws Exception {
  SharedPreferences p=c.getSharedPreferences("vault",Context.MODE_PRIVATE);
  KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
  if(!ks.containsAlias("speed-vault")){KeyGenerator g=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");g.init(new KeyGenParameterSpec.Builder("speed-vault",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());g.generateKey();}
  SecretKey k=(SecretKey)ks.getKey("speed-vault",null);
  String stored=p.getString("key","");
  if(!stored.isEmpty()){byte[] all=android.util.Base64.decode(stored,0);Cipher ci=Cipher.getInstance("AES/GCM/NoPadding");ci.init(Cipher.DECRYPT_MODE,k,new GCMParameterSpec(128,all,0,12));return new String(ci.doFinal(all,12,all.length-12),"UTF-8");}
  String fresh=hex(random(32));Cipher ci=Cipher.getInstance("AES/GCM/NoPadding");ci.init(Cipher.ENCRYPT_MODE,k);byte[] iv=ci.getIV(),body=ci.doFinal(fresh.getBytes("UTF-8"));byte[] all=new byte[iv.length+body.length];System.arraycopy(iv,0,all,0,iv.length);System.arraycopy(body,0,all,iv.length,body.length);
  p.edit().putString("key",android.util.Base64.encodeToString(all,android.util.Base64.NO_WRAP)).commit();return fresh;
 }
 private static byte[] random(int n){byte[] b=new byte[n];new SecureRandom().nextBytes(b);return b;}
 private static String hex(byte[] b){StringBuilder s=new StringBuilder();for(byte x:b)s.append(String.format("%02x",x));return s.toString();}
 // nodejs-mobile ships without ICU: TextDecoder rejects {fatal}. UTF-8 decoding itself works, so drop the option.
    private static final String BOOT="import {appendFileSync} from \"node:fs\";const L=process.env.SPEED_NODE_ERROR_LOG,w=(k,e)=>{try{appendFileSync(L,new Date().toISOString()+\" \"+k+\": \"+(e&&e.stack||e)+\"\\n\")}catch{}};process.on(\"uncaughtException\",e=>{w(\"uncaughtException\",e);process.exit(70)});process.on(\"unhandledRejection\",e=>w(\"unhandledRejection\",e));const T=globalThis.TextDecoder;globalThis.TextDecoder=class extends T{constructor(l,o){super(l,o&&o.fatal?{...o,fatal:false}:o)}};try{await import(\"./server/index.mjs\")}catch(e){w(\"startup\",e);process.exit(71)}\n";
    private static void copyAssets(AssetManager am,String path,File out) throws IOException {
  String[] list=am.list(path);
  if(list==null||list.length==0){out.getParentFile().mkdirs();try(InputStream in=am.open(path);OutputStream o=new FileOutputStream(out)){byte[] buf=new byte[65536];int n;while((n=in.read(buf))>0)o.write(buf,0,n);}return;}
  out.mkdirs();for(String name:list)copyAssets(am,path+"/"+name,new File(out,name));
 }
 private static void deleteTree(File dir,String prefix){File[] f=dir.listFiles();if(f!=null)for(File x:f)if(x.getName().startsWith(prefix))deleteRec(x);}
 private static void deleteRec(File f){File[] k=f.listFiles();if(k!=null)for(File x:k)deleteRec(x);f.delete();}
}

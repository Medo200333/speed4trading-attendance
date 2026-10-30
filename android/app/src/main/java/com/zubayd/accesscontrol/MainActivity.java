package com.zubayd.accesscontrol;
import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import java.io.File;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

public final class MainActivity extends Activity {
 private WebView web; private LinearLayout layout; private TextView notice; private SharedPreferences preferences;
 private String server=""; private ValueCallback<Uri[]> chooser; private Uri cameraUri; private boolean cameraRequested, photoSelection;
 private WebMessagePort downloadPort; private byte[] pendingDownload;
 private final Handler handler=new Handler(Looper.getMainLooper());
 @Override public void onCreate(Bundle state){super.onCreate(state);preferences=getSharedPreferences("connection",MODE_PRIVATE);if(NodeRunner.available()){/* standalone: always the embedded server; ignore any server URL saved by an older thin-client install */preferences.edit().remove("server").remove("mode").apply();localWorkspace(state);return;}server=preferences.getString("server","");if(server.isEmpty())connectionScreen();else workspace(state);}
 private void localWorkspace(Bundle state){getWindow().setStatusBarColor(DEEP);LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(android.view.Gravity.CENTER);box.setBackgroundColor(NAVY);box.setPadding(32,32,32,32);box.addView(styled("Speed for Training",22,ONNAVY,true));TextView msg=styled("جارٍ التشغيل…",15,ONNAVY,false);box.addView(msg);ProgressBar sp=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);sp.setMax(100);box.addView(sp,new LinearLayout.LayoutParams(-1,-2));setContentView(box);
  final long t0=android.os.SystemClock.elapsedRealtime();
  new Thread(()->{String err=null;try{NodeRunner.start(this,(p,t)->handler.post(()->{sp.setProgress(p);msg.setText(t);}));err=NodeRunner.waitReady(p->handler.post(()->sp.setProgress(p)));}catch(Exception e){err=String.valueOf(e);}
   final String error=err;android.util.Log.i("SpeedApp","local server "+(error==null?"ready":"failed")+" in "+(android.os.SystemClock.elapsedRealtime()-t0)+" ms");
   handler.post(()->{if(error==null){server=NodeRunner.ORIGIN;workspace(state);return;}
    sp.setVisibility(View.GONE);msg.setText("تعذر تشغيل خادم البرنامج على هذا الهاتف.");TextView log=styled(error+"\n\n"+NodeRunner.lastLog(this),12,ONNAVY,false);log.setTextIsSelectable(true);log.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);android.widget.ScrollView sv=new android.widget.ScrollView(this);sv.addView(log);box.addView(sv,new LinearLayout.LayoutParams(-1,0,1));
    box.addView(button("إعادة تشغيل البرنامج",v->{Intent i=getPackageManager().getLaunchIntentForPackage(getPackageName());if(i!=null){i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK|Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(i);}finishAffinity();System.exit(0);}));});}).start();}
 private Button button(String text,View.OnClickListener action){Button b=new Button(this);b.setText(text);b.setTextSize(16);b.setMinHeight(52);b.setOnClickListener(action);return b;}
 private TextView text(String value,int size){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setPadding(12,14,12,14);return t;}
 private static final int NAVY=0xFF0B2242,DEEP=0xFF07182F,ACCENT=0xFF2F425D,TILE=0xFFF7FAFB,BORDER=0xFFDBE1E6,INPUT=0xFFD7DDE3,MUTED=0xFF64748B,ONNAVY=0xFFF7FAFB,DANGER=0xFF9F1239;
 private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
 private android.graphics.drawable.GradientDrawable shape(int fill,int stroke,int radius){android.graphics.drawable.GradientDrawable g=new android.graphics.drawable.GradientDrawable();g.setColor(fill);g.setCornerRadius(dp(radius));if(stroke!=0)g.setStroke(dp(1),stroke);return g;}
 private TextView styled(String value,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setGravity(android.view.Gravity.CENTER);t.setPadding(0,dp(6),0,dp(6));t.setTypeface(android.graphics.Typeface.create("sans-serif",bold?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL));return t;}
 private void connectionScreen(){
  if(web!=null){web.destroy();web=null;}getWindow().setStatusBarColor(DEEP);getWindow().setNavigationBarColor(ACCENT);
  layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(dp(16),dp(40),dp(16),dp(24));layout.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);layout.setGravity(android.view.Gravity.CENTER);
  LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(24),dp(24),dp(24),dp(24));card.setBackground(shape(0xFFFFFFFF,0x40FFFFFF,24));card.setElevation(dp(18));LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);layout.addView(card,cp);
  LinearLayout head=new LinearLayout(this);head.setOrientation(LinearLayout.HORIZONTAL);head.setGravity(android.view.Gravity.CENTER_VERTICAL);head.setPadding(0,0,0,dp(16));
  LinearLayout tile=new LinearLayout(this);tile.setGravity(android.view.Gravity.CENTER);tile.setPadding(dp(12),dp(8),dp(12),dp(8));tile.setBackground(shape(TILE,BORDER,16));
  ImageView logo=new ImageView(this);logo.setImageResource(R.drawable.splash_logo);logo.setAdjustViewBounds(true);tile.addView(logo,new LinearLayout.LayoutParams(dp(72),dp(48)));head.addView(tile,new LinearLayout.LayoutParams(-2,dp(64)));
  LinearLayout titles=new LinearLayout(this);titles.setOrientation(LinearLayout.VERTICAL);titles.setPadding(dp(14),0,dp(14),0);
  TextView t1=styled("Speed for Training",20,NAVY,true);t1.setGravity(android.view.Gravity.START);titles.addView(t1);TextView t2=styled("ربط الهاتف بخادم شركتك",14,MUTED,false);t2.setGravity(android.view.Gravity.START);titles.addView(t2);head.addView(titles,new LinearLayout.LayoutParams(0,-2,1f));
  card.addView(head);View rule=new View(this);rule.setBackgroundColor(0xB3DBE1E6);card.addView(rule,new LinearLayout.LayoutParams(-1,dp(1)));
  TextView help=styled("أدخل عنوان HTTPS الذي يعطيه مسؤول الخادم. يمكن استخدام عنوان Tailscale الآمن. لا يحتاج الهاتف للوصول المباشر إلى جهاز البصمة.",15,MUTED,false);card.addView(help);
  EditText address=new EditText(this);address.setText(server);address.setHint("https://server.example.com");address.setSingleLine(true);address.setTextDirection(View.TEXT_DIRECTION_LTR);address.setInputType(17);address.setTextSize(17);address.setTextColor(NAVY);address.setPadding(dp(14),dp(10),dp(14),dp(10));address.setBackground(shape(0xFFFFFFFF,INPUT,12));LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(-1,-2);ap.topMargin=dp(10);card.addView(address,ap);
  notice=styled("لا تُحفظ كلمات مرور الحساب أو البصمة في إعداد الاتصال.",14,MUTED,false);card.addView(notice);
  ProgressBar spinner=new ProgressBar(this);spinner.setIndeterminate(true);spinner.setVisibility(View.GONE);card.addView(spinner,new LinearLayout.LayoutParams(-1,dp(36)));
  Button connect=new Button(this);connect.setText("اختبار الخادم والاتصال");connect.setTextSize(16);connect.setAllCaps(false);connect.setTextColor(ONNAVY);connect.setTypeface(android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.BOLD));connect.setMinHeight(dp(52));connect.setBackground(shape(NAVY,0,12));LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,dp(52));bp.topMargin=dp(8);card.addView(connect,bp);
  Runnable idle=()->{connect.setEnabled(true);connect.setAlpha(1f);connect.setText("اختبار الخادم والاتصال");spinner.setVisibility(View.GONE);};
  connect.setOnClickListener(v->{String input=address.getText().toString().trim();try{URL u=new URL(input);if(!u.getProtocol().equals("https")||u.getUserInfo()!=null||u.getHost().isEmpty()||!u.getPath().matches("/?")||u.getQuery()!=null||u.getRef()!=null)throw new Exception();server=u.getProtocol()+"://"+u.getAuthority();notice.setTextColor(MUTED);notice.setText("جارٍ التحقق من شهادة الخادم وهويته…");connect.setEnabled(false);connect.setAlpha(0.7f);connect.setText("جارٍ الاتصال…");spinner.setVisibility(View.VISIBLE);new Thread(()->{
   try{HttpsURLConnection connection=(HttpsURLConnection)new URL(server+"/zubayd-server.json").openConnection();connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setInstanceFollowRedirects(false);if(connection.getResponseCode()!=200)throw new Exception();byte[] bytes=new byte[4096];int count=connection.getInputStream().read(bytes);String body=new String(bytes,0,Math.max(count,0),StandardCharsets.UTF_8);connection.disconnect();if(!body.contains("com.zubayd.accesscontrol"))throw new Exception();handler.post(()->{preferences.edit().putString("server",server).putString("mode","remote").apply();workspace(null);});
   }catch(Exception error){handler.post(()->{idle.run();notice.setTextColor(DANGER);notice.setText("تعذر التحقق من الخادم. راجع العنوان والشبكة وشهادة HTTPS ثم أعد المحاولة. لم تُحفظ بيانات دخول.");});}
  }).start();}catch(Exception error){notice.setTextColor(DANGER);notice.setText("استخدم عنوان HTTPS صحيحاً للخادم دون مسار إضافي أو كلمة مرور داخل العنوان.");}});
  if(NodeRunner.available()){Button local=button("تشغيل محلي على هذا الهاتف (بدون خادم)",v->{preferences.edit().putString("mode","local").remove("server").apply();localWorkspace(null);});LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(52));lp.topMargin=dp(8);card.addView(local,lp);}
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable(android.graphics.drawable.GradientDrawable.Orientation.TL_BR,new int[]{DEEP,NAVY,ACCENT});scroll.setBackground(bg);scroll.addView(layout);setContentView(scroll);
 }
 /** mailto: opens the user's mail app (composer only; nothing is sent), https links open in the browser. */
 private boolean openOutside(Uri uri){String scheme=uri.getScheme()==null?"":uri.getScheme().toLowerCase();try{if(scheme.equals("mailto")){Intent i=new Intent(Intent.ACTION_SENDTO,uri);startActivity(Intent.createChooser(i,"إرسال بالبريد"));return true;}if(scheme.equals("https")||scheme.equals("http")){startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));return true;}}catch(Exception error){notice.setVisibility(View.VISIBLE);notice.setText(scheme.equals("mailto")?"لا يوجد برنامج بريد على الهاتف. انسخ نص الرسالة وأرسله يدوياً.":"تعذر فتح الرابط في المتصفح.");return true;}return false;}
 private boolean ownOrigin(String value){try{URL a=new URL(server),b=new URL(value);return a.getProtocol().equals(b.getProtocol())&&a.getHost().equalsIgnoreCase(b.getHost())&&(a.getPort()<0?a.getDefaultPort():a.getPort())==(b.getPort()<0?b.getDefaultPort():b.getPort());}catch(Exception error){return false;}}
 private void workspace(Bundle state){
  layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);LinearLayout bar=new LinearLayout(this);if(!NodeRunner.ORIGIN.equals(server))bar.addView(button("Speed for Training • الاتصال",v->new AlertDialog.Builder(this).setTitle("تغيير الخادم؟").setMessage("أكمل أو ألغ العملية الحالية أولاً. تغيير الخادم يغلق الشاشة الحالية.").setPositiveButton("تغيير الخادم",(d,w)->{CookieManager.getInstance().removeAllCookies(null);preferences.edit().remove("server").putString("mode","remote").apply();connectionScreen();}).setNegativeButton("البقاء",null).show()));if(bar.getChildCount()>0)layout.addView(bar);
  notice=text("جارٍ فتح خادم الشركة…",14);layout.addView(notice);web=new WebView(this);layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setAllowFileAccessFromFileURLs(false);settings.setAllowUniversalAccessFromFileURLs(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSafeBrowsingEnabled(true);settings.setSupportZoom(true);settings.setBuiltInZoomControls(true);settings.setDisplayZoomControls(false);
  web.addJavascriptInterface(new SadpBridge(this),"ZubaydSadp");CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){if(downloadPort!=null){downloadPort.close();downloadPort=null;}}
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){String u=request.getUrl().toString();if(ownOrigin(u)&&!request.getUrl().getPath().toLowerCase().endsWith(".pdf"))return false;if(openOutside(request.getUrl()))return true;notice.setVisibility(View.VISIBLE);notice.setText("تم منع الانتقال خارج خادم الشركة المحدد.");return true;}
   @Override public void onPageFinished(WebView view,String url){notice.setVisibility(View.GONE);CookieManager.getInstance().flush();if(ownOrigin(url))enableDownloads();}
   @Override public void onReceivedSslError(WebView view,SslErrorHandler h,SslError e){h.cancel();notice.setVisibility(View.VISIBLE);notice.setText("شهادة HTTPS غير صالحة. اطلب من مسؤول الخادم إصلاحها؛ لم نتجاوز التحقق.");}
   @Override public void onReceivedError(WebView view,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame()){notice.setVisibility(View.VISIBLE);notice.setText("انقطع الاتصال بالخادم. اضغط هنا لإعادة المحاولة.");notice.setOnClickListener(v->web.reload());}}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){request.deny();}
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> result,FileChooserParams p){if(!ownOrigin(view.getUrl())){result.onReceiveValue(null);return true;}if(chooser!=null)chooser.onReceiveValue(null);chooser=result;photoSelection=false;for(String type:p.getAcceptTypes())if(type.startsWith("image/"))photoSelection=true;cameraRequested=p.isCaptureEnabled()&&photoSelection;if(cameraRequested&&checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},8);}else selectPhoto();return true;}
  });
  if(state!=null)web.restoreState(state);else web.loadUrl(server+"/");
 }
 // A transferred message port is scoped to the configured main-frame HTTPS origin.
 // It exposes only an explicit document-save flow, never a general JavaScript bridge.
 private void enableDownloads(){
  if(downloadPort!=null)downloadPort.close();
  WebMessagePort[] channel=web.createWebMessageChannel();downloadPort=channel[0];
  downloadPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort port,WebMessage message){
   if(!ownOrigin(web.getUrl())||pendingDownload!=null)return;
   try{String raw=message.getData();if(raw==null||raw.length()>12000000)throw new Exception();org.json.JSONObject data=new org.json.JSONObject(raw);String name=data.getString("name").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_");if(name.length()>120)name=name.substring(0,120);String mime=data.getString("mime");if(!mime.matches("(?:text/csv(?:;charset=utf-8)?|application/(?:pdf|vnd.openxmlformats-officedocument.spreadsheetml.sheet|octet-stream))"))throw new Exception();pendingDownload=android.util.Base64.decode(data.getString("body"),android.util.Base64.DEFAULT);if(pendingDownload.length>8*1024*1024)throw new Exception();Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType(mime.split(";")[0]);save.putExtra(Intent.EXTRA_TITLE,name);startActivityForResult(save,41);
   }catch(Exception error){if(pendingDownload!=null)java.util.Arrays.fill(pendingDownload,(byte)0);pendingDownload=null;Toast.makeText(MainActivity.this,"تعذر تجهيز التقرير. الحد الأقصى للتصدير في التطبيق 8 ميجابايت.",Toast.LENGTH_LONG).show();}
  }});
  String handshake="zubayd-export-"+java.util.UUID.randomUUID().toString();
  String script="(()=>{if(window.__zubaydDownloadHook)return;window.__zubaydDownloadHook=true;let port;window.addEventListener('message',e=>{if(e.data==='"+handshake+"'&&e.ports.length===1)port=e.ports[0];});document.addEventListener('click',async e=>{const a=e.target.closest&&e.target.closest('a[download]');if(!a||!port||!a.href.startsWith('blob:')||new URL(a.href).origin!==location.origin)return;e.preventDefault();try{const b=await (await fetch(a.href)).blob();if(b.size>8388608)throw Error();const r=new FileReader();r.onload=()=>port.postMessage(JSON.stringify({name:a.download||'SpeedForTraining-report',mime:b.type||'application/octet-stream',body:String(r.result).split(',')[1]}));r.readAsDataURL(b);}catch{alert('تعذر تجهيز الملف. جرّب فترة تقرير أقصر.');}},true);})()";
  web.evaluateJavascript(script,v->web.postWebMessage(new WebMessage(handshake,new WebMessagePort[]{channel[1]}),Uri.parse(server)));
 }
 private void selectPhoto(){
  Intent gallery=new Intent(Intent.ACTION_OPEN_DOCUMENT);gallery.setType(photoSelection?"image/*":"*/*");gallery.addCategory(Intent.CATEGORY_OPENABLE);
  if(cameraRequested && checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED){
   cameraUri=Uri.parse("content://com.zubayd.accesscontrol.capture/capture.jpg");Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);camera.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);camera.putExtra("android.intent.extra.USE_FRONT_CAMERA",true);camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);camera.setClipData(ClipData.newRawUri("photo",cameraUri));
   if(camera.resolveActivity(getPackageManager())!=null){Intent select=Intent.createChooser(gallery,"التقاط صورة أو اختيارها");select.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{camera});startActivityForResult(select,9);return;}
  }
  cameraUri=null;startActivityForResult(gallery,9);
 }
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(code==8){if(grants.length==0||grants[0]!=PackageManager.PERMISSION_GRANTED)cameraRequested=false;selectPhoto();}}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==41&&pendingDownload!=null){try{if(result==RESULT_OK&&data!=null&&data.getData()!=null&&"content".equals(data.getData().getScheme())){try(OutputStream output=getContentResolver().openOutputStream(data.getData())){output.write(pendingDownload);}Toast.makeText(this,"تم حفظ التقرير في المكان الذي اخترته.",Toast.LENGTH_LONG).show();}}catch(Exception error){Toast.makeText(this,"تعذر حفظ التقرير. أعد المحاولة.",Toast.LENGTH_LONG).show();}finally{java.util.Arrays.fill(pendingDownload,(byte)0);pendingDownload=null;}}if(request==9&&chooser!=null){Uri uri=result==RESULT_OK?(data!=null&&data.getData()!=null?data.getData():cameraUri):null;if(uri!=null){String type=getContentResolver().getType(uri);if(!"content".equals(uri.getScheme())||(photoSelection&&(type==null||!type.startsWith("image/"))))uri=null;}chooser.onReceiveValue(uri==null?null:new Uri[]{uri});chooser=null;cameraUri=null;handler.postDelayed(()->new File(getCacheDir(),"capture.jpg").delete(),15*60*1000);}}
 @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else new AlertDialog.Builder(this).setTitle("إغلاق Speed for Training؟").setMessage("أكمل أو ألغ العملية المفتوحة قبل الإغلاق.").setPositiveButton("إغلاق",(d,w)->finish()).setNegativeButton("البقاء",null).show();}
 @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);if(web!=null)web.saveState(state);}
 @Override protected void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);if(downloadPort!=null)downloadPort.close();if(pendingDownload!=null)java.util.Arrays.fill(pendingDownload,(byte)0);if(web!=null)web.destroy();super.onDestroy();}
}

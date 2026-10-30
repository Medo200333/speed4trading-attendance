package com.zubayd.accesscontrol;
import android.content.Context;
final class BuildConfigInfo { @SuppressWarnings("deprecation") static String versionCode(Context c){try{android.content.pm.PackageInfo p=c.getPackageManager().getPackageInfo(c.getPackageName(),0);return p.versionCode+"-"+p.lastUpdateTime;}catch(Exception e){return "0";}} }

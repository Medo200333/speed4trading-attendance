package com.zubayd.accesscontrol;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
/** One camera file in private application cache; never exposes arbitrary filesystem paths. */
public final class CaptureProvider extends ContentProvider {
 public boolean onCreate(){return true;}
 private File target(Uri uri)throws FileNotFoundException{if(!"/capture.jpg".equals(uri.getPath()))throw new FileNotFoundException();return new File(getContext().getCacheDir(),"capture.jpg");}
 public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{return ParcelFileDescriptor.open(target(uri),ParcelFileDescriptor.parseMode(mode));}
 public String getType(Uri uri){return "image/jpeg";}
 public Cursor query(Uri uri,String[] projection,String selection,String[] args,String sort){MatrixCursor c=new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE});try{File f=target(uri);c.addRow(new Object[]{"capture.jpg",f.length()});}catch(Exception ignored){}return c;}
 public Uri insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
 public int update(Uri u,ContentValues v,String s,String[] a){throw new UnsupportedOperationException();}
 public int delete(Uri u,String s,String[] a){throw new UnsupportedOperationException();}
}

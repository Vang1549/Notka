package studio.notka.piano;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.DocumentsContract;
import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Explicitly enabled, bounded local diagnostics. No network or music contents. */
public final class Diagnostics {
    private static final int PICK_REPORT=6420, LIMIT=524288;
    private static boolean installed;
    private static boolean exporting;
    public static synchronized void install(Context c){
        if(installed)return;installed=true;final Context app=c.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous=Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler(){public void uncaughtException(Thread thread,Throwable error){
            try{if(new JSONObject(config(app)).optBoolean("enabled")){
                JSONObject q=new JSONObject(report(app));q.put("format","notka.diagnostics.1").put("device",device(app)).put("panel","0.60");
                StringWriter stack=new StringWriter();error.printStackTrace(new PrintWriter(stack));String text=stack.toString();
                q.put("nativeCrash",new JSONObject().put("at",System.currentTimeMillis()).put("thread",thread.getName()).put("type",error.getClass().getName()).put("stack",text.substring(0,Math.min(3000,text.length()))));
                write(app,"report",q.toString());
            }}catch(Throwable ignored){}finally{if(previous!=null)previous.uncaughtException(thread,error);else android.os.Process.killProcess(android.os.Process.myPid());}
        }});
    }
    private static AtomicFile file(Context c,String name){return new AtomicFile(new File(c.getFilesDir(),"diagnostics-"+name+".json"));}
    private static synchronized String read(Context c,String name,String fallback){
        try(InputStream in=file(c,name).openRead();ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1){if(out.size()+n>LIMIT)return fallback;out.write(b,0,n);}return out.toString("UTF-8");
        }catch(Exception e){return fallback;}
    }
    private static synchronized boolean write(Context c,String name,String value){
        AtomicFile f=file(c,name);FileOutputStream out=null;
        try{byte[] bytes=value.getBytes("UTF-8");if(bytes.length>LIMIT)return false;out=f.startWrite();out.write(bytes);f.finishWrite(out);return true;}
        catch(Exception e){if(out!=null)f.failWrite(out);return false;}
    }
    public static String config(Context c){return read(c,"settings","{\"enabled\":false,\"overlay\":false}");}
    public static boolean configure(Context c,String raw){
        try{JSONObject q=new JSONObject(raw);boolean enabled=q.getBoolean("enabled");return write(c,"settings",new JSONObject().put("enabled",enabled).put("overlay",enabled&&q.getBoolean("overlay")).toString());}catch(Exception e){return false;}
    }
    public static boolean store(Context c,String raw){
        try{if(raw==null||raw.length()>LIMIT||!new JSONObject(config(c)).optBoolean("enabled"))return false;
            JSONObject q=new JSONObject(raw);if(!"notka.diagnostics.1".equals(q.optString("format")))return false;
            q.put("device",device(c)).put("panel","0.60");return write(c,"report",q.toString());
        }catch(Exception e){return false;}
    }
    public static String report(Context c){
        return read(c,"report","{}");
    }
    private static JSONObject device(Context c)throws Exception{return new JSONObject().put("manufacturer",Build.MANUFACTURER).put("model",Build.MODEL).put("android",Build.VERSION.RELEASE).put("sdk",Build.VERSION.SDK_INT).put("apk",c.getPackageManager().getPackageInfo(c.getPackageName(),0).versionName);}
    public static boolean clear(Context c){try{file(c,"report").delete();return true;}catch(Exception e){return false;}}
    public static synchronized String status(Context c){
        String raw=read(c,"export-status","{}");
        try{if(!exporting&&"pending".equals(new JSONObject(raw).optString("state"))){
            status(c,"error","Сохранение прервалось. Отчёт остался в приложении — скачай его ещё раз.");
            return read(c,"export-status","{}");
        }}catch(Exception ignored){}return raw;
    }
    private static void status(Context c,String state,String message){try{write(c,"export-status",new JSONObject().put("state",state).put("message",message).toString());}catch(Exception ignored){}}
    private static String filename(){return "Notka-diagnostics-"+new SimpleDateFormat("yyyyMMdd-HHmmss-SSS",Locale.US).format(new Date())+".txt";}
    private static byte[] exportBytes(String raw)throws Exception{
        JSONObject report=new JSONObject(raw);
        if(!"notka.diagnostics.1".equals(report.optString("format")))throw new IOException("No report");
        return report.toString(2).getBytes("UTF-8");
    }
    private static synchronized void completed(){exporting=false;}
    private static void failed(Context c,Exception e){status(c,"error","Не удалось сохранить файл ("+e.getClass().getSimpleName()+"). Отчёт остался в приложении — попробуй ещё раз.");}
    private static DiagnosticExport.Document document(final Context c,final Uri uri,final boolean download){
        final ContentResolver resolver=c.getContentResolver();
        return new DiagnosticExport.Document(){
            public OutputStream openWrite(String mode)throws IOException{return resolver.openOutputStream(uri,mode);}
            public InputStream openRead()throws IOException{return resolver.openInputStream(uri);}
            public void publish()throws IOException{if(download){ContentValues ready=new ContentValues();ready.put(MediaStore.MediaColumns.IS_PENDING,0);if(resolver.update(uri,ready,null,null)!=1)throw new IOException("Cannot publish report");}}
            public void delete()throws IOException{if(download)resolver.delete(uri,null,null);else DocumentsContract.deleteDocument(resolver,uri);}
        };
    }
    public static synchronized boolean export(final Activity a){
        if(exporting)return true;
        try{final String raw=report(a);final byte[] bytes=exportBytes(raw);
            exporting=true;
            if(Build.VERSION.SDK_INT>=29){
                final Context app=a.getApplicationContext();
                status(app,"pending","Сохраняю отчёт…");
                new Thread(new Runnable(){public void run(){try{
                    String name=filename();ContentValues values=new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME,name);values.put(MediaStore.MediaColumns.MIME_TYPE,"text/plain");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH,"Download/Notka");values.put(MediaStore.MediaColumns.IS_PENDING,1);
                    Uri uri=app.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);
                    if(uri==null)throw new IOException("Cannot create report");
                    DiagnosticExport.save(document(app,uri,true),bytes);
                    status(app,"saved","Отчёт сохранён: Загрузки/Notka/"+name+"\n"+bytes.length+" байт. Можно прикрепить этот TXT-файл к сообщению.");
                }catch(Exception e){failed(app,e);}finally{completed();}}},"notka-diagnostics-export").start();
                return true;
            }
            if(!write(a,"export-pending",raw))throw new IOException("Cannot prepare report");
            status(a,"pending","Выбери, куда сохранить отчёт.");
            a.runOnUiThread(new Runnable(){public void run(){try{
                Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TITLE,filename());
                a.startActivityForResult(intent,PICK_REPORT);
            }catch(Exception e){file(a,"export-pending").delete();failed(a,e);completed();}}});return true;
        }catch(Exception e){failed(a,e);completed();return false;}
    }
    public static synchronized void result(Activity a,int request,int result,Intent data){
        if(request!=PICK_REPORT)return;
        if(result!=Activity.RESULT_OK||data==null||data.getData()==null){status(a,"cancelled","Сохранение отменено.");file(a,"export-pending").delete();completed();return;}
        exporting=true;final Context app=a.getApplicationContext();final Uri uri=data.getData();
        status(app,"pending","Сохраняю отчёт…");
        new Thread(new Runnable(){public void run(){try{
            byte[] bytes=exportBytes(read(app,"export-pending",""));
            DiagnosticExport.save(document(app,uri,false),bytes);
            status(app,"saved","Отчёт сохранён: "+bytes.length+" байт. Можно прикрепить TXT-файл из выбранной папки.");
        }catch(Exception e){try{DocumentsContract.deleteDocument(app.getContentResolver(),uri);}catch(Exception ignored){}failed(app,e);}finally{file(app,"export-pending").delete();completed();}}},"notka-diagnostics-export").start();
    }
}

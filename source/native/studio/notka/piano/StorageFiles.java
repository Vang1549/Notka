package studio.notka.piano;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.*;
import java.util.zip.ZipFile;
import java.util.zip.ZipEntry;

/** Inventory and deletion of only Notka-owned files, never a general file browser. */
public final class StorageFiles {
    private StorageFiles() {}
    static final class Entry {
        String id, name, kind, stamp, note=""; long bytes; boolean removable;
        File[] files; Uri uri; long download;
        Entry(String id,String name,String kind,long bytes,String stamp,boolean removable) {
            this.id=id;this.name=name;this.kind=kind;this.bytes=Math.max(0,bytes);this.stamp=stamp;this.removable=removable;
        }
        JSONObject json() throws Exception {return new JSONObject().put("id",id).put("name",name).put("kind",kind).put("bytes",bytes).put("stamp",stamp).put("removable",removable).put("note",note);}
    }
    static final class Inventory {
        final Map<String,Entry> entries=new LinkedHashMap<>(); final JSONArray errors=new JSONArray();
        void add(Entry e){entries.put(e.id,e);}
    }
    public static String list(Activity activity) {
        try {
            Inventory inventory=scan(activity);JSONArray items=new JSONArray();
            for(Entry e:inventory.entries.values())items.put(e.json());
            return new JSONObject().put("items",items).put("errors",inventory.errors).toString();
        } catch(Exception e){return "{\"items\":[],\"errors\":[\"Не удалось прочитать файлы приложения.\"]}";}
    }
    public static String remove(Activity activity,String request) {
        try {
            JSONObject q=new JSONObject(request);Entry e=scan(activity).entries.get(q.getString("id"));
            if(e==null)return "Файл уже удалён или недоступен.";
            if(!e.removable)return "Этот файл входит в установленное приложение.";
            if(!e.stamp.equals(q.getString("stamp")))return "Файл изменился. Обнови список перед удалением.";
            boolean ok;
            if(e.files!=null){ok=true;for(File f:e.files)if(f.exists()&&!f.delete())ok=false;}
            else if(e.uri!=null){
                ok=activity.getContentResolver().delete(e.uri,"relative_path=? AND owner_package_name=? AND is_pending=0 AND _display_name=? AND _size=? AND date_modified=?",new String[]{"Download/Notka/",activity.getPackageName(),e.name,String.valueOf(e.bytes),e.stamp.split(":",2)[0]})==1;
                if(ok&&"tracks".equals(e.kind)){
                    File journal=new File(activity.getFilesDir(),"song-write-"+ContentUris.parseId(e.uri));
                    for(File f:new File[]{journal,new File(journal+".bak"),new File(journal+".new")})if(StoragePolicy.child(activity.getFilesDir(),f))f.delete();
                }
            } else ok=((DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE)).remove(e.download)==1;
            return ok?"":"Не удалось удалить файл. Возможно, он уже изменён или занят.";
        } catch(Exception e){return "Не удалось удалить файл. Доступ ограничен Android.";}
    }
    private static Inventory scan(Activity a) {
        Inventory out=new Inventory();
        try {privateSounds(a,out);}catch(Exception e){out.errors.put("Не удалось прочитать загруженные инструменты.");}
        try {legacyFiles(a,out);}catch(Exception e){out.errors.put("Не удалось прочитать папку треков приложения.");}
        if(Build.VERSION.SDK_INT>=29)try{PublicFiles.scan(a,out);}catch(Exception e){out.errors.put("Не удалось прочитать Загрузки/Notka.");}
        try{downloads(a,out);}catch(Exception e){out.errors.put("Не удалось прочитать скачанные APK.");}
        try {
            File apk=new File(a.getApplicationInfo().sourceDir);
            Entry installed=new Entry("installed", "APK "+a.getPackageManager().getPackageInfo(a.getPackageName(),0).versionName,"apk",apk.length(),"",false);installed.note="Установлен";out.add(installed);
            try(ZipFile zip=new ZipFile(apk)){
                for(String[] asset:new String[][]{{"piano.json","Пианино"},{"bank-mda-grand-1.json","Grand Piano · MDA"}}){
                    ZipEntry z=zip.getEntry("assets/instruments/"+asset[0]);if(z==null)continue;
                    Entry e=new Entry("asset:"+asset[0],asset[1],"sounds",z.getSize(),"",false);e.note="В APK";out.add(e);
                }
            }
        }catch(Exception e){out.errors.put("Не удалось прочитать встроенные файлы.");}
        return out;
    }
    private static void privateSounds(Activity a,Inventory out)throws Exception {
        File dir=a.getFilesDir();File[] list=dir.listFiles();if(list==null)throw new java.io.IOException();
        Set<String> names=new TreeSet<>();for(File f:list){String n=f.getName().replaceFirst("\\.(bak|new)$","");if(StoragePolicy.sound(n))names.add(n);}
        for(String name:names){
            File[] files={new File(dir,name),new File(dir,name+".bak"),new File(dir,name+".new")};long size=0;StringBuilder stamp=new StringBuilder();boolean safe=true;
            for(File f:files){safe&=StoragePolicy.child(dir,f)&&(!f.exists()||f.isFile());size+=f.length();stamp.append(f.exists()).append(':').append(f.length()).append(':').append(f.lastModified()).append(';');}
            if(!safe)continue;
            String label=name.equals("musicbox-import.json")?"Шкатулка · FrozenPlain":soundLabel(name);
            Entry e=new Entry("sound:"+name,label,"sounds",size,stamp.toString(),true);e.files=files;out.add(e);
        }
    }
    private static String soundLabel(String file) {
        String key=file.substring(11,file.length()-5);
        String[][] names={{"violin-1","Скрипка"},{"flute-1","Флейта"},{"bass-1","Контрабас"},{"trumpet-1","Труба"},{"musicbox-1","Музыкальная шкатулка"},{"mda-grand-1","Grand Piano · MDA"}};
        for(String[] pair:names)if(pair[0].equals(key))return pair[1];return key;
    }
    private static void legacyFiles(Activity a,Inventory out)throws Exception {
        File base=a.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);if(base==null)return;
        File dir=new File(base,"Notka");if(!dir.exists())return;
        File[] files=dir.listFiles();if(files==null)throw new java.io.IOException();
        for(File f:files){String kind=StoragePolicy.publicKind(f.getName());if(kind==null||!f.isFile()||!StoragePolicy.child(dir,f))continue;
            Entry e=new Entry("legacy:"+f.getName(),f.getName(),kind,f.length(),f.lastModified()+":"+f.length(),true);e.files=new File[]{f};out.add(e);
        }
    }
    private static void downloads(Activity a,Inventory out)throws Exception {
        DownloadManager dm=(DownloadManager)a.getSystemService(Context.DOWNLOAD_SERVICE);
        try(Cursor c=dm.query(new DownloadManager.Query())){
            if(c==null)throw new java.io.IOException();
            while(c.moveToNext()){
                String url=c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_URI));if(!StoragePolicy.apkUrl(url))continue;
                long id=c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID));int status=c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if(status!=DownloadManager.STATUS_SUCCESSFUL)continue;
                long size;
                try(ParcelFileDescriptor fd=dm.openDownloadedFile(id)){size=fd.getStatSize();}catch(Exception missing){continue;}
                if(size<0)size=c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                long time=c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LAST_MODIFIED_TIMESTAMP));
                String name=url.substring(url.lastIndexOf('/')+1);
                Entry e=new Entry("download:"+id,name,"apk",size,time+":"+size,true);e.download=id;out.add(e);
            }
        }
    }
    private static final class PublicFiles {
        static void scan(Activity a,Inventory out)throws Exception {
            Uri collection=MediaStore.Downloads.getContentUri("external_primary");
            String[] columns={"_id","_display_name","_size","date_modified"};
            try(Cursor c=a.getContentResolver().query(collection,columns,"relative_path=? AND is_pending=0 AND owner_package_name=?",new String[]{"Download/Notka/",a.getPackageName()},"_display_name ASC")){
                if(c==null)throw new java.io.IOException();
                while(c.moveToNext()){
                    String name=c.getString(1),kind=StoragePolicy.publicKind(name);if(kind==null)continue;
                    long id=c.getLong(0),size=c.getLong(2),time=c.getLong(3);
                    Entry e=new Entry("public:"+id,name,kind,size,time+":"+size,true);e.uri=ContentUris.withAppendedId(collection,id);out.add(e);
                }
            }
        }
    }
}

package studio.notka.piano;

import android.app.Activity;
import android.content.Context;
import android.util.Base64;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.security.*;
import java.nio.channels.*;
import java.security.cert.CertificateFactory;
import java.util.*;
import java.util.zip.*;

/** Immutable, verified editor packages. Only a short token crosses the Activity boundary. */
public final class EditorStore {
    static final int ARCHIVE_LIMIT=8*1024*1024, FILE_LIMIT=8*1024*1024, TOTAL_LIMIT=24*1024*1024;
    private static final String ORIGIN="https://appassets.androidplatform.net/notka/";
    private EditorStore() {}
    private static final Map<Activity,RandomAccessFile> leases=new WeakHashMap<>();
    private static final Map<Activity,FileLock> locks=new WeakHashMap<>();
    public static synchronized void release(Activity activity){
        FileLock lock=locks.remove(activity);RandomAccessFile file=leases.remove(activity);
        try{if(lock!=null)lock.release();}catch(Exception ignored){}
        try{if(file!=null)file.close();}catch(Exception ignored){}
    }
    public static synchronized String delete(Context c,String id){
        try{
            if(id==null||!id.matches("[0-9a-f]{64}"))throw new IOException("Неверная версия.");
            JSONObject builtin=new JSONObject(text(read(c.getAssets().open("editor-builtin.json"),8192)));
            if(id.equals(builtin.getString("sha256")))return "Встроенная версия входит в APK.";
            File dir=new File(root(c),id);if(!dir.isDirectory())return "";
            try(RandomAccessFile use=new RandomAccessFile(new File(dir,".use"),"rw");FileLock lock=use.getChannel().tryLock()){
                if(lock==null)return "Сначала закрой этот редактор.";
                File trash=new File(root(c),"trash-"+UUID.randomUUID());
                if(!dir.renameTo(trash))return "Не удалось удалить версию.";
                remove(trash);
            }
            return "";
        }catch(Exception e){return "Не удалось удалить версию. Закрой редактор и повтори.";}
    }
    static File root(Context c) throws IOException {
        File root=new File(c.getFilesDir(),"editor-packages");
        if(!root.isDirectory()&&!root.mkdirs())throw new IOException("Editor storage unavailable");
        return root;
    }
    static byte[] read(InputStream in,int limit) throws IOException {
        try(InputStream owned=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[8192];int n;
            while((n=owned.read(buffer))!=-1){if(out.size()>limit-n)throw new IOException("Editor file too large");out.write(buffer,0,n);}
            return out.toByteArray();
        }
    }
    static String hex(byte[] bytes){StringBuilder s=new StringBuilder();for(byte b:bytes)s.append(String.format(Locale.ROOT,"%02x",b&255));return s.toString();}
    static String hash(byte[] bytes) throws Exception{return hex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    static String text(byte[] bytes) throws Exception{return new String(bytes,"UTF-8");}
    static void write(File file,byte[] bytes) throws IOException {
        try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);out.getFD().sync();}
    }
    static void remove(File file){File[] children=file.listFiles();if(children!=null)for(File f:children)remove(f);file.delete();}
    static boolean name(String s){return s.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\\.(html|js|css|txt)");}
    static boolean token(String s){return s!=null&&s.matches("(?:legacy-)?[0-9a-f]{64}");}
    static volatile PublicKey legacyKey;
    static PublicKey key(Context c)throws Exception{
        try(InputStream in=c.getAssets().open("editor-signing-legacy.der")){
            legacyKey=CertificateFactory.getInstance("X.509").generateCertificate(in).getPublicKey();
        }
        try(InputStream in=c.getAssets().open("editor-signing.der")){return CertificateFactory.getInstance("X.509").generateCertificate(in).getPublicKey();}
    }
    static boolean signedBy(String record,String encoded,PublicKey key){
        try{
            Signature verifier=Signature.getInstance("SHA256withRSA");verifier.initVerify(key);verifier.update(record.getBytes("UTF-8"));
            return verifier.verify(Base64.decode(encoded,Base64.DEFAULT));
        }catch(Exception e){return false;}
    }
    static boolean trustedSignature(String record,String signature,PublicKey current){
        return signedBy(record,signature,current)||(legacyKey!=null&&signedBy(record,signature,legacyKey));
    }
    public static boolean valid(Context c,String record,String signature){
        try{return trustedSignature(record,signature,key(c));}catch(Exception e){return false;}
    }
    static JSONObject manifest(byte[] raw,PublicKey key)throws Exception{
        JSONObject envelope=new JSONObject(text(raw));String record=envelope.getString("record");
        if(!trustedSignature(record,envelope.getString("signature"),key))throw new IOException("Editor signature mismatch");
        JSONObject info=new JSONObject(record);
        if(!"notka.bundle.1".equals(info.getString("kind"))||info.getInt("code")<1||info.getInt("minApk")>69||!info.getString("version").matches("[0-9]+(\\.[0-9]+){1,3}"))throw new IOException("Unsupported editor bundle");
        JSONObject files=info.getJSONObject("files");
        if(files.length()<2||files.length()>64||!files.has("index.html")||!files.has("runtime.js"))throw new IOException("Incomplete editor");
        int total=0;Iterator<String> names=files.keys();
        while(names.hasNext()){
            String name=names.next();JSONObject spec=files.getJSONObject(name);int size=spec.getInt("bytes");
            if(!name(name)||size<0||size>FILE_LIMIT||!spec.getString("sha256").matches("[0-9a-f]{64}"))throw new IOException("Invalid editor file");
            total+=size;if(total>TOTAL_LIMIT)throw new IOException("Editor package too large");
        }
        return info;
    }
    static JSONObject verify(File dir,PublicKey key)throws Exception{
        JSONObject info=manifest(read(new FileInputStream(new File(dir,"manifest.json")),128*1024),key);
        JSONObject files=info.getJSONObject("files");Iterator<String> names=files.keys();
        while(names.hasNext()){
            String name=names.next();JSONObject spec=files.getJSONObject(name);File file=new File(dir,name);
            if(file.length()!=spec.getInt("bytes")||!hash(read(new FileInputStream(file),FILE_LIMIT)).equals(spec.getString("sha256")))throw new IOException("Editor checksum mismatch");
        }
        return info;
    }
    // Staging is never listed or launched. A failed install leaves every previous package intact.
    static synchronized String install(File root,InputStream input,int code,String expected,PublicKey key)throws Exception{
        byte[] archive=read(input,ARCHIVE_LIMIT);
        if(!expected.matches("[0-9a-f]{64}")||!hash(archive).equals(expected))throw new IOException("Archive checksum mismatch");
        File target=new File(root,expected);
        if(target.isDirectory())try{JSONObject info=verify(target,key);if(info.getInt("code")==code)return expected;}catch(Exception corrupt){/* Re-download can repair a corrupted package. */}
        File stage=new File(root,"stage-"+UUID.randomUUID());if(!stage.mkdir())throw new IOException("No staging space");
        try{
            Set<String> seen=new HashSet<>();int total=0;
            try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(archive))){
                ZipEntry entry;byte[] buffer=new byte[8192];
                while((entry=zip.getNextEntry())!=null){
                    String name=entry.getName();
                    if(entry.isDirectory()||!("manifest.json".equals(name)||name(name))||!seen.add(name)||seen.size()>65)throw new IOException("Unsafe bundle entry");
                    int size=0,limit="manifest.json".equals(name)?128*1024:FILE_LIMIT,n;
                    try(FileOutputStream out=new FileOutputStream(new File(stage,name))){
                        while((n=zip.read(buffer))!=-1){size+=n;total+=n;if(size>limit||total>TOTAL_LIMIT+128*1024)throw new IOException("Expanded bundle too large");out.write(buffer,0,n);}
                        out.getFD().sync();
                    }
                    zip.closeEntry();
                }
            }
            JSONObject info=verify(stage,key);
            if(info.getInt("code")!=code||seen.size()!=info.getJSONObject("files").length()+1)throw new IOException("Wrong or unexpected edition files");
            File damaged=null;
            if(target.exists()){
                damaged=new File(root,"damaged-"+UUID.randomUUID());
                if(!target.renameTo(damaged))throw new IOException("Cannot replace damaged package");
            }
            if(!stage.renameTo(target)){
                if(damaged!=null)damaged.renameTo(target);
                throw new IOException("Cannot commit editor package");
            }
            if(damaged!=null)remove(damaged);
            return expected;
        }finally{if(stage.exists())remove(stage);}
    }
    public static String install(Context c,InputStream input,int code,String expected){
        try{return install(root(c),input,code,expected,key(c));}catch(Exception e){return null;}
    }
    public static synchronized String inventory(Context c){
        JSONArray result=new JSONArray();
        try{
            File root=root(c);
            JSONObject builtin=new JSONObject(text(read(c.getAssets().open("editor-builtin.json"),8192)));
            String builtinToken=builtin.getString("sha256");
            try{install(root,c.getAssets().open("editor-builtin.zip"),builtin.getInt("code"),builtinToken,key(c));}catch(Exception failedBuiltin){/* Still list other working versions. */}
            File[] dirs=root.listFiles();if(dirs!=null)for(File dir:dirs){
                if(!dir.getName().matches("[0-9a-f]{64}"))continue;
                try{
                    JSONObject info=verify(dir,key(c)),entry=new JSONObject();long bytes=0;
                    for(File f:dir.listFiles())bytes+=f.length();
                    entry.put("code",info.getInt("code"));entry.put("version",info.getString("version"));entry.put("name",info.optString("name"));entry.put("sha256",dir.getName());entry.put("token",dir.getName());entry.put("format",2);entry.put("minApk",info.getInt("minApk"));entry.put("bytes",bytes);entry.put("builtin",dir.getName().equals(builtinToken));result.put(entry);
                }catch(Exception invalid){/* Invalid directories never become launch choices. */}
            }
        }catch(Exception e){/* The legacy built-in edition remains available. */}
        return result.toString();
    }
    public static String prepare(Context c,String body)throws Exception{
        if(token(body)){
            File dir=new File(root(c),body);
            if(body.startsWith("legacy-")){
                if(!hash(read(new FileInputStream(new File(dir,"index.html")),FILE_LIMIT)).equals(body.substring(7)))throw new IOException("Legacy editor changed");
            }else verify(dir,key(c));
            return body;
        }
        if(body==null||body.length()>190000)throw new IOException("Invalid legacy editor");
        byte[] html=Base64.decode(body,Base64.DEFAULT);String id="legacy-"+hash(html);File dir=new File(root(c),id);
        if(!dir.isDirectory()){
            File stage=new File(root(c),"stage-"+UUID.randomUUID());if(!stage.mkdir())throw new IOException("No editor space");
            try{write(new File(stage,"index.html"),html);if(!stage.renameTo(dir)&&!dir.isDirectory())throw new IOException("Cannot save legacy editor");}
            finally{if(stage.exists())remove(stage);}
        }
        return id;
    }
    public static void load(final Activity c,WebView web,String id)throws Exception{
        id=prepare(c,id);final File dir=new File(root(c),id);final String base=ORIGIN+id+"/";
        synchronized(EditorStore.class){
            release(c);RandomAccessFile lease=new RandomAccessFile(new File(dir,".use"),"rw");
            try{FileLock lock=lease.getChannel().tryLock();if(lock==null)throw new IOException("Editor already in use");leases.put(c,lease);locks.put(c,lock);}
            catch(Exception e){lease.close();throw e;}
        }
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,String url){
                try{
                    if(!url.startsWith(base))throw new IOException("External request blocked");
                    String name=url.substring(base.length());if(!name(name))throw new IOException("Invalid resource");
                    String mime=name.endsWith(".js")?"application/javascript":name.endsWith(".css")?"text/css":"text/html";
                    return new WebResourceResponse(mime,"UTF-8",new FileInputStream(new File(dir,name)));
                }catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return true;}
        });
        web.loadDataWithBaseURL(base,text(read(new FileInputStream(new File(dir,"index.html")),FILE_LIMIT)),"text/html","UTF-8",base+"index.html");
    }
    public static String script(Activity c,String name)throws Exception{
        if(!"scene-renderer.js".equals(name))return null;
        String id=c.getIntent().getStringExtra("editionToken");
        if(!token(id)||id.startsWith("legacy-"))return null;
        return text(read(new FileInputStream(new File(new File(root(c),id),name)),FILE_LIMIT));
    }
    public static String media(Activity c)throws Exception{
        String id=c.getIntent().getStringExtra("editionToken");
        if(token(id)&&!id.startsWith("legacy-"))return text(read(new FileInputStream(new File(new File(root(c),id),"media-export.js")),FILE_LIMIT));
        return text(read(c.getAssets().open("media-export.js"),FILE_LIMIT));
    }
}

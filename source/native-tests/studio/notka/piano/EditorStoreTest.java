package studio.notka.piano;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import java.util.zip.*;
import org.json.*;
import android.util.Base64;

public class EditorStoreTest {
    static KeyPair key;static int rejected;
    static byte[] zip(Map<String,byte[]> files)throws Exception{
        ByteArrayOutputStream out=new ByteArrayOutputStream();try(ZipOutputStream z=new ZipOutputStream(out)){
            for(Map.Entry<String,byte[]> f:files.entrySet()){z.putNextEntry(new ZipEntry(f.getKey()));z.write(f.getValue());z.closeEntry();}
        }return out.toByteArray();
    }
    static Map<String,byte[]> files(String body)throws Exception{
        Map<String,byte[]> files=new LinkedHashMap<>();files.put("index.html","<script src='runtime.js'></script>".getBytes("UTF-8"));files.put("runtime.js",body.getBytes("UTF-8"));
        JSONObject specs=new JSONObject();for(Map.Entry<String,byte[]> e:files.entrySet())specs.put(e.getKey(),new JSONObject().put("sha256",EditorStore.hash(e.getValue())).put("bytes",e.getValue().length));
        String record=new JSONObject().put("kind","notka.bundle.1").put("code",72).put("version","0.72").put("minApk",64).put("files",specs).toString();
        Signature sign=Signature.getInstance("SHA256withRSA");sign.initSign(key.getPrivate());sign.update(record.getBytes("UTF-8"));
        files.put("manifest.json",new JSONObject().put("record",record).put("signature",Base64.encodeToString(sign.sign(),Base64.NO_WRAP)).toString().getBytes("UTF-8"));return files;
    }
    static String install(File root,byte[] archive,String hash,int code)throws Exception{return EditorStore.install(root,new ByteArrayInputStream(archive),code,hash,key.getPublic());}
    static void reject(File root,byte[] archive,String hash,int code)throws Exception{
        try{install(root,archive,hash,code);throw new AssertionError("Invalid package accepted");}catch(IOException|GeneralSecurityException|JSONException expected){rejected++;}
        for(File f:root.listFiles())if(f.getName().startsWith("stage-"))throw new AssertionError("Staging leaked");
    }
    public static void main(String[] args)throws Exception{
        KeyPairGenerator gen=KeyPairGenerator.getInstance("RSA");gen.initialize(2048);key=gen.generateKeyPair();File root=Files.createTempDirectory("notka-editor-test").toFile();
        try{
            char[] large=new char[300000];Arrays.fill(large,'x');byte[] valid=zip(files("//"+new String(large))),bad;
            String digest=EditorStore.hash(valid);String id=install(root,valid,digest,72);
            if(!id.equals(digest)||id.length()!=64)throw new AssertionError("Noncompact token");
            if(!install(root,valid,digest,72).equals(id))throw new AssertionError("Non-idempotent install");
            reject(root,valid,"0"+digest.substring(1),72);
            reject(root,valid,digest,73);
            Map<String,byte[]> corrupt=files("ok");corrupt.put("runtime.js","changed".getBytes("UTF-8"));bad=zip(corrupt);reject(root,bad,EditorStore.hash(bad),72);
            corrupt=files("ok");corrupt.remove("runtime.js");bad=zip(corrupt);reject(root,bad,EditorStore.hash(bad),72);
            corrupt=files("ok");corrupt.put("../escaped.js",new byte[1]);bad=zip(corrupt);reject(root,bad,EditorStore.hash(bad),72);
            corrupt=files("ok");corrupt.put("extra.js",new byte[1]);bad=zip(corrupt);reject(root,bad,EditorStore.hash(bad),72);
            corrupt=files("ok");corrupt.put("manifest.json","{}".getBytes("UTF-8"));bad=zip(corrupt);reject(root,bad,EditorStore.hash(bad),72);
            corrupt=files("ok");corrupt.put("runtime.js",new byte[EditorStore.FILE_LIMIT+1]);bad=zip(corrupt);reject(root,bad,EditorStore.hash(bad),72);
            bad=Arrays.copyOf(valid,valid.length/2);reject(root,bad,EditorStore.hash(bad),72);
            EditorStore.verify(new File(root,id),key.getPublic()); // All failed updates retain the installed version.
            EditorStore.write(new File(new File(root,id),"runtime.js"),new byte[0]);
            install(root,valid,digest,72);EditorStore.verify(new File(root,id),key.getPublic());
            if(new File(root.getParentFile(),"escaped.js").exists())throw new AssertionError("Traversal wrote outside root");
            System.out.println("PASS native bundle: >190k runtime, compact token, signature/hash/missing/traversal/size/truncation rejection ("+rejected+"), atomic fallback, corrupted-cache repair.");
        }finally{EditorStore.remove(root);}
    }
}

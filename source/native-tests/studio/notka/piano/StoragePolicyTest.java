package studio.notka.piano;
import java.nio.file.*;
import java.io.File;
public final class StoragePolicyTest {
 static void check(boolean ok){if(!ok)throw new AssertionError();}
 public static void main(String[] args)throws Exception{
  check("tracks".equals(StoragePolicy.publicKind("Memory(v0.68).notka")));
  check("exports".equals(StoragePolicy.publicKind("Мой трек.mp4")));
  for(String n:new String[]{"../song.notka","/song.notka",".hidden.notka","a\\b.wav","test\n.wav","theme.json","song.notka.bak","music-export.part","app.apk"})check(StoragePolicy.publicKind(n)==null);
  check(StoragePolicy.sound("musicbox-import.json"));check(StoragePolicy.sound("sound-bank-violin-1.json"));
  for(String n:new String[]{"sound-scene-presets.json","track-draft.json","sound-musicbox-source-step.json","sound-bank-a.json.bak","../musicbox-import.json"})check(!StoragePolicy.sound(n));
  check(StoragePolicy.apkUrl("https://notka-piano-updates.zentas.chatgpt.site/Notka-59.apk"));
  check(StoragePolicy.apkUrl("https://github.com/Vang1549/Notka/releases/download/apk-63/Notka-63.apk"));
  for(String s:new String[]{"https://github.com/Vang1549/Notka/releases/download/apk-63/Notka-64.apk","https://github.com/other/Notka/releases/download/apk-63/Notka-63.apk","https://github.com/Vang1549/Notka/releases/download/apk-63/Notka-63.apk?other=x","https://evil.test/Notka-59.apk","https://notka-piano-updates.zentas.chatgpt.site.evil/Notka-59.apk","https://notka-piano-updates.zentas.chatgpt.site/Notka-59.apk?other=x","file:///Notka-59.apk"})check(!StoragePolicy.apkUrl(s));
  Path root=Files.createTempDirectory("notka-policy"),other=Files.createTempFile("notka-foreign", ".notka"),normal=Files.createFile(root.resolve("ok.notka")),link=root.resolve("link.notka");
  try{Files.createSymbolicLink(link,other);check(StoragePolicy.child(root.toFile(),normal.toFile()));check(!StoragePolicy.child(root.toFile(),link.toFile()));check(!StoragePolicy.child(root.toFile(),other.toFile()));}
  finally{Files.deleteIfExists(link);Files.delete(normal);Files.delete(root);Files.delete(other);}
  System.out.println("PASS storage path, symlink, extension, preset exclusion and APK origin boundaries.");
 }
}

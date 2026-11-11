import java.io.*;
import java.util.zip.*;
public class TestImportZip {
 public static void main(String[] args) throws Exception {
  int n=0;
  try(ZipInputStream z=new ZipInputStream(new FileInputStream(args[0]))){
   ZipEntry e;while((e=z.getNextEntry())!=null){if(e.getName().endsWith(".flac")){z.readAllBytes();n++;}z.closeEntry();}
   System.out.println("STREAM samples="+n);
  }catch(Exception e){System.out.println("STREAM failed after "+n+" samples: "+e);}
  try(ZipFile z=new ZipFile(args[0])){
   long bytes=0;int samples=0;var entries=z.entries();while(entries.hasMoreElements()){
    ZipEntry e=entries.nextElement();if(!e.getName().endsWith(".flac"))continue;
    try(InputStream in=z.getInputStream(e)){byte[] b=in.readAllBytes();if(b.length!=e.getSize())throw new IOException("wrong size");CRC32 c=new CRC32();c.update(b);if(c.getValue()!=e.getCrc())throw new IOException("wrong CRC");bytes+=b.length;samples++;}
   }if(samples!=31||bytes!=4708843)throw new IOException("Incomplete import");
   var license=z.getEntry("Libraries/FrozenPlain - Music Box Suite Free/License.pdf");if(license==null||license.getSize()!=32881)throw new IOException("Missing license");
   System.out.println("PASS ZIPFILE samples="+samples+", bytes="+bytes+", all CRCs verified and license present");
  }
 }
}

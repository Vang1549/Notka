package studio.notka.piano;

import java.io.*;
import java.util.*;

public class DiagnosticExportTest {
    static class Fake implements DiagnosticExport.Document {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();
        List<String> modes=new ArrayList<>();
        boolean closed,published,deleted,unsupported,partial,drop,closeError,nullOut,nullIn,extra,changed,publishError,deleteError;
        public OutputStream openWrite(String mode)throws IOException {
            modes.add(mode);
            if(unsupported&&mode.equals("wt"))throw new FileNotFoundException("Unsupported mode");
            if(nullOut)return null;
            return new OutputStream(){
                public void write(int b)throws IOException{if(partial&&bytes.size()==4)throw new IOException("Disk full");if(!drop)bytes.write(b);}
                public void close()throws IOException{closed=true;if(closeError)throw new IOException("Close failed");}
            };
        }
        public InputStream openRead(){
            if(!closed)throw new AssertionError("Read before close");
            if(nullIn)return null;
            byte[] data=bytes.toByteArray();
            if(extra)data=Arrays.copyOf(data,data.length+1);
            if(changed)data[0]^=1;
            return new ByteArrayInputStream(data);
        }
        public void publish()throws IOException{if(publishError)throw new IOException("Publish failed");published=true;}
        public void delete()throws IOException{deleted=true;if(deleteError)throw new IOException("Delete failed");bytes.reset();}
    }
    static void check(boolean value){if(!value)throw new AssertionError();}
    static void rejects(Fake f,byte[] report)throws Exception{
        try{DiagnosticExport.save(f,report);throw new AssertionError("Bad file accepted");}catch(IOException expected){}
        check(!f.published&&f.deleted);if(!f.deleteError)check(f.bytes.size()==0);
    }
    public static void main(String[] args)throws Exception{
        byte[] report=("{\"format\":\"notka.diagnostics.1\",\"test\":\"Отчёт 🎹\"}").getBytes("UTF-8");
        Fake f=new Fake();DiagnosticExport.save(f,report);check(f.closed&&f.published&&!f.deleted&&Arrays.equals(f.bytes.toByteArray(),report));
        f=new Fake();f.unsupported=true;DiagnosticExport.save(f,report);check(f.modes.equals(Arrays.asList("wt","w"))&&f.published);
        f=new Fake();f.partial=true;rejects(f,report);
        f=new Fake();f.drop=true;rejects(f,report);
        f=new Fake();f.closeError=true;rejects(f,report);
        f=new Fake();f.nullOut=true;rejects(f,report);
        f=new Fake();f.nullIn=true;rejects(f,report);
        f=new Fake();f.extra=true;rejects(f,report);
        f=new Fake();f.changed=true;rejects(f,report);
        f=new Fake();f.publishError=true;rejects(f,report);
        f=new Fake();f.partial=true;f.deleteError=true;rejects(f,report);
        rejects(new Fake(),new byte[0]);
        byte[] large=new byte[600000];new Random(7).nextBytes(large);f=new Fake();DiagnosticExport.save(f,large);check(f.published&&Arrays.equals(f.bytes.toByteArray(),large));
        System.out.println("PASS diagnostic export: UTF-8, large report, closed before verification, incompatible provider fallback, empty/partial/corrupt/extra bytes, close/publish/delete errors and cleanup.");
    }
}

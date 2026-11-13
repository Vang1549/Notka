package studio.notka.piano;

import java.io.*;

/** Publish only after closing and reading back the complete document. */
final class DiagnosticExport {
    interface Document {
        OutputStream openWrite(String mode) throws IOException;
        InputStream openRead() throws IOException;
        void publish() throws IOException;
        void delete() throws IOException;
    }
    static void save(Document document, byte[] bytes) throws IOException {
        boolean saved=false;
        try {
            if(bytes==null||bytes.length==0)throw new IOException("Empty report");
            OutputStream stream;
            try {stream=document.openWrite("wt");}
            catch(IOException|IllegalArgumentException unsupported){stream=document.openWrite("w");}
            if(stream==null)throw new IOException("No output stream");
            try(OutputStream out=stream){out.write(bytes);out.flush();}
            try(InputStream in=document.openRead()){
                if(in==null)throw new IOException("No input stream");
                byte[] buffer=new byte[8192];int offset=0,n;
                while((n=in.read(buffer))!=-1){
                    if(n==0)throw new IOException("Empty read");
                    if(n>bytes.length-offset)throw new IOException("Unexpected file size");
                    for(int i=0;i<n;i++)if(buffer[i]!=bytes[offset+i])throw new IOException("Report changed");
                    offset+=n;
                }
                if(offset!=bytes.length)throw new IOException("Incomplete report");
            }
            document.publish();saved=true;
        } finally {
            if(!saved)try{document.delete();}catch(Exception ignored){}
        }
    }
}

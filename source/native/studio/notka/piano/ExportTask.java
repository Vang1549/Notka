package studio.notka.piano;

/** Thread-safe lifetime shared by the JS bridge and Android's main thread. */
final class ExportTask {
    static final long MAX_TIME = 6L * 60 * 60 * 1000;
    final long id, started;
    final String title;
    private String phase = "starting", error = "";
    private long heartbeat;
    private int percent;
    ExportTask(long id, String title, long now) { this.id=id; this.title=title; started=heartbeat=now; }
    synchronized boolean ready(long now) { if(!phase.equals("starting"))return false; phase="running";heartbeat=now;return true; }
    synchronized boolean active() { return phase.equals("starting")||phase.equals("running")||phase.equals("committing"); }
    synchronized boolean progress(int value,long now) { if(!active())return false;heartbeat=now;int next=Math.max(percent,Math.min(99,Math.max(0,value)));boolean changed=next!=percent;percent=next;return changed; }
    synchronized int percent() { return percent; }
    synchronized String status() { return error.isEmpty()?phase:"error:"+error; }
    synchronized boolean commit() { if(!phase.equals("running"))return false;phase="committing";return true; }
    synchronized boolean cancel(String reason) { if(!active()||phase.equals("committing"))return false;phase="cancelled";error=reason;return true; }
    synchronized void fail(String reason) { if(active()){phase="failed";error=reason;} }
    synchronized void finish(boolean success) { if(active()){phase=success?"done":"failed";if(success)percent=100;} }
    synchronized boolean expired(long now) { return active()&&(now-started>=MAX_TIME||now-heartbeat>=5*60*1000); }
}

package studio.notka.piano;
public final class ExportTaskTest {
    static void check(boolean b){if(!b)throw new AssertionError();}
    public static void main(String[] args)throws Exception{
        ExportTask t=new ExportTask(1,"Test",0);check(t.status().equals("starting"));check(!t.commit());check(t.ready(1));check(!t.ready(2));
        check(t.progress(50,10));check(!t.progress(20,20));check(t.percent()==50);t.progress(999,25);check(t.percent()==99);
        check(!t.expired(299999));check(t.expired(300025));check(t.commit());check(!t.cancel("late"));t.finish(true);check(t.status().equals("done"));check(t.percent()==100);check(!t.active());
        t=new ExportTask(2,"Cancelled before startup",0);check(t.cancel("stop"));check(!t.ready(1));check(!t.commit());t.finish(true);check(t.status().equals("error:stop"));
        t=new ExportTask(3,"Timeout",0);t.ready(1);t.progress(20,ExportTask.MAX_TIME-1);check(t.expired(ExportTask.MAX_TIME));t.fail("timeout");check(!t.active());check(!t.commit());
        t=new ExportTask(4,"Write failure",0);t.ready(1);check(t.commit());t.finish(false);check(t.status().equals("failed"));check(!t.active());
        for(int i=0;i<100;i++){
            final ExportTask race=new ExportTask(i,"Race",0);race.ready(1);final boolean[] results=new boolean[2];
            Thread a=new Thread(()->results[0]=race.commit()),b=new Thread(()->results[1]=race.cancel("stop"));a.start();b.start();a.join();b.join();check(results[0]!=results[1]);
        }
        System.out.println("PASS background lifetime, startup cancellation, monotonic progress, watchdog/deadline, finalization failure and concurrent cancel/commit exclusivity.");
    }
}

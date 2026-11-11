package studio.notka.piano;

import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.webkit.WebView;
import java.util.concurrent.atomic.AtomicLong;

/** Keeps the existing offline renderer alive while its Activity is stopped. */
public final class ExportRuntime {
    static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static final AtomicLong IDS=new AtomicLong();
    static volatile Session current;
    static volatile ExportService service;
    static final class Session {
        final ExportTask task;
        final Activity activity;
        final Context app;
        final Class<? extends ExportService> serviceClass;
        Session(Activity activity,String title){
            this.activity=activity;app=activity.getApplicationContext();
            serviceClass=Build.VERSION.SDK_INT<28?LegacyExportService.class:ExportService.class;
            task=new ExportTask(IDS.incrementAndGet(),title,SystemClock.elapsedRealtime());
        }
        Intent intent(String action){return new Intent(app,serviceClass).setAction(action).putExtra("job",task.id);}
    }
    public static synchronized boolean begin(Activity activity,String title){
        if(current!=null)return false;
        final Session s=new Session(activity,title==null?"Нотка":title.substring(0,Math.min(title.length(),64)));
        current=s;
        MAIN.post(()->{
            if(current!=s||!s.task.active())return;
            try{
                if(activity.isFinishing()||activity.isDestroyed())throw new IllegalStateException();
                View root=activity.findViewById(android.R.id.content);
                if(root instanceof ViewGroup && ((ViewGroup)root).getChildCount()>0){
                    View view=((ViewGroup)root).getChildAt(0);
                    if(view instanceof WebView){((WebView)view).onResume();((WebView)view).resumeTimers();view.setKeepScreenOn(false);}
                }
                Intent intent=s.intent("start");
                if(Build.VERSION.SDK_INT>=26)activity.startForegroundService(intent);else activity.startService(intent);
            }catch(Exception e){s.task.fail("Не удалось запустить фоновое сохранение.");}
        });
        return true;
    }
    public static String status(){Session s=current;return s==null?"error:Фоновая задача остановлена.":s.task.status();}
    public static void progress(int value){
        Session s=current;if(s==null)return;
        if(s.task.progress(value,SystemClock.elapsedRealtime()))MAIN.post(()->{ExportService e=service;if(current==s&&e!=null)e.update(s);});
    }
    public static boolean commit(){Session s=current;return s!=null&&s.task.commit();}
    public static void end(boolean success,String message){
        final Session s=current;if(s==null)return;s.task.finish(success);
        MAIN.post(()->{
            if(current!=s)return;
            ExportService e=service;
            if(e!=null)e.complete(s,success,message);else s.app.stopService(s.intent("stop"));
            View root=s.activity.findViewById(android.R.id.content);
            if(root instanceof ViewGroup&&((ViewGroup)root).getChildCount()>0)((ViewGroup)root).getChildAt(0).setKeepScreenOn(true);
            synchronized(ExportRuntime.class){if(current==s)current=null;}
        });
    }
    public static void destroyed(Activity activity){
        Session s=current;if(s==null||s.activity!=activity)return;
        s.task.fail("Сохранение прервано: редактор закрыт.");end(false,"Сохранение прервано: редактор закрыт.");
    }
    static PendingIntent open(Session s){
        // Reorder the existing Activity; never put the large editor HTML into a PendingIntent.
        Intent i=new Intent(s.activity,s.activity.getClass()).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(s.app,680,i,PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0));
    }
}

package studio.notka.piano;

import android.app.*;
import android.content.*;
import android.os.*;

/** User-started local media processing; never restarted after process death. */
public class ExportService extends Service {
    private static final String CHANNEL="notka_export";
    private static final int ID=680;
    private PowerManager.WakeLock wake;
    private ExportRuntime.Session owner;
    private boolean stopping;
    private final Runnable watchdog=new Runnable(){public void run(){
        ExportRuntime.Session s=owner;
        if(stopping||s==null)return;
        if(s.task.expired(SystemClock.elapsedRealtime())||s.activity.isDestroyed()){
            s.task.fail("Сохранение прервано системой. Запусти его ещё раз.");
            complete(s,false,"Сохранение прервано системой.");return;
        }
        ExportRuntime.MAIN.postDelayed(this,30000);
    }};
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        ExportRuntime.Session s=ExportRuntime.current;
        if(intent==null||s==null||intent.getLongExtra("job",-1)!=s.task.id){if(owner==null)stopSelf();return START_NOT_STICKY;}
        if("cancel".equals(intent.getAction())){
            if(s.task.cancel("Экспорт отменён из уведомления."))complete(s,false,"Экспорт отменён.");
            return START_NOT_STICKY;
        }
        if(!"start".equals(intent.getAction()))return START_NOT_STICKY;
        owner=s;ExportRuntime.service=this;stopping=false;
        try{
            NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Сохранение музыки",NotificationManager.IMPORTANCE_LOW));
            Notification notification=notification(s,false,"Подготовка…");
            if(Build.VERSION.SDK_INT>=29)startForeground(ID,notification,Build.VERSION.SDK_INT>=35?8192:1);else startForeground(ID,notification);
            PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);
            wake=power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"studio.notka.piano:export");wake.setReferenceCounted(false);wake.acquire(ExportTask.MAX_TIME);
            if(!s.task.ready(SystemClock.elapsedRealtime())){complete(s,false,"Экспорт отменён.");return START_NOT_STICKY;}
            ExportRuntime.MAIN.postDelayed(watchdog,30000);
        }catch(Exception e){s.task.fail("Не удалось включить фоновое сохранение.");complete(s,false,"Не удалось включить фоновое сохранение.");}
        return START_NOT_STICKY;
    }
    private Notification notification(ExportRuntime.Session s,boolean done,String text){
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        b.setSmallIcon(done?android.R.drawable.stat_sys_download_done:android.R.drawable.stat_sys_upload)
            .setContentTitle(done?"Нотка · "+text:"Нотка · Создание файла")
            .setContentText(done?s.task.title:text).setSubText(s.task.title)
            .setOnlyAlertOnce(true).setOngoing(!done).setAutoCancel(done)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(ExportRuntime.open(s));
        if(!done){
            b.setProgress(100,s.task.percent(),s.task.status().equals("starting"));
            PendingIntent cancel=PendingIntent.getService(this,681,s.intent("cancel"),PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0));
            b.addAction(android.R.drawable.ic_menu_close_clear_cancel,"Отменить",cancel);
        }
        return b.build();
    }
    void update(ExportRuntime.Session s){if(!stopping&&owner==s)try{((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(ID,notification(s,false,"Расчёт · "+s.task.percent()+"%"));}catch(Exception ignored){}}
    void complete(ExportRuntime.Session s,boolean success,String message){
        if(owner!=s)return;
        release();stopForeground(true);
        if(!success)new java.io.File(getFilesDir(),"music-export.part").delete();
        try{((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(ID,notification(s,true,success?"Файл сохранён":message));}catch(Exception ignored){}
        stopSelf();
    }
    private void release(){stopping=true;ExportRuntime.MAIN.removeCallbacks(watchdog);if(wake!=null){if(wake.isHeld())wake.release();wake=null;}if(ExportRuntime.service==this)ExportRuntime.service=null;}
    @Override public void onDestroy(){if(owner!=null&&owner.task.active()){owner.task.fail("Фоновое сохранение остановлено системой.");new java.io.File(getFilesDir(),"music-export.part").delete();}release();super.onDestroy();}
    @Override public void onTaskRemoved(Intent rootIntent){if(owner!=null){owner.task.fail("Сохранение прервано: приложение закрыто.");complete(owner,false,"Сохранение прервано.");}super.onTaskRemoved(rootIntent);}
    // Android 15 callback, compiled against an older API for broad compatibility.
    public void onTimeout(int startId,int type){if(owner!=null){owner.task.fail("Достигнут лимит фонового расчёта Android.");complete(owner,false,"Достигнут лимит Android.");}else stopSelf();}
}

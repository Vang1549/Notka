package studio.notka.next.export

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.*
import android.provider.DocumentsContract
import java.io.File
import java.util.UUID
import java.util.concurrent.CancellationException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject
import studio.notka.core.*
import studio.notka.next.MainActivity
import studio.notka.next.NotkaApplication
import studio.notka.next.R
import studio.notka.next.data.*

class ExportService : Service() {
    companion object {
        private const val CHANNEL = "music-export"
        private const val ID = 701
        @Volatile
        var status = ""
            private set

        @Volatile
        var busy = false
            private set

        @Synchronized
        fun launch(context: Context, project: Project, uri: Uri, options: String) {
            check(!busy) { "Уже выполняется экспорт" }
            require(uri.scheme == "content")
            ExportOptions.decode(options)
            val id = UUID.randomUUID().toString()
            val file = File(context.filesDir, "export-jobs/$id.json")
            atomicWrite(
                file,
                JSONObject()
                    .put("track", ProjectCodec.encode(project))
                    .put("uri", uri.toString())
                    .put("options", options)
                    .toString()
                    .toByteArray(),
            )
            busy = true
            status = "Подготовка экспорта…"
            try {
                val intent = Intent(context, ExportService::class.java).putExtra("id", id)
                if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
                else context.startService(intent)
            } catch (e: Throwable) {
                busy = false
                file.delete()
                throw e
            }
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val cancel = AtomicBoolean(false)
    private var running = false
    private var wake: PowerManager.WakeLock? = null
    private var startedAt = 0L
    private var advancedAt = 0L
    private var lastFraction = -1.0
    private var notifiedAt = 0L
    private val app
        get() = application as NotkaApplication

    override fun onBind(intent: Intent?) = null

    private fun notification(
        text: String,
        progress: Int = -1,
        done: Boolean = false,
    ): Notification {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26)
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Экспорт музыки", NotificationManager.IMPORTANCE_LOW)
            )
        val builder =
            if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL)
            else Notification.Builder(this)
        val open =
            PendingIntent.getActivity(
                this,
                1,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        builder
            .setSmallIcon(R.drawable.ic_notka)
            .setContentTitle("Нотка 2")
            .setContentText(text)
            .setContentIntent(open)
            .setOnlyAlertOnce(true)
            .setOngoing(!done)
        if (!done) {
            builder.setProgress(100, maxOf(0, progress), progress < 0)
            val stop =
                PendingIntent.getService(
                    this,
                    2,
                    Intent(this, ExportService::class.java).setAction("cancel"),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            builder.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отмена", stop)
        }
        return builder.build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "cancel") {
            cancel.set(true)
            if (!running) {
                busy = false
                stopSelf()
            }
            return START_NOT_STICKY
        }
        if (running) return START_NOT_STICKY
        val id = intent?.getStringExtra("id")
        if (id == null || !id.matches(Regex("[a-f0-9-]{36}"))) {
            busy = false
            stopSelf()
            return START_NOT_STICKY
        }
        val note = notification("Подготовка экспорта…")
        if (Build.VERSION.SDK_INT >= 35)
            startForeground(ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING)
        else if (Build.VERSION.SDK_INT >= 29)
            startForeground(ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(ID, note)
        running = true
        busy = true
        cancel.set(false)
        startedAt = SystemClock.elapsedRealtime()
        advancedAt = startedAt
        wake =
            (getSystemService(POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Notka2:export")
                .apply { acquire(6 * 60 * 60 * 1000L) }
        executor.execute { runExport(id) }
        return START_NOT_STICKY
    }

    private fun checkJob() {
        if (cancel.get()) throw CancellationException("Экспорт отменён")
        val now = SystemClock.elapsedRealtime()
        check(now - startedAt < 6 * 60 * 60 * 1000L) {
            "Экспорт остановлен по ограничению времени Android"
        }
        check(now - advancedAt < 5 * 60 * 1000L) { "Кодировщик перестал отвечать" }
    }

    private fun progress(value: Double) {
        val now = SystemClock.elapsedRealtime()
        if (value > lastFraction) {
            lastFraction = value
            advancedAt = now
        }
        if (now - notifiedAt > 500) {
            notifiedAt = now
            status = "Экспорт · ${(value*100).toInt()}%"
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(
                ID,
                notification(status, (value * 100).toInt()),
            )
        }
    }

    private fun runExport(id: String) {
        val request = File(filesDir, "export-jobs/$id.json")
        val temp = File(cacheDir, "export-$id.partial")
        var target: Uri? = null
        var success = false
        var message = ""
        try {
            val data =
                JSONObject(
                    atomicRead(request, ProjectCodec.MAX_FILE_BYTES * 2 + 65536)
                        .toString(Charsets.UTF_8)
                )
            val project = ProjectCodec.decode(data.getString("track"))
            val options = ExportOptions.decode(data.getString("options"))
            target = Uri.parse(data.getString("uri"))
            require(target.scheme == "content")
            when (options.type) {
                "wav" ->
                    LimitedOutput(temp.outputStream().buffered()).use {
                        AudioExport.wave(
                            project,
                            app.banks,
                            options,
                            it,
                            ::checkJob,
                            progress = ::progress,
                        )
                    }
                "zip" ->
                    LimitedOutput(temp.outputStream().buffered()).use {
                        AudioExport.archive(project, app.banks, options, it, ::checkJob, ::progress)
                    }
                "mp4",
                "webm" ->
                    CodecExport.video(project, app.banks, options, temp, ::checkJob, ::progress)
                else -> CodecExport.audio(project, app.banks, options, temp, ::checkJob, ::progress)
            }
            checkJob()
            require(temp.length() in 1..EXPORT_LIMIT)
            status = "Сохраняю файл…"
            advancedAt = SystemClock.elapsedRealtime()
            contentResolver.openOutputStream(target, "wt")!!.use { out ->
                temp.inputStream().use { source ->
                    val buffer = ByteArray(65536)
                    while (true) {
                        checkJob()
                        val n = source.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        advancedAt = SystemClock.elapsedRealtime()
                    }
                    out.flush()
                }
            }
            success = true
            message = "Экспорт завершён"
        } catch (e: Throwable) {
            message =
                if (e is CancellationException) "Экспорт отменён"
                else "Ошибка экспорта: ${e.message?:e.javaClass.simpleName}"
            app.diagnostics.record("export", e)
        } finally {
            if (!success && target != null)
                runCatching { DocumentsContract.deleteDocument(contentResolver, target) }
            temp.delete()
            request.delete()
            status = message
            wake?.let { if (it.isHeld) it.release() }
            wake = null
            Handler(Looper.getMainLooper()).post {
                if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
                else stopForeground(true)
                (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(
                    ID,
                    notification(message, done = true),
                )
                stopSelf()
                running = false
                busy = false
            }
        }
    }

    @android.annotation.TargetApi(35) // This callback is dispatched only by Android 15+.
    override fun onTimeout(startId: Int, fgsType: Int) {
        cancel.set(true)
        status = "Экспорт остановлен по ограничению времени Android"
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        cancel.set(true)
        wake?.let { if (it.isHeld) it.release() }
        wake = null
        executor.shutdown()
        super.onDestroy()
    }
}

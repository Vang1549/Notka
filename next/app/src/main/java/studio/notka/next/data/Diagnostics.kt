package studio.notka.next.data

import android.content.Context
import android.os.Build
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import studio.notka.next.BuildConfig

class Diagnostics(context: Context) {
    private val preferences = context.getSharedPreferences("settings", 0)
    private val file = File(context.filesDir, "diagnostics.log")
    var enabled: Boolean
        get() = preferences.getBoolean("diagnostics", false)
        set(value) {
            preferences.edit().putBoolean("diagnostics", value).apply()
            if (!value) file.delete()
        }

    @Synchronized
    fun record(event: String, error: Throwable? = null) {
        if (!enabled) return
        runCatching {
            if (file.length() > 256 * 1024) file.writeText(file.readText().takeLast(128 * 1024))
            val time = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.ROOT).format(Date())
            val details =
                error?.let {
                    " ${it.javaClass.simpleName}\n" +
                        it.stackTrace.take(12).joinToString("\n") { frame ->
                            "${frame.className}.${frame.methodName}:${frame.lineNumber}"
                        }
                } ?: ""
            file.appendText("$time ${event.take(80)}$details\n")
        }
    }

    @Synchronized
    fun clear() {
        file.delete()
    }

    fun installCrashHandler() {
        val old = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            record("crash", error)
            old?.uncaughtException(thread, error)
        }
    }

    @Synchronized
    fun report(): String =
        "Нотка 2 ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\nAndroid ${Build.VERSION.RELEASE}, API ${Build.VERSION.SDK_INT}\n${Build.MANUFACTURER} ${Build.MODEL}\nПамять приложения: ${Runtime.getRuntime().maxMemory()/1024/1024} МБ\nДиагностика: $enabled\n\n" +
            (if (file.exists()) file.readText() else "Журнал пуст")
}

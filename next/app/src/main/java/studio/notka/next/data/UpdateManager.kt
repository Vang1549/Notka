package studio.notka.next.data

import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Base64
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.Signature
import java.security.cert.CertificateFactory
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject
import studio.notka.next.BuildConfig
import studio.notka.next.MainActivity
import studio.notka.next.ui.*

class UpdateManager(private val activity: MainActivity) {
    companion object {
        const val CHANNEL =
            "https://raw.githubusercontent.com/Vang1549/Notka/native-updates/next/dist/channel.json"
    }

    private val certificate =
        activity.assets.open("trust/native.der").use {
            CertificateFactory.getInstance("X.509").generateCertificate(it)
        }

    private fun fetch(url: String, limit: Int, cancel: AtomicBoolean): ByteArray {
        var current = url
        repeat(5) {
            val uri = Uri.parse(current)
            require(
                uri.scheme == "https" &&
                    uri.host in
                        listOf(
                            "raw.githubusercontent.com",
                            "github.com",
                            "release-assets.githubusercontent.com",
                            "objects.githubusercontent.com",
                        )
            ) {
                "Неверный адрес обновления"
            }
            val c = URL(current).openConnection() as HttpURLConnection
            c.connectTimeout = 15000
            c.readTimeout = 15000
            c.instanceFollowRedirects = false
            try {
                val code = c.responseCode
                if (code in listOf(301, 302, 303, 307, 308)) {
                    current = URL(URL(current), c.getHeaderField("Location")).toString()
                    return@repeat
                }
                if (code == 404) error("Новых выпусков пока нет")
                require(code == 200) { "Сервер вернул $code" }
                return c.inputStream.use { it.readBounded(limit, cancel) }
            } finally {
                c.disconnect()
            }
        }
        error("Слишком много перенаправлений")
    }

    fun check() {
        val cancelled = AtomicBoolean(false)
        activity.background(
            "Проверяю обновления…",
            {
                val raw = fetch(CHANNEL, 65536, cancelled)
                val envelope = JSONObject(raw.toString(Charsets.UTF_8))
                val record = envelope.getString("record")
                val valid =
                    Signature.getInstance("SHA256withRSA").run {
                        initVerify(certificate)
                        update(record.toByteArray())
                        verify(Base64.decode(envelope.getString("signature"), Base64.DEFAULT))
                    }
                require(valid) { "Подпись обновления не прошла проверку" }
                val data = JSONObject(record)
                require(
                    data.getString("kind") == "notka.native.channel.1" &&
                        data.getString("package") == "studio.notka.next"
                )
                val code = data.getInt("versionCode")
                val name = data.getString("versionName")
                val bytes = data.getInt("bytes")
                val hash = Base64.decode(data.getString("sha256"), Base64.DEFAULT)
                val url = data.getString("url")
                require(
                    code > 0 &&
                        bytes in 1024..128 * 1024 * 1024 &&
                        hash.size == 32 &&
                        name.length in 1..40 &&
                        url.matches(
                            Regex(
                                "https://github\\.com/Vang1549/Notka/releases/download/native-[a-zA-Z0-9.-]+/Notka2-[a-zA-Z0-9.-]+\\.apk"
                            )
                        )
                )
                activity.app.main.post {
                    if (!activity.isDestroyed) {
                        if (code <= BuildConfig.VERSION_CODE)
                            activity.message("Обновления", "Установлена актуальная версия")
                        else
                            activity.confirm(
                                "Нотка 2 · $name",
                                "Скачать обновление (${bytes/1024/1024} МБ)?",
                            ) {
                                download(code, url, bytes, hash)
                            }
                    }
                }
            },
            executor = activity.app.network,
        )
    }

    private fun download(code: Int, url: String, bytes: Int, hash: ByteArray) {
        val cancelled = AtomicBoolean(false)
        val progress =
            AlertDialog.Builder(activity)
                .setTitle("Обновление Нотки 2")
                .setMessage("Скачиваю и проверяю APK…")
                .setNegativeButton("Отмена") { _, _ -> cancelled.set(true) }
                .setCancelable(false)
                .show()
        activity.background(
            "Скачиваю APK…",
            {
                try {
                    val raw = fetch(url, bytes, cancelled)
                    require(
                        raw.size == bytes &&
                            MessageDigest.isEqual(
                                MessageDigest.getInstance("SHA-256").digest(raw),
                                hash,
                            )
                    ) {
                        "Размер или хеш APK не совпадает"
                    }
                    val file = File(activity.filesDir, "updates/Notka2-$code.apk")
                    atomicWrite(file, raw)
                    val flags =
                        if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
                        else PackageManager.GET_SIGNATURES
                    val archive =
                        activity.packageManager.getPackageArchiveInfo(file.path, flags)
                            ?: error("APK повреждён")
                    require(
                        archive.packageName == "studio.notka.next" &&
                            (if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode
                            else archive.versionCode.toLong()) == code.toLong()
                    )
                    val signatures =
                        if (Build.VERSION.SDK_INT >= 28) archive.signingInfo?.apkContentsSigners
                        else archive.signatures
                    require(
                        signatures?.size == 1 &&
                            MessageDigest.isEqual(signatures[0].toByteArray(), certificate.encoded)
                    ) {
                        "APK подписан другим ключом"
                    }
                    if (cancelled.get()) throw java.util.concurrent.CancellationException()
                    activity.app.main.post { if (!activity.isDestroyed) install(file) }
                } finally {
                    activity.app.main.post { progress.dismiss() }
                }
            },
            executor = activity.app.network,
        )
    }

    private fun install(file: File) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            activity.confirm(
                "Разрешение на установку",
                "Разреши Нотке 2 устанавливать обновления в следующем окне. Затем снова выбери проверку обновлений.",
            ) {
                activity.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${activity.packageName}"),
                    )
                )
            }
            return
        }
        val uri =
            Uri.Builder()
                .scheme("content")
                .authority(activity.packageName + ".updates")
                .appendPath(file.name)
                .build()
        activity.startActivity(
            Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        )
    }
}

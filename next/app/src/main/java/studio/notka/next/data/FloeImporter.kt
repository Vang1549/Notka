package studio.notka.next.data

import android.content.Context
import android.net.Uri
import android.util.Base64
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipFile
import org.json.*

object FloeImporter {
    const val AUTHOR = "https://www.frozenplain.com/product/music-box-suite-free"
    private const val PACKAGE_SHA256 = "HustIk4VgiWy/G9Trs8cP0hq4S9lrkP73Zv5FBywJDg="

    fun import(context: Context, uri: Uri, banks: BankStore, cancel: AtomicBoolean) {
        val bytes =
            context.contentResolver.openInputStream(uri)!!.use {
                it.readBounded(16 * 1024 * 1024, cancel)
            }
        require(
            Base64.encodeToString(
                MessageDigest.getInstance("SHA-256").digest(bytes),
                Base64.NO_WRAP,
            ) == PACKAGE_SHA256
        ) {
            "Это другая версия пакета FrozenPlain. Нужен оригинальный Music Box Suite Free в формате Floe"
        }
        val temporary = File.createTempFile("floe-", ".zip", context.cacheDir)
        temporary.writeBytes(bytes)
        try {
            val template =
                JSONObject(
                    context.assets.open("musicbox-import-template.json").bufferedReader().use {
                        it.readText()
                    }
                )
            val files = template.getJSONObject("files")
            val samples = JSONArray()
            var total = 0
            var license: ByteArray? = null
            ZipFile(temporary).use { zip ->
                val seen = mutableSetOf<String>()
                val entries = zip.entries()
                var count = 0
                while (entries.hasMoreElements()) {
                    val entry = entries.nextElement()
                    require(++count <= 512 && seen.add(entry.name))
                    if (cancel.get()) throw java.util.concurrent.CancellationException()
                    val definition = files.optJSONObject(entry.name)
                    if (definition != null) {
                        val data =
                            zip.getInputStream(entry).use {
                                it.readBounded(2 * 1024 * 1024, cancel)
                            }
                        total += data.size
                        require(total < 24 * 1024 * 1024)
                        definition.put("data", Base64.encodeToString(data, Base64.NO_WRAP))
                        samples.put(definition)
                    }
                    if (entry.name == "Libraries/FrozenPlain - Music Box Suite Free/License.pdf")
                        license =
                            zip.getInputStream(entry).use { it.readBounded(1024 * 1024, cancel) }
                }
            }
            require(samples.length() == files.length() && license != null) {
                "В пакете отсутствуют записи или лицензия"
            }
            template.remove("files")
            template.put("samples", samples)
            banks.storePrivate(template, cancel)
            atomicWrite(File(context.filesDir, "FrozenPlain-license.pdf"), license!!)
        } finally {
            temporary.delete()
        }
    }
}

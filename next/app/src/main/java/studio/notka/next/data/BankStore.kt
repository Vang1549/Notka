package studio.notka.next.data

import android.content.Context
import android.util.Base64
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.Signature
import java.security.cert.CertificateFactory
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject
import studio.notka.core.*

data class BankEntry(
    val id: String,
    val name: String,
    val asset: String,
    val gm: Int,
    val demo: Int = 60,
    val revision: Int = 1,
    val bytes: Int = 0,
    val hash: String = "",
    val preview: String? = null,
    val previewBytes: Int = 0,
    val previewHash: String = "",
    val builtin: Boolean = false,
    val origin: String = "legacy",
    val short: String = "Ин",
) {
    fun sameAssets(other: BankEntry) =
        id == other.id &&
            asset == other.asset &&
            revision == other.revision &&
            bytes == other.bytes &&
            hash == other.hash &&
            origin == other.origin &&
            preview == other.preview &&
            previewBytes == other.previewBytes &&
            previewHash == other.previewHash
}

data class BankSample(
    val root: Int,
    val tune: Double,
    val rr: Int,
    val pcm: Pcm,
    val loopStart: Double,
    val loopEnd: Double,
)

data class Bank(
    val id: String,
    val samples: List<BankSample>,
    val gain: Double,
    val attack: Double,
    val release: Double,
) {
    val bytes: Long
        get() = samples.sumOf { it.pcm.samples.size.toLong() * 4 }
}

class BankStore(private val context: Context) {
    companion object {
        const val LEGACY_BASE =
            "https://raw.githubusercontent.com/Vang1549/Notka/legacy-final-0.70/dist/soundbank/"
        const val NATIVE_BASE =
            "https://raw.githubusercontent.com/Vang1549/Notka/native-updates/next/dist/soundbank/"
        const val FLOE = "lib-floe-musicbox-1"
    }

    private val root = File(context.filesDir, "banks").apply { mkdirs() }
    private val previews = File(context.cacheDir, "previews").apply { mkdirs() }
    private val keys =
        listOf("legacy-current.der", "legacy-original.der", "native.der").map { name ->
            context.assets.open("trust/$name").use {
                CertificateFactory.getInstance("X.509").generateCertificate(it).publicKey
            }
        }
    @Volatile
    var entries: List<BankEntry> = emptyList()
        private set

    private val decoded = LinkedHashMap<String, Bank>(16, .75f, true)
    private val previewLock = Any()

    init {
        val builtin =
            listOf(
                BankEntry(
                    DEFAULT_SOURCE,
                    "Пианино",
                    "piano",
                    0,
                    bytes = context.assets.open("banks/piano.json").use { it.available() },
                    builtin = true,
                ),
                BankEntry(
                    "lib-mda-grand-1",
                    "Grand Piano · MDA",
                    "bank-mda-grand-1",
                    0,
                    bytes =
                        context.assets.open("banks/bank-mda-grand-1.json").use { it.available() },
                    builtin = true,
                ),
                BankEntry(FLOE, "Шкатулка · FrozenPlain", "musicbox-floe", 10),
            )
        val shipped =
            parseCatalog(context.assets.open("catalog.json").use { it.readBounded(262144) })
        val saved =
            runCatching { parseCatalog(atomicRead(File(root, "catalog.json"), 262144)) }.getOrNull()
        val catalog =
            saved?.takeIf { next -> shipped.all { old -> next.any { it.sameAssets(old) } } }
                ?: shipped
        entries = builtin + catalog.filter { item -> builtin.none { it.id == item.id } }
    }

    fun entry(id: String) =
        entries.firstOrNull { it.id == id } ?: error("Неизвестный инструмент. Обнови каталог")

    fun installed(id: String) =
        entries
            .firstOrNull { it.id == id }
            ?.let { it.builtin || File(root, it.asset + ".json").exists() } ?: false

    fun verify(bytes: ByteArray): JSONObject {
        require(bytes.size < 32 * 1024 * 1024)
        val envelope = JSONObject(bytes.toString(Charsets.UTF_8))
        val record = envelope.getString("record")
        val signature = Base64.decode(envelope.getString("signature"), Base64.DEFAULT)
        require(
            keys.any { key ->
                runCatching {
                        Signature.getInstance("SHA256withRSA").run {
                            initVerify(key)
                            update(record.toByteArray())
                            verify(signature)
                        }
                    }
                    .getOrDefault(false)
            }
        ) {
            "Подпись файла не прошла проверку"
        }
        return JSONObject(record)
    }

    private fun parseCatalog(bytes: ByteArray): List<BankEntry> {
        val data = verify(bytes)
        require(data.getString("kind") == "notka.instruments.1" && data.getInt("version") > 0)
        val list = data.getJSONArray("instruments")
        require(list.length() <= 200)
        val result =
            (0 until list.length()).map { i ->
                val d = list.getJSONObject(i)
                val p = d.optJSONObject("preview")
                BankEntry(
                    d.getString("id"),
                    d.getString("name"),
                    d.getString("asset"),
                    d.getInt("gm"),
                    d.getInt("demo"),
                    d.getInt("revision"),
                    d.getInt("bytes"),
                    d.getString("sha256"),
                    p?.getString("asset"),
                    p?.getInt("bytes") ?: 0,
                    p?.getString("sha256") ?: "",
                    origin = d.optString("origin", "legacy"),
                    short = d.optString("short", "Ин").take(4),
                )
            }
        require(
            result.map { it.id }.distinct().size == result.size &&
                result.map { it.asset }.distinct().size == result.size
        )
        result.forEach { e ->
            require(
                e.id.matches(Regex("lib-[a-z0-9-]{1,43}")) &&
                    e.asset.matches(Regex("bank-[a-z0-9-]{1,42}")) &&
                    Project.validName(e.name) &&
                    e.gm in 0..127 &&
                    e.demo in 24..119 &&
                    e.revision in 1..65535 &&
                    e.bytes in 100..8388607 &&
                    Base64.decode(e.hash, Base64.DEFAULT).size == 32 &&
                    e.origin in listOf("legacy", "native")
            )
            e.preview?.let {
                require(
                    it.matches(Regex("preview-[a-z0-9-]{1,39}")) &&
                        e.previewBytes in 100..262144 &&
                        Base64.decode(e.previewHash, Base64.DEFAULT).size == 32
                )
            }
        }
        return result
    }

    private fun fetch(path: String, limit: Int, cancel: AtomicBoolean, origin: String): ByteArray {
        require(path.matches(Regex("[a-z0-9.-]+")))
        val base =
            when (origin) {
                "legacy" -> LEGACY_BASE
                "native" -> NATIVE_BASE
                else -> error("Неизвестный источник инструмента")
            }
        val connection = URL(base + path).openConnection() as HttpURLConnection
        connection.connectTimeout = 15000
        connection.readTimeout = 15000
        connection.instanceFollowRedirects = false
        try {
            require(connection.responseCode == 200) { "Сервер вернул ${connection.responseCode}" }
            return connection.inputStream.use { it.readBounded(limit, cancel) }
        } finally {
            connection.disconnect()
        }
    }

    private fun checkHash(data: ByteArray, size: Int, hash: String) {
        require(
            data.size == size &&
                MessageDigest.isEqual(
                    MessageDigest.getInstance("SHA-256").digest(data),
                    Base64.decode(hash, Base64.DEFAULT),
                )
        ) {
            "Файл загружен не полностью или изменён"
        }
    }

    fun refresh(cancel: AtomicBoolean) {
        val raw = fetch("catalog.json", 262144, cancel, "native")
        val next = parseCatalog(raw)
        synchronized(this) {
            require(
                entries
                    .filter { !it.builtin && it.id != FLOE }
                    .all { old -> next.any { it.sameAssets(old) } }
            ) {
                "Каталог изменил существующий инструмент"
            }
            if (cancel.get()) throw java.util.concurrent.CancellationException()
            atomicWrite(File(root, "catalog.json"), raw)
            entries =
                entries.filter { it.builtin || it.id == FLOE } +
                    next.filter { n -> entries.none { it.builtin && it.id == n.id } }
        }
    }

    fun download(id: String, cancel: AtomicBoolean) {
        val e = entry(id)
        require(!e.builtin && id != FLOE)
        val raw = fetch(e.asset + ".json", e.bytes, cancel, e.origin)
        checkHash(raw, e.bytes, e.hash)
        decode(e, verify(raw), cancel)
        if (cancel.get()) throw java.util.concurrent.CancellationException()
        synchronized(this) { atomicWrite(File(root, e.asset + ".json"), raw) }
    }

    fun preview(id: String, cancel: AtomicBoolean): File {
        synchronized(previewLock) {
            val e = entry(id)
            val asset = e.preview ?: error("Для этого инструмента нет отдельного примера")
            val target = File(previews, "$asset.mp3")
            val cached = File(previews, "$asset.json")
            val previous =
                runCatching { atomicRead(cached, e.previewBytes).also { decodePreview(e, it) } }
                    .getOrNull()
            val raw = previous ?: fetch("$asset.json", e.previewBytes, cancel, e.origin)
            val audio = decodePreview(e, raw)
            if (cancel.get()) throw java.util.concurrent.CancellationException()
            if (previous == null) atomicWrite(cached, raw)
            cached.setLastModified(System.currentTimeMillis())
            atomicWrite(target, audio)
            previews
                .listFiles { f -> f.extension == "json" }
                ?.sortedByDescending { it.lastModified() }
                ?.drop(5)
                ?.forEach {
                    File(previews, it.nameWithoutExtension + ".mp3").delete()
                    it.delete()
                }
            return target
        }
    }

    fun decodePreview(entry: BankEntry, raw: ByteArray): ByteArray {
        checkHash(raw, entry.previewBytes, entry.previewHash)
        val data = verify(raw)
        require(
            data.getString("format") == "notka.preview.1" &&
                data.getString("id") == entry.preview &&
                data.getString("mime") == "audio/mpeg" &&
                data.getDouble("duration") > 0 &&
                data.getDouble("duration") <= 10
        )
        val encoded = data.getString("data")
        require(encoded.length in 1..240000 && encoded.matches(Regex("[A-Za-z0-9+/]+={0,2}")))
        return Base64.decode(encoded, Base64.DEFAULT)
    }

    @Synchronized
    fun remove(id: String) {
        val e = entry(id)
        require(!e.builtin)
        require(File(root, e.asset + ".json").delete()) { "Не удалось удалить инструмент" }
        decoded.remove(id)
    }

    @Synchronized
    fun load(id: String): Bank {
        decoded[id]?.let {
            return it
        }
        val e = entry(id)
        require(installed(id)) { "Сначала скачай «${e.name}» в библиотеке" }
        val data =
            if (e.builtin)
                context.assets.open("banks/${e.asset}.json").use {
                    JSONObject(it.readBounded(8388608).toString(Charsets.UTF_8))
                }
            else if (id == FLOE)
                JSONObject(
                    atomicRead(File(root, e.asset + ".json"), 32 * 1024 * 1024)
                        .toString(Charsets.UTF_8)
                )
            else {
                val raw = atomicRead(File(root, e.asset + ".json"), 8388608)
                checkHash(raw, e.bytes, e.hash)
                verify(raw)
            }
        val bank = decode(e, data)
        decoded[id] = bank
        var bytes = decoded.values.sumOf { it.bytes }
        val iterator = decoded.entries.iterator()
        while (bytes > 64 * 1024 * 1024 && decoded.size > 1 && iterator.hasNext()) {
            val old = iterator.next()
            if (old.key != id) {
                bytes -= old.value.bytes
                iterator.remove()
            }
        }
        return bank
    }

    fun decode(entry: BankEntry, data: JSONObject, cancel: AtomicBoolean? = null): Bank {
        require(
            data.getString("format") == "notka.instrument.1" &&
                data.getString("id") == entry.asset &&
                data.getInt("revision") == entry.revision
        ) {
            "Файл не соответствует инструменту"
        }
        val gain = data.getDouble("gain")
        val attack = data.getDouble("attack")
        val release = data.getDouble("release")
        val rate = data.getInt("sampleRate")
        val variants = data.optInt("roundRobins", 1)
        require(
            gain > 0 &&
                gain <= 1 &&
                attack in 0.0..1.0 &&
                release in .01..3.0 &&
                rate in 8000..96000 &&
                variants in 1..8
        )
        val samples = data.getJSONArray("samples")
        require(samples.length() in 1..128)
        var total = 0L
        val list =
            (0 until samples.length()).map { i ->
                if (cancel?.get() == true) throw java.util.concurrent.CancellationException()
                val s = samples.getJSONObject(i)
                val root = s.getInt("root")
                val tune = s.getDouble("tune")
                val rr = s.optInt("rr", 0)
                val encoded = s.getString("data")
                require(
                    root in 0..127 &&
                        tune.isFinite() &&
                        kotlin.math.abs(tune) <= 1200 &&
                        rr in 0 until variants &&
                        encoded.length in 60..4 * 1024 * 1024
                )
                val bytes = Base64.decode(encoded, Base64.DEFAULT)
                val pcm =
                    if (bytes.size >= 4 && String(bytes, 0, 4, Charsets.US_ASCII) == "fLaC")
                        studio.notka.next.audio.AudioDecoder.decode(bytes, context.cacheDir)
                    else Wave.decode(bytes)
                require(pcm.rate == rate)
                total += pcm.samples.size.toLong() * 4
                require(total <= 64 * 1024 * 1024) { "Банк звуков слишком большой" }
                val loop = s.optJSONArray("loop")
                val low = loop?.getDouble(0) ?: 0.0
                val high = loop?.getDouble(1) ?: 0.0
                require(
                    loop == null ||
                        (loop.length() == 2 &&
                            low >= 0 &&
                            low < high &&
                            high <= pcm.frames &&
                            low % 1 == 0.0 &&
                            high % 1 == 0.0)
                )
                BankSample(root, tune, rr, pcm, low, high)
            }
        return Bank(entry.id, list, gain, attack, release)
    }

    fun storePrivate(data: JSONObject, cancel: AtomicBoolean? = null) {
        val e = entry(FLOE)
        decode(e, data, cancel)
        if (cancel?.get() == true) throw java.util.concurrent.CancellationException()
        synchronized(this) {
            atomicWrite(File(root, e.asset + ".json"), data.toString().toByteArray())
            decoded.remove(FLOE)
        }
    }
}

package studio.notka.core

import kotlin.math.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

const val PPQ = 960L
const val MAX_TICK = 9_007_199_254_740_991L
val DIVISIONS = listOf(0, 1, 2, 3, 4, 6, 8, 12, 16)
const val DEFAULT_SOURCE = "vsco-piano-1"

@Serializable
data class SoundSettings(
    val volume: Double = 100.0,
    val pan: Double = 0.0,
    val transpose: Int = 0,
    val fine: Double = 0.0,
    val attack: Double? = null,
    val release: Double? = null,
    val delay: Double = 0.0,
    val hold: Double = 0.0,
    val decay: Double = 0.0,
    val sustain: Double = 100.0,
    val filter: String = "off",
    val cutoff: Double = 16000.0,
    val resonance: Double = .7,
    val start: Double = 0.0,
    val end: Double = 100.0,
    val reverse: Boolean = false,
    val loop: String = "original",
    val velocity: Double = 1.0,
) {
    fun validate(): SoundSettings {
        fun bound(value: Double, lo: Double, hi: Double) {
            require(value.isFinite() && value in lo..hi) { "Некорректные настройки инструмента" }
        }
        bound(volume, 0.0, 150.0)
        bound(pan, -100.0, 100.0)
        require(transpose in -24..24)
        bound(fine, -100.0, 100.0)
        attack?.let { bound(it, 0.0, 5.0) }
        release?.let { bound(it, .005, 10.0) }
        bound(delay, 0.0, 2.0)
        bound(hold, 0.0, 5.0)
        bound(decay, 0.0, 10.0)
        bound(sustain, 0.0, 100.0)
        require(filter in listOf("off", "lowpass", "highpass", "bandpass"))
        bound(cutoff, 20.0, 20000.0)
        bound(resonance, .1, 20.0)
        bound(start, 0.0, 99.9)
        bound(end, .1, 100.0)
        require(start < end)
        require(loop in listOf("original", "off"))
        bound(velocity, .25, 3.0)
        return this
    }
}

data class Note(
    val id: Long,
    val start: Long,
    val len: Long,
    val pitch: Int,
    val volume: Int = 100,
) {
    val end: Long
        get() = start + len

    fun validate(): Note {
        require(id > 0 && start in 0..MAX_TICK && len in 1..MAX_TICK && start <= MAX_TICK - len) {
            "Неверная длина ноты"
        }
        require(pitch in 24..119 && volume in 0..100) { "Неверная высота или громкость ноты" }
        return this
    }
}

data class Instrument(
    val id: String,
    val source: String,
    val name: String,
    val settings: SoundSettings = SoundSettings(),
)

data class Lane(
    val id: Long,
    val name: String,
    val instrumentId: String,
    val instrument: String,
    val notes: List<Note> = emptyList(),
    val muted: Boolean = false,
    val ghost: Boolean = false,
)

data class Project(
    val bpm: Int = 100,
    val division: Int = 4,
    val noteDivision: Int = 0,
    val viewDivision: Int = 0,
    val activeLane: Int = 0,
    val lanes: List<Lane> = listOf(Lane(1, "Дорожка 1", "inst-1", DEFAULT_SOURCE)),
    val instruments: List<Instrument> = listOf(Instrument("inst-1", DEFAULT_SOURCE, "Пианино")),
    val scene: JsonObject = SceneOptions.defaults(),
) {
    val lane
        get() = lanes[activeLane]

    val endTick
        get() = lanes.maxOfOrNull { lane -> lane.notes.maxOfOrNull { it.end } ?: 0 } ?: 0

    val nextNoteId
        get() = (lanes.maxOfOrNull { lane -> lane.notes.maxOfOrNull { it.id } ?: 0 } ?: 0) + 1

    val snapTick
        get() = if (division == 0) 1L else PPQ / division

    val defaultNoteLength
        get() =
            PPQ /
                (noteDivision.takeIf { it > 0 }
                    ?: viewDivision.takeIf { it > 0 }
                    ?: division.takeIf { it > 0 }
                    ?: 4)

    fun instrument(lane: Lane) = instruments.first { it.id == lane.instrumentId }

    fun replaceLane(index: Int, lane: Lane) =
        copy(lanes = lanes.mapIndexed { i, old -> if (i == index) lane else old })

    fun validate(): Project {
        require(
            bpm in 40..220 &&
                division in DIVISIONS &&
                noteDivision in DIVISIONS &&
                viewDivision in DIVISIONS
        )
        require(lanes.isNotEmpty() && activeLane in lanes.indices && instruments.size in 1..128)
        val ids = mutableSetOf<String>()
        val notes = mutableSetOf<Long>()
        val laneIds = mutableSetOf<Long>()
        instruments.forEach { i ->
            require(i.id.matches(Regex("inst-[a-z0-9-]{1,40}")) && ids.add(i.id)) {
                "Повторяющийся инструмент"
            }
            require(validSource(i.source) && validName(i.name))
            i.settings.validate()
        }
        lanes.forEach { lane ->
            require(laneIds.add(lane.id) && validName(lane.name))
            require(
                instruments.any { it.id == lane.instrumentId && it.source == lane.instrument }
            ) {
                "Инструмент дорожки отсутствует"
            }
            lane.notes.forEach {
                it.validate()
                require(notes.add(it.id)) { "Повторяющаяся нота" }
            }
        }
        return this
    }

    companion object {
        fun validSource(source: String) =
            source == DEFAULT_SOURCE || source.matches(Regex("lib-[a-z0-9-]{1,43}"))

        fun validName(name: String) = name.isNotBlank() && name.length <= 48

        fun normalizeSource(source: String) =
            mapOf(
                "classic" to DEFAULT_SOURCE,
                "vsco-violin-1" to "lib-vsco-violin-1",
                "vsco-flute-1" to "lib-vsco-flute-1",
                "vsco-bass-1" to "lib-vsco-bass-1",
            )[source] ?: source
    }
}

object SceneOptions {
    fun defaults(): JsonObject = buildJsonObject {
        put("schema", 2)
        put("palette", "basic")
        put("rangeMode", "auto")
        put("keyStart", 48)
        put("keyCount", 49)
        put("keyboardHeight", 18)
        put("keyLabels", "none")
        put("guides", false)
        put("speed", 1.0)
        put("noteWidth", 80)
        put("roundness", 25)
        put("noteStyle", "solid")
        put("colorMode", "lane")
        put("backdrop", "plain")
        put("background", "#000000")
        put("glow", true)
        put("glowAmount", 20)
        put("sparks", true)
        put("sparkAmount", 16)
        put("rays", 0)
        put("rings", 0)
        put("trails", 0)
        put("keyLights", true)
        put("fps", 60)
        put("quality", 1.5)
        put("loop", false)
        put("octaveRange", true)
        put("colorSeed", 1)
        put("presetName", "@basic")
        put("colors", JsonObject(emptyMap()))
    }

    val bounds =
        mapOf(
            "keyStart" to 0.0..116.0,
            "keyCount" to 12.0..88.0,
            "keyboardHeight" to 8.0..26.0,
            "speed" to .1..10.0,
            "noteWidth" to 40.0..96.0,
            "roundness" to 0.0..50.0,
            "glowAmount" to 0.0..100.0,
            "sparkAmount" to 0.0..100.0,
            "rays" to 0.0..100.0,
            "rings" to 0.0..100.0,
            "trails" to 0.0..100.0,
        )
    val choices =
        mapOf(
            "palette" to listOf("basic", "aurora", "ember", "ice", "iris"),
            "rangeMode" to listOf("auto", "manual"),
            "keyLabels" to listOf("c", "all", "none"),
            "noteStyle" to listOf("glass", "solid", "neon"),
            "colorMode" to listOf("lane", "instrument", "single"),
            "backdrop" to listOf("aurora", "stars", "plain"),
        )

    fun normalize(saved: JsonObject?): JsonObject {
        val result = defaults().toMutableMap()
        if (saved == null) return JsonObject(result)
        val legacy = (saved["schema"] as? JsonPrimitive)?.intOrNull != 2
        result["presetName"] = JsonPrimitive("")
        if (legacy) {
            result.putAll(
                buildJsonObject {
                    put("palette", "aurora")
                    put("keyLabels", "c")
                    put("guides", true)
                    put("backdrop", "aurora")
                    put("background", "#080e19")
                    put("octaveRange", false)
                    put("fps", 30)
                    put("keyboardHeight", 16)
                    put("noteWidth", 78)
                    put("roundness", 22)
                    put("noteStyle", "glass")
                    put("glowAmount", 40)
                    put("sparkAmount", 30)
                    put("rays", 28)
                    put("rings", 20)
                    put("trails", 15)
                }
            )
        }
        for ((key, value) in saved) {
            val primitive = value as? JsonPrimitive ?: continue
            when {
                key in bounds ->
                    primitive
                        .takeUnless { it.isString }
                        ?.doubleOrNull
                        ?.takeIf { it.isFinite() }
                        ?.let {
                            val v = it.coerceIn(bounds.getValue(key))
                            result[key] =
                                if (key == "speed") JsonPrimitive(v)
                                else JsonPrimitive(v.roundToInt())
                        }
                key in choices && primitive.content in choices.getValue(key) -> result[key] = value
                key in listOf("loop", "guides", "glow", "sparks", "keyLights", "octaveRange") &&
                    primitive.booleanOrNull != null -> result[key] = value
                key == "background" && primitive.content.matches(Regex("#[a-fA-F0-9]{6}")) ->
                    result[key] = value
                key == "fps" && primitive.intOrNull in listOf(30, 60) -> result[key] = value
                key == "quality" && primitive.doubleOrNull in listOf(1.0, 1.5, 2.0) ->
                    result[key] = value
                key == "colorSeed" && (primitive.longOrNull ?: 0) in 1..2147483647 ->
                    result[key] = value
                key == "presetName" && primitive.isString && primitive.content.length <= 48 ->
                    result[key] = value
            }
        }
        if (legacy) {
            val fall = (saved["fall"] as? JsonPrimitive)?.doubleOrNull
            val speed =
                (saved["speed"] as? JsonPrimitive)
                    ?.doubleOrNull
                    ?.takeIf { it.isFinite() }
                    ?.coerceIn(.5, 3.0) ?: if (fall in listOf(1.3, 2.4, 4.0)) 3.6 / fall!! else 1.0
            val stretch =
                (saved["stretch"] as? JsonPrimitive)
                    ?.doubleOrNull
                    ?.takeIf { it.isFinite() }
                    ?.coerceIn(.25, 2.5) ?: 1.25
            result["speed"] = JsonPrimitive(speed * stretch)
        }
        val start = result.getValue("keyStart").jsonPrimitive.double.toInt()
        result["keyCount"] =
            JsonPrimitive(
                min(result.getValue("keyCount").jsonPrimitive.double.toInt(), 128 - start)
            )
        val colors =
            (saved["colors"] as? JsonObject)
                ?.entries
                ?.take(250)
                ?.filter { (key, value) ->
                    key.matches(Regex("lane-\\d{1,4}|instrument-[a-z0-9-]{1,48}|single")) &&
                        (value as? JsonPrimitive)?.content?.let {
                            it == "transparent" || it.matches(Regex("#[a-fA-F0-9]{6}"))
                        } == true
                }
                ?.associate { it.key to it.value } ?: emptyMap()
        result["colors"] = JsonObject(colors)
        return JsonObject(result)
    }
}

fun JsonObject.number(key: String, fallback: Double = 0.0) =
    (get(key) as? JsonPrimitive)?.doubleOrNull ?: fallback

fun JsonObject.flag(key: String, fallback: Boolean = false) =
    (get(key) as? JsonPrimitive)?.booleanOrNull ?: fallback

fun JsonObject.text(key: String, fallback: String = "") =
    (get(key) as? JsonPrimitive)?.content ?: fallback

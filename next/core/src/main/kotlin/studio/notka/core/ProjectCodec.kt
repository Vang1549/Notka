package studio.notka.core

import kotlinx.serialization.json.*

object ProjectCodec {
    val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = true
    }
    const val MAX_FILE_BYTES = 16 * 1024 * 1024

    private fun JsonObject.integer(key: String): Long {
        val value =
            (get(key) as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull
                ?: error("Неверное числовое поле: $key")
        require(
            value.isFinite() && kotlin.math.abs(value) <= MAX_TICK.toDouble() && value % 1 == 0.0
        ) {
            "Неверное целое число: $key"
        }
        return value.toLong()
    }

    private fun JsonObject.string(key: String): String =
        (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: error("Неверное текстовое поле: $key")

    private fun JsonObject.bool(key: String, fallback: Boolean? = null): Boolean =
        (get(key) as? JsonPrimitive)?.takeUnless { it.isString }?.booleanOrNull
            ?: fallback
            ?: error("Неверное поле: $key")

    private fun JsonObject.objects(key: String) =
        (get(key) as? JsonArray)?.map { it as? JsonObject ?: error("Неверный список: $key") }
            ?: error("Отсутствует список: $key")

    fun decode(raw: String): Project {
        require(raw.toByteArray(Charsets.UTF_8).size <= MAX_FILE_BYTES) { "Файл слишком большой" }
        val t = json.parseToJsonElement(raw) as? JsonObject ?: error("Неверный формат трека")
        require(
            t.string("format") == "notka.track" &&
                t.integer("version") in 1..3 &&
                t.integer("ppq") == PPQ
        ) {
            "Неизвестный формат трека"
        }
        val version = t.integer("version").toInt()
        val bpm = t.integer("bpm")
        val division = t.integer("division")
        require(bpm in 40..220 && division in DIVISIONS.map(Int::toLong))
        val input =
            if (version == 1)
                listOf(
                    buildJsonObject {
                        put("name", "Дорожка 1")
                        put("muted", false)
                        put("notes", t["notes"] ?: error("Нет нот"))
                    }
                )
            else t.objects("lanes")
        require(input.isNotEmpty())
        var noteId = 0L
        val lanes =
            input.mapIndexed { index, lane ->
                val source =
                    Project.normalizeSource(
                        lane["instrument"]?.let { lane.string("instrument") } ?: DEFAULT_SOURCE
                    )
                require(Project.validSource(source)) { "Неизвестный инструмент" }
                val notes =
                    lane.objects("notes").map { n ->
                        val pitch = n.integer("pitch")
                        val volume = n.integer("volume")
                        require(pitch in 24..119 && volume in 0..100)
                        Note(
                                ++noteId,
                                n.integer("start"),
                                n.integer("len"),
                                pitch.toInt(),
                                volume.toInt(),
                            )
                            .validate()
                    }
                Lane(
                    index + 1L,
                    lane.string("name"),
                    if (version == 3) lane.string("instrumentId") else "",
                    source,
                    notes,
                    lane.bool("muted"),
                    if ("ghost" in lane) lane.bool("ghost") else false,
                )
            }
        val rack =
            if (version == 3)
                t.objects("instruments").map { i ->
                    Instrument(
                        i.string("id"),
                        i.string("source"),
                        i.string("name").trim(),
                        json
                            .decodeFromJsonElement<SoundSettings>(
                                i["settings"] ?: JsonObject(emptyMap())
                            )
                            .validate(),
                    )
                }
            else
                lanes
                    .map { it.instrument }
                    .distinct()
                    .mapIndexed { index, source ->
                        Instrument(
                            "inst-${index + 1}",
                            source,
                            if (source == DEFAULT_SOURCE) "Пианино" else "Инструмент ${index + 1}",
                        )
                    }
        val active =
            if (version == 1) 0
            else
                t.integer("activeLane")
                    .also { require(it in lanes.indices.map(Int::toLong)) }
                    .toInt()
        fun division(name: String) =
            if (name !in t) 0
            else t.integer(name).also { require(it in DIVISIONS.map(Int::toLong)) }.toInt()
        return Project(
                bpm.toInt(),
                division.toInt(),
                division("noteDivision"),
                division("viewDivision"),
                active,
                if (version == 3) lanes
                else
                    lanes.map { lane ->
                        lane.copy(instrumentId = rack.first { it.source == lane.instrument }.id)
                    },
                rack,
                SceneOptions.normalize(t["scene"] as? JsonObject),
            )
            .validate()
    }

    fun encode(project: Project): String {
        project.validate()
        return buildJsonObject {
                put("format", "notka.track")
                put("version", 3)
                put("ppq", PPQ)
                put("bpm", project.bpm)
                put("division", project.division)
                put("noteDivision", project.noteDivision)
                put("viewDivision", project.viewDivision)
                put("activeLane", project.activeLane)
                put("scene", project.scene)
                put(
                    "instruments",
                    JsonArray(
                        project.instruments.map { i ->
                            buildJsonObject {
                                put("id", i.id)
                                put("source", i.source)
                                put("name", i.name)
                                put("settings", json.encodeToJsonElement(i.settings))
                            }
                        }
                    ),
                )
                put(
                    "lanes",
                    JsonArray(
                        project.lanes.map { lane ->
                            buildJsonObject {
                                put("name", lane.name)
                                put("muted", lane.muted)
                                put("ghost", lane.ghost)
                                put("instrument", lane.instrument)
                                put("instrumentId", lane.instrumentId)
                                put(
                                    "notes",
                                    JsonArray(
                                        lane.notes.map { n ->
                                            buildJsonObject {
                                                put("start", n.start)
                                                put("len", n.len)
                                                put("pitch", n.pitch)
                                                put("volume", n.volume)
                                            }
                                        }
                                    ),
                                )
                            }
                        }
                    ),
                )
            }
            .toString()
    }
}

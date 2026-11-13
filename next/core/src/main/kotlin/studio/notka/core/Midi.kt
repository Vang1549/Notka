package studio.notka.core

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import kotlin.math.*

object Midi {
    fun encode(
        project: Project,
        title: String,
        programs: Map<String, Int>,
        includeMuted: Boolean = false,
    ): ByteArray {
        project.validate()
        val lanes =
            project.lanes.filter {
                (includeMuted || !it.muted) && it.notes.any { n -> n.volume > 0 }
            }
        require(lanes.size in 1..15) { "Для MIDI нужны от 1 до 15 непустых дорожек" }
        fun variable(n: Long): ByteArray {
            require(n in 0..0x0fffffff) { "Слишком большой промежуток времени для MIDI" }
            var v = n
            val bytes = mutableListOf((v and 127).toByte())
            while (v shr 7 > 0) {
                v = v shr 7
                bytes.add(0, ((v and 127) or 128).toByte())
            }
            return bytes.toByteArray()
        }
        fun DataOutputStream.meta(kind: Int, text: String) {
            val data = text.toByteArray(Charsets.UTF_8)
            writeByte(255)
            writeByte(kind)
            write(variable(data.size.toLong()))
            write(data)
        }
        fun chunk(action: DataOutputStream.() -> Unit): ByteArray {
            val data = ByteArrayOutputStream()
            DataOutputStream(data).use(action)
            return ByteArrayOutputStream()
                .also {
                    DataOutputStream(it).apply {
                        writeBytes("MTrk")
                        writeInt(data.size())
                        write(data.toByteArray())
                    }
                }
                .toByteArray()
        }
        val conductor = chunk {
            writeByte(0)
            meta(3, title)
            val tempo = (60_000_000.0 / project.bpm).roundToInt()
            write(byteArrayOf(0, -1, 81, 3))
            writeByte(tempo shr 16)
            writeByte(tempo shr 8)
            writeByte(tempo)
            write(byteArrayOf(0, -1, 88, 4, 4, 2, 24, 8, 0, -1, 47, 0))
        }
        data class Event(val tick: Long, val on: Boolean, val pitch: Int, val velocity: Int)
        val tracks =
            lanes.mapIndexed { index, lane ->
                chunk {
                    val channel = if (index < 9) index else index + 1
                    val instrument = project.instrument(lane)
                    val s = instrument.settings
                    val gm =
                        programs[lane.instrument]
                            ?: error("Нет данных об инструменте ${instrument.name}")
                    require(gm in 0..127)
                    writeByte(0)
                    meta(3, lane.name)
                    writeByte(0)
                    meta(4, instrument.name)
                    fun cc(n: Int, v: Int) {
                        writeByte(0)
                        writeByte(0xb0 or channel)
                        writeByte(n)
                        writeByte(v)
                    }
                    cc(0, 0)
                    cc(32, 0)
                    writeByte(0)
                    writeByte(0xc0 or channel)
                    writeByte(gm)
                    cc(7, (min(100.0, s.volume) * 127 / 100).roundToInt())
                    cc(10, ((s.pan + 100) * 127 / 200).roundToInt())
                    val events =
                        lane.notes
                            .filter { it.volume > 0 && s.volume > 0 }
                            .flatMap { n ->
                                val pitch = n.pitch + s.transpose
                                require(pitch in 0..127) {
                                    "Нота после транспонирования выходит за диапазон MIDI"
                                }
                                listOf(
                                    Event(
                                        n.start,
                                        true,
                                        pitch,
                                        max(
                                            1,
                                            (n.volume / 100.0)
                                                .pow(s.velocity)
                                                .times(127)
                                                .roundToInt(),
                                        ),
                                    ),
                                    Event(n.end, false, pitch, 0),
                                )
                            }
                            .sortedWith(
                                compareBy<Event> { it.tick }.thenBy { it.on }.thenBy { it.pitch }
                            )
                    var tick = 0L
                    for (e in events) {
                        write(variable(e.tick - tick))
                        writeByte((if (e.on) 0x90 else 0x80) or channel)
                        writeByte(e.pitch)
                        writeByte(e.velocity)
                        tick = e.tick
                    }
                    write(byteArrayOf(0, -1, 47, 0))
                }
            }
        return ByteArrayOutputStream()
            .also { out ->
                DataOutputStream(out).use {
                    it.writeBytes("MThd")
                    it.writeInt(6)
                    it.writeShort(1)
                    it.writeShort(tracks.size + 1)
                    it.writeShort(PPQ.toInt())
                    it.write(conductor)
                    tracks.forEach(it::write)
                }
            }
            .toByteArray()
    }
}

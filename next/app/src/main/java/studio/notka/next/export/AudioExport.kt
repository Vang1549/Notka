package studio.notka.next.export

import java.io.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.math.*
import kotlinx.serialization.json.*
import studio.notka.core.*
import studio.notka.next.audio.NativeAudio
import studio.notka.next.data.BankStore

const val EXPORT_LIMIT = 256L * 1024 * 1024

class LimitedOutput(private val target: OutputStream) : OutputStream() {
    var count = 0L
        private set

    override fun write(b: Int) {
        require(++count <= EXPORT_LIMIT) { "Экспорт превышает 256 МБ" }
        target.write(b)
    }

    override fun write(data: ByteArray, offset: Int, length: Int) {
        require(count + length <= EXPORT_LIMIT) { "Экспорт превышает 256 МБ" }
        target.write(data, offset, length)
        count += length
    }

    override fun flush() = target.flush()

    override fun close() = target.close()
}

object AudioExport {
    fun pcm(buffer: FloatArray, frames: Int, channels: Int, bits: Int): ByteArray {
        val out = ByteBuffer.allocate(frames * channels * bits / 8).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until frames) for (ch in 0 until channels) {
            val sample =
                (if (channels == 1) (buffer[i * 2] + buffer[i * 2 + 1]) * .5f
                    else buffer[i * 2 + ch])
                    .coerceIn(-1f, 1f)
            if (bits == 16)
                out.putShort((sample * (if (sample < 0) 32768 else 32767)).roundToInt().toShort())
            else {
                val v = (sample * (if (sample < 0) 8388608 else 8388607)).roundToInt()
                out.put(v.toByte())
                out.put((v shr 8).toByte())
                out.put((v shr 16).toByte())
            }
        }
        return out.array()
    }

    fun wave(
        project: Project,
        banks: BankStore,
        options: ExportOptions,
        output: OutputStream,
        check: () -> Unit,
        duration: Double = 0.0,
        progress: (Double) -> Unit,
    ) {
        NativeAudio.build(project, banks, options.rate, options.includeMuted).use { audio ->
            val frames = ceil(maxOf(audio.duration, duration) * options.rate).toLong()
            require(frames * options.channels * (options.bits / 8) + 44 <= EXPORT_LIMIT) {
                "WAV превышает 256 МБ"
            }
            output.write(Wave.header(frames, options.rate, options.channels, options.bits))
            val buffer = FloatArray(8192 * 2)
            var at = 0L
            while (at < frames) {
                check()
                val count = minOf(8192L, frames - at).toInt()
                audio.render(buffer, count)
                output.write(pcm(buffer, count, options.channels, options.bits))
                at += count
                progress(at.toDouble() / frames)
            }
        }
    }

    fun archive(
        project: Project,
        banks: BankStore,
        options: ExportOptions,
        output: OutputStream,
        check: () -> Unit,
        progress: (Double) -> Unit,
    ) {
        val lanes =
            project.lanes.filter {
                (options.includeMuted || !it.muted) && it.notes.any { n -> n.volume > 0 }
            }
        require(lanes.isNotEmpty()) { "Нет звучащих нот" }
        val selected = project.copy(lanes = lanes, activeLane = 0)
        val midi = Midi.encode(selected, "Трек", banks.entries.associate { it.id to it.gm }, true)
        val duration = NativeAudio.build(selected, banks, options.rate, true).use { it.duration }
        ZipOutputStream(output).use { zip ->
            fun text(name: String, bytes: ByteArray) {
                check()
                zip.putNextEntry(ZipEntry(name))
                zip.write(bytes)
                zip.closeEntry()
            }
            text("original.notka", ProjectCodec.encode(project).toByteArray())
            text("track.mid", midi)
            text(
                "tracks.json",
                buildJsonObject {
                        put("bpm", project.bpm)
                        put("sampleRate", options.rate)
                        put(
                            "tracks",
                            JsonArray(
                                lanes.map { lane ->
                                    buildJsonObject {
                                        put("name", lane.name)
                                        put("instrument", lane.instrument)
                                        put("instrumentId", lane.instrumentId)
                                        put("muted", lane.muted)
                                    }
                                }
                            ),
                        )
                    }
                    .toString()
                    .toByteArray(),
            )
            text(
                "README.txt",
                "Нотка 2\noriginal.notka — исходный проект; track.mid — MIDI; mix.wav — общий звук; stems — отдельные дорожки с сохранёнными паузами.\nЛичные звуковые банки в архив не включены.\n"
                    .toByteArray(),
            )
            zip.putNextEntry(ZipEntry("mix.wav"))
            wave(selected, banks, options.copy(includeMuted = true), zip, check) {
                progress(it / (lanes.size + 1))
            }
            zip.closeEntry()
            lanes.forEachIndexed { index, lane ->
                val name = lane.name.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").take(48)
                zip.putNextEntry(
                    ZipEntry("stems/${(index+1).toString().padStart(3,'0')}-$name.wav")
                )
                val track = selected.copy(lanes = listOf(lane), activeLane = 0)
                wave(track, banks, options.copy(includeMuted = true), zip, check, duration) {
                    progress((index + 1 + it) / (lanes.size + 1))
                }
                zip.closeEntry()
            }
        }
    }
}

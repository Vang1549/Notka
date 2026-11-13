package studio.notka.next.audio

import studio.notka.core.*
import studio.notka.next.data.BankStore

class NativeAudio(val sampleRate: Int = 48000) : AutoCloseable {
    companion object {
        init {
            System.loadLibrary("notka_audio")
        }

        fun build(
            project: Project,
            banks: BankStore,
            rate: Int = 48000,
            includeMuted: Boolean = false,
            loop: Boolean = false,
        ): NativeAudio {
            project.validate()
            val lanes =
                project.lanes
                    .filter {
                        (includeMuted || !it.muted) && project.instrument(it).settings.volume > 0
                    }
                    .map { it.copy(notes = it.notes.filter { n -> n.volume > 0 }) }
            val ids = lanes.filter { it.notes.isNotEmpty() }.map { it.instrument }.distinct()
            val loaded = ids.map { banks.load(it) }
            require(loaded.sumOf { it.bytes } <= 128 * 1024 * 1024) {
                "Для этого трека нужно слишком много памяти звуков"
            }
            val engine = NativeAudio(rate)
            try {
                loaded.forEachIndexed { index, bank ->
                    bank.samples.forEach { sample ->
                        engine.addSample(
                            engine.handle,
                            index,
                            sample.root,
                            sample.tune,
                            sample.rr,
                            sample.pcm.rate,
                            sample.pcm.channels,
                            sample.pcm.samples,
                            sample.loopStart,
                            sample.loopEnd,
                            bank.gain,
                            bank.attack,
                            bank.release,
                        )
                    }
                }
                val secondsPerTick = 60.0 / project.bpm / PPQ
                val musicalEnd =
                    (project.lanes
                        .filter { includeMuted || !it.muted }
                        .maxOfOrNull { lane -> lane.notes.maxOfOrNull { it.end } ?: 0L } ?: 0L) *
                        secondsPerTick
                var duration = musicalEnd
                val data = DoubleArray(lanes.sumOf { it.notes.size } * 26)
                var at = 0
                lanes.forEach { lane ->
                    val s = project.instrument(lane).settings
                    val bank = ids.indexOf(lane.instrument)
                    lane.notes.forEachIndexed { variant, n ->
                        val start = n.start * secondsPerTick
                        val length = n.len * secondsPerTick
                        duration =
                            maxOf(duration, start + length + (s.release ?: loaded[bank].release))
                        val values =
                            doubleArrayOf(
                                start,
                                length,
                                n.pitch.toDouble(),
                                n.volume.toDouble(),
                                bank.toDouble(),
                                variant.toDouble(),
                                s.volume,
                                s.pan,
                                s.transpose.toDouble(),
                                s.fine,
                                s.attack ?: -1.0,
                                s.release ?: -1.0,
                                s.delay,
                                s.hold,
                                s.decay,
                                s.sustain,
                                listOf("off", "lowpass", "highpass", "bandpass")
                                    .indexOf(s.filter)
                                    .toDouble(),
                                s.cutoff,
                                s.resonance,
                                s.start,
                                s.end,
                                if (s.reverse) 1.0 else 0.0,
                                if (s.loop == "original") 1.0 else 0.0,
                                s.velocity,
                                0.0,
                                0.0,
                            )
                        values.copyInto(data, at)
                        at += 26
                    }
                }
                engine.duration = maxOf(.1, if (loop) musicalEnd else duration)
                engine.prepare(
                    engine.handle,
                    data,
                    maxOf(.1, duration),
                    loop,
                    maxOf(.1, musicalEnd),
                )
                return engine
            } catch (e: Throwable) {
                engine.close()
                throw e
            }
        }
    }

    private var handle = create(sampleRate)
    var duration = 0.0
        private set

    @Synchronized
    fun play() {
        check(handle != 0L)
        start(handle)
    }

    @Synchronized
    fun pause() {
        if (handle != 0L) pause(handle)
    }

    @Synchronized
    fun seek(seconds: Double) {
        check(handle != 0L)
        seek(handle, seconds)
    }

    @Synchronized fun seconds(): Double = if (handle == 0L) 0.0 else position(handle)

    @Synchronized fun status(): Int = if (handle == 0L) 1 else state(handle)

    @Synchronized
    fun diagnostics(): LongArray = if (handle == 0L) longArrayOf(0, 0) else metrics(handle)

    private external fun metrics(handle: Long): LongArray

    @Synchronized
    fun render(buffer: FloatArray, frames: Int) {
        check(handle != 0L)
        render(handle, buffer, frames)
    }

    @Synchronized
    override fun close() {
        if (handle != 0L) {
            destroy(handle)
            handle = 0
        }
    }

    private external fun create(rate: Int): Long

    private external fun destroy(handle: Long)

    private external fun addSample(
        handle: Long,
        bank: Int,
        root: Int,
        tune: Double,
        rr: Int,
        rate: Int,
        channels: Int,
        pcm: FloatArray,
        loopStart: Double,
        loopEnd: Double,
        gain: Double,
        attack: Double,
        release: Double,
    )

    private external fun prepare(
        handle: Long,
        events: DoubleArray,
        duration: Double,
        loop: Boolean,
        period: Double,
    )

    private external fun start(handle: Long)

    private external fun pause(handle: Long)

    private external fun seek(handle: Long, seconds: Double)

    private external fun position(handle: Long): Double

    private external fun state(handle: Long): Int

    private external fun render(handle: Long, output: FloatArray, frames: Int)
}

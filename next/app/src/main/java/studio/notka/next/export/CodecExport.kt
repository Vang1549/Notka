package studio.notka.next.export

import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.*
import java.io.File
import java.nio.ByteBuffer
import kotlin.math.*
import studio.notka.core.Project
import studio.notka.core.number
import studio.notka.next.audio.NativeAudio
import studio.notka.next.data.BankStore
import studio.notka.next.ui.SceneRenderer

object CodecExport {
    private fun muxFormat(options: ExportOptions) =
        when (options.type) {
            "opus" ->
                if (android.os.Build.VERSION.SDK_INT >= 29) MediaMuxer.OutputFormat.MUXER_OUTPUT_OGG
                else error("Для Opus нужен Android 10 или новее")
            "webm",
            "webm-audio" -> MediaMuxer.OutputFormat.MUXER_OUTPUT_WEBM
            else -> MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4
        }

    fun audio(
        project: Project,
        banks: BankStore,
        options: ExportOptions,
        file: File,
        check: () -> Unit,
        leadIn: Double = 0.0,
        progress: (Double) -> Unit,
    ) {
        val opus = options.type in listOf("opus", "webm", "webm-audio")
        val mime = if (opus) MediaFormat.MIMETYPE_AUDIO_OPUS else MediaFormat.MIMETYPE_AUDIO_AAC
        val rate = if (opus) 48000 else options.rate
        val format =
            MediaFormat.createAudioFormat(mime, rate, options.channels).apply {
                setInteger(MediaFormat.KEY_BIT_RATE, options.audioBitrate)
                if (!opus)
                    setInteger(
                        MediaFormat.KEY_AAC_PROFILE,
                        MediaCodecInfo.CodecProfileLevel.AACObjectLC,
                    )
            }
        val name =
            MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format)
                ?: error("Этот кодировщик не поддерживает выбранные настройки")
        val codec = MediaCodec.createByCodecName(name)
        var mux: MediaMuxer? = null
        var started = false
        try {
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
            mux = MediaMuxer(file.path, muxFormat(options))
            var track = -1
            val info = MediaCodec.BufferInfo()
            NativeAudio.build(project, banks, rate, options.includeMuted).use { audio ->
                audio.seek(-leadIn)
                val total = ceil((audio.duration + .25 + leadIn) * rate).toLong()
                var sent = 0L
                var inputDone = false
                var done = false
                val samples = FloatArray(8192 * 2)
                while (!done) {
                    check()
                    if (!inputDone) {
                        val i = codec.dequeueInputBuffer(10000)
                        if (i >= 0) {
                            val input = codec.getInputBuffer(i)!!
                            input.clear()
                            val count =
                                minOf(
                                        8192L,
                                        total - sent,
                                        (input.remaining() / 2 / options.channels).toLong(),
                                    )
                                    .toInt()
                            if (count > 0) {
                                audio.render(samples, count)
                                val pcm = AudioExport.pcm(samples, count, options.channels, 16)
                                input.put(pcm)
                                codec.queueInputBuffer(i, 0, pcm.size, sent * 1_000_000 / rate, 0)
                                sent += count
                            } else {
                                codec.queueInputBuffer(
                                    i,
                                    0,
                                    0,
                                    sent * 1_000_000 / rate,
                                    MediaCodec.BUFFER_FLAG_END_OF_STREAM,
                                )
                                inputDone = true
                            }
                        }
                    }
                    val i = codec.dequeueOutputBuffer(info, 10000)
                    if (i == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        kotlin.check(!started)
                        track = mux.addTrack(codec.outputFormat)
                        mux.start()
                        started = true
                    } else if (i >= 0) {
                        if (
                            info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0 && info.size > 0
                        ) {
                            kotlin.check(started)
                            val output = codec.getOutputBuffer(i)!!
                            output.position(info.offset)
                            output.limit(info.offset + info.size)
                            info.presentationTimeUs = max(0L, info.presentationTimeUs)
                            mux.writeSampleData(track, output, info)
                        }
                        done = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                        codec.releaseOutputBuffer(i, false)
                    }
                    require(file.length() <= EXPORT_LIMIT) { "Экспорт превышает 256 МБ" }
                    progress(sent.toDouble() / total)
                }
            }
        } finally {
            runCatching { codec.stop() }
            codec.release()
            try {
                if (started) mux?.stop()
            } finally {
                mux?.release()
            }
        }
    }

    fun video(
        project: Project,
        banks: BankStore,
        options: ExportOptions,
        file: File,
        check: () -> Unit,
        progress: (Double) -> Unit,
    ) {
        val audioFile = File.createTempFile("audio-", ".media", file.parentFile)
        val videoFile = File.createTempFile("video-", ".media", file.parentFile)
        try {
            val leadIn = 3.6 / project.scene.number("speed", 1.0)
            audio(project, banks, options, audioFile, check, leadIn) { progress(it * .35) }
            val duration =
                NativeAudio.build(project, banks, options.rate, options.includeMuted).use {
                    it.duration + .25 + leadIn
                }
            val format =
                MediaFormat.createVideoFormat(
                        if (options.type == "webm") MediaFormat.MIMETYPE_VIDEO_VP8
                        else MediaFormat.MIMETYPE_VIDEO_AVC,
                        options.width,
                        options.videoHeight,
                    )
                    .apply {
                        setInteger(
                            MediaFormat.KEY_COLOR_FORMAT,
                            MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
                        )
                        setInteger(MediaFormat.KEY_BIT_RATE, options.videoBitrate)
                        setInteger(MediaFormat.KEY_FRAME_RATE, options.fps)
                        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
                    }
            val name =
                MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format)
                    ?: error("Телефон не поддерживает выбранное разрешение или частоту кадров")
            val codec = MediaCodec.createByCodecName(name)
            var mux: MediaMuxer? = null
            var egl: EncoderSurface? = null
            var started = false
            val bitmap =
                Bitmap.createBitmap(options.width, options.videoHeight, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            val sceneProject =
                if (options.includeMuted)
                    project.copy(lanes = project.lanes.map { it.copy(muted = false) })
                else project
            val renderer = SceneRenderer(sceneProject)
            try {
                codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
                val surface = codec.createInputSurface()
                egl = EncoderSurface(surface, options.width, options.videoHeight)
                codec.start()
                mux = MediaMuxer(videoFile.path, muxFormat(options))
                var track = -1
                val info = MediaCodec.BufferInfo()
                var eof = false
                fun drain(wait: Boolean) {
                    while (true) {
                        check()
                        val i = codec.dequeueOutputBuffer(info, if (wait) 10000 else 0)
                        if (i == MediaCodec.INFO_TRY_AGAIN_LATER) {
                            if (wait && !eof) continue
                            return
                        }
                        if (i == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                            kotlin.check(!started)
                            track = mux!!.addTrack(codec.outputFormat)
                            mux!!.start()
                            started = true
                        } else if (i >= 0) {
                            if (
                                info.size > 0 &&
                                    info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                            ) {
                                kotlin.check(started)
                                val bytes = codec.getOutputBuffer(i)!!
                                bytes.position(info.offset)
                                bytes.limit(info.offset + info.size)
                                mux!!.writeSampleData(track, bytes, info)
                            }
                            eof = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                            codec.releaseOutputBuffer(i, false)
                            if (eof) return
                        }
                        require(videoFile.length() + audioFile.length() <= EXPORT_LIMIT) {
                            "Видео превышает 256 МБ"
                        }
                    }
                }
                val frames = ceil(duration * options.fps).toLong()
                for (frame in 0 until frames) {
                    check()
                    drain(false)
                    renderer.draw(
                        canvas,
                        options.width,
                        options.videoHeight,
                        frame.toDouble() / options.fps - leadIn,
                    )
                    egl.draw(bitmap, frame * 1_000_000_000 / options.fps)
                    progress(.35 + frame.toDouble() / frames * .6)
                }
                codec.signalEndOfInputStream()
                drain(true)
            } finally {
                runCatching { codec.stop() }
                codec.release()
                egl?.close()
                bitmap.recycle()
                try {
                    if (started) mux?.stop()
                } finally {
                    mux?.release()
                }
            }
            merge(videoFile, audioFile, file, muxFormat(options), check)
            progress(1.0)
        } finally {
            audioFile.delete()
            videoFile.delete()
        }
    }

    private fun merge(video: File, audio: File, target: File, format: Int, check: () -> Unit) {
        val sources = listOf(MediaExtractor(), MediaExtractor())
        val mux = MediaMuxer(target.path, format)
        var started = false
        try {
            sources[0].setDataSource(video.path)
            sources[1].setDataSource(audio.path)
            val tracks =
                sources.map {
                    require(it.trackCount == 1)
                    it.selectTrack(0)
                    mux.addTrack(it.getTrackFormat(0))
                }
            mux.start()
            started = true
            val buffer = ByteBuffer.allocateDirect(8 * 1024 * 1024)
            val info = MediaCodec.BufferInfo()
            while (true) {
                check()
                val index =
                    sources.indices
                        .filter { sources[it].sampleTime >= 0 }
                        .minByOrNull { sources[it].sampleTime } ?: break
                val source = sources[index]
                buffer.clear()
                val size = source.readSampleData(buffer, 0)
                require(size in 0..buffer.capacity())
                val flags =
                    if (source.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0)
                        MediaCodec.BUFFER_FLAG_KEY_FRAME
                    else 0
                info.set(0, size, source.sampleTime, flags)
                mux.writeSampleData(tracks[index], buffer, info)
                source.advance()
                require(target.length() <= EXPORT_LIMIT) { "Видео превышает 256 МБ" }
            }
        } finally {
            sources.forEach { it.release() }
            try {
                if (started) mux.stop()
            } finally {
                mux.release()
            }
        }
    }
}

package studio.notka.next.audio

import android.media.*
import android.os.SystemClock
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import studio.notka.core.Pcm

object AudioDecoder {
    fun decode(data: ByteArray, cache: File): Pcm {
        require(data.size <= 4 * 1024 * 1024)
        val file = File.createTempFile("sample-", ".flac", cache)
        file.writeBytes(data)
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            extractor.setDataSource(file.path)
            require(extractor.trackCount == 1)
            val format = extractor.getTrackFormat(0)
            val mime = format.getString(MediaFormat.KEY_MIME) ?: error("Нет звуковой дорожки")
            require(mime.startsWith("audio/"))
            extractor.selectTrack(0)
            codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()
            var inputDone = false
            var outputDone = false
            var rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var encoding = AudioFormat.ENCODING_PCM_16BIT
            val info = MediaCodec.BufferInfo()
            val output = ByteArrayOutputStream()
            val deadline = SystemClock.elapsedRealtime() + 30000
            while (!outputDone) {
                require(SystemClock.elapsedRealtime() < deadline) {
                    "Декодирование звука заняло слишком много времени"
                }
                if (!inputDone) {
                    val i = codec.dequeueInputBuffer(10000)
                    if (i >= 0) {
                        val buffer = codec.getInputBuffer(i)!!
                        val n = extractor.readSampleData(buffer, 0)
                        if (n < 0) {
                            codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            codec.queueInputBuffer(i, 0, n, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }
                val i = codec.dequeueOutputBuffer(info, 10000)
                if (i == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    val f = codec.outputFormat
                    rate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    encoding =
                        if (f.containsKey("pcm-encoding")) f.getInteger("pcm-encoding")
                        else AudioFormat.ENCODING_PCM_16BIT
                } else if (i >= 0) {
                    val buffer = codec.getOutputBuffer(i)!!
                    require(output.size() + info.size <= 32 * 1024 * 1024)
                    buffer.position(info.offset)
                    buffer.limit(info.offset + info.size)
                    val bytes = ByteArray(info.size)
                    buffer.get(bytes)
                    output.write(bytes)
                    outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                    codec.releaseOutputBuffer(i, false)
                }
            }
            require(channels in 1..2 && rate in 8000..96000)
            val bytes = output.toByteArray()
            val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            val width =
                when (encoding) {
                    AudioFormat.ENCODING_PCM_16BIT -> 2
                    AudioFormat.ENCODING_PCM_FLOAT -> 4
                    21 -> 3
                    22 -> 4
                    else -> error("Неподдерживаемый формат PCM")
                }
            require(bytes.size % (channels * width) == 0)
            val pcm =
                FloatArray(bytes.size / width) {
                    when (encoding) {
                        AudioFormat.ENCODING_PCM_FLOAT -> b.float
                        AudioFormat.ENCODING_PCM_16BIT -> b.short / 32768f
                        21 -> {
                            val a = b.get().toInt() and 255
                            val c = b.get().toInt() and 255
                            val d = b.get().toInt()
                            (a or (c shl 8) or (d shl 16)) / 8388608f
                        }
                        else -> (b.int / 2147483648.0).toFloat()
                    }
                }
            require(pcm.isNotEmpty() && pcm.all { it.isFinite() && it in -1.01f..1.01f })
            return Pcm(rate, channels, pcm)
        } finally {
            runCatching { codec?.stop() }
            codec?.release()
            extractor.release()
            file.delete()
        }
    }
}

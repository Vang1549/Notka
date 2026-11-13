package studio.notka.core

import java.nio.ByteBuffer
import java.nio.ByteOrder

data class Pcm(val rate: Int, val channels: Int, val samples: FloatArray) {
    val frames
        get() = samples.size / channels
}

object Wave {
    fun decode(data: ByteArray): Pcm {
        require(data.size in 44..16 * 1024 * 1024) { "Неверный размер WAV" }
        val b = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN)
        fun tag(at: Int) = String(data, at, 4, Charsets.US_ASCII)
        require(
            tag(0) == "RIFF" && tag(8) == "WAVE" && b.getInt(4).toLong() + 8 == data.size.toLong()
        ) {
            "Повреждён WAV"
        }
        var format = 0
        var channels = 0
        var rate = 0
        var bits = 0
        var block = 0
        var start = -1
        var length = 0
        var at = 12
        while (at + 8 <= data.size) {
            val size = b.getInt(at + 4)
            require(size >= 0 && size.toLong() + at + 8 <= data.size)
            when (tag(at)) {
                "fmt " -> {
                    require(size >= 16 && format == 0)
                    format = b.getShort(at + 8).toInt()
                    channels = b.getShort(at + 10).toInt()
                    rate = b.getInt(at + 12)
                    block = b.getShort(at + 20).toInt()
                    bits = b.getShort(at + 22).toInt()
                }
                "data" -> {
                    require(start < 0)
                    start = at + 8
                    length = size
                }
            }
            at += 8 + size + (size and 1)
        }
        require(
            format in listOf(1, 3) &&
                channels in 1..2 &&
                rate in 8000..192000 &&
                bits in listOf(16, 24, 32) &&
                block == channels * (bits / 8) &&
                start >= 0 &&
                length > 0 &&
                length % block == 0
        )
        require(format != 3 || bits == 32)
        b.position(start)
        val samples =
            FloatArray(length / (bits / 8)) {
                val value =
                    when {
                        format == 3 -> b.float
                        bits == 16 -> b.short / 32768f
                        bits == 24 -> {
                            val a = b.get().toInt() and 255
                            val c = b.get().toInt() and 255
                            val d = b.get().toInt()
                            (a or (c shl 8) or (d shl 16)) / 8388608f
                        }
                        else -> (b.int / 2147483648.0).toFloat()
                    }
                require(value.isFinite() && value in -1.01f..1.01f)
                value
            }
        return Pcm(rate, channels, samples)
    }

    fun header(frames: Long, rate: Int, channels: Int, bits: Int): ByteArray {
        require(rate in 8000..192000 && channels in 1..2 && bits in listOf(16, 24) && frames >= 0)
        val bytes = frames * channels * (bits / 8)
        require(bytes <= 0xffffffffL - 36)
        return ByteBuffer.allocate(44)
            .order(ByteOrder.LITTLE_ENDIAN)
            .apply {
                put("RIFF".toByteArray())
                putInt((36 + bytes).toInt())
                put("WAVEfmt ".toByteArray())
                putInt(16)
                putShort(1)
                putShort(channels.toShort())
                putInt(rate)
                putInt(rate * channels * bits / 8)
                putShort((channels * bits / 8).toShort())
                putShort(bits.toShort())
                put("data".toByteArray())
                putInt(bytes.toInt())
            }
            .array()
    }
}

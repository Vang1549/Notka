package studio.notka.next.export

import android.media.*
import android.os.Build
import org.json.JSONObject

data class ExportOptions(
    val type: String = "wav",
    val rate: Int = 48000,
    val channels: Int = 2,
    val bits: Int = 16,
    val fps: Int = 30,
    val height: Int = 720,
    val portrait: Boolean = false,
    val includeMuted: Boolean = false,
    val audioBitrate: Int = 192000,
    val videoBitrate: Int = 8000000,
) {
    fun validate(): ExportOptions {
        require(type in formats().map { it.first })
        require(
            rate in listOf(32000, 44100, 48000) &&
                channels in 1..2 &&
                bits in listOf(16, 24) &&
                fps in listOf(24, 25, 30, 50, 60) &&
                height in listOf(480, 720, 1080) &&
                audioBitrate in 64000..320000 &&
                videoBitrate in 1000000..20000000
        )
        return this
    }

    fun json() =
        JSONObject()
            .put("type", type)
            .put("rate", rate)
            .put("channels", channels)
            .put("bits", bits)
            .put("fps", fps)
            .put("height", height)
            .put("portrait", portrait)
            .put("includeMuted", includeMuted)
            .put("audioBitrate", audioBitrate)
            .put("videoBitrate", videoBitrate)
            .toString()

    val width
        get() = if (portrait) height else height * 16 / 9 / 2 * 2

    val videoHeight
        get() = if (portrait) height * 16 / 9 / 2 * 2 else height

    val extension
        get() =
            when (type) {
                "aac" -> "m4a"
                "opus" -> "ogg"
                "webm-audio",
                "webm" -> "webm"
                else -> type
            }

    val mime
        get() =
            when (type) {
                "wav" -> "audio/wav"
                "zip" -> "application/zip"
                "aac" -> "audio/mp4"
                "opus" -> "audio/ogg"
                "webm-audio" -> "audio/webm"
                "mp4" -> "video/mp4"
                else -> "video/webm"
            }

    companion object {
        fun decode(raw: String): ExportOptions {
            val j = JSONObject(raw)
            return ExportOptions(
                    j.getString("type"),
                    j.getInt("rate"),
                    j.getInt("channels"),
                    j.getInt("bits"),
                    j.getInt("fps"),
                    j.getInt("height"),
                    j.getBoolean("portrait"),
                    j.getBoolean("includeMuted"),
                    j.getInt("audioBitrate"),
                    j.getInt("videoBitrate"),
                )
                .validate()
        }

        private fun encoder(mime: String) =
            MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any {
                it.isEncoder && it.supportedTypes.any { type -> type.equals(mime, true) }
            }

        fun formats(): List<Pair<String, String>> = buildList {
            add("wav" to "WAV")
            add("zip" to "Архив с дорожками")
            if (encoder(MediaFormat.MIMETYPE_AUDIO_AAC)) {
                add("aac" to "M4A · AAC")
                if (encoder(MediaFormat.MIMETYPE_VIDEO_AVC)) add("mp4" to "MP4 · видео")
            }
            if (Build.VERSION.SDK_INT >= 29 && encoder(MediaFormat.MIMETYPE_AUDIO_OPUS)) {
                add("opus" to "OGG · Opus")
                add("webm-audio" to "WebM · звук")
                if (encoder(MediaFormat.MIMETYPE_VIDEO_VP8)) add("webm" to "WebM · видео")
            }
        }
    }
}

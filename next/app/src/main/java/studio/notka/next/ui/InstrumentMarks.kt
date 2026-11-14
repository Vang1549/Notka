package studio.notka.next.ui

import android.graphics.Path

object InstrumentMarks {
    fun kind(gm: Int): String? =
        when (gm) {
            0,
            1,
            2,
            3,
            4,
            5 -> "piano"
            10 -> "musicbox"
            32,
            43 -> "bass"
            40 -> "violin"
            56 -> "trumpet"
            73 -> "flute"
            else -> null
        }

    val paths: Map<String, Path> =
        mapOf(
            "violin" to
                Path().apply {
                    moveTo(15.0f, 8.0f)
                    lineTo(20.0f, 3.0f)
                    moveTo(17.0f, 2.0f)
                    lineTo(22.0f, 7.0f)
                    moveTo(13.0f, 6.0f)
                    lineTo(18.0f, 11.0f)
                    lineTo(15.0f, 14.0f)
                    cubicTo(13.0f, 13.0f, 12.0f, 14.0f, 12.0f, 16.0f)
                    cubicTo(12.0f, 19.0f, 8.0f, 22.0f, 5.0f, 19.0f)
                    cubicTo(2.0f, 16.0f, 5.0f, 12.0f, 8.0f, 12.0f)
                    cubicTo(10.0f, 12.0f, 11.0f, 11.0f, 10.0f, 9.0f)
                    close()
                    moveTo(5.0f, 19.0f)
                    lineTo(14.0f, 10.0f)
                    moveTo(13.0f, 22.0f)
                    lineTo(21.0f, 9.0f)
                },
            "flute" to
                Path().apply {
                    moveTo(3.0f, 19.0f)
                    lineTo(18.0f, 4.0f)
                    lineTo(21.0f, 7.0f)
                    lineTo(6.0f, 22.0f)
                    close()
                    moveTo(16.0f, 6.0f)
                    lineTo(19.0f, 9.0f)
                    moveTo(6.0f, 17.0f)
                    lineTo(7.0f, 18.0f)
                    moveTo(9.0f, 14.0f)
                    lineTo(10.0f, 15.0f)
                    moveTo(12.0f, 11.0f)
                    lineTo(13.0f, 12.0f)
                    moveTo(18.0f, 3.0f)
                    lineTo(19.0f, 2.0f)
                    lineTo(22.0f, 5.0f)
                    lineTo(21.0f, 6.0f)
                },
            "bass" to
                Path().apply {
                    moveTo(12.0f, 6.0f)
                    lineTo(12.0f, 2.0f)
                    lineTo(15.0f, 2.0f)
                    moveTo(11.0f, 6.0f)
                    lineTo(14.0f, 6.0f)
                    lineTo(14.0f, 11.0f)
                    cubicTo(14.0f, 13.0f, 18.0f, 13.0f, 18.0f, 16.0f)
                    cubicTo(18.0f, 20.0f, 15.0f, 21.0f, 12.0f, 21.0f)
                    cubicTo(9.0f, 21.0f, 6.0f, 20.0f, 6.0f, 16.0f)
                    cubicTo(6.0f, 13.0f, 10.0f, 13.0f, 10.0f, 11.0f)
                    lineTo(10.0f, 8.0f)
                    close()
                    moveTo(12.0f, 7.0f)
                    lineTo(12.0f, 22.0f)
                    moveTo(9.0f, 16.0f)
                    lineTo(15.0f, 16.0f)
                },
            "musicbox" to
                Path().apply {
                    moveTo(3.0f, 12.0f)
                    lineTo(21.0f, 12.0f)
                    lineTo(21.0f, 20.0f)
                    lineTo(3.0f, 20.0f)
                    close()
                    moveTo(3.0f, 12.0f)
                    lineTo(7.0f, 4.0f)
                    lineTo(17.0f, 4.0f)
                    lineTo(21.0f, 12.0f)
                    moveTo(8.0f, 16.0f)
                    lineTo(16.0f, 16.0f)
                    moveTo(12.0f, 4.0f)
                    lineTo(12.0f, 9.0f)
                    moveTo(15.0f, 2.0f)
                    lineTo(15.0f, 7.0f)
                    lineTo(18.0f, 6.0f)
                    lineTo(18.0f, 1.0f)
                    close()
                },
            "trumpet" to
                Path().apply {
                    moveTo(2.0f, 10.0f)
                    lineTo(15.0f, 10.0f)
                    lineTo(21.0f, 5.0f)
                    lineTo(21.0f, 19.0f)
                    lineTo(15.0f, 14.0f)
                    lineTo(5.0f, 14.0f)
                    moveTo(3.0f, 8.0f)
                    lineTo(3.0f, 16.0f)
                    moveTo(7.0f, 14.0f)
                    lineTo(7.0f, 17.0f)
                    cubicTo(7.0f, 20.0f, 14.0f, 20.0f, 14.0f, 17.0f)
                    lineTo(14.0f, 10.0f)
                    moveTo(8.0f, 7.0f)
                    lineTo(8.0f, 12.0f)
                    moveTo(11.0f, 7.0f)
                    lineTo(11.0f, 12.0f)
                    moveTo(14.0f, 7.0f)
                    lineTo(14.0f, 12.0f)
                    moveTo(7.0f, 7.0f)
                    lineTo(9.0f, 7.0f)
                    moveTo(10.0f, 7.0f)
                    lineTo(12.0f, 7.0f)
                    moveTo(13.0f, 7.0f)
                    lineTo(15.0f, 7.0f)
                },
        )
}

package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.Choreographer
import android.view.View
import kotlin.math.roundToInt

/** Samples real display callbacks. It never includes notes, filenames or audio in diagnostics. */
class FrameStatsView(context: Context) : View(context), Choreographer.FrameCallback {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var since = 0L
    private var previous = 0L
    private var frames = 0
    private var worst = 0.0
    private var line = "FPS …"
    private var drawn = 0

    fun frameDrawn() {
        drawn++
    }

    override fun onMeasure(w: Int, h: Int) {
        setMeasuredDimension(context.dp(180), context.dp(26))
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (!isAttachedToWindow) return
        Choreographer.getInstance().removeFrameCallback(this)
        since = 0
        previous = 0
        frames = 0
        drawn = 0
        worst = 0.0
        if (isShown) Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onDetachedFromWindow() {
        Choreographer.getInstance().removeFrameCallback(this)
        super.onDetachedFromWindow()
    }

    override fun doFrame(time: Long) {
        if (isShown) {
            if (previous > 0) worst = maxOf(worst, (time - previous) / 1e6)
            if (since == 0L) since = time
            frames++
            if (time - since >= 1_000_000_000L) {
                val fps = drawn * 1e9 / (time - since)
                line =
                    "${fps.roundToInt()} FPS · ${worst.roundToInt()} мс · ${(Runtime.getRuntime().totalMemory()-Runtime.getRuntime().freeMemory())/1048576} МБ"
                frames = 0
                drawn = 0
                since = time
                worst = 0.0
                invalidate()
            }
            previous = time
        } else {
            since = 0
            previous = 0
            frames = 0
            drawn = 0
            worst = 0.0
        }
        if (isShown) Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onDraw(c: Canvas) {
        paint.color = 0xcc101614.toInt()
        c.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), 8f, 8f, paint)
        paint.color = Color.WHITE
        paint.textSize = context.dp(11).toFloat()
        c.drawText(line, context.dp(6).toFloat(), context.dp(17).toFloat(), paint)
    }
}

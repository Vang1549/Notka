package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View
import android.widget.SeekBar

/** Keep the HSV coordinates while dragging, including when RGB rounding gives a grey color. */
fun readHsv(color: Int, hsv: FloatArray) {
    val hue = hsv[0]
    Color.colorToHSV(color, hsv)
    if (hsv[1] == 0f) hsv[0] = hue
}

class ColorPlane(context: Context, val hsv: FloatArray, private val changed: () -> Unit) :
    View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clip = Path()
    private val d = resources.displayMetrics.density
    private var pointer = MotionEvent.INVALID_POINTER_ID

    init {
        contentDescription = "Насыщенность и яркость цвета"
        isClickable = true
    }

    override fun onDraw(c: Canvas) {
        val r = RectF(0f, 0f, width.toFloat(), height.toFloat())
        clip.reset()
        clip.addRoundRect(r, 9 * d, 9 * d, Path.Direction.CW)
        c.save()
        c.clipPath(clip)
        paint.style = Paint.Style.FILL
        paint.shader =
            LinearGradient(
                0f,
                0f,
                r.right,
                0f,
                Color.WHITE,
                Color.HSVToColor(floatArrayOf(hsv[0], 1f, 1f)),
                Shader.TileMode.CLAMP,
            )
        c.drawRect(r, paint)
        paint.shader =
            LinearGradient(
                0f,
                0f,
                0f,
                r.bottom,
                Color.TRANSPARENT,
                Color.BLACK,
                Shader.TileMode.CLAMP,
            )
        c.drawRect(r, paint)
        paint.shader = null
        c.restore()
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = d
        paint.color = ReferencePalette(context).border
        r.inset(d / 2, d / 2)
        c.drawRoundRect(r, 9 * d, 9 * d, paint)
        val x = hsv[1] * width
        val y = (1 - hsv[2]) * height
        paint.color = 0xff333333.toInt()
        paint.strokeWidth = 4 * d
        c.drawCircle(x, y, 6 * d, paint)
        paint.color = Color.WHITE
        paint.strokeWidth = 2 * d
        c.drawCircle(x, y, 6 * d, paint)
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        fun update() {
            val index = e.findPointerIndex(pointer)
            if (index < 0 || width == 0 || height == 0) return
            hsv[1] = (e.getX(index) / width).coerceIn(0f, 1f)
            hsv[2] = (1 - e.getY(index) / height).coerceIn(0f, 1f)
            changed()
            invalidate()
        }
        fun release() {
            pointer = MotionEvent.INVALID_POINTER_ID
            parent?.requestDisallowInterceptTouchEvent(false)
        }
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                pointer = e.getPointerId(0)
                parent?.requestDisallowInterceptTouchEvent(true)
                update()
            }
            MotionEvent.ACTION_MOVE -> update()
            MotionEvent.ACTION_UP -> {
                update()
                release()
                performClick()
            }
            MotionEvent.ACTION_CANCEL -> release()
            MotionEvent.ACTION_POINTER_UP -> if (e.getPointerId(e.actionIndex) == pointer) release()
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }
}

class HueSlider(context: Context) : SeekBar(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val d = resources.displayMetrics.density

    init {
        max = 360
        contentDescription = "Оттенок"
        progressDrawable = null
        thumb = null
        setPadding(context.dp(9), 0, context.dp(9), 0)
    }

    override fun onDraw(c: Canvas) {
        val y = height / 2f
        paint.style = Paint.Style.FILL
        paint.shader =
            LinearGradient(
                0f,
                0f,
                width.toFloat(),
                0f,
                intArrayOf(
                    Color.RED,
                    Color.YELLOW,
                    Color.GREEN,
                    Color.CYAN,
                    Color.BLUE,
                    Color.MAGENTA,
                    Color.RED,
                ),
                null,
                Shader.TileMode.CLAMP,
            )
        c.drawRoundRect(RectF(0f, y - 8 * d, width.toFloat(), y + 8 * d), 6 * d, 6 * d, paint)
        paint.shader = null
        val x = 9 * d + (width - 18 * d) * progress / 360f
        val r = RectF(x - 8 * d, y - 11 * d, x + 8 * d, y + 11 * d)
        paint.color = 0x66000000
        c.drawRoundRect(r, 5 * d, 5 * d, paint)
        paint.style = Paint.Style.STROKE
        paint.color = Color.WHITE
        paint.strokeWidth = 2 * d
        c.drawRoundRect(r, 5 * d, 5 * d, paint)
    }
}

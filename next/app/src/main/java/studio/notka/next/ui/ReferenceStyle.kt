package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import kotlin.math.*

/** The palette algorithm of APK 0.68, not an approximation of its CSS defaults. */
class ReferencePalette(context: Context) {
    private val prefs = context.getSharedPreferences("settings", 0)
    val light = prefs.getString("theme", "dark") == "light"

    private fun parse(value: String?, fallback: String) =
        runCatching { Color.parseColor(value) }.getOrElse { Color.parseColor(fallback) }

    private val brightness = prefs.getInt("brightness", 100).coerceIn(50, 150)
    private val contrast = prefs.getInt("contrast", 100).coerceIn(50, 180) / 100.0

    private fun lighting(c: Int) =
        mix(
            c,
            if (brightness >= 100) Color.WHITE else Color.BLACK,
            (if (brightness >= 100) .009 else .016) * abs(brightness - 100),
        )

    val bg =
        lighting(parse(prefs.getString("background", null), if (light) "#f4f3eb" else "#101614"))
    val accent =
        lighting(parse(prefs.getString("accent", null), if (light) "#3c7243" else "#baef8a"))
    val text = ink(bg)
    val on = ink(accent)
    val muted = mix(bg, text, .72)
    val cursor = mix(accent, text, .35)
    val panel = mix(bg, text, .07)
    val border = mix(bg, text, .24 * contrast)
    val cell = mix(bg, text, .13 * contrast)
    val black = mix(bg, text, .07 * contrast)
    val key = mix(bg, text, .20 * contrast)
    val raised = mix(bg, text, .035 * contrast)
    val line = mix(bg, text, .36 * contrast)
    val depth = prefs.getBoolean("depth", false)

    companion object {
        fun mix(a: Int, b: Int, w: Double): Int =
            Color.rgb(
                (Color.red(a) + (Color.red(b) - Color.red(a)) * w).roundToInt().coerceIn(0, 255),
                (Color.green(a) + (Color.green(b) - Color.green(a)) * w)
                    .roundToInt()
                    .coerceIn(0, 255),
                (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * w).roundToInt().coerceIn(0, 255),
            )

        fun ink(c: Int): Int {
            fun channel(v: Int): Double {
                val s = v / 255.0
                return if (s <= .04045) s / 12.92 else ((s + .055) / 1.055).pow(2.4)
            }
            return if (
                .2126 * channel(Color.red(c)) +
                    .7152 * channel(Color.green(c)) +
                    .0722 * channel(Color.blue(c)) > .179
            )
                Color.rgb(18, 18, 18)
            else Color.WHITE
        }
    }
}

class ReferenceShape(
    private var fill: Int,
    private var outline: Int,
    private val d: Float,
    private val radius: Float,
) : GradientDrawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        setColor(fill)
        cornerRadius = radius * d
    }

    override fun draw(c: Canvas) {
        super.draw(c)
        if (outline != Color.TRANSPARENT) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = d
            paint.color = outline
            paint.alpha = Color.alpha(outline) * alpha / 255
            val half = d / 2
            c.drawRoundRect(
                RectF(
                    bounds.left + half,
                    bounds.top + half,
                    bounds.right - half,
                    bounds.bottom - half,
                ),
                maxOf(0f, radius * d - half),
                maxOf(0f, radius * d - half),
                paint,
            )
        }
    }

    fun recolor(mapping: Map<Int, Int>) {
        fill = mapping[fill] ?: fill
        outline = mapping[outline] ?: outline
        setColor(fill)
        invalidateSelf()
    }
}

fun Context.shape(fill: Int, stroke: Int, radius: Float = 10f) =
    ReferenceShape(fill, stroke, resources.displayMetrics.density, radius)

class ReferenceButton(context: Context) : Button(context) {
    init {
        val p = ReferencePalette(context)
        isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f)
        typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        includeFontPadding = false
        gravity = Gravity.CENTER
        minWidth = 0
        minimumWidth = 0
        minHeight = context.dp(43)
        minimumHeight = context.dp(43)
        setPadding(context.dp(12), 0, context.dp(12), 0)
        background = context.shape(p.panel, p.border)
        backgroundTintList = null
        setTextColor(p.text)
        stateListAnimator = null
    }

    override fun setEnabled(enabled: Boolean) {
        super.setEnabled(enabled)
        alpha = if (enabled) 1f else .45f
    }
}

/** Vector marks copied geometrically from the 0.80 shell. No font-dependent emoji. */
class ReferenceIcon(private val kind: String, private val color: Int) : Drawable() {
    private val p =
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1.8f
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }

    override fun draw(c: Canvas) {
        c.save()
        c.translate(bounds.left.toFloat(), bounds.top.toFloat())
        c.scale(bounds.width() / 24f, bounds.height() / 24f)
        p.color = color
        fun line(vararg xy: Float) {
            val path = Path()
            path.moveTo(xy[0], xy[1])
            for (i in 2 until xy.size step 2) path.lineTo(xy[i], xy[i + 1])
            c.drawPath(path, p)
        }
        fun rect(l: Float, t: Float, r: Float, b: Float, rad: Float = 0f) {
            c.drawRoundRect(RectF(l, t, r, b), rad, rad, p)
        }
        when (kind) {
            "lanes" -> {
                for (y in listOf(4f, 10f, 16f)) {
                    rect(3f, y, 7f, y + 4, 1f)
                    line(11f, y + 2, 21f, y + 2)
                }
            }
            "grid" -> {
                rect(3f, 3f, 21f, 21f, 2f)
                line(9f, 3f, 9f, 21f)
                line(15f, 3f, 15f, 21f)
                line(3f, 9f, 21f, 9f)
                line(3f, 15f, 21f, 15f)
            }
            "track" -> {
                line(9f, 18f, 9f, 5f, 20f, 3f, 20f, 16f)
                line(9f, 9f, 20f, 7f)
                c.drawOval(RectF(3f, 16f, 9f, 20f), p)
                c.drawOval(RectF(14f, 14f, 20f, 18f), p)
            }
            "back" -> line(14f, 5f, 7f, 12f, 14f, 19f)
            "scene" -> {
                line(6f, 5f, 6f, 9f)
                line(11f, 2f, 11f, 7f)
                line(17f, 5f, 17f, 10f)
                rect(2f, 13f, 22f, 22f, 2f)
                for (x in listOf(7f, 12f, 17f)) line(x, 13f, x, 18f)
            }
            "piano" -> {
                rect(2f, 4f, 22f, 20f, 2f)
                line(7f, 4f, 7f, 13f, 9f, 13f, 9f, 4f)
                line(14f, 4f, 14f, 13f, 16f, 13f, 16f, 4f)
                line(8f, 13f, 8f, 20f)
                line(15f, 13f, 15f, 20f)
            }
            "trash" -> {
                line(3f, 6f, 21f, 6f)
                line(9f, 6f, 9f, 3f, 15f, 3f, 15f, 6f)
                line(5f, 6f, 6f, 21f, 18f, 21f, 19f, 6f)
                line(10f, 10f, 10f, 17f)
                line(14f, 10f, 14f, 17f)
            }
            "copy" -> {
                rect(8f, 8f, 20f, 21f, 2f)
                line(16f, 8f, 16f, 3f, 3f, 3f, 3f, 17f, 8f, 17f)
            }
            "volume" -> {
                line(3f, 9f, 7f, 9f, 12f, 5f, 12f, 19f, 7f, 15f, 3f, 15f, 3f, 9f)
                c.drawArc(RectF(12f, 7f, 20f, 17f), -60f, 120f, false, p)
                c.drawArc(RectF(10f, 3f, 24f, 21f), -55f, 110f, false, p)
            }
            "download" -> {
                line(12f, 3f, 12f, 15f)
                line(7f, 10f, 12f, 15f, 17f, 10f)
                line(4f, 16f, 4f, 21f, 20f, 21f, 20f, 16f)
            }
            "settings" -> {
                c.drawCircle(12f, 12f, 4f, p)
                for (i in 0..7) {
                    val a = i * Math.PI / 4
                    line(
                        (12 + 8 * cos(a)).toFloat(),
                        (12 + 8 * sin(a)).toFloat(),
                        (12 + 10 * cos(a)).toFloat(),
                        (12 + 10 * sin(a)).toFloat(),
                    )
                }
            }
            else -> InstrumentMarks.paths[kind]?.let { c.drawPath(it, p) }
        }
        c.restore()
    }

    override fun setAlpha(alpha: Int) {
        p.alpha = alpha
    }

    override fun setColorFilter(filter: ColorFilter?) {
        p.colorFilter = filter
    }

    override fun getOpacity() = PixelFormat.TRANSLUCENT
}

fun Context.iconButton(kind: String, description: String, action: () -> Unit): Button =
    ReferenceButton(this).apply {
        contentDescription = description
        setPadding(0, 0, 0, 0)
        val icon = ReferenceIcon(kind, ReferencePalette(this@iconButton).text)
        icon.setBounds(
            0,
            0,
            dp(if (kind == "lanes" || kind == "back") 20 else 22),
            dp(if (kind == "lanes" || kind == "back") 20 else 22),
        )
        tag = kind
        background =
            iconSurface(
                kind,
                ReferencePalette(this@iconButton).text,
                ReferencePalette(this@iconButton).panel,
                ReferencePalette(this@iconButton).border,
            )
        setOnClickListener { action() }
    }

fun Context.iconSurface(
    kind: String,
    ink: Int,
    fill: Int,
    border: Int,
    radius: Float = 10f,
): Drawable =
    object : Drawable() {
        private val bg = shape(fill, border, radius)
        private val icon =
            ReferenceIcon(kind, ink).apply {
                val size = dp(if (kind in listOf("lanes", "back")) 20 else 22)
                setBounds(0, 0, size, size)
            }

        override fun draw(c: Canvas) {
            bg.bounds = bounds
            bg.draw(c)
            c.save()
            c.translate(
                bounds.left + (bounds.width() - icon.bounds.width()) / 2f,
                bounds.top + (bounds.height() - icon.bounds.height()) / 2f,
            )
            icon.draw(c)
            c.restore()
        }

        override fun setAlpha(a: Int) {
            bg.alpha = a
            icon.alpha = a
        }

        override fun setColorFilter(f: ColorFilter?) {}

        override fun getOpacity() = PixelFormat.TRANSLUCENT
    }

class ReferenceCheck(
    context: Context,
    checked: Boolean,
    description: String,
    private val changed: (Boolean) -> Unit,
) : View(context) {
    var checked = checked
        set(value) {
            field = value
            invalidate()
        }

    private val p = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        contentDescription = description
        isClickable = true
        isFocusable = true
        setOnClickListener {
            this.checked = !this.checked
            changed(this.checked)
        }
    }

    override fun onDraw(c: Canvas) {
        val t = ReferencePalette(context)
        val d = resources.displayMetrics.density
        val rect =
            RectF(width / 2 - 10 * d, height / 2 - 10 * d, width / 2 + 10 * d, height / 2 + 10 * d)
        p.style = Paint.Style.FILL
        p.color = if (checked) t.accent else 0xff3b3b3b.toInt()
        c.drawRoundRect(rect, 2 * d, 2 * d, p)
        p.style = Paint.Style.STROKE
        p.strokeWidth = d
        p.color = if (checked) t.accent else 0xff858585.toInt()
        c.drawRoundRect(rect, 2 * d, 2 * d, p)
        if (checked) {
            p.color = ReferencePalette.ink(t.accent)
            p.strokeWidth = 2.8f * d
            val path = Path()
            path.moveTo(width / 2 - 6 * d, height / 2f)
            path.lineTo(width / 2 - 1 * d, height / 2 + 5 * d)
            path.lineTo(width / 2 + 7 * d, height / 2 - 6 * d)
            c.drawPath(path, p)
        }
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.CheckBox"
        info.isCheckable = true
        info.isChecked = checked
    }
}

/** Update an open theme editor without replacing focused fields or interrupting a slider drag. */
fun recolorTree(view: View, old: ReferencePalette, next: ReferencePalette) {
    if (view is ReferenceSlider) view.recolor(old, next)
    val mapping =
        mapOf(
            old.bg to next.bg,
            old.accent to next.accent,
            old.text to next.text,
            old.on to next.on,
            old.muted to next.muted,
            old.panel to next.panel,
            old.border to next.border,
            old.cell to next.cell,
            old.raised to next.raised,
            old.line to next.line,
            old.cursor to next.cursor,
        )
    if (view is android.widget.TextView) {
        mapping[view.currentTextColor]?.let { view.setTextColor(it) }
        mapping[view.currentHintTextColor]?.let { view.setHintTextColor(it) }
    }
    val bg = view.background
    if (bg is android.graphics.drawable.ColorDrawable) mapping[bg.color]?.let { bg.color = it }
    if (bg is ReferenceShape) bg.recolor(mapping)
    else if (bg is GradientDrawable && android.os.Build.VERSION.SDK_INT >= 24) {
        bg.color?.defaultColor?.let { mapping[it] }?.let { bg.setColor(it) }
    }
    if (
        view.tag is String &&
            view is android.widget.Button &&
            view.tag in
                listOf(
                    "lanes",
                    "grid",
                    "track",
                    "back",
                    "trash",
                    "copy",
                    "volume",
                    "scene",
                    "download",
                )
    )
        view.background =
            view.context.iconSurface(view.tag as String, next.text, next.panel, next.border)
    if (view is android.view.ViewGroup)
        for (i in 0 until view.childCount) recolorTree(view.getChildAt(i), old, next)
    view.invalidate()
}

package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.*
import android.widget.*

class ColorPicker(private val context: Context) {
    fun show(title: String, current: Int, special: Boolean = true, changed: (String?) -> Unit) =
        with(context) {
            val box = column()
            val palette = ReferencePalette(this)
            val colors =
                listOf(
                    "#ff4040",
                    "#ff9f32",
                    "#ffff00",
                    "#00ff00",
                    "#00d9bd",
                    "#00cfff",
                    "#0000ff",
                    "#883bff",
                    "#ff42d0",
                    "#ffffff",
                    "#888888",
                    "#000000",
                )
            for (line in colors.chunked(6)) {
                val row = row()
                for (value in line) row.addView(
                    button("") { changed(value) }
                        .apply {
                            background = shape(Color.parseColor(value), 0xff888888.toInt(), 6f)
                            contentDescription = value
                        },
                    LinearLayout.LayoutParams(0, dp(34), 1f).apply { rightMargin = dp(7) },
                )
                box.addView(row, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(7) })
            }
            val actions = row()
            if (special) {
                actions.addView(
                    button("▧") { changed("transparent") }
                        .apply { contentDescription = "Прозрачный" },
                    LinearLayout.LayoutParams(0, dp(34), 1f),
                )
                actions.addView(
                    button("●") { changed(null) }.apply { contentDescription = "Цвет палитры" },
                    LinearLayout.LayoutParams(0, dp(34), 1f).apply { leftMargin = dp(7) },
                )
            }
            actions.addView(
                button("＋") { custom(title, current) { changed(it) } }
                    .apply {
                        contentDescription = "Свой цвет"
                        background =
                            android.graphics.drawable
                                .GradientDrawable(
                                    android.graphics.drawable.GradientDrawable.Orientation
                                        .LEFT_RIGHT,
                                    intArrayOf(
                                        Color.RED,
                                        Color.YELLOW,
                                        Color.GREEN,
                                        Color.CYAN,
                                        Color.BLUE,
                                        Color.MAGENTA,
                                    ),
                                )
                                .apply { cornerRadius = dp(6).toFloat() }
                    },
                LinearLayout.LayoutParams(0, dp(34), 1f).apply { leftMargin = dp(7) },
            )
            box.addView(actions)
            sheet(title, box, width = 300, close = "✕")
        }

    private fun custom(title: String, current: Int, changed: (String) -> Unit) =
        with(context) {
            val hsv = FloatArray(3)
            Color.colorToHSV(if (current == Color.TRANSPARENT) Color.GREEN else current, hsv)
            val box = column()
            val preview = View(this)
            val hex = field(String.format("#%06x", current and 0xffffff))
            var updating = false
            fun update() {
                val color = Color.HSVToColor(hsv)
                preview.setBackgroundColor(color)
                val value = String.format("#%06x", color and 0xffffff)
                updating = true
                hex.setText(value)
                updating = false
                changed(value)
            }
            val square =
                object : View(this) {
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

                    override fun onDraw(c: Canvas) {
                        paint.shader =
                            LinearGradient(
                                0f,
                                0f,
                                width.toFloat(),
                                0f,
                                Color.WHITE,
                                Color.HSVToColor(floatArrayOf(hsv[0], 1f, 1f)),
                                Shader.TileMode.CLAMP,
                            )
                        c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
                        paint.shader =
                            LinearGradient(
                                0f,
                                0f,
                                0f,
                                height.toFloat(),
                                Color.TRANSPARENT,
                                Color.BLACK,
                                Shader.TileMode.CLAMP,
                            )
                        c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), paint)
                        paint.shader = null
                        paint.style = Paint.Style.STROKE
                        paint.strokeWidth = dp(2).toFloat()
                        paint.color = Color.WHITE
                        c.drawCircle(hsv[1] * width, (1 - hsv[2]) * height, dp(6).toFloat(), paint)
                        paint.style = Paint.Style.FILL
                    }

                    override fun onTouchEvent(e: MotionEvent): Boolean {
                        hsv[1] = (e.x / width).coerceIn(0f, 1f)
                        hsv[2] = (1 - e.y / height).coerceIn(0f, 1f)
                        invalidate()
                        update()
                        return true
                    }
                }
            box.addView(square, LinearLayout.LayoutParams(-1, dp(180)))
            val hue =
                SeekBar(this).apply {
                    max = 360
                    progress = hsv[0].toInt()
                    contentDescription = "Оттенок"
                    setOnSeekBarChangeListener(
                        object : SeekBar.OnSeekBarChangeListener {
                            override fun onStartTrackingTouch(s: SeekBar) {}

                            override fun onStopTrackingTouch(s: SeekBar) {}

                            override fun onProgressChanged(s: SeekBar, p: Int, user: Boolean) {
                                if (user) {
                                    hsv[0] = p.toFloat()
                                    square.invalidate()
                                    update()
                                }
                            }
                        }
                    )
                }
            box.addView(hue)
            preview.setBackgroundColor(current)
            box.addView(preview, LinearLayout.LayoutParams(-1, dp(30)))
            box.addView(hex)
            hex.onTextChanged {
                if (!updating && it.matches(Regex("#[0-9a-fA-F]{6}"))) {
                    Color.colorToHSV(Color.parseColor(it), hsv)
                    square.invalidate()
                    preview.setBackgroundColor(Color.parseColor(it))
                    changed(it)
                }
            }
            sheet(title, box, width = 300)
        }
}

package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.*
import android.widget.*

class ColorPicker(private val context: Context) {
    fun show(
        title: String,
        current: Int,
        special: Boolean = true,
        paletteColor: Int = current,
        changed: (String?) -> Unit,
    ) =
        with(context) {
            var selected = current
            fun choose(value: String?) {
                selected =
                    when (value) {
                        null -> paletteColor
                        "transparent" -> Color.TRANSPARENT
                        else -> Color.parseColor(value)
                    }
                changed(value)
            }
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
                    button("") { choose(value) }
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
                    button("▧") { choose("transparent") }
                        .apply { contentDescription = "Прозрачный" },
                    LinearLayout.LayoutParams(0, dp(34), 1f),
                )
                actions.addView(
                    button("") { choose(null) }
                        .apply {
                            contentDescription = "Цвет палитры"
                            background = shape(paletteColor, palette.border, 6f)
                        },
                    LinearLayout.LayoutParams(0, dp(34), 1f).apply { leftMargin = dp(7) },
                )
            }
            actions.addView(
                button("＋") {
                        custom(
                            title,
                            if (selected == Color.TRANSPARENT) paletteColor else selected,
                        ) {
                            choose(it)
                        }
                    }
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
            val square = ColorPlane(this, hsv) { update() }
            box.addView(square, LinearLayout.LayoutParams(-1, dp(180)))
            val hue =
                HueSlider(this).apply {
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
            preview.setBackgroundColor(Color.HSVToColor(hsv))
            box.addView(preview, LinearLayout.LayoutParams(-1, dp(30)))
            box.addView(hex)
            hex.onTextChanged {
                if (!updating && it.matches(Regex("#[0-9a-fA-F]{6}"))) {
                    readHsv(Color.parseColor(it), hsv)
                    hue.progress = hsv[0].toInt()
                    square.invalidate()
                    preview.setBackgroundColor(Color.parseColor(it))
                    changed(it)
                }
            }
            sheet(title, box, width = 300)
        }
}

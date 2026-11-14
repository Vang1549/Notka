package studio.notka.next.ui

import android.app.AlertDialog
import android.graphics.*
import android.util.TypedValue
import android.view.*
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import studio.notka.next.MainActivity

/** APK 0.68 theme collection. Built-in colors are locked; custom themes are editable. */
class ThemeSheet(private val activity: MainActivity) {
    private val prefs = activity.getSharedPreferences("settings", 0)
    private var items =
        runCatching { JSONArray(prefs.getString("themes", "[]")) }.getOrElse { JSONArray() }
    private var active = prefs.getString("activeTheme", prefs.getString("theme", "dark")) ?: "dark"
    private var editing = "background"
    private lateinit var box: LinearLayout
    private lateinit var dialog: AlertDialog
    private val hsv = FloatArray(3)

    init {
        if (items.length() == 0) {
            items.put(builtin("dark"))
            items.put(builtin("light"))
        }
        if ((0 until items.length()).none { items.getJSONObject(it).getString("id") == active })
            active = "dark"
    }

    private fun builtin(mode: String) =
        JSONObject()
            .put("id", mode)
            .put("name", if (mode == "light") "Светлая" else "Тёмная")
            .put("theme", mode)
            .put("background", if (mode == "light") "#f4f3eb" else "#101614")
            .put("accent", if (mode == "light") "#3c7243" else "#baef8a")
            .put("brightness", 100)
            .put("contrast", 100)
            .put("depth", false)

    private fun current() =
        (0 until items.length())
            .map { items.getJSONObject(it) }
            .first { it.getString("id") == active }

    private fun save() {
        val old = ReferencePalette(activity)
        val item = current()
        prefs
            .edit()
            .putString("themes", items.toString())
            .putString("activeTheme", active)
            .putString("theme", item.getString("theme"))
            .putString("background", item.getString("background"))
            .putString("accent", item.getString("accent"))
            .putInt("brightness", item.getInt("brightness"))
            .putInt("contrast", item.getInt("contrast"))
            .putBoolean("depth", item.optBoolean("depth"))
            .apply()
        val next = ReferencePalette(activity)
        recolorTree(activity.window.decorView, old, next)
        if (::dialog.isInitialized) dialog.window?.decorView?.let { recolorTree(it, old, next) }
        activity.grid.palette = next
    }

    fun show() =
        with(activity) {
            box = column()
            render()
            dialog = sheet("Темы", box, width = 385, close = "✕")
            dialog.setOnDismissListener {
                save()
                recreate()
            }
        }

    private fun render(): Unit =
        with(activity) {
            box.removeAllViews()
            val item = current()
            val custom = active.startsWith("custom-")
            val names = (0 until items.length()).map { items.getJSONObject(it).getString("name") }
            val index =
                (0 until items.length()).first { items.getJSONObject(it).getString("id") == active }
            val choose = row()
            choose.addView(
                select(names, index) {
                    active = items.getJSONObject(it).getString("id")
                    save()
                    render()
                },
                LinearLayout.LayoutParams(0, dp(40), 1f),
            )
            choose.addView(
                button("＋") {
                    var n = 1
                    while (
                        (0 until items.length()).any {
                            items.getJSONObject(it).getString("id") == "custom-$n"
                        }
                    ) n++
                    val next =
                        JSONObject(item.toString())
                            .put("id", "custom-$n")
                            .put("name", "Моя тема $n")
                    items.put(next)
                    active = "custom-$n"
                    save()
                    render()
                },
                LinearLayout.LayoutParams(dp(42), dp(40)).apply { leftMargin = dp(8) },
            )
            box.addView(choose)
            if (custom) {
                val name =
                    field(item.getString("name")).apply {
                        filters = arrayOf(android.text.InputFilter.LengthFilter(40))
                    }
                val nameRow = row()
                nameRow.addView(label("Название"), LinearLayout.LayoutParams(0, -2, 1f))
                nameRow.addView(name, LinearLayout.LayoutParams(dp(190), dp(36)))
                box.addView(nameRow)
                name.setOnFocusChangeListener { _, focus ->
                    if (!focus && name.text.isNotBlank()) {
                        item.put("name", name.text.toString().trim())
                        save()
                    }
                }
            }
            val preview =
                object : View(this) {
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

                    override fun onDraw(c: Canvas) {
                        val p = ReferencePalette(this@with)
                        val d = resources.displayMetrics.density
                        for (i in 0..5) {
                            paint.color = if (i % 2 == 0) p.cell else p.black
                            c.drawRect(
                                0f,
                                height - i * 13 * d - 13 * d,
                                width.toFloat(),
                                height - i * 13 * d,
                                paint,
                            )
                        }
                        paint.color = p.line
                        paint.strokeWidth = d
                        for (i in 0..8) c.drawLine(
                            i * width / 8f,
                            0f,
                            i * width / 8f,
                            height.toFloat(),
                            paint,
                        )
                        for ((left, bottom, w) in
                            listOf(
                                Triple(.125f, 3f, .24f),
                                Triple(.375f, 16f, .12f),
                                Triple(.5f, 29f, .36f),
                            )) {
                            val r =
                                RectF(
                                    left * width,
                                    height - (bottom + 10) * d,
                                    (left + w) * width,
                                    height - bottom * d,
                                )
                            paint.color = p.accent
                            c.drawRoundRect(r, 3 * d, 3 * d, paint)
                            if (p.depth) {
                                paint.shader =
                                    LinearGradient(
                                        0f,
                                        r.top,
                                        0f,
                                        r.bottom,
                                        intArrayOf(0x66ffffff, 0x00ffffff, 0x33000000),
                                        floatArrayOf(0f, .45f, 1f),
                                        Shader.TileMode.CLAMP,
                                    )
                                c.drawRoundRect(r, 3 * d, 3 * d, paint)
                                paint.shader = null
                            }
                        }
                        paint.color = p.cursor
                        c.drawRect(width * .58f, 0f, width * .58f + 2 * d, height.toFloat(), paint)
                    }
                }
            box.addView(
                preview,
                LinearLayout.LayoutParams(-1, dp(56)).apply {
                    topMargin = dp(10)
                    bottomMargin = dp(10)
                },
            )
            if (custom) {
                val pair = row()
                for ((key, title) in
                    listOf("background" to "Основной", "accent" to "Второстепенный")) pair.addView(
                    button("● $title") {
                            editing = key
                            render()
                        }
                        .apply {
                            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
                            setPadding(dp(6), 0, dp(6), 0)
                            if (editing == key)
                                background =
                                    shape(
                                        ReferencePalette(this@with).panel,
                                        ReferencePalette(this@with).text,
                                    )
                        },
                    LinearLayout.LayoutParams(0, dp(40), 1f).apply { rightMargin = dp(4) },
                )
                box.addView(pair)
                Color.colorToHSV(Color.parseColor(item.getString(editing)), hsv)
                val hex =
                    field(item.getString(editing)).apply {
                        filters = arrayOf(android.text.InputFilter.LengthFilter(7))
                        contentDescription = "Код выбранного цвета"
                    }
                fun colorChanged() {
                    val value = String.format("#%06x", Color.HSVToColor(hsv) and 0xffffff)
                    item.put(editing, value)
                    save()
                    hex.setText(value)
                    preview.invalidate()
                }
                val pad =
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
                            c.drawCircle(
                                hsv[1] * width,
                                (1 - hsv[2]) * height,
                                dp(6).toFloat(),
                                paint,
                            )
                            paint.style = Paint.Style.FILL
                        }

                        override fun onTouchEvent(e: MotionEvent): Boolean {
                            hsv[1] = (e.x / width).coerceIn(0f, 1f)
                            hsv[2] = (1 - e.y / height).coerceIn(0f, 1f)
                            colorChanged()
                            invalidate()
                            return true
                        }
                    }
                box.addView(
                    pad,
                    LinearLayout.LayoutParams(-1, dp(112)).apply { topMargin = dp(10) },
                )
                box.addView(
                    ReferenceRange(this, "Оттенок", "°", 0.0, 360.0, 1.0, hsv[0].toDouble()) { value
                        ->
                        if (value != null) {
                            hsv[0] = value.toFloat()
                            pad.invalidate()
                            colorChanged()
                        }
                    }
                )
                val hexRow = row()
                hexRow.addView(label("HEX"), LinearLayout.LayoutParams(0, -2, 1f))
                hexRow.addView(hex, LinearLayout.LayoutParams(dp(100), dp(36)))
                box.addView(hexRow)
                hex.setOnFocusChangeListener { _, focus ->
                    if (!focus && hex.text.toString().matches(Regex("#[0-9a-fA-F]{6}"))) {
                        item.put(editing, hex.text.toString())
                        save()
                        Color.colorToHSV(Color.parseColor(hex.text.toString()), hsv)
                        preview.invalidate()
                        pad.invalidate()
                    }
                }
                box.addView(
                    ReferenceRange(
                        this,
                        "Яркость темы",
                        "%",
                        50.0,
                        150.0,
                        1.0,
                        item.getInt("brightness").toDouble(),
                    ) { value ->
                        if (value != null) {
                            item.put("brightness", value.toInt())
                            save()
                            preview.invalidate()
                        }
                    }
                )
                box.addView(
                    ReferenceRange(
                        this,
                        "Контраст сетки",
                        "%",
                        50.0,
                        180.0,
                        1.0,
                        item.getInt("contrast").toDouble(),
                    ) { value ->
                        if (value != null) {
                            item.put("contrast", value.toInt())
                            save()
                            preview.invalidate()
                        }
                    }
                )
            }
            box.checkRow("Объёмные ноты", item.optBoolean("depth")) {
                item.put("depth", it)
                save()
                preview.invalidate()
            }
            if (custom) {
                box.addButton("Сбросить тему") {
                    val defaults = builtin(item.getString("theme"))
                    for (key in
                        listOf("background", "accent", "brightness", "contrast", "depth")) item.put(
                        key,
                        defaults.get(key),
                    )
                    save()
                    render()
                }
                box.addButton("Удалить тему…") {
                    confirm("Удалить тему", item.getString("name")) {
                        val kept = JSONArray()
                        for (i in 0 until items.length()) {
                            val t = items.getJSONObject(i)
                            if (t.getString("id") != active) kept.put(t)
                        }
                        active = item.getString("theme")
                        items = kept
                        save()
                        render()
                    }
                }
            }
        }
}

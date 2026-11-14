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
    private var cancelDelete: (() -> Boolean)? = null

    init {
        val valid = JSONArray()
        val seen = mutableSetOf<String>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val id = item.optString("id")
            if (!id.matches(Regex("dark|light|custom-[1-9][0-9]*")) || !seen.add(id)) continue
            if (id == "dark" || id == "light") {
                valid.put(builtin(id).put("depth", item.optBoolean("depth")))
            } else {
                if (
                    item.optString("theme") !in listOf("dark", "light") ||
                        listOf("background", "accent").any {
                            !item.optString(it).matches(Regex("#[0-9a-fA-F]{6}"))
                        } ||
                        item.optString("name").isBlank()
                )
                    continue
                item.put("name", item.getString("name").trim().take(40))
                item.put("brightness", item.optInt("brightness", 100).coerceIn(50, 150))
                item.put("contrast", item.optInt("contrast", 100).coerceIn(50, 180))
                valid.put(item)
            }
        }
        for (mode in listOf("dark", "light")) if (mode !in seen) valid.put(builtin(mode))
        items = valid
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
        activity.applyTheme()
        if (::dialog.isInitialized) dialog.window?.decorView?.let { applyPalette(it, next) }
        activity.grid.palette = next
    }

    fun show(onClose: () -> Unit = {}) =
        with(activity) {
            box = column().apply { isFocusableInTouchMode = true }
            save()
            render()
            dialog =
                sheet(
                    "Темы",
                    box,
                    width = 385,
                    close = "‹",
                    panel = true,
                    beforeClose = { cancelDelete?.invoke() != true },
                ) {
                    box.clearFocus()
                    save()
                    onClose()
                }
            dialog.setOnKeyListener { _, key, event ->
                if (key == KeyEvent.KEYCODE_BACK && event.action == KeyEvent.ACTION_UP)
                    cancelDelete?.invoke() == true
                else false
            }
        }

    private fun render(): Unit =
        with(activity) {
            fun themeLabel(text: String) = label(text).apply { setPadding(0, 0, 0, 0) }
            box.clearFocus()
            cancelDelete = null
            box.removeAllViews()
            val item = current()
            val custom = active.startsWith("custom-")
            val names = (0 until items.length()).map { items.getJSONObject(it).getString("name") }
            val index =
                (0 until items.length()).first { items.getJSONObject(it).getString("id") == active }
            val choose = row()
            choose.addView(themeLabel("Тема"), LinearLayout.LayoutParams(dp(43), -2))
            choose.addView(
                select(names, index) {
                    box.clearFocus()
                    active = items.getJSONObject(it).getString("id")
                    save()
                    render()
                },
                LinearLayout.LayoutParams(0, dp(34), 1f),
            )
            choose.addView(
                button("＋") {
                    var n = 1
                    while (
                        (0 until items.length()).any {
                            items.getJSONObject(it).getString("id") == "custom-$n"
                        }
                    ) n++
                    box.clearFocus()
                    val next =
                        JSONObject(item.toString())
                            .put("id", "custom-$n")
                            .put("name", "Моя тема $n")
                    items.put(next)
                    active = "custom-$n"
                    save()
                    render()
                    box.findViewWithTag<EditText>("themeName")?.apply {
                        requestFocus()
                        selectAll()
                        post {
                            (getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                                    as android.view.inputmethod.InputMethodManager)
                                .showSoftInput(this, 0)
                        }
                    }
                },
                LinearLayout.LayoutParams(dp(42), dp(44)).apply { leftMargin = dp(8) },
            )
            box.addView(
                choose,
                LinearLayout.LayoutParams(-1, -2).apply {
                    topMargin = dp(5)
                    bottomMargin = dp(10)
                },
            )
            if (custom) {
                val name =
                    field(item.getString("name")).apply {
                        theme {
                            setTextColor(it.text)
                            background = shape(it.panel, it.border, 6f)
                        }
                        tag = "themeName"
                        filters = arrayOf(android.text.InputFilter.LengthFilter(40))
                    }
                val nameRow = row()
                nameRow.addView(themeLabel("Название"), LinearLayout.LayoutParams(0, -2, .4f))
                nameRow.addView(name, LinearLayout.LayoutParams(0, dp(32), .6f))
                box.addView(nameRow)
                name.setOnFocusChangeListener { _, focus ->
                    if (!focus) {
                        val value = name.text.toString().trim().ifEmpty { item.getString("name") }
                        item.put("name", value)
                        name.setText(value)
                        save()
                        val spinner = choose.getChildAt(1) as Spinner
                        @Suppress("UNCHECKED_CAST")
                        val adapter = spinner.adapter as ArrayAdapter<String>
                        adapter.setNotifyOnChange(false)
                        adapter.clear()
                        adapter.addAll(
                            (0 until items.length()).map {
                                items.getJSONObject(it).getString("name")
                            }
                        )
                        adapter.notifyDataSetChanged()
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
                            paint.style = Paint.Style.STROKE
                            paint.strokeWidth = d
                            paint.color = 0x44000000
                            r.inset(d / 2, d / 2)
                            c.drawRoundRect(r, 3 * d, 3 * d, paint)
                            paint.style = Paint.Style.FILL
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
            preview.background = shape(0, ReferencePalette(this).border, 8f)
            preview.clipToOutline = true
            box.addView(
                preview,
                LinearLayout.LayoutParams(-1, dp(56)).apply {
                    topMargin = dp(10)
                    bottomMargin = dp(15)
                },
            )
            if (custom) {
                val pair = row()
                for ((key, title) in
                    listOf("background" to "Основной", "accent" to "Второстепенный")) pair.addView(
                    button(title) {
                            box.clearFocus()
                            editing = key
                            render()
                        }
                        .apply {
                            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
                            setPadding(dp(6), 0, dp(6), 0)
                            contentDescription = title
                            theme { palette ->
                                setTextColor(palette.text)
                                background =
                                    shape(palette.panel, 0).apply {
                                        setStroke(
                                            dp(if (editing == key) 2 else 1),
                                            if (editing == key) palette.text else palette.border,
                                        )
                                    }
                                val chip =
                                    shape(Color.parseColor(item.getString(key)), palette.text, 8f)
                                chip.setBounds(0, 0, dp(16), dp(16))
                                text =
                                    android.text.SpannableString("\uFFFC  $title").apply {
                                        setSpan(
                                            android.text.style.ImageSpan(
                                                chip,
                                                android.text.style.ImageSpan.ALIGN_BOTTOM,
                                            ),
                                            0,
                                            1,
                                            0,
                                        )
                                    }
                            }
                        },
                    LinearLayout.LayoutParams(0, dp(43), 1f).apply {
                        if (key == "background") rightMargin = dp(8)
                    },
                )
                box.addView(pair)
                readHsv(Color.parseColor(item.getString(editing)), hsv)
                val hex =
                    field(item.getString(editing)).apply {
                        filters = arrayOf(android.text.InputFilter.LengthFilter(7))
                        theme {
                            setTextColor(it.text)
                            background = shape(it.panel, it.border, 6f)
                        }
                        contentDescription = "Код выбранного цвета"
                    }
                val colorKey = editing
                fun colorChanged() {
                    val value = String.format("#%06x", Color.HSVToColor(hsv) and 0xffffff)
                    item.put(colorKey, value)
                    save()
                    hex.setText(value)
                    preview.invalidate()
                }
                val pad = ColorPlane(this, hsv) { colorChanged() }
                box.addView(
                    pad,
                    LinearLayout.LayoutParams(-1, dp(112)).apply {
                        topMargin = dp(10)
                        bottomMargin = dp(10)
                    },
                )
                val hueValue = themeLabel("${hsv[0].toInt()}°")
                val hueRow = row()
                hueRow.addView(themeLabel("Оттенок"), LinearLayout.LayoutParams(0, -2, 1f))
                hueRow.addView(hueValue)
                box.addView(hueRow)
                val hue =
                    HueSlider(this).apply {
                        progress = hsv[0].toInt()
                        setOnSeekBarChangeListener(
                            object : SeekBar.OnSeekBarChangeListener {
                                override fun onStartTrackingTouch(s: SeekBar) {}

                                override fun onStopTrackingTouch(s: SeekBar) {}

                                override fun onProgressChanged(
                                    s: SeekBar,
                                    value: Int,
                                    user: Boolean,
                                ) {
                                    if (user) {
                                        hsv[0] = value.toFloat()
                                        hueValue.text = "$value°"
                                        pad.invalidate()
                                        colorChanged()
                                    }
                                }
                            }
                        )
                    }
                box.addView(
                    hue,
                    LinearLayout.LayoutParams(-1, dp(23)).apply {
                        topMargin = dp(7)
                        bottomMargin = dp(7)
                    },
                )
                val hexRow = row()
                hexRow.addView(themeLabel("HEX"), LinearLayout.LayoutParams(0, -2, 1f))
                hexRow.addView(hex, LinearLayout.LayoutParams(dp(75), dp(32)))
                box.addView(hexRow)
                hex.setOnFocusChangeListener { _, focus ->
                    if (!focus) {
                        val normalized =
                            "#" + hex.text.toString().trim().removePrefix("#").lowercase()
                        if (normalized.matches(Regex("#[0-9a-f]{6}"))) {
                            item.put(colorKey, normalized)
                            readHsv(Color.parseColor(normalized), hsv)
                            hue.progress = hsv[0].toInt()
                            hueValue.text = "${hsv[0].toInt()}°"
                            save()
                            preview.invalidate()
                            pad.invalidate()
                        }
                        hex.setText(item.getString(colorKey))
                    }
                }
                fun range(title: String, key: String, low: Int, high: Int) {
                    val line = row()
                    val value = themeLabel("${item.getInt(key)}%")
                    line.addView(themeLabel(title), LinearLayout.LayoutParams(0, -2, 1f))
                    line.addView(value)
                    box.addView(
                        line,
                        LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) },
                    )
                    val slider =
                        ReferenceSlider(this).apply {
                            contentDescription = title
                            max = high - low
                            progress = item.getInt(key) - low
                            setOnSeekBarChangeListener(
                                object : SeekBar.OnSeekBarChangeListener {
                                    override fun onStartTrackingTouch(s: SeekBar) {}

                                    override fun onStopTrackingTouch(s: SeekBar) {}

                                    override fun onProgressChanged(
                                        s: SeekBar,
                                        p: Int,
                                        user: Boolean,
                                    ) {
                                        if (user) {
                                            item.put(key, p + low)
                                            value.text = "${p+low}%"
                                            save()
                                            preview.invalidate()
                                        }
                                    }
                                }
                            )
                        }
                    box.addView(
                        slider,
                        LinearLayout.LayoutParams(-1, dp(25)).apply { topMargin = dp(10) },
                    )
                }
                range("Яркость темы", "brightness", 50, 150)
                range("Контраст сетки", "contrast", 50, 180)
            }
            box.checkRow("Объёмные ноты", item.optBoolean("depth")) {
                item.put("depth", it)
                save()
                preview.invalidate()
            }
            (box.getChildAt(box.childCount - 1).layoutParams as LinearLayout.LayoutParams).apply {
                topMargin = dp(10)
                bottomMargin = dp(10)
            }
            if (custom) {
                box.addButton("Сбросить тему") {
                    box.clearFocus()
                    val defaults = builtin(item.getString("theme"))
                    for (key in
                        listOf("background", "accent", "brightness", "contrast", "depth")) item.put(
                        key,
                        defaults.get(key),
                    )
                    save()
                    render()
                }
                val confirmation = column().apply { visibility = View.GONE }
                cancelDelete = {
                    if (confirmation.visibility == View.VISIBLE) {
                        confirmation.visibility = View.GONE
                        true
                    } else false
                }
                box.addButton("Удалить тему…") {
                    box.clearFocus()
                    confirmation.visibility = View.VISIBLE
                    confirmation.post {
                        confirmation.requestRectangleOnScreen(
                            Rect(0, 0, confirmation.width, confirmation.height),
                            false,
                        )
                    }
                }
                confirmation.addView(themeLabel("Удалить «${item.getString("name") }»?"))
                val actions = row()
                actions.addView(
                    button("Удалить") {
                        box.clearFocus()
                        val kept = JSONArray()
                        for (i in 0 until items.length()) {
                            val t = items.getJSONObject(i)
                            if (t.getString("id") != active) kept.put(t)
                        }
                        active = item.getString("theme")
                        items = kept
                        save()
                        render()
                    },
                    LinearLayout.LayoutParams(0, dp(43), 1f),
                )
                actions.addView(
                    button("Отмена") { confirmation.visibility = View.GONE },
                    LinearLayout.LayoutParams(0, dp(43), 1f).apply { leftMargin = dp(8) },
                )
                confirmation.addView(actions)
                box.addView(confirmation)
            }
        }
}

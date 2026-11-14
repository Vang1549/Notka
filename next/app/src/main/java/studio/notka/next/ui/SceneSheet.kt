package studio.notka.next.ui

import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.os.*
import android.util.TypedValue
import android.view.*
import android.widget.*
import java.io.File
import kotlin.math.*
import kotlinx.serialization.json.*
import studio.notka.core.*
import studio.notka.next.MainActivity
import studio.notka.next.audio.NativeAudio
import studio.notka.next.data.*

/** Two independent previews and immediately applied controls, as in editor 0.80. */
class SceneSheet(private val activity: MainActivity) {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var dialog: Dialog
    private lateinit var panel: LinearLayout
    private lateinit var demo: SceneView
    private lateinit var overview: SceneView
    private lateinit var pause: Button
    private lateinit var sound: Button
    private lateinit var overviewTime: TextView
    private var audio: NativeAudio? = null
    private var muted = false
    private var paused = false
    private var zoom = false
    private var demoProject = Project()
    private var actualKeys = emptyList<SceneRenderer.Key>()
    private var demoStart = 0L
    private var demoTime = 0.0
    private var demoDuration = 2.8
    private var chord = 0
    private var closed = false
    private var selectedPreset = -1
    private val expanded =
        mutableSetOf("Мои пресеты", "Клавиатура и диапазон", "Движение и форма нот")
    private val options
        get() = activity.editor.project.scene

    private val project
        get() = activity.editor.project

    private val presetsFile
        get() = File(activity.filesDir, "scene-presets.json")

    private fun presets(): JsonArray =
        if (!presetsFile.exists()) JsonArray(emptyList())
        else
            ProjectCodec.json
                .parseToJsonElement(atomicRead(presetsFile, 1024 * 1024).toString(Charsets.UTF_8))
                .jsonArray
                .also { require(it.size <= 50) }

    private fun writePresets(items: List<JsonElement>) {
        require(items.size <= 50)
        atomicWrite(presetsFile, JsonArray(items).toString().toByteArray())
    }

    private fun apply(value: JsonObject) {
        activity.editor.change { it.copy(scene = SceneOptions.normalize(value)) }
        activity.app.changed()
        refreshPreviews()
    }

    private fun set(key: String, value: JsonElement) {
        apply(JsonObject(options.toMutableMap().apply { put(key, value) }))
    }

    private fun refreshPreviews() {
        overview.renderer = SceneRenderer(project)
        overview.invalidate()
        val actual = overview.renderer!!.keys
        actualKeys = actual
        val scene =
            JsonObject(
                options.toMutableMap().apply {
                    put("rangeMode", JsonPrimitive("manual"))
                    put("keyStart", JsonPrimitive(actual.first().pitch))
                    put("keyCount", JsonPrimitive(actual.last().pitch - actual.first().pitch + 1))
                }
            )
        demoProject = demoProject.copy(scene = scene)
        demo.renderer =
            SceneRenderer(demoProject, keyRange = actual.first().pitch..actual.last().pitch)
        frameDemo()
    }

    private val frame =
        object : Runnable {
            override fun run() {
                if (closed) return
                if (!paused) {
                    demoTime = (SystemClock.elapsedRealtime() - demoStart) / 1000.0
                    if (demoTime >= demoDuration) {
                        startDemo()
                        return
                    }
                    frameDemo()
                }
                handler.postDelayed(this, if (options.number("fps") == 30.0) 33 else 16)
            }
        }

    private fun frameDemo() {
        demo.seconds = demoTime
        val notes = demoProject.lanes.flatMap { it.notes }
        val sec = 60.0 / demoProject.bpm / PPQ
        val current = (notes.firstOrNull { it.end * sec > demoTime } ?: notes.lastOrNull())?.start
        val chord = notes.filter { it.start == current }
        val range = actualKeys
        demo.lensRange =
            if (zoom && chord.isNotEmpty())
                max(range.first().pitch, chord.minOf { it.pitch } - 2)..min(
                        range.last().pitch,
                        chord.maxOf { it.pitch } + 2,
                    )
            else null
        demo.invalidate()
    }

    private fun demoScore(): Project {
        val keys = SceneRenderer(project).keys
        val low = keys.first().pitch
        val high = keys.last().pitch
        val middle = (low + high) / 2.0
        val chords =
            listOf(
                listOf(0, 4, 7, 12),
                listOf(1, 5, 8, 13),
                listOf(9, 12, 16, 21),
                listOf(3, 7, 10, 15),
                listOf(5, 9, 12, 17),
                listOf(6, 9, 13, 18),
                listOf(7, 11, 14, 19),
                listOf(8, 12, 15, 20),
                listOf(2, 5, 9, 14),
                listOf(10, 14, 17, 22),
                listOf(4, 7, 11, 16),
                listOf(11, 14, 18, 23),
            )
        val notes = project.lanes.map { mutableListOf<Note>() }
        var id = 1L
        for (group in project.lanes.indices step 4) {
            val count = min(4, project.lanes.size - group)
            val c = chords[(chord + group / 4) % chords.size]
            val raw =
                when (count) {
                    1 -> c.take(3)
                    2 -> listOf(c[0], c[if ((chord + group / 4) % 2 == 1) 2 else 1])
                    else -> c.take(count)
                }
            val candidates =
                (-1..10)
                    .map { shift -> raw.map { it + 12 * shift } }
                    .filter { it.min() >= low && it.max() <= high }
            val pitches =
                candidates.minByOrNull {
                    abs((it.min() + it.max()) / 2.0 - middle) +
                        if (it.min() < low + 2 || it.max() > high - 2) 128 else 0
                }
                    ?: raw.map { pitch ->
                        keys
                            .filter { it.pitch % 12 == pitch % 12 }
                            .minByOrNull { abs(it.pitch - middle) }
                            ?.pitch ?: low
                    }
            pitches.forEachIndexed { i, pitch ->
                notes[group + i % count].add(
                    Note(
                        id++,
                        ((1.1 + group / 4 * 1.65) * PPQ).roundToLong(),
                        (.8 * PPQ).roundToLong(),
                        pitch.coerceIn(24, 119),
                        80,
                    )
                )
            }
        }
        chord += ceil(project.lanes.size / 4.0).toInt()
        demoDuration = 1.1 + (project.lanes.size - 1) / 4 * 1.65 + 1.7
        return project.copy(
            bpm = 60,
            lanes =
                project.lanes.mapIndexed { i, lane -> lane.copy(notes = notes[i], muted = false) },
            scene = JsonObject(options.toMutableMap().apply { put("loop", JsonPrimitive(false)) }),
        )
    }

    private fun startDemo() {
        handler.removeCallbacks(frame)
        activity.stopPreview()
        audio = null
        demoProject = demoScore()
        demoTime = 0.0
        demoStart = SystemClock.elapsedRealtime()
        refreshPreviews()
        if (!muted && !paused)
            activity.playPreviewProject(demoProject) { engine ->
                if (!closed) {
                    audio = engine
                    demoStart = SystemClock.elapsedRealtime()
                } else engine.close()
            }
        handler.post(frame)
    }

    private fun randomFrame() {
        val notes = project.lanes.filter { !it.muted }.flatMap { it.notes }
        val n = notes.randomOrNull()
        overview.seconds =
            if (n == null) 0.0
            else (n.start + n.len * (.2 + .5 * Math.random())) * 60 / project.bpm / PPQ
        overview.invalidate()
    }

    fun show(): Unit =
        with(activity) {
            transport.pause()
            stopPreview()
            val palette = ReferencePalette(this)
            val layout =
                row().apply {
                    setPadding(dp(12), dp(12), dp(12), dp(12))
                    gravity = Gravity.TOP
                }
            val previews =
                LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                }
            layout.addView(
                previews,
                LinearLayout.LayoutParams(0, -1, 1f).apply { rightMargin = dp(12) },
            )
            val demoFrame =
                FrameLayout(this).apply {
                    background = shape(Color.BLACK, palette.border, 12f)
                    clipToOutline = true
                    foreground = shape(Color.TRANSPARENT, palette.border, 12f)
                }
            demo =
                SceneView(this).apply {
                    compact = true
                    audition = true
                    setOnClickListener {
                        zoom = !zoom
                        frameDemo()
                    }
                    contentDescription = "Приблизить ноты предпросмотра"
                }
            demoFrame.addView(demo, FrameLayout.LayoutParams(-1, -1))
            val demoHead =
                row().apply {
                    setPadding(dp(6), dp(4), dp(6), dp(4))
                    setBackgroundColor((palette.bg and 0xffffff) or 0xe0000000.toInt())
                }
            pause =
                button("Ⅱ") {
                        paused = !paused
                        if (paused) {
                            audio?.pause()
                            demoTime = (SystemClock.elapsedRealtime() - demoStart) / 1000.0
                        } else {
                            demoStart = SystemClock.elapsedRealtime() - (demoTime * 1000).toLong()
                            if (!muted) {
                                activity.playPreviewProject(demoProject) { engine ->
                                    audio = engine
                                    engine.seek(demoTime)
                                    demoStart =
                                        SystemClock.elapsedRealtime() - (demoTime * 1000).toLong()
                                }
                            }
                        }
                        pause.text = if (paused) "▶" else "Ⅱ"
                    }
                    .apply {
                        setPadding(0, 0, 0, 0)
                        minHeight = 0
                        minimumHeight = 0
                        contentDescription = "Пауза предпросмотра"
                    }
            demoHead.addView(pause, LinearLayout.LayoutParams(dp(34), dp(30)))
            demoHead.addView(
                label("Предпросмотр").apply {
                    gravity = Gravity.CENTER
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                    setPadding(0, 0, 0, 0)
                },
                LinearLayout.LayoutParams(0, -2, 1f),
            )
            sound =
                iconButton("volume", "Включить звук предпросмотра") {
                        muted = !muted
                        sound.alpha = if (muted) .55f else 1f
                        sound.contentDescription =
                            if (muted) "Включить звук предпросмотра"
                            else "Выключить звук предпросмотра"
                        if (muted) {
                            stopPreview()
                            audio = null
                        } else if (!paused)
                            playPreviewProject(demoProject) { engine ->
                                audio = engine
                                engine.seek(demoTime)
                                demoStart =
                                    SystemClock.elapsedRealtime() - (demoTime * 1000).toLong()
                            }
                    }
                    .apply { alpha = if (muted) .55f else 1f }
            demoHead.addView(sound, LinearLayout.LayoutParams(dp(34), dp(30)))
            demoFrame.addView(demoHead, FrameLayout.LayoutParams(-1, dp(38)))
            val overviewFrame =
                FrameLayout(this).apply {
                    background = shape(Color.BLACK, palette.border, 12f)
                    clipToOutline = true
                    foreground = shape(Color.TRANSPARENT, palette.border, 12f)
                }
            overview =
                SceneView(this).apply {
                    compact = true
                    contentDescription =
                        "Кадр трека: нажми для случайного момента, удерживай для перемотки"
                }
            overviewFrame.addView(overview, FrameLayout.LayoutParams(-1, -1))
            overviewTime =
                label("").apply {
                    setTextColor(Color.WHITE)
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f)
                    setBackgroundColor(0xaa000000.toInt())
                    visibility = View.GONE
                }
            overviewFrame.addView(overviewTime, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
            var downX = 0f
            var downY = 0f
            var scrubbing = false
            var moved = false
            var fraction = 0.0
            fun seek() {
                val duration =
                    project.lanes
                        .filter { !it.muted }
                        .maxOfOrNull { it.notes.maxOfOrNull { it.end } ?: 0L } ?: 0L
                overview.seconds = fraction * duration * 60 / project.bpm / PPQ
                overview.invalidate()
                overviewTime.text =
                    clock(overview.seconds) + " / " + clock(duration * 60.0 / project.bpm / PPQ)
                overviewTime.visibility = View.VISIBLE
            }
            val hold = Runnable {
                scrubbing = true
                seek()
            }
            overview.setOnTouchListener { v, e ->
                when (e.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        downX = e.x
                        downY = e.y
                        moved = false
                        scrubbing = false
                        fraction = (e.x / v.width).toDouble().coerceIn(0.0, 1.0)
                        handler.postDelayed(hold, 350)
                    }
                    MotionEvent.ACTION_MOVE -> {
                        fraction = (e.x / v.width).toDouble().coerceIn(0.0, 1.0)
                        if (hypot(e.x - downX, e.y - downY) > dp(7)) {
                            moved = true
                        }
                        if (scrubbing) seek()
                    }
                    MotionEvent.ACTION_UP -> {
                        handler.removeCallbacks(hold)
                        if (!scrubbing && !moved) randomFrame()
                        overviewTime.visibility = View.GONE
                        v.performClick()
                    }
                    MotionEvent.ACTION_CANCEL -> {
                        handler.removeCallbacks(hold)
                        overviewTime.visibility = View.GONE
                    }
                }
                true
            }
            previews.addView(demoFrame, LinearLayout.LayoutParams(-1, 0, 1f))
            previews.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
            previews.addView(overviewFrame, LinearLayout.LayoutParams(-1, 0, 1f))
            previews.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
                val available = previews.height
                val aspect =
                    resources.displayMetrics.widthPixels.toFloat() /
                        resources.displayMetrics.heightPixels
                val h =
                    min((available - dp(12)) / 2f, (previews.width - dp(2)) / aspect + dp(2))
                        .roundToInt()
                val w = min(previews.width, ((h - dp(2)) * aspect + dp(2)).roundToInt())
                for (view in listOf(demoFrame, overviewFrame)) {
                    val lp = view.layoutParams as LinearLayout.LayoutParams
                    if (lp.height != h || lp.width != w) {
                        lp.height = h
                        lp.width = w
                        lp.weight = 0f
                        view.layoutParams = lp
                    }
                }
            }
            panel = column().apply { setPadding(dp(17), dp(17), dp(17), dp(17)) }
            layout.addView(
                ScrollView(this).apply {
                    background = shape(palette.bg, palette.border, 18f)
                    clipToOutline = true
                    addView(panel)
                    isVerticalScrollBarEnabled = false
                },
                LinearLayout.LayoutParams(
                    ((resources.displayMetrics.widthPixels - dp(24)) * .46).toInt(),
                    -1,
                ),
            )
            dialog = Dialog(this)
            dialog.setContentView(layout)
            dialog.window?.apply {
                setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
                addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                setDimAmount(2f / 3)
                decorView.systemUiVisibility =
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                setLayout(-1, -1)
            }
            dialog.setOnDismissListener {
                panel.clearFocus()
                closed = true
                handler.removeCallbacksAndMessages(null)
                stopPreview()
                app.flush(true)
            }
            selectedPreset =
                runCatching {
                        presets().indexOfFirst {
                            it.jsonObject.text("name") == options.text("presetName")
                        }
                    }
                    .getOrDefault(-1)
            buildControls()
            dialog.show()
            dialog.window?.setLayout(-1, -1)
            startDemo()
            randomFrame()
        }

    private fun clock(seconds: Double) =
        "${seconds.toInt()/60}:${(seconds.toInt()%60).toString().padStart(2,'0')}"

    private fun section(title: String): LinearLayout =
        with(activity) {
            val box = column()
            val body =
                column().apply { visibility = if (title in expanded) View.VISIBLE else View.GONE }
            val heading =
                button((if (title in expanded) "▼" else "▶") + title) {}
                    .apply {
                        gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL
                        background = null
                        setPadding(0, 0, 0, 0)
                        setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f)
                        setTypeface(typeface, Typeface.BOLD)
                        minimumHeight = dp(38)
                        minHeight = dp(38)
                    }
            heading.setOnClickListener {
                if (title in expanded) expanded.remove(title) else expanded.add(title)
                body.visibility = if (title in expanded) View.VISIBLE else View.GONE
                heading.text = (if (title in expanded) "▼" else "▶") + title
            }
            box.addView(heading, LinearLayout.LayoutParams(-1, dp(38)))
            box.addView(body)
            panel.addView(box)
            panel.addView(
                View(this).apply { setBackgroundColor(ReferencePalette(this@with).border) },
                LinearLayout.LayoutParams(-1, dp(1)).apply { topMargin = dp(22) },
            )
            body
        }

    private fun buildControls(): Unit =
        with(activity) {
            panel.clearFocus()
            panel.removeAllViews()
            val heading = row()
            heading.addView(
                label("Оформление сцены").apply {
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 20f)
                    setTypeface(typeface, Typeface.BOLD)
                },
                LinearLayout.LayoutParams(0, -2, 1f),
            )
            heading.addView(
                button("✕") { dialog.dismiss() },
                LinearLayout.LayoutParams(dp(40), dp(43)),
            )
            panel.addView(
                heading,
                LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) },
            )
            panel.addView(
                View(this).apply { setBackgroundColor(ReferencePalette(this@with).border) },
                LinearLayout.LayoutParams(-1, dp(1)),
            )
            val presetsBox = section("Мои пресеты")
            buildPresets(presetsBox)
            fun choice(
                box: LinearLayout,
                key: String,
                title: String,
                values: List<String>,
                labels: List<String>,
                after: () -> Unit = {},
            ) =
                box.selectRow(
                    title,
                    labels,
                    values.indexOf(options.text(key)).coerceAtLeast(0),
                    compact = true,
                ) {
                    set(key, JsonPrimitive(values[it]))
                    after()
                }
            fun range(
                box: LinearLayout,
                key: String,
                title: String,
                unit: String,
                step: Double = 1.0,
            ) {
                val bound = SceneOptions.bounds.getValue(key)
                box.addView(
                    ReferenceRange(
                        this,
                        title,
                        unit,
                        bound.start,
                        bound.endInclusive,
                        step,
                        options.number(key),
                        sceneField = true,
                    ) { value ->
                        if (value != null) set(key, JsonPrimitive(value))
                    }
                )
            }
            val keyboard = section("Клавиатура и диапазон")
            val manual =
                column().apply {
                    visibility =
                        if (options.text("rangeMode") == "manual") View.VISIBLE else View.GONE
                }
            choice(
                keyboard,
                "rangeMode",
                "Диапазон",
                listOf("auto", "manual"),
                listOf("По музыке", "Вручную"),
            ) {
                manual.visibility =
                    if (options.text("rangeMode") == "manual") View.VISIBLE else View.GONE
            }
            manual.selectRow(
                "Первая нота",
                (0..116).map { PianoGrid.noteName(it) },
                options.number("keyStart").toInt(),
            ) {
                set("keyStart", JsonPrimitive(it))
            }
            val count = field(options.number("keyCount").toInt().toString(), true)
            val cr = row()
            cr.addView(label("Количество клавиш"), LinearLayout.LayoutParams(0, -2, 1f))
            cr.addView(count, LinearLayout.LayoutParams(dp(64), dp(34)))
            manual.addView(cr)
            count.setOnFocusChangeListener { _, focused ->
                if (!focused)
                    count.text.toString().toIntOrNull()?.let {
                        set(
                            "keyCount",
                            JsonPrimitive(
                                it.coerceIn(12, min(88, 128 - options.number("keyStart").toInt()))
                            ),
                        )
                    }
            }
            keyboard.addView(manual)
            range(keyboard, "keyboardHeight", "Высота клавиатуры", "%")
            choice(
                keyboard,
                "keyLabels",
                "Подписи клавиш",
                listOf("c", "all", "none"),
                listOf("Только До", "Все ноты", "Без подписей"),
            )
            keyboard.checkRow("Линии клавиш", options.flag("guides")) {
                set("guides", JsonPrimitive(it))
            }
            val motion = section("Движение и форма нот")
            range(motion, "speed", "Скорость падения", "×", .01)
            range(motion, "noteWidth", "Ширина нот", "%")
            range(motion, "roundness", "Скругление", "%")
            choice(
                motion,
                "noteStyle",
                "Стиль нот",
                listOf("glass", "solid", "neon"),
                listOf("Стекло", "Матовый", "Неоновый контур"),
            )
            val colors = section("Цвета")
            val chips = column()
            choice(
                colors,
                "colorMode",
                "Цвет нот",
                listOf("lane", "instrument", "single"),
                listOf("По дорожкам", "По инструментам", "Один цвет"),
            ) {
                buildColors(chips)
            }
            choice(
                colors,
                "palette",
                "Палитра",
                listOf("basic", "aurora", "ember", "ice", "iris"),
                listOf("Базовая", "Северное сияние", "Янтарь", "Лёд", "Ирис"),
            ) {
                buildColors(chips)
            }
            colors.addView(chips)
            buildColors(chips)
            val backdrop = section("Фон")
            choice(
                backdrop,
                "backdrop",
                "Фон",
                listOf("aurora", "stars", "plain"),
                listOf("Мягкое сияние", "Звёзды", "Однотонный"),
            )
            val br = row()
            br.addView(label("Цвет фона"), LinearLayout.LayoutParams(0, -2, 1f))
            val bg =
                button("") {
                        ColorPicker(this).show(
                            "Цвет фона",
                            Color.parseColor(options.text("background")),
                            false,
                        ) { value ->
                            if (value != null) {
                                set("background", JsonPrimitive(value))
                                buildControls()
                            }
                        }
                    }
                    .apply {
                        background =
                            shape(
                                Color.parseColor(options.text("background")),
                                ReferencePalette(this@with).border,
                                6f,
                            )
                    }
            br.addView(bg, LinearLayout.LayoutParams(dp(46), dp(28)))
            backdrop.addView(br)
            val effects = section("Эффекты")
            effects.checkRow("Свечение", options.flag("glow")) { set("glow", JsonPrimitive(it)) }
            range(effects, "glowAmount", "Яркость свечения", "%")
            effects.checkRow("Искры", options.flag("sparks")) { set("sparks", JsonPrimitive(it)) }
            for ((key, title) in
                listOf(
                    "sparkAmount" to "Количество искр",
                    "rays" to "Световые лучи",
                    "rings" to "Кольца касания",
                    "trails" to "Световой след",
                )) range(effects, key, title, "%")
            effects.checkRow("Подсветка клавиш", options.flag("keyLights")) {
                set("keyLights", JsonPrimitive(it))
            }
            val quality = section("Качество")
            quality.selectRow(
                "Частота кадров",
                listOf("30 FPS", "60 FPS"),
                if (options.number("fps") == 30.0) 0 else 1,
            ) {
                set("fps", JsonPrimitive(if (it == 0) 30 else 60))
            }
            quality.selectRow(
                "Чёткость",
                listOf("Экономная", "Сбалансированная", "Высокая"),
                listOf(1.0, 1.5, 2.0).indexOf(options.number("quality")),
            ) {
                set("quality", JsonPrimitive(listOf(1.0, 1.5, 2.0)[it]))
            }
        }

    private fun buildColors(box: LinearLayout): Unit =
        with(activity) {
            box.removeAllViews()
            val renderer = SceneRenderer(project)
            val used = mutableSetOf<String>()
            project.lanes.forEachIndexed { i, lane ->
                val key =
                    when (options.text("colorMode")) {
                        "single" -> "single"
                        "instrument" -> "instrument-${lane.instrumentId}"
                        else -> "lane-$i"
                    }
                if (!used.add(key)) return@forEachIndexed
                val name =
                    when (options.text("colorMode")) {
                        "single" -> "Все ноты"
                        "instrument" -> project.instrument(lane).name
                        else -> lane.name
                    }
                val row = row()
                row.addView(label(name), LinearLayout.LayoutParams(0, -2, 1f))
                val chip =
                    button("") {
                            ColorPicker(this).show(
                                name,
                                renderer.color(i),
                                true,
                                renderer.color(i, false),
                            ) { value ->
                                val colors =
                                    (options["colors"] as? JsonObject)?.toMutableMap()
                                        ?: mutableMapOf()
                                if (value == null) colors.remove(key)
                                else colors[key] = JsonPrimitive(value)
                                set("colors", JsonObject(colors))
                                buildColors(box)
                            }
                        }
                        .apply {
                            background =
                                shape(renderer.color(i), ReferencePalette(this@with).border, 6f)
                            contentDescription = "Цвет · $name"
                        }
                row.addView(chip, LinearLayout.LayoutParams(dp(44), dp(30)))
                box.addView(row)
            }
        }

    private fun buildPresets(box: LinearLayout): Unit =
        with(activity) {
            box.removeAllViews()
            val all =
                runCatching { presets() }
                    .getOrElse {
                        box.addView(label("Не удалось прочитать пресеты."))
                        return@with
                    }
            val list = column().apply { visibility = View.GONE }
            val selected = all.getOrNull(selectedPreset)?.jsonObject
            box.addButton(
                (selected?.text("name")
                    ?: if (options.text("presetName") == "@basic") "Базовый" else "Настройки трека")
            ) {
                list.visibility = if (list.visibility == View.GONE) View.VISIBLE else View.GONE
            }
            (box.getChildAt(0) as Button).apply {
                gravity = Gravity.LEFT or Gravity.CENTER_VERTICAL
                // The HTML selector pins its arrow to the far edge, independent of the name.
                setCompoundDrawablesWithIntrinsicBounds(
                    null,
                    null,
                    object : android.graphics.drawable.Drawable() {
                        private val paint =
                            android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                                color = ReferencePalette(activity).text
                            }

                        override fun getIntrinsicWidth() = dp(8)

                        override fun getIntrinsicHeight() = dp(6)

                        override fun draw(canvas: android.graphics.Canvas) {
                            val path =
                                android.graphics.Path().apply {
                                    moveTo(bounds.left.toFloat(), bounds.top.toFloat())
                                    lineTo(bounds.right.toFloat(), bounds.top.toFloat())
                                    lineTo(bounds.exactCenterX(), bounds.bottom.toFloat())
                                    close()
                                }
                            canvas.drawPath(path, paint)
                        }

                        override fun setAlpha(alpha: Int) {
                            paint.alpha = alpha
                        }

                        override fun setColorFilter(filter: android.graphics.ColorFilter?) {
                            paint.colorFilter = filter
                        }

                        override fun getOpacity() = android.graphics.PixelFormat.TRANSLUCENT
                    },
                    null,
                )
            }
            box.addView(list)
            list.addButton("Базовый") {
                selectedPreset = -1
                apply(SceneOptions.defaults())
                buildControls()
            }
            all.forEachIndexed { i, value ->
                val item = value.jsonObject
                val r = row()
                r.addView(
                    button(item.text("name")) {
                        selectedPreset = i
                        val data = SceneOptions.normalize(item["scene"]!!.jsonObject)
                        val colors =
                            (data["colors"] as JsonObject)
                                .filterKeys { !it.startsWith("instrument-") }
                                .toMutableMap()
                        val rack = (item["rack"] as? JsonArray) ?: JsonArray(emptyList())
                        val seen = mutableMapOf<String, Int>()
                        for (instrument in project.instruments) {
                            val n = seen[instrument.source] ?: 0
                            seen[instrument.source] = n + 1
                            rack
                                .filter { it.jsonObject.text("source") == instrument.source }
                                .getOrNull(n)
                                ?.jsonObject
                                ?.get("color")
                                ?.takeUnless { it == JsonNull }
                                ?.let { colors["instrument-${instrument.id}"] = it }
                        }
                        apply(
                            JsonObject(
                                data.toMutableMap().apply {
                                    put("colors", JsonObject(colors))
                                    put("presetName", JsonPrimitive(item.text("name")))
                                }
                            )
                        )
                        buildControls()
                    },
                    LinearLayout.LayoutParams(0, dp(43), 1f),
                )
                r.addView(
                    iconButton("trash", "Удалить пресет ${item.text("name")}") {
                        confirm("Удалить пресет", item.text("name")) {
                            writePresets(all.filterIndexed { index, _ -> index != i })
                            selectedPreset = -1
                            buildPresets(box)
                        }
                    },
                    LinearLayout.LayoutParams(dp(38), dp(43)).apply { leftMargin = dp(4) },
                )
                list.addView(r)
            }
            fun snapshot(name: String) = buildJsonObject {
                put("name", name)
                put(
                    "scene",
                    JsonObject(
                        options.toMutableMap().apply { put("presetName", JsonPrimitive("")) }
                    ),
                )
                put(
                    "rack",
                    JsonArray(
                        project.instruments.map { instrument ->
                            buildJsonObject {
                                put("source", instrument.source)
                                put(
                                    "color",
                                    (options["colors"] as? JsonObject)?.get(
                                        "instrument-${instrument.id}"
                                    ) ?: JsonNull,
                                )
                            }
                        }
                    ),
                )
            }
            val actions = row()
            actions.addView(
                button("Сохранить как новый") {
                    prompt("Название пресета") { name ->
                        require(Project.validName(name))
                        val write = {
                            val result =
                                all.filter { it.jsonObject.text("name") != name } + snapshot(name)
                            writePresets(result)
                            selectedPreset = result.lastIndex
                            set("presetName", JsonPrimitive(name))
                            buildPresets(box)
                        }
                        if (all.any { it.jsonObject.text("name") == name })
                            confirm("Заменить пресет", name, write)
                        else write()
                    }
                },
                LinearLayout.LayoutParams(0, dp(44), 1f),
            )
            actions.addView(
                button("Обновить выбранный") {
                        if (selected != null) {
                            val updated =
                                all.mapIndexed { i, v ->
                                    if (i == selectedPreset) snapshot(selected.text("name")) else v
                                }
                            writePresets(updated)
                        }
                    }
                    .apply { isEnabled = selected != null },
                LinearLayout.LayoutParams(0, dp(44), 1f),
            )
            for (i in 0 until actions.childCount) (actions.getChildAt(i) as Button).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                setPadding(dp(6), 0, dp(6), 0)
                background = null
            }
            val palette = ReferencePalette(this)
            actions.background = shape(palette.panel, palette.border, 10f)
            actions.clipToOutline = true
            actions.addView(
                View(this).apply { setBackgroundColor(palette.border) },
                1,
                LinearLayout.LayoutParams(dp(1), -1),
            )
            box.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        }
}

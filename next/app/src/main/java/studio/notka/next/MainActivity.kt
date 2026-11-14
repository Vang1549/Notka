package studio.notka.next

import android.app.*
import android.content.*
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.media.MediaPlayer
import android.os.*
import android.util.TypedValue
import android.view.*
import android.widget.*
import kotlinx.serialization.json.*
import studio.notka.core.*
import studio.notka.next.audio.*
import studio.notka.next.data.*
import studio.notka.next.export.ExportService
import studio.notka.next.ui.*

class MainActivity : Activity() {
    lateinit var app: NotkaApplication
        private set

    val editor
        get() = app.editor

    lateinit var grid: PianoGrid
        private set

    lateinit var transport: Transport
        private set

    private lateinit var diagnosticsOverlay: FrameStatsView
    private lateinit var screen: FrameLayout
    private lateinit var sceneLayer: FrameLayout
    private var launcher: View? = null
    private var librarySheet: LibrarySheet? = null
    private lateinit var bpmInput: EditText
    private lateinit var startButton: Button
    private lateinit var visualButton: Button
    private lateinit var minusButton: Button
    private lateinit var plusButton: Button
    private lateinit var inspectorTitle: TextView
    private lateinit var inspectorLength: TextView
    private lateinit var volumeRow: LinearLayout
    private lateinit var volumeValue: TextView
    private lateinit var volumeSlider: SeekBar
    private lateinit var sceneTransport: Button
    private lateinit var sceneLoop: Button
    private lateinit var stagePosition: TextView
    private lateinit var stageDuration: TextView
    private var sceneWasPortrait = false
    private lateinit var root: LinearLayout
    private lateinit var topBar: LinearLayout
    private lateinit var body: FrameLayout
    private lateinit var scene: SceneView
    private lateinit var missingSounds: TextView
    private lateinit var status: TextView
    private lateinit var play: Button
    private lateinit var laneButton: Button
    private lateinit var title: TextView
    private lateinit var selectionBar: LinearLayout
    private lateinit var editorControls: LinearLayout
    private lateinit var sceneControls: LinearLayout
    private lateinit var timeline: SeekBar
    private var scrubbing = false
    private var inScene = false
    private var sceneHud = true
    private var lightSystemBars = false
    private var previewAudio: NativeAudio? = null
    private var previewSerial = 0L
    private var media: MediaPlayer? = null
    private var pendingBytes: ByteArray? = null
    private var started = false
    private var lastExportStatus = ""
    private val main = Handler(Looper.getMainLooper())
    private val tick =
        object : Runnable {
            override fun run() {
                if (isDestroyed) return
                diagnosticsOverlay.visibility =
                    if (getSharedPreferences("settings", 0).getBoolean("diagnosticsOverlay", false))
                        View.VISIBLE
                    else View.GONE
                val seconds = transport.poll()
                grid.playTick =
                    if (transport.playing) seconds * editor.project.bpm * PPQ / 60 else -1.0
                if (inScene) {
                    scene.seconds = seconds
                    scene.invalidate()
                    if (!scrubbing)
                        timeline.progress =
                            if (transport.duration > 0)
                                (seconds / transport.duration * 1000).toInt()
                            else 0
                    stagePosition.text = formatTime(seconds)
                    stageDuration.text = formatTime(musicalDuration())
                } else if (transport.playing) {
                    grid.follow(grid.playTick)
                    grid.invalidate()
                }
                if (ExportService.status != lastExportStatus) {
                    lastExportStatus = ExportService.status
                    if (lastExportStatus.isNotEmpty()) hint(lastExportStatus)
                }
                main.postDelayed(
                    this,
                    if (inScene && editor.project.scene.number("fps") == 30.0) 33
                    else if (inScene || transport.playing) 16 else 100,
                )
            }
        }

    override fun onCreate(state: Bundle?) {
        val prefs = getSharedPreferences("settings", 0)
        if (prefs.getString("theme", "dark") == "light")
            setTheme(android.R.style.Theme_Material_Light_NoActionBar)
        super.onCreate(state)
        app = application as NotkaApplication
        transport = Transport(this, { app.banks }, app.worker)
        transport.onState = {
            if (::play.isInitialized) {
                play.text =
                    if (transport.preparing) "…"
                    else if (transport.playing) "■ Стоп" else "▶ Играть"
                window.keepScreen(transport.playing)
                updateTransportControls()
            }
        }
        transport.onError = ::error
        transport.onInterruption = ::stopPreview
        transport.diagnosticsEnabled = { app.diagnostics.enabled }
        var lastAudioMetrics = ""
        transport.onMetrics = { xruns, stolen ->
            val value = "audio xruns=$xruns stolen=$stolen"
            if (value != lastAudioMetrics) {
                lastAudioMetrics = value
                app.io.execute { app.diagnostics.record(value) }
            }
        }
        val palette = ReferencePalette(this)
        screen = FrameLayout(this).apply { theme { setBackgroundColor(it.bg) } }
        root =
            column().apply {
                setPadding(0, dp(12), 0, dp(12))
                theme { setBackgroundColor(it.bg) }
            }
        screen.addView(root, FrameLayout.LayoutParams(-1, -1))
        val top = row()
        topBar = top
        laneButton = iconButton("lanes", "Дорожки", ::lanes)
        top.addView(laneButton, LinearLayout.LayoutParams(dp(40), dp(40)))
        top.addView(
            iconButton("grid", "Настройка сетки", ::gridOptions),
            LinearLayout.LayoutParams(dp(40), dp(40)).apply { leftMargin = dp(6) },
        )
        top.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        top.addView(
            iconButton("track", "Меню трека", ::menu),
            LinearLayout.LayoutParams(dp(40), dp(40)),
        )
        top.addView(
            iconButton("back", "Вернуться к выбору версии", ::exitEditor),
            LinearLayout.LayoutParams(dp(40), dp(40)).apply { leftMargin = dp(6) },
        )
        root.addView(
            top,
            LinearLayout.LayoutParams(-1, dp(40)).apply {
                leftMargin = dp(12)
                rightMargin = dp(12)
                bottomMargin = dp(10)
            },
        )
        title = label("")
        body = FrameLayout(this)
        grid = PianoGrid(this, editor)
        grid.palette = palette
        grid.onChange = {
            transport.stop()
            app.changed()
        }
        grid.onSelection = ::selectionChanged
        grid.onPreview = ::previewNote
        grid.onHint = ::hint
        grid.onSeek = { seconds -> transport.seek(seconds) }
        body.addView(grid, FrameLayout.LayoutParams(-1, -1))
        root.addView(body, LinearLayout.LayoutParams(-1, 0, 1f))
        missingSounds =
            label("").apply {
                visibility = View.GONE
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                setPadding(dp(12), dp(6), dp(12), 0)
                setOnClickListener {
                    LibrarySheet(this@MainActivity)
                        .also { librarySheet = it }
                        .show {
                            librarySheet = null
                            refresh()
                        }
                }
            }
        root.addView(missingSounds)

        status =
            label("").apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                theme { setTextColor(it.muted) }
                setPadding(0, 0, 0, 0)
                visibility = View.GONE
            }
        root.addView(
            status,
            LinearLayout.LayoutParams(-1, -2).apply {
                leftMargin = dp(12)
                rightMargin = dp(12)
                topMargin = dp(10)
            },
        )
        editorControls = row()
        val split = row()
        fun playStyle(b: Button) {
            b.background = shape(palette.accent, palette.border)
            b.setTextColor(palette.on)
            b.setTypeface(b.typeface, Typeface.BOLD)
        }
        startButton =
            button("|▶") { startEditorPlayback(true) }
                .apply {
                    contentDescription = "Играть с начала трека"
                    playStyle(this)
                    setPadding(0, 0, 0, 0)
                }
        play =
            button("▶ Играть") {
                    if (transport.playing || transport.preparing) transport.stop()
                    else startEditorPlayback(false)
                }
                .apply {
                    playStyle(this)
                    setPadding(0, 0, 0, 0)
                    contentDescription = "Играть с левого края сетки"
                }
        visualButton = iconButton("scene", "Визуальное пианино — играть с начала", ::enterScene)
        visualButton.background = shape(palette.accent, palette.border)
        val sceneIcon = ReferenceIcon("scene", palette.on).apply { setBounds(0, 0, dp(23), dp(24)) }
        visualButton.setCompoundDrawables(null, sceneIcon, null, null)
        visualButton.setPadding(dp(11), dp(9), dp(11), dp(9))
        fun segment(b: Button, radii: FloatArray) {
            b.theme { p ->
                setTextColor(p.on)
                background =
                    android.graphics.drawable.GradientDrawable().apply {
                        setColor(p.accent)
                        setStroke(dp(1), p.border)
                        cornerRadii =
                            radii.map { it * resources.displayMetrics.density }.toFloatArray()
                    }
                if (b === visualButton)
                    setCompoundDrawables(
                        null,
                        ReferenceIcon("scene", p.on).apply { setBounds(0, 0, dp(23), dp(24)) },
                        null,
                        null,
                    )
            }
        }
        segment(startButton, floatArrayOf(10f, 10f, 0f, 0f, 0f, 0f, 10f, 10f))
        segment(play, FloatArray(8))
        segment(visualButton, floatArrayOf(0f, 0f, 10f, 10f, 10f, 10f, 0f, 0f))
        split.addView(startButton, LinearLayout.LayoutParams(dp(44), dp(43)))
        split.addView(play, LinearLayout.LayoutParams(0, dp(43), 1f))
        split.addView(visualButton, LinearLayout.LayoutParams(dp(46), dp(43)))
        editorControls.addView(split, LinearLayout.LayoutParams(0, dp(43), 1f))
        val tempo = row()
        minusButton =
            button("−") { setTempo(editor.project.bpm - 5) }
                .apply { contentDescription = "Медленнее" }
        plusButton =
            button("+") { setTempo(editor.project.bpm + 5) }
                .apply { contentDescription = "Быстрее" }
        tempo.addView(minusButton, LinearLayout.LayoutParams(dp(34), dp(43)))
        val bpmBox = column().apply { gravity = Gravity.CENTER }
        bpmInput =
            field(editor.project.bpm.toString(), true).apply {
                theme {
                    setTextColor(it.text)
                    background = null
                }
                setPadding(0, 0, 0, 0)
                minimumHeight = 0
                minHeight = 0
                gravity = Gravity.CENTER
                setTypeface(typeface, Typeface.BOLD)
                contentDescription = "Темп в BPM"
                filters = arrayOf(android.text.InputFilter.LengthFilter(3))
                setOnEditorActionListener { _, _, _ ->
                    commitTempo()
                    clearFocus()
                    true
                }
                setOnFocusChangeListener { _, focused -> if (!focused) commitTempo() }
            }
        bpmBox.addView(bpmInput, LinearLayout.LayoutParams(dp(29), dp(21)))
        bpmBox.addView(
            label("BPM").apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 9f)
                theme { setTextColor(it.muted) }
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 0)
            },
            LinearLayout.LayoutParams(dp(29), dp(11)),
        )
        tempo.addView(
            bpmBox,
            LinearLayout.LayoutParams(dp(29), dp(43)).apply {
                leftMargin = dp(4)
                rightMargin = dp(4)
            },
        )
        tempo.addView(plusButton, LinearLayout.LayoutParams(dp(34), dp(43)))
        editorControls.addView(
            tempo,
            LinearLayout.LayoutParams(-2, dp(43)).apply { leftMargin = dp(7) },
        )
        root.addView(
            editorControls,
            LinearLayout.LayoutParams(-1, dp(43)).apply {
                leftMargin = dp(12)
                rightMargin = dp(12)
                topMargin = dp(10)
            },
        )
        selectionBar =
            column().apply {
                setPadding(dp(9), dp(6), dp(9), dp(6))
                theme { background = shape(it.panel, it.line, 11f) }
                elevation = dp(4).toFloat()
                visibility = View.GONE
            }
        val ins = row()
        inspectorTitle =
            label("").apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f)
                setTypeface(typeface, Typeface.BOLD)
                setPadding(0, 0, 0, 0)
            }
        inspectorLength =
            label("").apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                theme { setTextColor(it.muted) }
                setPadding(0, 0, 0, 0)
            }
        ins.addView(inspectorTitle)
        ins.addView(inspectorLength, LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(6) })
        ins.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
        ins.addView(
            iconButton("volume", "Громкость ноты") {
                volumeRow.visibility =
                    if (volumeRow.visibility == View.VISIBLE) View.GONE else View.VISIBLE
                selectionChanged()
            },
            LinearLayout.LayoutParams(dp(30), dp(30)),
        )
        ins.addView(
            iconButton("copy", "Копировать выделенные ноты") {
                mutate { grid.duplicateSelection() }
            },
            LinearLayout.LayoutParams(dp(30), dp(30)).apply { leftMargin = dp(6) },
        )
        ins.addView(
            button("Удалить") {
                    mutate { editor.deleteNotes(grid.selected) }
                    grid.clearSelection()
                }
                .apply {
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                    setPadding(dp(6), 0, dp(6), 0)
                    minHeight = 0
                    minimumHeight = 0
                    theme {
                        setTextColor(Color.rgb(251, 172, 156))
                        background = shape(it.panel, it.border)
                    }
                },
            LinearLayout.LayoutParams(-2, dp(30)).apply { leftMargin = dp(6) },
        )
        ins.addView(
            button("✕") { grid.clearSelection() }
                .apply {
                    minHeight = 0
                    minimumHeight = 0
                    setPadding(dp(6), 0, dp(6), 0)
                },
            LinearLayout.LayoutParams(dp(30), dp(30)).apply { leftMargin = dp(6) },
        )
        selectionBar.addView(ins)
        volumeRow = row().apply { visibility = View.GONE }
        volumeRow.addView(label("Громк.").apply { setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f) })
        volumeSlider =
            SeekBar(this).apply {
                max = 100
                theme {
                    progressTintList = ColorStateList.valueOf(it.accent)
                    thumbTintList = ColorStateList.valueOf(it.accent)
                }
            }
        volumeRow.addView(volumeSlider, LinearLayout.LayoutParams(0, dp(24), 1f))
        volumeValue = label("").apply { setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f) }
        volumeRow.addView(volumeValue)
        volumeSlider.setOnSeekBarChangeListener(
            object : SeekBar.OnSeekBarChangeListener {
                override fun onStartTrackingTouch(s: SeekBar) {}

                override fun onProgressChanged(s: SeekBar, value: Int, user: Boolean) {
                    if (user) {
                        volumeValue.text = "$value%"
                    }
                }

                override fun onStopTrackingTouch(s: SeekBar) {
                    mutate { editor.updateNotes(grid.selected) { it.copy(volume = s.progress) } }
                    grid.syncTemplate()
                    grid.selection().firstOrNull()?.let { previewNote(it.pitch, it.volume) }
                }
            }
        )
        selectionBar.addView(volumeRow)
        screen.addView(
            selectionBar,
            FrameLayout.LayoutParams(
                minOf(dp(320), resources.displayMetrics.widthPixels - dp(16)),
                -2,
            ),
        )
        sceneLayer = FrameLayout(this).apply { visibility = View.GONE }
        scene =
            SceneView(this).apply {
                setOnClickListener {
                    sceneHud = !sceneHud
                    applySceneHud()
                }
            }
        sceneLayer.addView(scene, FrameLayout.LayoutParams(-1, -1))
        screen.addView(sceneLayer, FrameLayout.LayoutParams(-1, -1))
        sceneControls = row().apply { setPadding(0, 0, 0, 0) }
        fun stageButton(b: Button) {
            b.background =
                if (b.tag is String)
                    iconSurface(
                        b.tag as String,
                        0xffe0eaf3.toInt(),
                        0xe0101b29.toInt(),
                        0x35b6cce0,
                        11f,
                    )
                else shape(0xe0101b29.toInt(), 0x35b6cce0, 11f)
            b.setTextColor(0xffe0eaf3.toInt())
            b.minHeight = 0
            b.minimumHeight = 0
            b.setPadding(0, 0, 0, 0)
        }
        fun addStage(b: Button, w: Int = 42) {
            stageButton(b)
            sceneControls.addView(
                b,
                LinearLayout.LayoutParams(dp(w), dp(42)).apply { rightMargin = dp(6) },
            )
        }
        addStage(iconButton("scene", "Настройки визуала") { SceneSheet(this).show() })
        addStage(iconButton("download", "Сохранить аудио или видео") { ExportSheet(this).show() })
        sceneLoop =
            button("∞") {
                    editor.change {
                        it.copy(
                            scene =
                                JsonObject(
                                    it.scene.toMutableMap().apply {
                                        put("loop", JsonPrimitive(!it.scene.flag("loop")))
                                    }
                                )
                        )
                    }
                    transport.setLoop(
                        editor.project.scene.flag("loop"),
                        musicalDuration(),
                        editor.revision,
                    )
                    app.changed()
                }
                .apply {
                    contentDescription = "Повторять трек"
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 28f)
                }
        addStage(sceneLoop)
        sceneTransport =
            button("Ⅱ") {
                    if (transport.playing) transport.pause()
                    else transport.play(editor.project, editor.revision, visual = true)
                }
                .apply { contentDescription = "Пауза" }
        addStage(sceneTransport)
        val seekColumn = column()
        timeline =
            ReferenceSlider(this, 0xffbaf8e8.toInt()).apply {
                max = 1000
                progressTintList = ColorStateList.valueOf(0xffbaf8e8.toInt())
                thumbTintList = ColorStateList.valueOf(0xffbaf8e8.toInt())
                setPadding(dp(8), 0, dp(8), 0)
            }
        timeline.setOnSeekBarChangeListener(
            object : SeekBar.OnSeekBarChangeListener {
                override fun onStartTrackingTouch(s: SeekBar) {
                    scrubbing = true
                }

                override fun onStopTrackingTouch(s: SeekBar) {
                    transport.seek(s.progress / 1000.0 * transport.duration)
                    scrubbing = false
                }

                override fun onProgressChanged(s: SeekBar, p: Int, user: Boolean) {
                    if (user) {
                        scene.seconds = p / 1000.0 * transport.duration
                        scene.invalidate()
                    }
                }
            }
        )
        seekColumn.addView(timeline, LinearLayout.LayoutParams(-1, dp(26)))
        val times = row()
        stagePosition = label("0:00")
        stageDuration = label("0:00")
        for (t in listOf(stagePosition, stageDuration)) {
            t.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 10f)
            t.setTextColor(0xffe0eaf3.toInt())
            t.setPadding(0, 0, 0, 0)
        }
        times.addView(stagePosition, LinearLayout.LayoutParams(0, dp(12), 1f))
        times.addView(stageDuration)
        seekColumn.addView(times)
        sceneControls.addView(
            seekColumn,
            LinearLayout.LayoutParams(0, dp(42), 1f).apply { rightMargin = dp(6) },
        )
        for (amount in listOf(-10, -1, 1, 10)) addStage(
            button(if (amount > 0) "+$amount" else "−${-amount}") {
                    transport.seek(transport.position + amount)
                }
                .apply {
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
                    setTypeface(typeface, Typeface.BOLD)
                },
            42,
        )
        addStage(iconButton("back", "Вернуться в редактор", ::leaveScene))
        sceneControls.addOnLayoutChangeListener { _, l, _, r, _, _, _, _, _ ->
            val width = (r - l) / resources.displayMetrics.density
            val small = resources.configuration.screenWidthDp <= 700
            val gap = if (small) 4 else 6
            val group =
                if (small) 8
                else (resources.configuration.screenWidthDp * .02).toInt().coerceIn(10, 28)
            for (i in 0 until sceneControls.childCount) {
                val child = sceneControls.getChildAt(i)
                val lp = child.layoutParams as LinearLayout.LayoutParams
                val margin =
                    when (i) {
                        1,
                        8 -> group
                        2,
                        3,
                        4 -> if (small) 4 else 8
                        9 -> 0
                        else -> gap
                    }
                val cw = if (i == 4) 0 else dp(if (small) 36 else 42)
                if (lp.width != cw || lp.rightMargin != dp(margin)) {
                    lp.width = cw
                    lp.rightMargin = dp(margin)
                    child.layoutParams = lp
                }
            }
        }
        sceneLayer.addView(
            sceneControls,
            FrameLayout.LayoutParams(-1, dp(42)).apply {
                leftMargin = dp(12)
                rightMargin = dp(12)
                topMargin = dp(10)
            },
        )
        diagnosticsOverlay = FrameStatsView(this)
        grid.onFrame = { diagnosticsOverlay.frameDrawn() }
        scene.onFrame = { diagnosticsOverlay.frameDrawn() }
        screen.addView(
            diagnosticsOverlay,
            FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.RIGHT).apply {
                bottomMargin = dp(62)
                rightMargin = dp(8)
            },
        )
        setContentView(screen)
        immersive()
        app.observer = { refresh() }
        app.saveError = {
            hint("Не удалось сохранить автокопию. Проверь свободное место")
            error(it)
        }
        refresh()
        main.post(tick)
    }

    private fun Window.keepScreen(on: Boolean) {
        if (on) addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun hint(text: String) {
        status.text = text
        status.visibility = if (text.isEmpty() || inScene) View.GONE else View.VISIBLE
    }

    fun error(error: Throwable) {
        app.diagnostics.record("operation", error)
        hint(error.message ?: "Не удалось выполнить действие")
        message("Не получилось", error.message ?: "Попробуй ещё раз")
    }

    fun background(
        label: String,
        work: () -> Unit,
        done: () -> Unit = {},
        executor: java.util.concurrent.Executor = app.worker,
    ) {
        hint(label)
        executor.execute {
            runCatching(work)
                .onSuccess {
                    main.post {
                        if (!isDestroyed) {
                            done()
                            refresh()
                        }
                    }
                }
                .onFailure { e ->
                    main.post {
                        if (!isDestroyed) {
                            if (e is java.util.concurrent.CancellationException) hint("Отменено")
                            else error(e)
                        }
                    }
                }
        }
    }

    fun mutate(work: () -> Unit) {
        try {
            transport.stop()
            stopPreview()
            work()
            app.changed()
        } catch (e: Exception) {
            error(e)
        }
    }

    fun refresh() {
        if (!::status.isInitialized) return
        editorControls.isEnabled = app.ready
        grid.isEnabled = app.ready
        play.isEnabled = app.ready
        if (app.ready && !started) {
            started = true
            grid.resetView()
            hint("")
            showLauncher()
            app.startupError?.let(::error)
        }
        if (!app.ready && app.startupError != null)
            hint("Не удалось подготовить библиотеку: ${app.startupError?.message}")
        updateTransportControls()
        title.text = app.songName ?: "Нотка 2"
        if (app.ready)
            grid.instrumentMarks =
                app.banks.entries.associate { it.id to (InstrumentMarks.kind(it.gm) to it.short) }
        if (app.ready) {
            val missing =
                editor.project.lanes
                    .filter {
                        it.notes.isNotEmpty() &&
                            it.instrument == BankStore.FLOE &&
                            !app.banks.installed(it.instrument)
                    }
                    .map { editor.project.instrument(it).name }
                    .distinct()
            missingSounds.text = missing.joinToString("\n") { "Нет звука: $it. Скачать у автора ↗" }
            missingSounds.visibility = if (missing.isEmpty()) View.GONE else View.VISIBLE
        }
        grid.refresh()
        selectionChanged()
        if (inScene)
            scene.renderer = SceneRenderer(editor.project, editor.project.scene.flag("loop"))
    }

    private fun selectionChanged() {
        val notes = grid.selection()
        val bounds = grid.selectedBounds()
        selectionBar.visibility =
            if (
                notes.isEmpty() ||
                    inScene ||
                    launcher != null ||
                    transport.playing ||
                    grid.editingGesture ||
                    bounds == null
            )
                View.GONE
            else View.VISIBLE
        if (selectionBar.visibility != View.VISIBLE) return
        inspectorTitle.text =
            if (notes.size > 1) "Нот: ${notes.size}" else PianoGrid.noteName(notes.first().pitch)
        inspectorLength.text =
            if (notes.all { it.len == notes.first().len })
                "${"%.3f".format(java.util.Locale.US,notes.first().len/PPQ.toDouble()).trimEnd('0').trimEnd('.')} уд."
            else "Разная длина"
        volumeSlider.progress = notes.first().volume
        volumeValue.text =
            if (notes.all { it.volume == notes.first().volume }) "${notes.first().volume}%"
            else "Разная"
        selectionBar.post {
            if (bounds == null) return@post
            val xy = IntArray(2)
            grid.getLocationOnScreen(xy)
            val h = selectionBar.height
            val py = xy[1] + bounds.top - h - dp(5)
            selectionBar.x =
                (xy[0] + bounds.left).coerceIn(
                    dp(4).toFloat(),
                    maxOf(dp(4).toFloat(), screen.width - selectionBar.width - dp(4).toFloat()),
                )
            selectionBar.y =
                (if (py < dp(4)) xy[1] + bounds.bottom + dp(3) else py).coerceIn(
                    dp(4).toFloat(),
                    maxOf(dp(4).toFloat(), screen.height - h - dp(4).toFloat()),
                )
        }
    }

    private fun immersive() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    private fun updateTransportControls() {
        if (!::startButton.isInitialized) return
        val running = transport.playing || transport.preparing
        val playable = app.ready && editor.project.lanes.any { !it.muted && it.notes.isNotEmpty() }
        grid.isPlaying = running
        startButton.isEnabled = playable && !running
        visualButton.isEnabled = playable && !running
        play.isEnabled = playable || running
        laneButton.isEnabled = !running && app.ready
        minusButton.isEnabled = !running && editor.project.bpm > 40
        plusButton.isEnabled = !running && editor.project.bpm < 220
        bpmInput.isEnabled = !running
        if (!bpmInput.hasFocus()) bpmInput.setText(editor.project.bpm.toString())
        if (::sceneTransport.isInitialized) {
            sceneTransport.text = if (transport.playing) "Ⅱ" else "▶"
            val loop = editor.project.scene.flag("loop")
            sceneLoop.setTextColor(if (loop) 0xffbaf8e8.toInt() else 0xffe0eaf3.toInt())
            sceneLoop.background =
                shape(
                    if (loop) 0xff183d37.toInt() else 0xe0101b29.toInt(),
                    if (loop) 0xff62dfc4.toInt() else 0x35b6cce0,
                    11f,
                )
        }
        selectionChanged()
    }

    private fun setTempo(value: Int) {
        if (!transport.playing) mutate { editor.change { it.copy(bpm = value.coerceIn(40, 220)) } }
    }

    private fun commitTempo() {
        bpmInput.text.toString().toIntOrNull()?.let { setTempo(it) }
    }

    private fun startEditorPlayback(fromStart: Boolean) {
        stopPreview()
        transport.stop()
        transport.seek(if (fromStart) 0.0 else grid.leftTick * 60.0 / editor.project.bpm / PPQ)
        transport.play(editor.project, editor.revision)
    }

    private fun showLauncher() {
        transport.stop()
        stopPreview()
        grid.clearSelection()
        launcher?.let { screen.removeView(it) }
        launcher =
            ReferenceLauncher(
                this,
                onStart = { restore ->
                    launcher?.let { screen.removeView(it) }
                    launcher = null
                    if (!restore) {
                        app.startNew()
                        grid.resetView()
                    }
                    refresh()
                    immersive()
                },
                onSettings = ::settings,
                onUpdate = { UpdateManager(this).check() },
                hasDraft = app.restored || editor.project.endTick > 0,
            )
        screen.addView(launcher, FrameLayout.LayoutParams(-1, -1))
        selectionChanged()
    }

    private fun exitEditor() {
        transport.stop()
        stopPreview()
        app.flush(true)
        if (editor.project.endTick == 0L) {
            showLauncher()
            return
        }
        val box = column()
        lateinit var dialog: AlertDialog
        box.addButton("Сохранить и выйти") {
            dialog.dismiss()
            saveBeforeExit = true
            save(app.songName == null)
        }
        box.addButton("Выйти без сохранения") {
            dialog.dismiss()
            showLauncher()
        }
        box.addView(
            label("Без сохранения трек можно восстановить через «Загрузить последний трек».")
                .apply { setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f) }
        )
        dialog = sheet("Сохранить трек перед выходом?", box, close = "‹")
    }

    private var saveBeforeExit = false

    private fun menu() {
        if (!app.ready) return
        transport.stop()
        app.flush(true)
        val box = column()
        lateinit var d: AlertDialog
        box.addButton("Загрузить последний трек") {
            d.dismiss()
            background(
                "",
                {
                    val p = app.projects.readDraft()
                    main.post {
                        if (p != null) replace(p, app.projects.lastDraftName)
                        else hint("Автокопии пока нет")
                    }
                },
            )
        }
        box.addButton("Сохранить") {
            d.dismiss()
            save(false)
        }
        box.addButton("Сохранить как…") {
            d.dismiss()
            save(true)
        }
        box.addButton("Загрузить") {
            d.dismiss()
            openSaved()
        }
        box.addButton("Экспорт…") {
            d.dismiss()
            exportMenu()
        }
        d = sheet("", box, close = "✕")
    }

    private fun gridOptions() {
        if (transport.playing) return
        val box = column()
        val preview = GridPreview(this, { editor.project }, { grid.newNoteLength })
        box.addView(preview, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(12) })
        val view = fieldset("Вид сетки", 15f)
        view.selectRow(
            "Деление сетки",
            DIVISIONS.map { if (it == 0) "Как привязка" else if (it == 1) "1 удар" else "1/$it" },
            DIVISIONS.indexOf(editor.project.viewDivision),
        ) { i ->
            mutate { editor.change { it.copy(viewDivision = DIVISIONS[i]) } }
            preview.invalidate()
        }
        box.addView(view)
        val notes = fieldset("Размер нот", 15f)
        notes.selectRow(
            "Длина новой ноты",
            DIVISIONS.map { if (it == 0) "По сетке" else if (it == 1) "1 удар" else "1/$it" },
            DIVISIONS.indexOf(editor.project.noteDivision),
        ) { i ->
            grid.resetNoteTemplate()
            mutate { editor.change { it.copy(noteDivision = DIVISIONS[i]) } }
            preview.invalidate()
        }
        val snaps = DIVISIONS.drop(1) + 0
        notes.selectRow(
            "Привязка",
            snaps.map { if (it == 0) "Свободно" else if (it == 1) "1 удар" else "1/$it" },
            snaps.indexOf(editor.project.division),
        ) { i ->
            mutate { editor.change { it.copy(division = snaps[i]) } }
            preview.invalidate()
        }
        box.addView(notes, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        sheet("Сетка", box, 420, onClose = { app.flush(true) })
    }

    private fun lanes() {
        if (transport.playing) return
        val palette = ReferencePalette(this)
        val box = column()
        lateinit var dialog: AlertDialog
        fun rename(index: Int) {
            editor.selectLane(index)
            app.changed()
            val lane = editor.project.lane
            box.removeAllViews()
            box.addView(label("Название дорожки"))
            val name = field(lane.name)
            box.addView(name)
            val actions = row()
            actions.addView(
                button("Готово") {
                    val value = name.text.toString().trim()
                    if (value.isNotEmpty()) {
                        mutate {
                            editor.change {
                                it.replaceLane(index, it.lane.copy(name = value.take(48)))
                            }
                        }
                    }
                    dialog.dismiss()
                    lanes()
                },
                LinearLayout.LayoutParams(0, dp(43), 1f),
            )
            actions.addView(
                iconButton("trash", "Удалить дорожку") {
                        confirm("Удалить дорожку", "Удалить «${lane.name}»?") {
                            mutate { editor.deleteLane(index) }
                            dialog.dismiss()
                            lanes()
                        }
                    }
                    .apply { isEnabled = editor.project.lanes.size > 1 },
                LinearLayout.LayoutParams(dp(44), dp(43)).apply { leftMargin = dp(8) },
            )
            box.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
        }
        fun render() {
            box.removeAllViews()
            val header = row()
            header.addView(View(this), LinearLayout.LayoutParams(dp(48), 1))
            header.addView(
                label("Дорожка").apply {
                    theme { setTextColor(it.muted) }
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f)
                },
                LinearLayout.LayoutParams(0, dp(20), 1f),
            )
            for (text in listOf("Фон", "Звук")) header.addView(
                label(text).apply {
                    gravity = Gravity.CENTER
                    theme { setTextColor(it.muted) }
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f)
                },
                LinearLayout.LayoutParams(dp(48), dp(20)),
            )
            box.addView(header)
            editor.project.lanes.forEachIndexed { i, lane ->
                val current = i == editor.project.activeLane
                val mark = grid.instrumentMarks[lane.instrument] ?: (null to "Ин")
                val line =
                    row().apply {
                        setPadding(dp(3), dp(3), dp(3), dp(3))
                        background =
                            shape(
                                if (current) palette.panel else palette.bg,
                                if (current) palette.accent else palette.border,
                            )
                    }
                line.addView(
                    iconButton(
                            mark.first ?: "",
                            "Инструмент · ${lane.name} · ${editor.project.instrument(lane).name}",
                        ) {
                            editor.selectLane(i)
                            app.changed()
                            LibrarySheet(this)
                                .also { librarySheet = it }
                                .show {
                                    librarySheet = null
                                    render()
                                }
                        }
                        .apply {
                            background = shape(palette.raised, palette.border, 8f)
                            val icon =
                                ReferenceIcon(mark.first ?: "", palette.text).apply {
                                    setBounds(0, 0, dp(24), dp(24))
                                }
                            if (mark.first != null) {
                                setCompoundDrawables(null, icon, null, null)
                                setPadding(dp(10), dp(10), dp(10), dp(10))
                            } else {
                                text = mark.second
                                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                                setPadding(0, 0, 0, 0)
                            }
                        },
                    LinearLayout.LayoutParams(dp(44), dp(44)),
                )
                val name =
                    button(lane.name) {
                            editor.selectLane(i)
                            grid.template = null
                            grid.clearSelection()
                            app.changed()
                            dialog.dismiss()
                        }
                        .apply {
                            gravity = Gravity.CENTER_VERTICAL or Gravity.LEFT
                            background = null
                            setPadding(dp(5), 0, dp(5), 0)
                            maxLines = 1
                            ellipsize = android.text.TextUtils.TruncateAt.END
                            if (current) {
                                setTextColor(palette.accent)
                                setTypeface(typeface, Typeface.BOLD)
                            }
                            onHold(1000) { rename(i) }
                        }
                line.addView(
                    name,
                    LinearLayout.LayoutParams(0, dp(44), 1f).apply { leftMargin = dp(4) },
                )
                line.addView(
                    ReferenceCheck(this, lane.ghost, "Фон · ${lane.name}") { value ->
                            mutate {
                                editor.change { it.replaceLane(i, it.lanes[i].copy(ghost = value)) }
                            }
                        }
                        .apply { if (current && lane.ghost) alpha = .45f },
                    LinearLayout.LayoutParams(dp(44), dp(44)).apply { leftMargin = dp(4) },
                )
                line.addView(
                    ReferenceCheck(this, !lane.muted, "Звук · ${lane.name}") { value ->
                        mutate {
                            editor.change { it.replaceLane(i, it.lanes[i].copy(muted = !value)) }
                        }
                    },
                    LinearLayout.LayoutParams(dp(44), dp(44)).apply { leftMargin = dp(4) },
                )
                box.addView(
                    line,
                    LinearLayout.LayoutParams(-1, dp(51)).apply {
                        bottomMargin = if (i == editor.project.lanes.lastIndex) 0 else dp(6)
                    },
                )
            }
            box.addButton("＋") {
                mutate { editor.addLane() }
                render()
            }
            (box.getChildAt(box.childCount - 1).layoutParams as LinearLayout.LayoutParams)
                .topMargin = dp(10)
            (box.getChildAt(box.childCount - 1) as Button).setTextSize(
                TypedValue.COMPLEX_UNIT_DIP,
                26f,
            )
        }
        render()
        dialog = sheet("Дорожки", box, width = 460)
    }

    private fun openSaved() {
        val box = column()
        val list = column()
        val query =
            field("").apply {
                hint = "Найти трек…"
                visibility = View.GONE
            }
        lateinit var dialog: AlertDialog
        box.addButton("Поиск по названию") {
            query.visibility = if (query.visibility == View.GONE) View.VISIBLE else View.GONE
        }
        box.addView(query, LinearLayout.LayoutParams(-1, dp(42)).apply { topMargin = dp(8) })
        box.addView(list, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
        fun render(names: List<String>) {
            list.removeAllViews()
            val filter = query.text.toString().trim()
            if ("Memory".contains(filter, true))
                list.addButton("Memory") {
                    dialog.dismiss()
                    background(
                        "Открываю…",
                        {
                            val p =
                                assets.open("presets/memory.notka").use {
                                    ProjectCodec.decode(it.readBytes().toString(Charsets.UTF_8))
                                }
                            main.post { replace(p, null) }
                        },
                    )
                }
            for (name in names.filter { it.contains(filter, true) }) {
                val r = row()
                r.addView(
                    button(name) {
                        dialog.dismiss()
                        background(
                            "Открываю…",
                            {
                                val p = app.projects.load(name)
                                main.post { replace(p, name) }
                            },
                        )
                    },
                    LinearLayout.LayoutParams(0, dp(43), 1f),
                )
                r.addView(
                    iconButton("trash", "Удалить $name") {
                        confirm("Удалить трек?", name) {
                            background(
                                "",
                                { app.projects.delete(name) },
                                {
                                    openSaved()
                                    dialog.dismiss()
                                },
                            )
                        }
                    },
                    LinearLayout.LayoutParams(dp(43), dp(43)).apply { leftMargin = dp(8) },
                )
                list.addView(r, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })
            }
        }
        box.addButton("Импортировать старый файл .notka…") {
            dialog.dismiss()
            pick("*/*", 101)
        }
        dialog = sheet("Загрузить трек", box, close = "✕")
        background(
            "",
            {
                val names = app.projects.list()
                main.post {
                    if (dialog.isShowing) {
                        render(names)
                        query.onTextChanged { render(names) }
                    }
                }
            },
        )
    }

    private fun save(asNew: Boolean) {
        if (!asNew && app.songName != null) {
            saveName(app.songName!!, true)
            return
        }
        val box = column()
        box.addView(label("Название трека"))
        val input =
            field(app.songName ?: "").apply {
                hint = "Например, Вечер"
                filters = arrayOf(android.text.InputFilter.LengthFilter(80))
            }
        box.addView(input)
        lateinit var d: AlertDialog
        box.addButton("Сохранить трек") {
            val name = input.text.toString().trim()
            runCatching {
                    if (app.projects.exists(name))
                        confirm("Заменить трек", "Сохранить поверх «$name»?") {
                            d.dismiss()
                            saveName(name, true)
                        }
                    else {
                        d.dismiss()
                        saveName(name, false)
                    }
                }
                .onFailure(::error)
        }
        d = sheet(if (asNew) "Сохранить как…" else "Сохранить", box, close = "✕")
    }

    private fun saveName(name: String, overwrite: Boolean) {
        val p = editor.project
        background(
            "Сохраняю…",
            { app.projects.save(name, p, overwrite) },
            {
                app.songName = name
                if (saveBeforeExit) {
                    saveBeforeExit = false
                    showLauncher()
                }
                app.flush(true)
                hint("Сохранено: $name")
            },
        )
    }

    private fun replace(p: Project, name: String?) {
        val open = {
            mutate {
                editor.load(p)
                app.songName = name
            }
            grid.resetView()
            hint("")
        }
        if (editor.project.endTick == 0L) open()
        else confirm("Заменить трек", "Заменить открытый трек?", open)
    }

    fun pick(type: String, code: Int) {
        stopPreview()
        startActivityForResult(
            Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type),
            code,
        )
    }

    private fun exportMenu() {
        val box = column()
        box.addView(label("Название"))
        val name =
            field(app.songName ?: "Мой трек").apply {
                filters = arrayOf(android.text.InputFilter.LengthFilter(48))
            }
        box.addView(name)
        var includeMuted = false
        box.addView(
            row().apply {
                val text = "Включить выключенные дорожки"
                addView(
                    ReferenceCheck(this@MainActivity, false, text) { includeMuted = it },
                    LinearLayout.LayoutParams(dp(26), dp(34)),
                )
                addView(
                    label(text),
                    LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(6) },
                )
            }
        )
        fun title() = name.text.toString().trim().ifEmpty { "Мой трек" }
        lateinit var dialog: AlertDialog
        box.addButton("Для Нотки · .notka") {
            saveDocument(
                "${title()}.notka",
                "application/json",
                ProjectCodec.encode(editor.project).toByteArray(),
            )
        }
        box.addButton("MIDI · FL Studio / Embers") {
            runCatching {
                    val p =
                        if (includeMuted)
                            editor.project.copy(
                                lanes = editor.project.lanes.map { it.copy(muted = false) }
                            )
                        else editor.project
                    Midi.encode(p, title(), app.banks.entries.associate { it.id to it.gm })
                }
                .onSuccess { saveDocument("${title()}.mid", "audio/midi", it) }
                .onFailure(::error)
        }
        box.addButton("ZIP · ноты и звук по дорожкам") {
            val options =
                studio.notka.next.export.ExportOptions(
                    type = "zip",
                    rate = 32000,
                    includeMuted = includeMuted,
                )
            ExportSheet(this).chooseFile(options, title())
            dialog.dismiss()
        }
        dialog = sheet("Экспорт", box, close = "✕")
    }

    fun saveDocument(name: String, mime: String, bytes: ByteArray) {
        pendingBytes = bytes
        startActivityForResult(
            Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime)
                .putExtra(Intent.EXTRA_TITLE, name),
            102,
        )
    }

    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        val uri = data?.data
        if (result != RESULT_OK || uri == null) {
            if (request == 102) pendingBytes = null
            return
        }
        when (request) {
            101 ->
                background(
                    "Читаю трек…",
                    {
                        val p =
                            contentResolver.openInputStream(uri)!!.use {
                                ProjectCodec.decode(
                                    it.readBounded(ProjectCodec.MAX_FILE_BYTES)
                                        .toString(Charsets.UTF_8)
                                )
                            }
                        main.post { replace(p, null) }
                    },
                )
            102 -> {
                val bytes = pendingBytes ?: return
                pendingBytes = null
                background(
                    "Записываю файл…",
                    { contentResolver.openOutputStream(uri, "wt")!!.use { it.write(bytes) } },
                    { hint("Файл сохранён") },
                )
            }
            103 -> (librarySheet ?: LibrarySheet(this)).importFloe(uri)
            104 -> {
                val options = getSharedPreferences("export", 0).getString("pending", null) ?: return
                runCatching {
                    contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
                    )
                }
                runCatching {
                        ExportService.launch(this, editor.project, uri, options)
                        hint("Экспорт запущен. Прогресс — в уведомлении")
                    }
                    .onFailure(::error)
            }
        }
    }

    fun enterScene() {
        transport.stop()
        stopPreview()
        inScene = true
        sceneHud = true
        scene.renderer = SceneRenderer(editor.project, editor.project.scene.flag("loop"))
        sceneLayer.visibility = View.VISIBLE
        root.visibility = View.GONE
        sceneWasPortrait =
            resources.configuration.orientation ==
                android.content.res.Configuration.ORIENTATION_PORTRAIT
        requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        scene.visibility = View.VISIBLE
        grid.visibility = View.GONE
        editorControls.visibility = View.GONE
        sceneControls.visibility = View.VISIBLE
        selectionChanged()
        applySceneHud()
        transport.play(
            editor.project,
            editor.revision,
            visual = true,
            leadIn = 3.6 / editor.project.scene.number("speed"),
        )
    }

    private fun leaveScene() {
        transport.pause()
        inScene = false
        sceneHud = true
        sceneLayer.visibility = View.GONE
        root.visibility = View.VISIBLE
        requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        scene.visibility = View.GONE
        grid.visibility = View.VISIBLE
        editorControls.visibility = View.VISIBLE
        sceneControls.visibility = View.GONE
        selectionChanged()
        applySceneHud()
    }

    private fun applySceneHud() {
        scene.hud = inScene && sceneHud
        sceneControls.visibility = if (inScene && sceneHud) View.VISIBLE else View.GONE
        immersive()
    }

    private fun applySystemBarContrast() {
        val light = lightSystemBars && !inScene
        if (Build.VERSION.SDK_INT >= 30) {
            val mask =
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (light) mask else 0, mask)
        } else {
            var flags = window.decorView.systemUiVisibility
            if (Build.VERSION.SDK_INT >= 23) {
                flags = flags and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
                if (light) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            }
            if (Build.VERSION.SDK_INT >= 26) {
                flags = flags and View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR.inv()
                if (light) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            window.decorView.systemUiVisibility = flags
        }
    }

    private fun musicalDuration() =
        (editor.project.lanes
            .filter { !it.muted }
            .maxOfOrNull { lane -> lane.notes.maxOfOrNull { it.end } ?: 0L } ?: 0L) * 60.0 /
            editor.project.bpm /
            PPQ

    private fun formatTime(seconds: Double) =
        "${seconds.coerceAtLeast(0.0).toInt()/60}:${(seconds.coerceAtLeast(0.0).toInt()%60).toString().padStart(2,'0')}"

    fun stopPreview() {
        previewSerial++
        previewAudio?.close()
        previewAudio = null
        media?.release()
        media = null
        if (::transport.isInitialized) transport.endAudition()
    }

    fun previewNote(pitch: Int, volume: Int) {
        if (transport.playing || !app.ready) return
        val instrument = editor.project.instrument(editor.project.lane)
        previewInstrument(instrument, pitch, volume)
    }

    fun previewInstrument(
        instrument: Instrument,
        pitch: Int,
        volume: Int = 100,
        seconds: Double = .6,
    ) {
        val project =
            Project(
                instruments = listOf(instrument),
                lanes =
                    listOf(
                        Lane(
                            1,
                            "Пример",
                            instrument.id,
                            instrument.source,
                            listOf(Note(1, 0, (seconds * 100 * PPQ / 60).toLong(), pitch, volume)),
                        )
                    ),
            )
        playPreviewProject(project)
    }

    fun playPreviewProject(project: Project, onReady: (NativeAudio) -> Unit = {}) {
        stopPreview()
        transport.pause()
        val token = previewSerial
        app.worker.execute {
            val result = runCatching { NativeAudio.build(project, app.banks) }
            main.post {
                if (isDestroyed || token != previewSerial) {
                    result.getOrNull()?.close()
                    return@post
                }
                result
                    .onSuccess {
                        previewAudio = it
                        runCatching {
                                check(transport.auditionFocus()) {
                                    "Другое приложение сейчас использует звук"
                                }
                                onReady(it)
                                it.play()
                            }
                            .onFailure(::error)
                        main.postDelayed(
                            { if (token == previewSerial) stopPreview() },
                            (it.duration * 1000).toLong() + 250,
                        )
                    }
                    .onFailure(::error)
            }
        }
    }

    fun playPreview(file: java.io.File) {
        stopPreview()
        transport.pause()
        media =
            MediaPlayer().apply {
                setDataSource(file.path)
                setOnCompletionListener { stopPreview() }
                setOnPreparedListener { player ->
                    if (transport.auditionFocus()) player.start()
                    else {
                        stopPreview()
                        hint("Другое приложение сейчас использует звук")
                    }
                }
                setOnErrorListener { _, _, _ ->
                    stopPreview()
                    hint("Не удалось проиграть пример")
                    true
                }
                prepareAsync()
            }
    }

    fun applyTheme() {
        val palette = ReferencePalette(this)
        screen.setBackgroundColor(palette.bg)
        applyPalette(root, palette)
        applyPalette(selectionBar, palette)
        launcher?.let { applyPalette(it, palette) }
        grid.palette = palette
        grid.invalidate()
    }

    private fun settings() {
        if (isFinishing || isDestroyed) return
        val box = column()
        lateinit var d: AlertDialog
        box.addButton("Скачанные файлы") {
            d.dismiss()
            FileSheet(this).show { settings() }
        }
        box.addButton("Темы") {
            d.dismiss()
            ThemeSheet(this).show { settings() }
        }
        box.addButton("Диагностика") {
            d.dismiss()
            diagnosticsSettings()
        }
        box.addButton("Страница выпусков ↗") {
            startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://github.com/Vang1549/Notka/releases"),
                )
            )
        }
        d = sheet("Настройки панели", box, width = 385, close = "✕", panel = true)
    }

    private fun diagnosticsSettings() {
        val prefs = getSharedPreferences("settings", 0)
        val box = column()
        box.checkRow("Записывать диагностику", app.diagnostics.enabled) {
            app.diagnostics.enabled = it
        }
        box.checkRow(
            "Показывать показатели на экране",
            prefs.getBoolean("diagnosticsOverlay", false),
        ) {
            prefs.edit().putBoolean("diagnosticsOverlay", it).apply()
        }
        box.addView(
            label(
                    "FPS редактора, интервалы экрана, память приложения и ошибки редактора. Отчёт хранится на телефоне; отправить его можно вручную."
                )
                .apply { setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f) }
        )
        val summary =
            label(app.diagnostics.report()).apply { setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f) }
        box.addView(summary)
        box.addButton("Скачать отчёт") {
            saveDocument(
                "Notka-diagnostics.txt",
                "text/plain",
                app.diagnostics.report().toByteArray(),
            )
        }
        box.addButton("Удалить отчёт") {
            app.diagnostics.clear()
            summary.text = app.diagnostics.report()
        }
        sheet("Диагностика", box, width = 385, close = "‹", panel = true) { settings() }
    }

    override fun onStop() {
        super.onStop()
        if (::transport.isInitialized) transport.pause()
        stopPreview()
        app.flush()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        stopPreview()
        transport.close()
        app.observer = {}
        app.saveError = {}
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (inScene) leaveScene()
        else if (volumeRow.visibility == View.VISIBLE) volumeRow.visibility = View.GONE
        else if (grid.selected.isNotEmpty()) grid.clearSelection()
        else {
            app.flush()
            if (launcher != null) super.onBackPressed() else exitEditor()
        }
    }
}

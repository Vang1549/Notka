package studio.notka.next

import android.app.*
import android.content.*
import android.graphics.Color
import android.media.MediaPlayer
import android.os.*
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

    private lateinit var root: LinearLayout
    private lateinit var topBar: LinearLayout
    private lateinit var body: FrameLayout
    private lateinit var scene: SceneView
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
    private var clipboard = emptyList<Note>()
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
                } else if (transport.playing) grid.invalidate()
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
                    if (transport.preparing) "…" else if (transport.playing) "Пауза" else "Играть"
                window.keepScreen(transport.playing)
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
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val background =
            runCatching {
                    Color.parseColor(
                        prefs.getString(
                            "background",
                            if (prefs.getString("theme", "dark") == "light") "#f2f4ee"
                            else "#121a15",
                        )
                    )
                }
                .getOrDefault(Color.rgb(18, 26, 21))
        root.setBackgroundColor(background)
        lightSystemBars =
            Color.red(background) * 0.299 +
                Color.green(background) * 0.587 +
                Color.blue(background) * 0.114 > 150
        window.statusBarColor = background
        window.navigationBarColor = background
        root.setOnApplyWindowInsetsListener { v, insets ->
            v.setPadding(
                insets.systemWindowInsetLeft,
                insets.systemWindowInsetTop,
                insets.systemWindowInsetRight,
                insets.systemWindowInsetBottom,
            )
            insets
        }
        val top = row()
        topBar = top
        top.addView(
            button("☰", ::menu).apply { contentDescription = "Меню" },
            LinearLayout.LayoutParams(dp(50), dp(48)),
        )
        title =
            label("Нотка 2").apply {
                textSize = 17f
                maxLines = 1
                setPadding(dp(4), 0, 0, 0)
            }
        top.addView(title, LinearLayout.LayoutParams(0, dp(48), 1f))
        top.addView(
            button("↶") { mutate { editor.undo() } }.apply { contentDescription = "Отменить" },
            LinearLayout.LayoutParams(dp(44), dp(48)),
        )
        top.addView(
            button("↷") { mutate { editor.redo() } }.apply { contentDescription = "Повторить" },
            LinearLayout.LayoutParams(dp(44), dp(48)),
        )
        play =
            button("Играть") {
                if (transport.playing || transport.preparing) transport.pause()
                else {
                    stopPreview()
                    if (!inScene && !transport.canResume(editor.revision))
                        transport.seek(grid.leftTick * 60.0 / editor.project.bpm / PPQ)
                    transport.play(editor.project, editor.revision)
                }
            }
        top.addView(play, LinearLayout.LayoutParams(dp(90), dp(48)))
        root.addView(top)
        editorControls = column().apply { setPadding(dp(4), 0, dp(4), 0) }
        val row1 = row()
        laneButton = button("Дорожки", ::lanes)
        row1.addView(laneButton, LinearLayout.LayoutParams(0, dp(46), 1f))
        row1.addView(
            button("Инструменты") { if (app.ready) LibrarySheet(this).show() },
            LinearLayout.LayoutParams(0, dp(46), 1f),
        )
        row1.addView(button("Сцена") { enterScene() }, LinearLayout.LayoutParams(dp(80), dp(46)))
        editorControls.addView(row1)
        val row2 = row()
        row2.addView(
            button("Темп") {
                prompt("Темп · 40–220", editor.project.bpm.toString(), true) { value ->
                    mutate { editor.change { it.copy(bpm = value.toInt()) } }
                }
            },
            LinearLayout.LayoutParams(0, dp(42), 1f),
        )
        row2.addView(button("Сетка") { gridOptions() }, LinearLayout.LayoutParams(0, dp(42), 1f))
        row2.addView(
            button("Выделить") {
                grid.selectionMode = !grid.selectionMode
                hint(
                    if (grid.selectionMode) "Обведи ноты для выделения"
                    else "Добавление нот включено"
                )
            },
            LinearLayout.LayoutParams(0, dp(42), 1f),
        )
        editorControls.addView(row2)
        root.addView(editorControls)
        body = FrameLayout(this)
        grid = PianoGrid(this, editor)
        grid.surfaceColor = background
        grid.inkColor =
            if (prefs.getString("theme", "dark") == "light") Color.DKGRAY
            else Color.rgb(224, 232, 224)
        grid.accent =
            runCatching { Color.parseColor(prefs.getString("accent", "#beee95")) }
                .getOrDefault(Color.rgb(190, 238, 149))
        grid.onChange = {
            transport.stop()
            app.changed()
        }
        grid.onSelection = ::selectionChanged
        grid.onPreview = ::previewNote
        grid.onSeek = { seconds -> transport.seek(seconds) }
        body.addView(grid, FrameLayout.LayoutParams(-1, -1))
        scene =
            SceneView(this).apply {
                visibility = View.GONE
                setOnClickListener {
                    if (inScene) {
                        sceneHud = !sceneHud
                        applySceneHud()
                    }
                }
            }
        body.addView(scene, FrameLayout.LayoutParams(-1, -1))
        root.addView(body, LinearLayout.LayoutParams(-1, 0, 1f))
        selectionBar = row()
        selectionBar.addButton("Копия") {
            clipboard = grid.selection()
            hint("Скопировано нот: ${clipboard.size}")
        }
        selectionBar.addButton("Изменить") { noteOptions() }
        selectionBar.addButton("Удалить") {
            mutate { editor.deleteNotes(grid.selected) }
            grid.clearSelection()
        }
        selectionBar.addButton("×") { grid.clearSelection() }
        selectionBar.visibility = View.GONE
        root.addView(HorizontalScrollView(this).apply { addView(selectionBar) })
        sceneControls =
            column().apply {
                setPadding(dp(4), 0, dp(4), 0)
                visibility = View.GONE
            }
        timeline =
            SeekBar(this).apply {
                max = 1000
                setOnSeekBarChangeListener(
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
            }
        sceneControls.addView(timeline)
        val sceneRow = row()
        sceneRow.addButton("Назад") { leaveScene() }
        sceneRow.addButton("−1 с") { transport.seek(transport.position - 1) }
        sceneRow.addButton("−10 с") { transport.seek(transport.position - 10) }
        sceneRow.addButton("+10 с") { transport.seek(transport.position + 10) }
        sceneRow.addButton("+1 с") { transport.seek(transport.position + 1) }
        sceneRow.addButton("Поворот") {
            choice("Ориентация", listOf("Автоматически", "Вертикально", "Горизонтально")) { index ->
                requestedOrientation =
                    listOf(
                        android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED,
                        android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT,
                        android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE,
                    )[index]
            }
        }
        sceneRow.addButton("Вид") { SceneSheet(this).show() }
        sceneControls.addView(HorizontalScrollView(this).apply { addView(sceneRow) })
        root.addView(sceneControls)
        status =
            label("Подготовка…").apply {
                textSize = 12f
                setPadding(dp(10), dp(2), dp(10), dp(4))
                maxLines = 2
            }
        root.addView(status)
        setContentView(root)
        root.post { applySystemBarContrast() }
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
            hint(
                if (app.restored) "Восстановлена автокопия"
                else "Коснись сетки, чтобы добавить ноту. Масштаб — двумя пальцами"
            )
            app.startupError?.let(::error)
        }
        if (!app.ready && app.startupError != null)
            hint("Не удалось подготовить библиотеку: ${app.startupError?.message}")
        laneButton.text = editor.project.lane.name
        title.text = app.songName ?: "Нотка 2"
        grid.refresh()
        selectionChanged()
        if (inScene)
            scene.renderer = SceneRenderer(editor.project, editor.project.scene.flag("loop"))
    }

    private fun selectionChanged() {
        selectionBar.visibility =
            if (grid.selected.isNotEmpty() && !inScene) View.VISIBLE else View.GONE
    }

    private fun menu() {
        if (!app.ready) return
        choice(
            "Нотка 2",
            listOf(
                "Новый трек",
                "Открыть сохранённый",
                "Импорт .notka",
                "Сохранить",
                "Сохранить как…",
                "Экспорт",
                "Вставить ноты",
                "Выделить все ноты",
                "Добавить ноту…",
                "Memory",
                "Вид сцены",
                "Настройки и обновления",
            ),
        ) { i ->
            when (i) {
                0 ->
                    confirm(
                        "Новый трек",
                        "Создать пустой трек? Автокопия текущего будет заменена. Чтобы оставить его, сначала сохрани.",
                    ) {
                        app.flush()
                        mutate {
                            editor.load(Project())
                            app.songName = null
                        }
                        grid.resetView()
                    }
                1 -> openSaved()
                2 -> pick("*/*", 101)
                3 -> save(false)
                4 -> save(true)
                5 -> exportMenu()
                6 -> mutate { editor.paste(clipboard, grid.leftTick) }
                7 -> grid.selectAll()
                8 -> addNoteForm()
                9 ->
                    background(
                        "Открываю Memory…",
                        {
                            val p =
                                ProjectCodec.decode(
                                    assets.open("presets/memory.notka").bufferedReader().use {
                                        it.readText()
                                    }
                                )
                            main.post { replace(p, null) }
                        },
                    )
                10 -> SceneSheet(this).show()
                11 -> settings()
            }
        }
    }

    private fun gridOptions() {
        val box = column()
        val values = DIVISIONS.map { if (it == 0) "Авто / свободно" else "1/$it" }
        val fields = mutableListOf<Spinner>()
        listOf(
                "Привязка" to editor.project.division,
                "Длина новой ноты" to editor.project.noteDivision,
                "Линии сетки" to editor.project.viewDivision,
            )
            .forEach { (name, value) ->
                box.addView(label(name))
                val s =
                    Spinner(this).apply {
                        adapter =
                            ArrayAdapter(
                                this@MainActivity,
                                android.R.layout.simple_spinner_dropdown_item,
                                values,
                            )
                        setSelection(DIVISIONS.indexOf(value))
                    }
                fields.add(s)
                box.addView(s)
            }
        form("Сетка", box) {
            mutate {
                editor.change {
                    it.copy(
                        division = DIVISIONS[fields[0].selectedItemPosition],
                        noteDivision = DIVISIONS[fields[1].selectedItemPosition],
                        viewDivision = DIVISIONS[fields[2].selectedItemPosition],
                    )
                }
            }
        }
    }

    private fun addNoteForm() {
        val box = column()
        val fields =
            listOf(
                    "Высота MIDI · 24–119" to "60",
                    "Начало · доли" to (grid.leftTick / PPQ.toDouble()).toString(),
                    "Длина · доли" to "1",
                    "Громкость · 0–100" to "100",
                )
                .map { (name, v) ->
                    box.addView(label(name))
                    field(v, true).also { box.addView(it) }
                }
        form("Новая нота", box) {
            val p = fields[0].text.toString().toInt()
            val start = (fields[1].text.toString().uiNumber() * PPQ).toLong()
            val len = (fields[2].text.toString().uiNumber() * PPQ).toLong()
            val volume = fields[3].text.toString().toInt()
            mutate { editor.addNote(start, p, len, volume) }
        }
    }

    private fun noteOptions() {
        val notes = grid.selection()
        if (notes.isEmpty()) return
        val box = column()
        box.addView(label("Громкость · 0–100"))
        val volume = field(notes.first().volume.toString(), true)
        box.addView(volume)
        box.addView(label("Сдвиг высоты · полутоны"))
        val pitch = field("0", true)
        box.addView(pitch)
        box.addView(label("Длина · доли (пусто — сохранить)"))
        val length =
            field(if (notes.size == 1) (notes[0].len / PPQ.toDouble()).toString() else "", true)
        box.addView(length)
        form("Ноты: ${notes.size}", box) {
            val v = volume.text.toString().toInt()
            val delta = pitch.text.toString().toInt()
            val len =
                length.text.toString().takeIf { it.isNotBlank() }?.uiNumber()?.times(PPQ)?.toLong()
            mutate {
                editor.updateNotes(grid.selected) {
                    it.copy(volume = v, pitch = it.pitch + delta, len = len ?: it.len)
                }
            }
        }
    }

    private fun lanes() {
        val box = column()
        lateinit var dialog: AlertDialog
        fun render() {
            box.removeAllViews()
            editor.project.lanes.forEachIndexed { i, lane ->
                val line = row()
                line.addView(
                    button((if (i == editor.project.activeLane) "● " else "") + lane.name) {
                        transport.stop()
                        editor.selectLane(i)
                        app.changed()
                        grid.resetView()
                        dialog.dismiss()
                    },
                    LinearLayout.LayoutParams(0, dp(48), 1f),
                )
                line.addView(
                    button("⋮") {
                        choice(
                            lane.name,
                            listOf(
                                "Переименовать",
                                "${if(lane.muted)"Включить"else"Выключить"} звук",
                                "${if(lane.ghost)"Скрыть"else"Показывать"} фоном",
                                "Выше",
                                "Ниже",
                                "Удалить",
                            ),
                        ) { action ->
                            when (action) {
                                0 ->
                                    prompt("Имя дорожки", lane.name) { name ->
                                        mutate {
                                            editor.change { p ->
                                                p.replaceLane(i, p.lanes[i].copy(name = name))
                                            }
                                        }
                                        render()
                                    }
                                1 ->
                                    mutate {
                                        editor.change { p ->
                                            p.replaceLane(
                                                i,
                                                p.lanes[i].copy(muted = !p.lanes[i].muted),
                                            )
                                        }
                                    }
                                2 ->
                                    mutate {
                                        editor.change { p ->
                                            p.replaceLane(
                                                i,
                                                p.lanes[i].copy(ghost = !p.lanes[i].ghost),
                                            )
                                        }
                                    }
                                3 -> mutate { editor.moveLane(i, -1) }
                                4 -> mutate { editor.moveLane(i, 1) }
                                5 ->
                                    confirm(
                                        "Удалить дорожку",
                                        "Будут удалены ноты дорожки «${lane.name}»",
                                    ) {
                                        mutate { editor.deleteLane(i) }
                                        render()
                                    }
                            }
                            render()
                        }
                    }
                )
                box.addView(line)
            }
            box.addButton("+ Дорожка") {
                mutate { editor.addLane() }
                render()
            }
        }
        dialog =
            AlertDialog.Builder(this)
                .setTitle("Дорожки")
                .setView(ScrollView(this).apply { addView(box) })
                .setPositiveButton("Закрыть", null)
                .create()
        render()
        dialog.show()
    }

    private fun openSaved() {
        background(
            "Читаю список…",
            {
                val names = app.projects.list()
                main.post {
                    if (isDestroyed) return@post
                    if (names.isEmpty()) message("Треки", "Сохранённых треков пока нет")
                    else
                        choice("Сохранённые треки", names) { i ->
                            choice(names[i], listOf("Открыть", "Удалить")) { action ->
                                if (action == 0)
                                    background(
                                        "Открываю…",
                                        {
                                            val project = app.projects.load(names[i])
                                            main.post {
                                                if (!isDestroyed) replace(project, names[i])
                                            }
                                        },
                                    )
                                else
                                    confirm("Удалить файл", names[i]) {
                                        background(
                                            "Удаляю…",
                                            { app.projects.delete(names[i]) },
                                            { hint("Файл удалён") },
                                        )
                                    }
                            }
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
        prompt("Название трека", app.songName ?: "Мой трек") { name ->
            if (app.projects.exists(name))
                confirm("Заменить файл", "Сохранить поверх «$name»?") { saveName(name, true) }
            else saveName(name, false)
        }
    }

    private fun saveName(name: String, overwrite: Boolean) {
        val p = editor.project
        background(
            "Сохраняю…",
            { app.projects.save(name, p, overwrite) },
            {
                app.songName = name
                app.flush(true)
                hint("Сохранено: $name")
            },
        )
    }

    private fun replace(p: Project, name: String?) {
        confirm("Открыть трек", "Заменить открытый трек? Его автокопия будет обновлена.") {
            mutate {
                editor.load(p)
                app.songName = name
            }
            grid.resetView()
            hint("Трек открыт")
        }
    }

    fun pick(type: String, code: Int) {
        stopPreview()
        startActivityForResult(
            Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type),
            code,
        )
    }

    private fun exportMenu() {
        choice(
            "Экспорт",
            listOf("Проект .notka", "MIDI", "WAV", "Архив с дорожками", "Аудио / видео"),
        ) { i ->
            when (i) {
                0 ->
                    saveDocument(
                        "${app.songName?:"Мой трек"}.notka",
                        "application/json",
                        ProjectCodec.encode(editor.project).toByteArray(),
                    )
                1 ->
                    runCatching {
                            Midi.encode(
                                editor.project,
                                app.songName ?: "Мой трек",
                                app.banks.entries.associate { it.id to it.gm },
                            )
                        }
                        .onSuccess {
                            saveDocument("${app.songName?:"Мой трек"}.mid", "audio/midi", it)
                        }
                        .onFailure(::error)
                2 -> ExportSheet(this).show("wav")
                3 -> ExportSheet(this).show("zip")
                4 -> ExportSheet(this).show()
            }
        }
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
            103 -> LibrarySheet(this).importFloe(uri)
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
        scene.visibility = View.VISIBLE
        grid.visibility = View.GONE
        editorControls.visibility = View.GONE
        sceneControls.visibility = View.VISIBLE
        selectionChanged()
        applySceneHud()
        transport.play(editor.project, editor.revision)
    }

    private fun leaveScene() {
        transport.pause()
        inScene = false
        sceneHud = true
        scene.visibility = View.GONE
        grid.visibility = View.VISIBLE
        editorControls.visibility = View.VISIBLE
        sceneControls.visibility = View.GONE
        selectionChanged()
        applySceneHud()
    }

    private fun applySceneHud() {
        val show = !inScene || sceneHud
        topBar.visibility = if (show) View.VISIBLE else View.GONE
        status.visibility = if (show) View.VISIBLE else View.GONE
        sceneControls.visibility = if (inScene && show) View.VISIBLE else View.GONE
        window.decorView.systemUiVisibility =
            if (inScene && !show)
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            else 0
        applySystemBarContrast()
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

    fun previewInstrument(instrument: Instrument, pitch: Int, volume: Int = 100) {
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
                            listOf(Note(1, 0, 960, pitch, volume)),
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
                                it.play()
                                onReady(it)
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

    private fun settings() {
        choice(
            "Настройки",
            listOf(
                "Тема и цвета",
                "Проверить обновления",
                "Диагностика: ${if(app.diagnostics.enabled)"включена"else"выключена"}",
                "Сохранить отчёт",
                "Лицензии",
                "О приложении",
            ),
        ) { i ->
            when (i) {
                0 -> theme()
                1 -> UpdateManager(this).check()
                2 -> {
                    app.diagnostics.enabled = !app.diagnostics.enabled
                    hint("Диагностика ${if(app.diagnostics.enabled)"включена"else"выключена"}")
                }
                3 ->
                    saveDocument(
                        "Notka2-diagnostics.txt",
                        "text/plain",
                        app.diagnostics.report().toByteArray(),
                    )
                4 ->
                    background(
                        "Открываю лицензии…",
                        {
                            val text =
                                listOf("VSCO", "MDA", "GeneralUser", "Oboe", "Kotlin", "LLVM")
                                    .joinToString("\n\n") { name ->
                                        "$name\n" +
                                            assets.open("licenses/$name.txt").bufferedReader().use {
                                                it.readText()
                                            }
                                    }
                            main.post { message("Лицензии звуков", text) }
                        },
                    )
                5 ->
                    message(
                        "Нотка 2",
                        "${BuildConfig.VERSION_NAME}\nОтдельное приложение для Android.\nИсходники: github.com/Vang1549/Notka\nПрежняя Нотка 0.70 завершена и остаётся отдельным приложением.",
                    )
            }
        }
    }

    private fun theme() {
        val prefs = getSharedPreferences("settings", 0)
        val box = column()
        val light =
            CheckBox(this).apply {
                text = "Светлая тема"
                isChecked = prefs.getString("theme", "dark") == "light"
            }
        box.addView(light)
        box.addView(label("Цвет нот · #RRGGBB"))
        val accent = field(prefs.getString("accent", "#beee95")!!)
        box.addView(accent)
        box.addView(label("Фон · #RRGGBB (пусто — цвет темы)"))
        val bg = field(prefs.getString("background", "")!!)
        box.addView(bg)
        form("Тема", box) {
            Color.parseColor(accent.text.toString())
            if (bg.text.isNotBlank()) Color.parseColor(bg.text.toString())
            prefs
                .edit()
                .putString("theme", if (light.isChecked) "light" else "dark")
                .putString("accent", accent.text.toString())
                .apply()
            if (bg.text.isBlank()) prefs.edit().remove("background").apply()
            else prefs.edit().putString("background", bg.text.toString()).apply()
            recreate()
        }
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
        else if (grid.selected.isNotEmpty()) grid.clearSelection()
        else {
            app.flush()
            super.onBackPressed()
        }
    }
}

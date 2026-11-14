package studio.notka.next.ui

import android.app.AlertDialog
import android.content.Intent
import android.graphics.*
import android.net.Uri
import android.util.TypedValue
import android.view.*
import android.widget.*
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.*
import studio.notka.core.*
import studio.notka.next.MainActivity
import studio.notka.next.data.*

/** Editor 0.80's current instrument, library and immediate sound editor. */
class LibrarySheet(private val activity: MainActivity) {
    private val banks
        get() = activity.app.banks

    private val editor
        get() = activity.editor

    private lateinit var content: LinearLayout
    private var dialog: AlertDialog? = null
    private var closed = AtomicBoolean(false)
    private var downloadCancel = AtomicBoolean(false)
    private var downloading: String? = null
    private var query = ""
    private var category = -2
    private var editing: String? = null
    private var libraryList: LinearLayout? = null
    private var currentRow: LinearLayout? = null
    private var status: TextView? = null
    private val groups =
        listOf(
            "Клавишные",
            "Колокольчики и шкатулки",
            "Органы",
            "Гитары",
            "Басы",
            "Струнные",
            "Медные духовые",
            "Деревянные духовые",
            "Синтезаторы",
            "Народные",
            "Ударные",
            "Прочее",
        )

    private fun group(gm: Int) =
        when {
            gm < 8 -> 0
            gm < 16 -> 1
            gm < 24 -> 2
            gm < 32 -> 3
            gm < 40 -> 4
            gm < 56 -> 5
            gm < 64 -> 6
            gm < 80 -> 7
            gm < 104 -> 8
            gm < 112 -> 9
            gm < 120 -> 10
            else -> 11
        }

    private fun aliases(gm: Int) =
        when (gm) {
            0 -> "piano пианино рояль"
            10 -> "music box musicbox шкатулка"
            32 -> "bass контрабас"
            40 -> "violin скрипка"
            56 -> "trumpet труба"
            73 -> "flute флейта"
            else -> ""
        }

    private fun normalized(s: String) = s.lowercase().replace('ё', 'е').trim()

    fun show(onClose: () -> Unit = {}): Unit =
        with(activity) {
            transport.stop()
            grid.clearSelection()
            content = column()
            library()
            dialog = sheet("Инструменты", content)
            dialog!!.setOnKeyListener { _, key, event ->
                if (key == android.view.KeyEvent.KEYCODE_BACK && editing != null) {
                    if (event.action == android.view.KeyEvent.ACTION_UP) {
                        stopPreview()
                        library()
                    }
                    true
                } else false
            }
            dialog!!.setOnDismissListener {
                content.clearFocus()
                closed.set(true)
                downloadCancel.set(true)
                stopPreview()
                app.flush(true)
                onClose()
            }
            app.network.execute {
                val result = runCatching { banks.refresh(closed) }
                app.main.post {
                    if (!closed.get()) {
                        result
                            .onSuccess { if (editing == null) renderLibrary() }
                            .onFailure { app.diagnostics.record("catalog-refresh", it) }
                    }
                }
            }
        }

    private fun message(text: String) {
        status?.text = text
        status?.visibility = if (text.isBlank()) View.GONE else View.VISIBLE
    }

    private fun setTitle(text: String) {
        dialog?.window?.decorView?.findViewWithTag<TextView>("sheetTitle")?.text = text
    }

    private fun library(): Unit =
        with(activity) {
            content.clearFocus()
            editing = null
            content.removeAllViews()
            this@LibrarySheet.setTitle("Инструменты")
            val current = row()
            currentRow = current
            content.addView(
                current,
                LinearLayout.LayoutParams(-1, dp(43)).apply { bottomMargin = dp(14) },
            )
            renderCurrent()
            val search =
                field(query).apply {
                    hint = "Найти инструмент"
                    background =
                        shape(
                            ReferencePalette(this@with).panel,
                            ReferencePalette(this@with).border,
                            8f,
                        )
                }
            content.addView(search, LinearLayout.LayoutParams(-1, dp(40)))
            val choices = listOf("Все инструменты", "Загруженные") + groups
            val filter =
                select(choices, category + 2) {
                    category = it - 2
                    renderLibrary()
                }
            content.addView(
                filter,
                LinearLayout.LayoutParams(-1, dp(40)).apply {
                    topMargin = dp(8)
                    bottomMargin = dp(12)
                },
            )
            libraryList = column()
            content.addView(libraryList)
            status =
                label("").apply {
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                    visibility = View.GONE
                }
            content.addView(status)
            search.onTextChanged {
                query = it
                renderLibrary()
            }
            renderLibrary()
        }

    private fun renderCurrent(): Unit =
        with(activity) {
            val row = currentRow ?: return@with
            row.removeAllViews()
            val instrument = editor.project.instrument(editor.project.lane)
            val palette = ReferencePalette(this)
            row.addView(
                button(instrument.name) { settings(instrument.id) }
                    .apply {
                        gravity = Gravity.CENTER_VERTICAL or Gravity.LEFT
                        setPadding(dp(6), 0, dp(6), 0)
                        maxLines = 1
                        ellipsize = android.text.TextUtils.TruncateAt.END
                        setTextColor(palette.accent)
                        background = shape(palette.panel, palette.accent)
                    },
                LinearLayout.LayoutParams(0, dp(43), 1f),
            )
            row.addView(
                button("⚙") { settings(instrument.id) }
                    .apply { contentDescription = "Настроить ${instrument.name}" },
                LinearLayout.LayoutParams(dp(44), dp(43)).apply { leftMargin = dp(5) },
            )
            row.addView(
                button("⧉") {
                        runCatching {
                                var id = ""
                                mutate {
                                    id =
                                        editor.addInstrument(
                                            instrument.source,
                                            uniqueName(instrument.name),
                                            instrument.settings,
                                        )
                                    editor.assignInstrument(id)
                                }
                                settings(id)
                            }
                            .onFailure(::error)
                    }
                    .apply { contentDescription = "Копировать ${instrument.name}" },
                LinearLayout.LayoutParams(dp(44), dp(43)).apply { leftMargin = dp(5) },
            )
        }

    private fun uniqueName(base: String): String {
        var name = base
        var index = 2
        while (editor.project.instruments.any { it.name == name }) name =
            base.take(42) + " " + index++
        return name
    }

    private fun renderLibrary(): Unit =
        with(activity) {
            val list = libraryList ?: return@with
            list.removeAllViews()
            val palette = ReferencePalette(this)
            val words = normalized(query).split(Regex("\\s+")).filter { it.isNotEmpty() }
            val entries =
                banks.entries
                    .filter { e ->
                        (e.id != "lib-musicbox-1" ||
                            editor.project.lanes.any { it.instrument == e.id }) &&
                            (category != -1 || banks.installed(e.id)) &&
                            (category < 0 || category == group(e.gm)) &&
                            words.all {
                                normalized(
                                        e.name +
                                            " " +
                                            aliases(e.gm) +
                                            if (e.id == "lib-mda-grand-1") " гранд" else ""
                                    )
                                    .contains(it)
                            }
                    }
                    .sortedBy { group(it.gm) }
            var previous = -1
            if (entries.isEmpty()) list.addView(label("Ничего не найдено"))
            for (entry in entries) {
                val g = group(entry.gm)
                if (g != previous) {
                    previous = g
                    list.addView(
                        label(groups[g]).apply {
                            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                            setTypeface(typeface, Typeface.BOLD)
                            setTextColor(palette.muted)
                            setPadding(0, dp(6), 0, 0)
                        },
                        LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) },
                    )
                }
                val r = row()
                val installed = banks.installed(entry.id)
                val current = editor.project.lane.instrument == entry.id
                r.addView(
                    button(entry.name) {
                            mutate {
                                val id = editor.addInstrument(entry.id, uniqueName(entry.name))
                                editor.assignInstrument(id)
                            }
                            renderCurrent()
                            renderLibrary()
                            previewInstrument(
                                editor.project.instrument(editor.project.lane),
                                entry.demo,
                                80,
                            )
                        }
                        .apply {
                            isEnabled = installed
                            gravity = Gravity.CENTER_VERTICAL or Gravity.LEFT
                            maxLines = 1
                            ellipsize = android.text.TextUtils.TruncateAt.END
                            if (current) {
                                setTextColor(palette.accent)
                                background = shape(palette.panel, palette.accent)
                            }
                        },
                    LinearLayout.LayoutParams(0, dp(43), 1f),
                )
                if (entry.id == BankStore.FLOE && !installed) {
                    val split = row()
                    split.addView(
                        button("Скачать ↗") {
                                startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse(FloeImporter.AUTHOR))
                                )
                            }
                            .apply {
                                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                                setPadding(dp(5), 0, dp(5), 0)
                            },
                        LinearLayout.LayoutParams(0, dp(43), 1f),
                    )
                    split.addView(
                        button("Импорт") { pick("*/*", 103) }
                            .apply {
                                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                                setPadding(dp(5), 0, dp(5), 0)
                            },
                        LinearLayout.LayoutParams(0, dp(43), 1f),
                    )
                    r.addView(
                        split,
                        LinearLayout.LayoutParams(dp(135), dp(43)).apply { leftMargin = dp(8) },
                    )
                } else {
                    val busy = downloading == entry.id
                    val used = editor.project.lanes.any { it.instrument == entry.id }
                    val action =
                        if (installed && !busy)
                            iconButton("trash", "Удалить · ${entry.name}") {
                                    confirm(
                                        "Удалить инструмент",
                                        "Удалить «${entry.name}» с устройства?",
                                    ) {
                                        background(
                                            "",
                                            { banks.remove(entry.id) },
                                            { renderLibrary() },
                                        )
                                    }
                                }
                                .apply { isEnabled = !entry.builtin && !used }
                        else
                            button(if (busy) "Отмена" else "Скачать") {
                                    if (busy) {
                                        downloadCancel.set(true)
                                        message("Отменяем загрузку…")
                                    } else download(entry)
                                }
                                .apply {
                                    isEnabled = downloading == null || busy
                                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                                    setPadding(dp(9), 0, dp(9), 0)
                                }
                    r.addView(
                        action,
                        LinearLayout.LayoutParams(if (installed) dp(40) else -2, dp(40)).apply {
                            leftMargin = dp(8)
                        },
                    )
                    val bytes = entry.bytes
                    r.addView(
                        label(
                                "(" +
                                    "%.1f"
                                        .format(java.util.Locale.US, bytes / 1048576.0)
                                        .replace('.', ',') +
                                    " МБ)"
                            )
                            .apply {
                                setTextColor(palette.muted)
                                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 11f)
                                setPadding(0, 0, 0, 0)
                            },
                        LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(8) },
                    )
                }
                list.addView(r, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(8) })
            }
        }

    private fun download(entry: BankEntry): Unit =
        with(activity) {
            if (downloading != null) return@with
            downloading = entry.id
            downloadCancel = AtomicBoolean(false)
            val cancel = downloadCancel
            message("Скачиваем «${entry.name}»…")
            renderLibrary()
            app.network.execute {
                val result = runCatching { banks.download(entry.id, cancel) }
                app.main.post {
                    downloading = null
                    if (!closed.get()) {
                        result
                            .onSuccess { message("Инструмент загружен") }
                            .onFailure {
                                message(
                                    if (cancel.get()) "Загрузка отменена"
                                    else it.message ?: "Не удалось загрузить инструмент"
                                )
                            }
                        if (editing == null) renderLibrary()
                    }
                }
            }
        }

    fun importFloe(uri: Uri): Unit =
        with(activity) {
            val cancel = AtomicBoolean(false)
            val box = column()
            box.addView(label("Проверяем пакет и записи…"))
            val progress =
                sheet("Импорт шкатулки", box, close = "Отмена", onClose = { cancel.set(true) })
            progress.setOnCancelListener { cancel.set(true) }
            background(
                "",
                {
                    try {
                        FloeImporter.import(this, uri, banks, cancel)
                    } finally {
                        app.main.post { progress.dismiss() }
                    }
                },
                {
                    hint("Шкатулка импортирована")
                    if (::content.isInitialized && dialog?.isShowing == true) library()
                },
            )
        }

    private data class Field(
        val key: String,
        val title: String,
        val unit: String,
        val low: Double,
        val high: Double,
        val step: Double,
        val group: String,
    )

    private val fields =
        listOf(
            Field("volume", "Громкость", "%", 0.0, 150.0, 1.0, "basic"),
            Field("pan", "Панорама", "Л ↔ П", -100.0, 100.0, 1.0, "basic"),
            Field("transpose", "Высота", "полутонов", -24.0, 24.0, 1.0, "basic"),
            Field("attack", "Атака · Attack", "с", 0.0, 5.0, .005, "basic"),
            Field("release", "Затухание · Release", "с", .005, 10.0, .01, "basic"),
            Field("delay", "Задержка · Delay", "с", 0.0, 2.0, .01, "envelope"),
            Field("hold", "Удержание · Hold", "с", 0.0, 5.0, .01, "envelope"),
            Field("decay", "Спад · Decay", "с", 0.0, 10.0, .01, "envelope"),
            Field("sustain", "Уровень · Sustain", "%", 0.0, 100.0, 1.0, "envelope"),
            Field("velocity", "Отклик на громкость нот", "×", .25, 3.0, .05, "envelope"),
            Field("fine", "Точная высота", "центов", -100.0, 100.0, 1.0, "tuning"),
            Field("cutoff", "Частота среза", "Гц", 20.0, 20000.0, 10.0, "filter"),
            Field("resonance", "Резонанс", "Q", .1, 20.0, .1, "filter"),
            Field("start", "Начало сэмпла", "%", 0.0, 99.9, .1, "sample"),
            Field("end", "Конец сэмпла", "%", .1, 100.0, .1, "sample"),
        )

    private fun settings(id: String): Unit =
        with(activity) {
            content.clearFocus()
            editing = id
            content.removeAllViews()
            this@LibrarySheet.setTitle("Настройка инструмента")
            fun instrument() = editor.project.instruments.first { it.id == id }
            val nameRow = row()
            nameRow.addView(label("Название"), LinearLayout.LayoutParams(0, -2, 1f))
            val name =
                field(instrument().name).apply {
                    filters = arrayOf(android.text.InputFilter.LengthFilter(48))
                }
            nameRow.addView(name, LinearLayout.LayoutParams(0, dp(36), 1.86f))
            content.addView(nameRow)
            name.setOnFocusChangeListener { _, focused ->
                if (!focused) {
                    val value = name.text.toString().trim()
                    if (value.isNotEmpty())
                        mutate {
                            editor.change { p ->
                                p.copy(
                                    instruments =
                                        p.instruments.map {
                                            if (it.id == id) it.copy(name = value) else it
                                        }
                                )
                            }
                        }
                }
            }
            content.addView(
                label(
                        banks.entries.firstOrNull { it.id == instrument().source }?.name
                            ?: instrument().source
                    )
                    .apply {
                        setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                        setTextColor(ReferencePalette(this@with).muted)
                        setPadding(0, dp(14), 0, dp(4))
                    }
            )
            val tabs = row()
            content.addView(
                tabs,
                LinearLayout.LayoutParams(-1, dp(43)).apply {
                    topMargin = dp(10)
                    bottomMargin = dp(10)
                },
            )
            var bankAttack = .004
            var bankRelease = .25
            val envelope =
                object : View(this) {
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

                    override fun onDraw(c: Canvas) {
                        val s = instrument().settings
                        val attack = s.attack ?: bankAttack
                        val release = s.release ?: bankRelease
                        val total = s.delay + attack + s.hold + s.decay + 1 + release
                        val x: (Double) -> Float = { t -> (8 + t / total * 284).toFloat() }
                        val sustain = (64 - .5 * s.sustain).toFloat()
                        c.save()
                        val scale = minOf(width / 300f, height / 72f)
                        c.translate((width - 300 * scale) / 2, (height - 72 * scale) / 2)
                        c.scale(scale, scale)
                        paint.color = ReferencePalette(this@with).accent
                        paint.style = Paint.Style.STROKE
                        paint.strokeWidth = 1f
                        paint.alpha = 51
                        c.drawLine(8f, 64f, 292f, 64f, paint)
                        paint.alpha = 255
                        paint.strokeWidth = 2f
                        val path = Path()
                        path.moveTo(8f, 64f)
                        path.lineTo(x(s.delay), 64f)
                        path.lineTo(x(s.delay + attack), 14f)
                        path.lineTo(x(s.delay + attack + s.hold), 14f)
                        path.lineTo(x(s.delay + attack + s.hold + s.decay), sustain)
                        path.lineTo(x(total - release), sustain)
                        path.lineTo(292f, 64f)
                        c.drawPath(path, paint)
                        c.restore()
                    }
                }
            content.addView(envelope, LinearLayout.LayoutParams(-1, dp(72)))
            val basic = column()
            val advanced = column().apply { visibility = View.GONE }
            content.addView(basic)
            content.addView(advanced)
            val sections = mutableMapOf("basic" to basic)
            for ((key, title) in
                listOf(
                    "envelope" to "Огибающая громкости",
                    "tuning" to "Высота",
                    "filter" to "Фильтр",
                    "sample" to "Сэмпл",
                )) {
                val group = fieldset(title)
                sections[key] = group
                advanced.addView(
                    group,
                    LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) },
                )
            }
            fun values() =
                ProjectCodec.json
                    .encodeToJsonElement(SoundSettings.serializer(), instrument().settings)
                    .jsonObject
            val controls = mutableMapOf<String, ReferenceRange>()
            fun sync() {
                val json = values()
                for ((key, range) in controls) {
                    range.setValue(
                        (json[key] as? JsonPrimitive)?.doubleOrNull,
                        if (key == "attack") bankAttack
                        else if (key == "release") bankRelease else range.low,
                    )
                    if (key in listOf("cutoff", "resonance"))
                        range.enable(instrument().settings.filter != "off")
                }
                envelope.invalidate()
            }
            fun update(key: String, value: JsonElement) {
                runCatching {
                        val json = JsonObject(values().toMutableMap().apply { put(key, value) })
                        val settings =
                            ProjectCodec.json
                                .decodeFromJsonElement(SoundSettings.serializer(), json)
                                .validate()
                        mutate {
                            editor.change { p ->
                                p.copy(
                                    instruments =
                                        p.instruments.map {
                                            if (it.id == id) it.copy(settings = settings) else it
                                        }
                                )
                            }
                        }
                        message("")
                    }
                    .onFailure { message(it.message ?: "Проверь значения") }
                sync()
            }
            for (f in fields) {
                val n = (values()[f.key] as? JsonPrimitive)?.doubleOrNull
                val range =
                    ReferenceRange(
                        this,
                        f.title + " · " + f.unit,
                        "",
                        f.low,
                        f.high,
                        f.step,
                        n,
                        soundField = true,
                    ) { value ->
                        update(
                            f.key,
                            if (value == null) JsonNull
                            else if (f.key == "transpose") JsonPrimitive(value.toInt())
                            else JsonPrimitive(value),
                        )
                    }
                range.edit.hint = if (f.key == "attack" || f.key == "release") "Авто" else ""
                controls[f.key] = range
                sections
                    .getValue(f.group)
                    .addView(range, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            }
            val filters = listOf("off", "lowpass", "highpass", "bandpass")
            sections.getValue("filter").selectRow(
                "Тип",
                listOf("Выключен", "Низкие частоты · LP", "Высокие частоты · HP", "Полоса · BP"),
                filters.indexOf(instrument().settings.filter),
            ) {
                update("filter", JsonPrimitive(filters[it]))
            }
            val filterGroup = sections.getValue("filter")
            val filterType = filterGroup.getChildAt(filterGroup.childCount - 1)
            filterGroup.removeView(filterType)
            filterGroup.addView(filterType, 1)
            sections.getValue("sample").selectRow(
                "Петля",
                listOf("Из инструмента", "Выключена"),
                if (instrument().settings.loop == "original") 0 else 1,
            ) {
                update("loop", JsonPrimitive(if (it == 0) "original" else "off"))
            }
            sections.getValue("sample").checkRow("Реверс", instrument().settings.reverse) {
                update("reverse", JsonPrimitive(it))
            }
            lateinit var basicButton: Button
            lateinit var advancedButton: Button
            fun page(showAdvanced: Boolean) {
                basic.visibility = if (showAdvanced) View.GONE else View.VISIBLE
                advanced.visibility = if (showAdvanced) View.VISIBLE else View.GONE
                val p = ReferencePalette(this)
                for ((b, active) in
                    listOf(basicButton to !showAdvanced, advancedButton to showAdvanced)) {
                    b.setTextColor(if (active) p.accent else p.text)
                    b.background = shape(p.panel, if (active) p.accent else p.border)
                }
            }
            basicButton = button("Базовые") { page(false) }
            advancedButton = button("Advanced") { page(true) }
            tabs.addView(basicButton, LinearLayout.LayoutParams(0, -1, 1f))
            tabs.addView(
                advancedButton,
                LinearLayout.LayoutParams(0, -1, 1f).apply { leftMargin = dp(7) },
            )
            basicButton.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
            advancedButton.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
            page(false)
            val actions = row()
            actions.addView(
                button("▶ Послушать") {
                    previewInstrument(
                        instrument(),
                        banks.entries.firstOrNull { it.id == instrument().source }?.demo ?: 60,
                        85,
                        seconds = 1.5,
                    )
                },
                LinearLayout.LayoutParams(0, dp(43), 1f),
            )
            actions.addView(
                button("Сбросить параметры") {
                    mutate {
                        editor.change { p ->
                            p.copy(
                                instruments =
                                    p.instruments.map {
                                        if (it.id == id) it.copy(settings = SoundSettings()) else it
                                    }
                            )
                        }
                    }
                    settings(id)
                },
                LinearLayout.LayoutParams(0, dp(43), 1f).apply { leftMargin = dp(7) },
            )
            for (i in 0 until actions.childCount) (actions.getChildAt(i) as Button).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
                setPadding(dp(8), 0, dp(8), 0)
            }
            content.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
            status =
                label("").apply {
                    visibility = View.GONE
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                }
            content.addView(status)
            sync()
            val bankSource = instrument().source
            app.worker.execute {
                val bank = runCatching { banks.load(bankSource) }.getOrNull()
                app.main.post {
                    if (bank != null && !closed.get() && editing == id) {
                        bankAttack = bank.attack
                        bankRelease = bank.release
                        sync()
                    }
                }
            }
        }
}

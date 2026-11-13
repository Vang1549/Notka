package studio.notka.next.ui

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.text.Editable
import android.text.TextWatcher
import android.widget.*
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.json.*
import studio.notka.core.*
import studio.notka.next.MainActivity
import studio.notka.next.data.*

class LibrarySheet(private val activity: MainActivity) {
    private val banks
        get() = activity.app.banks

    private val editor
        get() = activity.editor

    private var dialog: AlertDialog? = null
    private val cancelled = AtomicBoolean(false)
    private var generation = 0
    private var audition: String? = null
    private var previewCancelled = AtomicBoolean(false)
    private var busy = false

    fun show() {
        with(activity) {
            transport.pause()
            val box = column()
            val search = field("").apply { hint = "Найти инструмент" }
            box.addView(search)
            val group = Spinner(this)
            val groups =
                listOf(
                    "Все",
                    "В проекте",
                    "Загруженные",
                    "Клавишные",
                    "Струнные",
                    "Духовые",
                    "Остальные",
                )
            group.adapter =
                ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, groups)
            box.addView(group)
            val list = column().apply { setPadding(0, 0, 0, 0) }
            box.addView(list)
            fun render() {
                list.removeAllViews()
                val filter = search.text.toString().trim()
                val category = group.selectedItemPosition
                if (category == 1) {
                    editor.project.instruments
                        .filter { it.name.contains(filter, true) }
                        .forEach { instrument ->
                            list.addButton(
                                (if (editor.project.lane.instrumentId == instrument.id) "● "
                                else "") + instrument.name
                            ) {
                                choice(
                                    instrument.name,
                                    listOf(
                                        "Назначить дорожке",
                                        "Настроить",
                                        "Переименовать",
                                        "Создать копию",
                                        "Удалить из проекта",
                                    ),
                                ) { i ->
                                    when (i) {
                                        0 -> mutate { editor.assignInstrument(instrument.id) }
                                        1 -> settings(instrument)
                                        2 ->
                                            prompt("Имя инструмента", instrument.name) { name ->
                                                mutate {
                                                    editor.change { p ->
                                                        p.copy(
                                                            instruments =
                                                                p.instruments.map {
                                                                    if (it.id == instrument.id)
                                                                        it.copy(name = name)
                                                                    else it
                                                                }
                                                        )
                                                    }
                                                }
                                            }
                                        3 ->
                                            mutate {
                                                val id =
                                                    editor.addInstrument(
                                                        instrument.source,
                                                        (instrument.name + " · копия").take(48),
                                                        instrument.settings,
                                                    )
                                                editor.assignInstrument(id)
                                            }
                                        4 -> mutate { editor.removeInstrument(instrument.id) }
                                    }
                                    render()
                                }
                            }
                        }
                    return
                }
                banks.entries
                    .filter { e ->
                        (e.id != "lib-musicbox-1" ||
                            editor.project.lanes.any { it.instrument == e.id }) &&
                            e.name.contains(filter, true) &&
                            when (category) {
                                2 -> banks.installed(e.id)
                                3 -> e.gm in 0..23
                                4 -> e.gm in 24..55
                                5 -> e.gm in 56..79
                                6 -> e.gm >= 80
                                else -> true
                            }
                    }
                    .forEach { e ->
                        val row = row()
                        row.addView(
                            button(e.name + (if (banks.installed(e.id)) " ✓" else "")) {
                                if (banks.installed(e.id)) {
                                    mutate {
                                        val existing =
                                            editor.project.instruments.firstOrNull {
                                                it.source == e.id
                                            }
                                        editor.assignInstrument(
                                            existing?.id ?: editor.addInstrument(e.id, e.name)
                                        )
                                    }
                                    dialog?.dismiss()
                                } else if (e.id == BankStore.FLOE) floeMenu()
                                else if (!busy) {
                                    busy = true
                                    hint("Скачиваю ${e.name}…")
                                    app.network.execute {
                                        val result = runCatching { banks.download(e.id, cancelled) }
                                        app.main.post {
                                            busy = false
                                            if (dialog?.isShowing == true) {
                                                result
                                                    .onSuccess {
                                                        render()
                                                        hint("Инструмент загружен")
                                                    }
                                                    .onFailure { if (!cancelled.get()) error(it) }
                                            }
                                        }
                                    }
                                }
                            },
                            LinearLayout.LayoutParams(0, dp(50), 1f),
                        )
                        row.addView(
                            button("▶") {
                                    val token = ++generation
                                    previewCancelled.set(true)
                                    stopPreview()
                                    if (audition == e.id) {
                                        audition = null
                                        return@button
                                    }
                                    audition = e.id
                                    val previewJob = AtomicBoolean(false)
                                    previewCancelled = previewJob
                                    if (e.preview != null) {
                                        app.network.execute {
                                            val result = runCatching {
                                                banks.preview(e.id, previewJob)
                                            }
                                            app.main.post {
                                                if (
                                                    dialog?.isShowing == true &&
                                                        token == generation &&
                                                        !cancelled.get()
                                                )
                                                    result
                                                        .onSuccess { playPreview(it) }
                                                        .onFailure(::error)
                                            }
                                        }
                                    } else if (banks.installed(e.id)) {
                                        val instrument =
                                            editor.project.instruments.firstOrNull {
                                                it.source == e.id
                                            } ?: Instrument("inst-preview", e.id, e.name)
                                        previewInstrument(instrument, e.demo)
                                    }
                                }
                                .apply { contentDescription = "Послушать ${e.name}" },
                            LinearLayout.LayoutParams(dp(48), dp(50)),
                        )
                        if (!e.builtin && banks.installed(e.id))
                            row.setOnLongClickListener {
                                confirm(
                                    "Удалить инструмент",
                                    "«${e.name}» можно будет скачать снова. Ноты останутся в треках.",
                                ) {
                                    background("Удаляю…", { banks.remove(e.id) }, { render() })
                                }
                                true
                            }
                        list.addView(row)
                    }
            }
            search.addTextChangedListener(
                object : TextWatcher {
                    override fun beforeTextChanged(
                        s: CharSequence?,
                        start: Int,
                        count: Int,
                        after: Int,
                    ) {}

                    override fun onTextChanged(
                        s: CharSequence?,
                        start: Int,
                        before: Int,
                        count: Int,
                    ) {
                        render()
                    }

                    override fun afterTextChanged(e: Editable?) {}
                }
            )
            group.onItemSelectedListener =
                object : android.widget.AdapterView.OnItemSelectedListener {
                    override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}

                    override fun onItemSelected(
                        p: android.widget.AdapterView<*>?,
                        v: android.view.View?,
                        position: Int,
                        id: Long,
                    ) {
                        render()
                    }
                }
            box.addButton("Настройки текущего инструмента") {
                settings(editor.project.instrument(editor.project.lane))
            }
            box.addButton("Обновить каталог") {
                if (!busy) {
                    busy = true
                    background(
                        "Обновляю каталог…",
                        {
                            try {
                                banks.refresh(cancelled)
                            } finally {
                                busy = false
                            }
                        },
                        {
                            render()
                            hint("Каталог обновлён")
                        },
                        executor = app.network,
                    )
                }
            }
            box.addButton("Импорт FrozenPlain") { floeMenu() }
            dialog =
                AlertDialog.Builder(this)
                    .setTitle("Инструменты")
                    .setView(ScrollView(this).apply { addView(box) })
                    .setNegativeButton("Закрыть", null)
                    .create()
            dialog!!.setOnDismissListener {
                cancelled.set(true)
                previewCancelled.set(true)
                generation++
                stopPreview()
            }
            dialog!!.show()
            render()
            app.network.execute {
                val result = runCatching { banks.refresh(cancelled) }
                app.main.post {
                    if (dialog?.isShowing == true && !cancelled.get()) {
                        result
                            .onSuccess { render() }
                            .onFailure { app.diagnostics.record("catalog-refresh", it) }
                    }
                }
            }
        }
    }

    private fun floeMenu() {
        activity.choice(
            "Шкатулка FrozenPlain",
            listOf("Скачать у автора", "Импортировать Floe-пакет"),
        ) {
            if (it == 0)
                activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(FloeImporter.AUTHOR)))
            else activity.pick("*/*", 103)
        }
    }

    fun importFloe(uri: Uri) {
        val cancel = AtomicBoolean(false)
        val progress =
            AlertDialog.Builder(activity)
                .setTitle("Импорт шкатулки")
                .setMessage("Проверяю пакет и записи…")
                .setNegativeButton("Отмена") { _, _ -> cancel.set(true) }
                .setCancelable(false)
                .show()
        activity.background(
            "Импортирую шкатулку…",
            {
                try {
                    FloeImporter.import(activity, uri, banks, cancel)
                } finally {
                    activity.app.main.post { progress.dismiss() }
                }
            },
            { activity.hint("Шкатулка импортирована") },
        )
    }

    private fun settings(instrument: Instrument) {
        with(activity) {
            val box = column()
            val values =
                ProjectCodec.json
                    .encodeToJsonElement(SoundSettings.serializer(), instrument.settings)
                    .jsonObject
            val names =
                linkedMapOf(
                    "volume" to "Громкость · 0–150%",
                    "pan" to "Панорама · −100…100",
                    "transpose" to "Транспонирование · −24…24",
                    "fine" to "Тонкая настройка · центы",
                    "attack" to "Атака · секунды; пусто — авто",
                    "release" to "Затухание · секунды; пусто — авто",
                    "delay" to "Задержка · секунды",
                    "hold" to "Удержание · секунды",
                    "decay" to "Спад · секунды",
                    "sustain" to "Уровень удержания · %",
                    "cutoff" to "Частота фильтра · Гц",
                    "resonance" to "Резонанс",
                    "start" to "Начало сэмпла · %",
                    "end" to "Конец сэмпла · %",
                    "velocity" to "Чувствительность к громкости",
                )
            val fields =
                names.mapValues { (key, name) ->
                    box.addView(label(name))
                    field(
                            values[key]?.takeUnless { it is JsonNull }?.jsonPrimitive?.content
                                ?: "",
                            true,
                        )
                        .also { box.addView(it) }
                }
            box.addView(label("Фильтр"))
            val filters = listOf("off", "lowpass", "highpass", "bandpass")
            val filter =
                Spinner(this).apply {
                    adapter =
                        ArrayAdapter(
                            this@with,
                            android.R.layout.simple_spinner_dropdown_item,
                            listOf("Выключен", "Низкие частоты", "Высокие частоты", "Полоса"),
                        )
                    setSelection(filters.indexOf(instrument.settings.filter))
                }
            box.addView(filter)
            val reverse =
                CheckBox(this).apply {
                    text = "Реверс"
                    isChecked = instrument.settings.reverse
                }
            box.addView(reverse)
            val loop =
                CheckBox(this).apply {
                    text = "Исходная петля"
                    isChecked = instrument.settings.loop == "original"
                }
            box.addView(loop)
            box.addButton("Сбросить параметры") {
                fields.forEach { (k, v) ->
                    v.setText(
                        ProjectCodec.json
                            .encodeToJsonElement(SoundSettings.serializer(), SoundSettings())
                            .jsonObject[k]
                            ?.takeUnless { it is JsonNull }
                            ?.jsonPrimitive
                            ?.content ?: ""
                    )
                }
                filter.setSelection(0)
                reverse.isChecked = false
                loop.isChecked = true
            }
            form(instrument.name, box) {
                val json = buildJsonObject {
                    fields.forEach { (key, edit) ->
                        val raw = edit.text.toString().trim()
                        if (raw.isEmpty() && key in listOf("attack", "release")) put(key, JsonNull)
                        else if (key == "transpose") put(key, raw.toInt())
                        else put(key, raw.uiNumber())
                    }
                    put("filter", filters[filter.selectedItemPosition])
                    put("reverse", reverse.isChecked)
                    put("loop", if (loop.isChecked) "original" else "off")
                }
                val settings =
                    ProjectCodec.json
                        .decodeFromJsonElement(SoundSettings.serializer(), json)
                        .validate()
                mutate {
                    editor.change { p ->
                        p.copy(
                            instruments =
                                p.instruments.map {
                                    if (it.id == instrument.id) it.copy(settings = settings) else it
                                }
                        )
                    }
                }
            }
        }
    }
}

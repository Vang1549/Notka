package studio.notka.next.ui

import android.os.Handler
import android.os.Looper
import android.widget.*
import java.io.File
import kotlinx.serialization.json.*
import studio.notka.core.*
import studio.notka.next.MainActivity
import studio.notka.next.data.*

class SceneSheet(private val activity: MainActivity) {
    fun show() {
        with(activity) {
            transport.pause()
            val box = column()
            var saved = editor.project.scene
            val sample =
                if (editor.project.endTick > 0) editor.project
                else
                    editor.project.replaceLane(
                        editor.project.activeLane,
                        editor.project.lane.copy(
                            notes =
                                listOf(60, 64, 67, 72).mapIndexed { i, p ->
                                    Note(i + 1L, i * 960L, 1440, p)
                                }
                        ),
                    )
            val preview =
                SceneView(this).apply { renderer = SceneRenderer(sample.copy(scene = saved)) }
            box.addView(preview, LinearLayout.LayoutParams(-1, dp(180)))
            val seek = SeekBar(this).apply { max = 1000 }
            box.addView(seek)
            val previewDuration = maxOf(4.0, sample.endTick * 60.0 / sample.bpm / PPQ)
            seek.setOnSeekBarChangeListener(
                object : SeekBar.OnSeekBarChangeListener {
                    override fun onStartTrackingTouch(s: SeekBar) {}

                    override fun onStopTrackingTouch(s: SeekBar) {}

                    override fun onProgressChanged(s: SeekBar, p: Int, user: Boolean) {
                        preview.seconds = p / 1000.0 * previewDuration
                        preview.invalidate()
                    }
                }
            )
            val numbers = linkedMapOf<String, EditText>()
            val choices = linkedMapOf<String, Spinner>()
            val booleans = linkedMapOf<String, CheckBox>()
            val names =
                mapOf(
                    "keyStart" to "Первая клавиша MIDI",
                    "keyCount" to "Количество клавиш",
                    "keyboardHeight" to "Высота клавиатуры · %",
                    "speed" to "Скорость падения",
                    "noteWidth" to "Ширина нот · %",
                    "roundness" to "Скругление · %",
                    "glowAmount" to "Свечение",
                    "sparkAmount" to "Искры",
                    "rays" to "Лучи",
                    "rings" to "Кольца",
                    "trails" to "Следы",
                )
            val choiceNames =
                mapOf(
                    "palette" to "Палитра",
                    "rangeMode" to "Диапазон",
                    "keyLabels" to "Подписи клавиш",
                    "noteStyle" to "Вид нот",
                    "colorMode" to "Цвет по",
                    "backdrop" to "Фон",
                )
            val translated =
                mapOf(
                    "basic" to "Базовая",
                    "aurora" to "Сияние",
                    "ember" to "Огонь",
                    "ice" to "Лёд",
                    "iris" to "Ирис",
                    "auto" to "Авто",
                    "manual" to "Вручную",
                    "c" to "Только До",
                    "all" to "Все",
                    "none" to "Нет",
                    "glass" to "Стекло",
                    "solid" to "Заливка",
                    "neon" to "Неон",
                    "lane" to "Дорожке",
                    "instrument" to "Инструменту",
                    "single" to "Один цвет",
                    "stars" to "Звёзды",
                    "plain" to "Однотонный",
                )
            val presetBar = row()
            box.addView(presetBar)
            for ((key, values) in SceneOptions.choices) {
                box.addView(label(choiceNames.getValue(key)))
                val spinner =
                    Spinner(this).apply {
                        adapter =
                            ArrayAdapter(
                                this@with,
                                android.R.layout.simple_spinner_dropdown_item,
                                values.map { translated[it] ?: it },
                            )
                        setSelection(values.indexOf(saved.text(key)).coerceAtLeast(0))
                    }
                choices[key] = spinner
                box.addView(spinner)
            }
            for ((key, bound) in SceneOptions.bounds) {
                box.addView(label("${names[key]} · ${bound.start}…${bound.endInclusive}"))
                val field = field(saved.number(key).toString(), true)
                numbers[key] = field
                box.addView(field)
            }
            for ((key, name) in
                listOf(
                    "loop" to "Повторять трек",
                    "guides" to "Направляющие",
                    "glow" to "Свечение нот",
                    "sparks" to "Искры",
                    "keyLights" to "Подсветка клавиш",
                    "octaveRange" to "Диапазон целыми октавами",
                )) {
                val check =
                    CheckBox(this).apply {
                        text = name
                        isChecked = saved.flag(key)
                    }
                booleans[key] = check
                box.addView(check)
            }
            box.addView(label("Фон · #RRGGBB"))
            val bg = field(saved.text("background"))
            box.addView(bg)
            box.addView(label("Частота кадров"))
            val fps =
                Spinner(this).apply {
                    adapter =
                        ArrayAdapter(
                            this@with,
                            android.R.layout.simple_spinner_dropdown_item,
                            listOf("30", "60"),
                        )
                    setSelection(if (saved.number("fps") == 30.0) 0 else 1)
                }
            box.addView(fps)
            var colors = (saved["colors"] as? JsonObject) ?: JsonObject(emptyMap())
            fun read(): JsonObject =
                SceneOptions.normalize(
                    buildJsonObject {
                        saved.forEach { (k, v) -> put(k, v) }
                        put("schema", 2)
                        numbers.forEach { (key, value) ->
                            val n = value.text.toString().uiNumber()
                            require(n.isFinite() && n in SceneOptions.bounds.getValue(key)) {
                                "Проверь ${names[key]}"
                            }
                            put(key, n)
                        }
                        choices.forEach { (key, spinner) ->
                            put(
                                key,
                                SceneOptions.choices.getValue(key)[spinner.selectedItemPosition],
                            )
                        }
                        booleans.forEach { (key, check) -> put(key, check.isChecked) }
                        require(bg.text.toString().matches(Regex("#[a-fA-F0-9]{6}"))) {
                            "Проверь цвет фона"
                        }
                        put("background", bg.text.toString())
                        put("fps", if (fps.selectedItemPosition == 0) 30 else 60)
                        put("colors", colors)
                    }
                )
            fun apply(value: JsonObject) {
                saved = SceneOptions.normalize(value)
                numbers.forEach { (key, field) -> field.setText(saved.number(key).toString()) }
                choices.forEach { (key, spinner) ->
                    spinner.setSelection(
                        SceneOptions.choices.getValue(key).indexOf(saved.text(key)).coerceAtLeast(0)
                    )
                }
                booleans.forEach { (key, check) -> check.isChecked = saved.flag(key) }
                bg.setText(saved.text("background"))
                fps.setSelection(if (saved.number("fps") == 30.0) 0 else 1)
                colors = (saved["colors"] as? JsonObject) ?: JsonObject(emptyMap())
                preview.renderer = SceneRenderer(sample.copy(scene = saved))
                preview.invalidate()
            }
            val presetFile = File(filesDir, "scene-presets.json")
            fun presets(): JsonArray =
                runCatching {
                        ProjectCodec.json
                            .parseToJsonElement(
                                atomicRead(presetFile, 1024 * 1024).toString(Charsets.UTF_8)
                            )
                            .jsonArray
                    }
                    .getOrDefault(JsonArray(emptyList()))
            fun write(list: List<JsonElement>) {
                require(list.size <= 50) { "Можно сохранить до 50 пресетов" }
                atomicWrite(presetFile, JsonArray(list).toString().toByteArray())
            }
            presetBar.addButton("Пресеты") {
                val all = presets()
                choice("Пресеты", listOf("Базовый") + all.map { it.jsonObject.text("name") }) {
                    index ->
                    if (index == 0) apply(SceneOptions.defaults())
                    else {
                        val preset = all[index - 1].jsonObject
                        val data = preset["scene"]!!.jsonObject
                        val rack = preset["rack"] as? JsonArray
                        val remapped =
                            (data["colors"] as? JsonObject)?.toMutableMap() ?: mutableMapOf()
                        rack?.forEach { entry ->
                            val r = entry.jsonObject
                            val color = r["color"] ?: return@forEach
                            editor.project.instruments
                                .filter { it.source == r.text("source") }
                                .forEach { remapped["instrument-${it.id}"] = color }
                        }
                        apply(
                            JsonObject(
                                data.toMutableMap().apply {
                                    put("colors", JsonObject(remapped))
                                    put("presetName", JsonPrimitive(preset.text("name")))
                                }
                            )
                        )
                    }
                }
            }
            presetBar.addButton("Сохранить") {
                runCatching { read() }
                    .onSuccess { current ->
                        prompt("Имя пресета") { name ->
                            require(Project.validName(name))
                            val all = presets()
                            val item = buildJsonObject {
                                put("name", name)
                                put("scene", current)
                                put(
                                    "rack",
                                    JsonArray(
                                        editor.project.instruments.map { instrument ->
                                            buildJsonObject {
                                                put("source", instrument.source)
                                                colors["instrument-${instrument.id}"]?.let {
                                                    put("color", it)
                                                }
                                            }
                                        }
                                    ),
                                )
                            }
                            val action = {
                                write(all.filter { it.jsonObject.text("name") != name } + item)
                                hint("Пресет сохранён")
                            }
                            if (all.any { it.jsonObject.text("name") == name })
                                confirm("Заменить пресет", name, action)
                            else action()
                        }
                    }
                    .onFailure(::error)
            }
            presetBar.addButton("Удалить") {
                val all = presets()
                choice("Удалить пресет", all.map { it.jsonObject.text("name") }) { i ->
                    confirm("Удалить пресет", all[i].jsonObject.text("name")) {
                        write(all.filterIndexed { index, _ -> index != i })
                    }
                }
            }
            box.addButton("Цвета нот") {
                val mode =
                    SceneOptions.choices
                        .getValue("colorMode")[choices.getValue("colorMode").selectedItemPosition]
                val items =
                    when (mode) {
                        "single" -> listOf("single" to "Все ноты")
                        "instrument" ->
                            editor.project.instruments.map { "instrument-${it.id}" to it.name }
                        else ->
                            editor.project.lanes.mapIndexed { i, lane -> "lane-$i" to lane.name }
                    }
                choice("Цвета", items.map { it.second }) { i ->
                    val key = items[i].first
                    val colorForm = column()
                    colorForm.addView(label("Цвет · #RRGGBB (пусто — из палитры)"))
                    val colorField =
                        field(colors.text(key).takeUnless { it == "transparent" } ?: "")
                    colorForm.addView(colorField)
                    val hidden =
                        CheckBox(this).apply {
                            text = "Скрыть эти ноты"
                            isChecked = colors.text(key) == "transparent"
                        }
                    colorForm.addView(hidden)
                    form(items[i].second, colorForm) {
                        val value =
                            if (hidden.isChecked) "transparent"
                            else colorField.text.toString().trim()
                        require(
                            value.isEmpty() ||
                                value == "transparent" ||
                                value.matches(Regex("#[a-fA-F0-9]{6}"))
                        ) {
                            "Проверь цвет"
                        }
                        colors =
                            JsonObject(
                                colors.toMutableMap().apply {
                                    if (value.isEmpty()) remove(key)
                                    else put(key, JsonPrimitive(value))
                                }
                            )
                    }
                }
            }
            val previewHandler = Handler(Looper.getMainLooper())
            box.addButton("Проиграть пример") {
                runCatching { read() }
                    .onSuccess {
                        preview.renderer = SceneRenderer(sample.copy(scene = it))
                        previewHandler.removeCallbacksAndMessages(null)
                        playPreviewProject(sample) { audio ->
                            val pulse =
                                object : Runnable {
                                    override fun run() {
                                        preview.seconds = audio.seconds()
                                        preview.invalidate()
                                        if (audio.status() == 0)
                                            previewHandler.postDelayed(this, 33)
                                    }
                                }
                            previewHandler.post(pulse)
                        }
                    }
                    .onFailure(::error)
            }
            box.addButton("Остановить пример") {
                previewHandler.removeCallbacksAndMessages(null)
                stopPreview()
            }
            val dialog =
                form("Вид сцены", box) {
                    val result = read()
                    mutate { editor.change { it.copy(scene = result) } }
                }
            dialog.setOnDismissListener {
                previewHandler.removeCallbacksAndMessages(null)
                stopPreview()
            }
        }
    }
}

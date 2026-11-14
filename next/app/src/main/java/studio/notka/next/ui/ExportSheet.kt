package studio.notka.next.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.view.View
import android.widget.*
import kotlin.math.roundToInt
import studio.notka.next.MainActivity
import studio.notka.next.export.*

class ExportSheet(private val activity: MainActivity) {
    fun chooseFile(options: ExportOptions, name: String) {
        with(activity) {
            options.validate()
            getSharedPreferences("export", 0).edit().putString("pending", options.json()).apply()
            startActivityForResult(
                Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(options.mime)
                    .putExtra(Intent.EXTRA_TITLE, "$name.${options.extension}"),
                104,
            )
        }
    }

    fun show(initial: String? = null) =
        with(activity) {
            if (ExportService.busy) {
                message("Сохранить файл", ExportService.status)
                return@with
            }
            transport.pause()
            stopPreview()
            val prefs = getSharedPreferences("export", 0)
            val box = column()
            val basic = column()
            val advanced = column().apply { visibility = View.GONE }
            val tabs = row()
            box.addView(tabs)
            box.addView(basic)
            box.addView(advanced)
            val name =
                field(app.songName ?: "Мой трек").apply {
                    filters = arrayOf(android.text.InputFilter.LengthFilter(48))
                }
            basic.addView(label("Название"))
            basic.addView(name)
            var kind = if (initial in listOf("mp4", "webm")) "video" else "audio"
            var type = initial ?: "wav"
            var rate = prefs.getInt("rate", 48000)
            var channels = prefs.getInt("channels", 2)
            var bits = prefs.getInt("bits", 16)
            var fps = prefs.getInt("fps", 30)
            var height = prefs.getInt("height", 720)
            var quality = prefs.getInt("quality", 1)
            var bitrate = prefs.getInt("bitrate", 192000)
            val types = ExportOptions.formats().map { it.first }.toSet()
            val audioFormats =
                listOf(
                        "wav" to "WAV · без сжатия",
                        "aac" to "M4A · AAC",
                        "webm-audio" to "WebM · Opus",
                        "opus" to "OGG · Opus",
                    )
                    .filter { it.first in types }
            val videoFormats =
                listOf("mp4" to "MP4 · H.264", "webm" to "WebM · VP8").filter { it.first in types }
            val formatBox = column()
            val formatRow = row()
            val kindBox = column()
            kindBox.addView(label("Тип"))
            kindBox.addView(
                select(listOf("Аудио", "Видео"), if (kind == "audio") 0 else 1) {
                    kind = if (it == 0) "audio" else "video"
                    renderExport?.invoke()
                }
            )
            formatRow.addView(kindBox, LinearLayout.LayoutParams(0, -2, 1f))
            formatRow.addView(
                formatBox,
                LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(12) },
            )
            basic.addView(formatRow)
            val video = fieldset("Видео")
            advanced.addView(video)
            val sound = fieldset("Звук")
            advanced.addView(sound, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(14) })
            val hint =
                label("").apply {
                    setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 13f)
                    setTextColor(ReferencePalette(this@with).muted)
                }
            box.addView(hint)
            fun savePreferences() {
                prefs
                    .edit()
                    .putInt("rate", rate)
                    .putInt("channels", channels)
                    .putInt("bits", bits)
                    .putInt("fps", fps)
                    .putInt("height", height)
                    .putInt("quality", quality)
                    .putInt("bitrate", bitrate)
                    .apply()
            }
            fun options(): ExportOptions {
                val width = if (height == 480) 854 else height * 16 / 9
                return ExportOptions(
                    type = type,
                    rate = rate,
                    channels = channels,
                    bits = bits,
                    fps = fps,
                    height = height,
                    audioBitrate = bitrate,
                    videoBitrate =
                        (width * height.toDouble() * fps * listOf(.07, .14, .24)[quality])
                            .roundToInt(),
                )
            }
            fun updateHint() {
                val o = options()
                hint.text =
                    (if (kind == "video")
                        "${o.width} × ${o.videoHeight} · $fps FPS · " +
                            "%.1f".format(o.videoBitrate / 1e6) +
                            " Мбит/с\n"
                    else "") +
                        (if (channels == 2) "Стерео" else "Моно") +
                        " · " +
                        (rate / 1000.0).toString().trimEnd('0').trimEnd('.').replace('.', ',') +
                        " кГц · " +
                        if (type == "wav") "$bits бит" else "${bitrate/1000} кбит/с"
                savePreferences()
            }
            lateinit var save: Button
            fun advancedControls() {
                video.removeViews(1, video.childCount - 1)
                sound.removeViews(1, sound.childCount - 1)
                video.visibility = if (kind == "video") View.VISIBLE else View.GONE
                video.selectRow(
                    "Разрешение",
                    listOf("480p", "720p", "1080p"),
                    listOf(480, 720, 1080).indexOf(height),
                ) {
                    height = listOf(480, 720, 1080)[it]
                    updateHint()
                }
                video.selectRow(
                    "Кадры/с",
                    listOf("24", "25", "30", "50", "60"),
                    listOf(24, 25, 30, 50, 60).indexOf(fps),
                ) {
                    fps = listOf(24, 25, 30, 50, 60)[it]
                    updateHint()
                }
                video.selectRow(
                    "Качество видео",
                    listOf("Компактное", "Стандартное", "Высокое"),
                    quality,
                ) {
                    quality = it
                    updateHint()
                }
                sound.selectRow(
                    "Частота",
                    listOf("32 кГц", "44,1 кГц", "48 кГц"),
                    listOf(32000, 44100, 48000).indexOf(rate),
                ) {
                    rate = listOf(32000, 44100, 48000)[it]
                    updateHint()
                }
                sound.selectRow("Каналы", listOf("Стерео", "Моно"), if (channels == 2) 0 else 1) {
                    channels = if (it == 0) 2 else 1
                    updateHint()
                }
                if (type == "wav")
                    sound.selectRow(
                        "Глубина WAV",
                        listOf("16 бит", "24 бита"),
                        if (bits == 16) 0 else 1,
                    ) {
                        bits = if (it == 0) 16 else 24
                        updateHint()
                    }
                else {
                    val rates = listOf(64000, 96000, 128000, 192000, 256000, 320000)
                    sound.selectRow(
                        "Битрейт",
                        rates.map { "${it/1000} кбит/с" },
                        rates.indexOf(bitrate),
                    ) {
                        bitrate = rates[it]
                        updateHint()
                    }
                }
            }
            renderExport = {
                val formats = if (kind == "audio") audioFormats else videoFormats
                if (type !in formats.map { it.first }) type = formats.firstOrNull()?.first ?: "wav"
                formatBox.removeAllViews()
                formatBox.addView(label("Формат"))
                if (formats.isNotEmpty())
                    formatBox.addView(
                        select(
                            formats.map { it.second },
                            formats.indexOfFirst { it.first == type },
                        ) {
                            type = formats[it].first
                            advancedControls()
                            updateHint()
                        }
                    )
                advancedControls()
                updateHint()
                if (formats.isEmpty()) {
                    hint.text = "Нет доступного кодировщика для этих настроек."
                }
                save.isEnabled = formats.isNotEmpty()
            }
            advanced.addButton("По умолчанию") {
                rate = 48000
                channels = 2
                bits = 16
                fps = 30
                height = 720
                quality = 1
                bitrate = 192000
                advancedControls()
                updateHint()
            }
            lateinit var d: android.app.AlertDialog
            save =
                button("Сохранить") {
                        runCatching {
                                chooseFile(
                                    options(),
                                    name.text.toString().trim().ifEmpty { "Мой трек" },
                                )
                                d.dismiss()
                            }
                            .onFailure(::error)
                    }
                    .apply {
                        val p = ReferencePalette(this@with)
                        background = shape(p.accent, p.border)
                        setTextColor(p.on)
                    }
            box.addView(save, LinearLayout.LayoutParams(-1, dp(43)).apply { topMargin = dp(10) })
            lateinit var basicTab: Button
            lateinit var advancedTab: Button
            fun tab(advancedMode: Boolean) {
                basic.visibility = if (advancedMode) View.GONE else View.VISIBLE
                advanced.visibility = if (advancedMode) View.VISIBLE else View.GONE
                val p = ReferencePalette(this)
                for ((button, active) in
                    listOf(basicTab to !advancedMode, advancedTab to advancedMode)) {
                    button.background = shape(p.raised, if (active) p.accent else p.border)
                    button.setTextColor(if (active) p.accent else p.text)
                }
            }
            basicTab = button("Основные") { tab(false) }
            advancedTab = button("Advanced") { tab(true) }
            tabs.addView(basicTab, LinearLayout.LayoutParams(0, dp(43), 1f))
            tabs.addView(
                advancedTab,
                LinearLayout.LayoutParams(0, dp(43), 1f).apply { leftMargin = dp(6) },
            )
            tab(false)
            renderExport?.invoke()
            d = sheet("Сохранить файл", box, width = 460, close = "‹")
            d.setOnDismissListener { renderExport = null }
            if (
                Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                        PackageManager.PERMISSION_GRANTED
            )
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 201)
        }

    private var renderExport: (() -> Unit)? = null
}

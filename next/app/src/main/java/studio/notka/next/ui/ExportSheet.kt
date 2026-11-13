package studio.notka.next.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.widget.*
import studio.notka.next.MainActivity
import studio.notka.next.export.*

class ExportSheet(private val activity: MainActivity) {
    fun show(initial: String? = null) {
        with(activity) {
            if (ExportService.busy) {
                message("Экспорт", ExportService.status)
                return
            }
            transport.pause()
            stopPreview()
            val box = column()
            val formats = ExportOptions.formats()
            fun spinner(title: String, values: List<String>, selected: Int = 0): Spinner {
                box.addView(label(title))
                return Spinner(this).apply {
                    adapter =
                        ArrayAdapter(
                            this@with,
                            android.R.layout.simple_spinner_dropdown_item,
                            values,
                        )
                    setSelection(selected.coerceAtLeast(0))
                    box.addView(this)
                }
            }
            val format =
                spinner(
                    "Формат",
                    formats.map { it.second },
                    formats.indexOfFirst { it.first == (initial ?: "wav") },
                )
            val rate = spinner("Частота звука", listOf("32 000 Гц", "44 100 Гц", "48 000 Гц"), 2)
            val channels = spinner("Каналы", listOf("Моно", "Стерео"), 1)
            val bits = spinner("Разрядность WAV", listOf("16 бит", "24 бита"))
            val audioRate =
                spinner(
                    "Качество сжатого звука",
                    listOf("96 кбит/с", "128 кбит/с", "192 кбит/с", "256 кбит/с", "320 кбит/с"),
                    2,
                )
            val fps = spinner("Кадров в секунду", listOf("24", "25", "30", "50", "60"), 2)
            val size = spinner("Размер видео", listOf("480p", "720p", "1080p"), 1)
            val videoRate =
                spinner(
                    "Качество видео",
                    listOf("2 Мбит/с", "4 Мбит/с", "8 Мбит/с", "12 Мбит/с", "20 Мбит/с"),
                    2,
                )
            val portrait = CheckBox(this).apply { text = "Вертикальное видео" }
            box.addView(portrait)
            val muted = CheckBox(this).apply { text = "Включить выключенные дорожки" }
            box.addView(muted)
            box.addView(label("Недоступные на телефоне форматы скрыты. Opus использует 48 кГц."))
            val dialog =
                form("Экспорт", box) {
                    val options =
                        ExportOptions(
                                formats[format.selectedItemPosition].first,
                                listOf(32000, 44100, 48000)[rate.selectedItemPosition],
                                channels.selectedItemPosition + 1,
                                listOf(16, 24)[bits.selectedItemPosition],
                                listOf(24, 25, 30, 50, 60)[fps.selectedItemPosition],
                                listOf(480, 720, 1080)[size.selectedItemPosition],
                                portrait.isChecked,
                                muted.isChecked,
                                listOf(96000, 128000, 192000, 256000, 320000)[
                                    audioRate.selectedItemPosition],
                                listOf(2000000, 4000000, 8000000, 12000000, 20000000)[
                                    videoRate.selectedItemPosition],
                            )
                            .validate()
                    getSharedPreferences("export", 0)
                        .edit()
                        .putString("pending", options.json())
                        .apply()
                    startActivityForResult(
                        Intent(Intent.ACTION_CREATE_DOCUMENT)
                            .addCategory(Intent.CATEGORY_OPENABLE)
                            .setType(options.mime)
                            .putExtra(
                                Intent.EXTRA_TITLE,
                                "${app.songName?:"Мой трек"}.${options.extension}",
                            ),
                        104,
                    )
                }
            dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).text = "Выбрать файл"
            if (
                Build.VERSION.SDK_INT >= 33 &&
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                        PackageManager.PERMISSION_GRANTED
            )
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 201)
        }
    }
}

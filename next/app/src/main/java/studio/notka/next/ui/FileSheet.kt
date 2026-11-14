package studio.notka.next.ui

import android.view.*
import android.widget.*
import java.io.File
import studio.notka.next.MainActivity

/** Only named app-owned downloads are listed; user projects are never treated as cache. */
class FileSheet(private val activity: MainActivity) {
    private data class Item(
        val id: String,
        val name: String,
        val bytes: Long,
        val group: String,
        val remove: () -> Unit,
    )

    fun show(onClose: () -> Unit = {}) =
        with(activity) {
            val box = column()
            val total = label("")
            box.addView(total)
            val query = field("").apply { hint = "Найти файл…" }
            box.addView(query)
            val selected = mutableSetOf<String>()
            val list = column()
            val delete = button("Удалить выбранные") {}
            box.addView(delete)
            box.addView(list)
            fun items(): List<Item> {
                val banks =
                    app.banks.entries
                        .filter { !it.builtin && app.banks.installed(it.id) }
                        .map { entry ->
                            Item(
                                "bank:${entry.id}",
                                entry.name,
                                File(filesDir, "banks/${entry.asset}.json").length(),
                                "Звуки",
                            ) {
                                app.banks.remove(entry.id)
                            }
                        }
                val root = File(filesDir, "updates").canonicalFile
                val updates =
                    root
                        .listFiles()
                        ?.filter { it.isFile && it.name.matches(Regex("Notka2-[0-9]+\\.apk")) }
                        ?.map { file ->
                            Item("apk:${file.name}", file.name, file.length(), "Обновления APK") {
                                require(file.canonicalFile.parentFile == root)
                                check(file.delete()) { "Не удалось удалить файл" }
                            }
                        } ?: emptyList()
                return banks + updates
            }
            fun render() {
                val all = items()
                selected.retainAll(all.map { it.id }.toSet())
                total.text =
                    "Скачано: ${all.size} · " +
                        "%.1f".format(all.sumOf { it.bytes } / 1048576.0) +
                        " МБ"
                list.removeAllViews()
                delete.visibility = if (selected.isEmpty()) View.GONE else View.VISIBLE
                delete.text = "Удалить выбранные (${selected.size})"
                for ((group, entries) in
                    all.filter { it.name.contains(query.text.toString().trim(), true) }
                        .groupBy { it.group }) {
                    val content = column()
                    list.addButton("▾ $group") {
                        content.visibility =
                            if (content.visibility == View.GONE) View.VISIBLE else View.GONE
                    }
                    content.addButton("Выбрать все") {
                        if (entries.all { it.id in selected })
                            selected.removeAll(entries.map { it.id }.toSet())
                        else selected.addAll(entries.map { it.id })
                        render()
                    }
                    for (item in entries) {
                        val row = row()
                        row.addView(
                            ReferenceCheck(this, item.id in selected, "Выбрать ${item.name}") {
                                value ->
                                if (value) selected.add(item.id) else selected.remove(item.id)
                                delete.visibility =
                                    if (selected.isEmpty()) View.GONE else View.VISIBLE
                                delete.text = "Удалить выбранные (${selected.size})"
                            },
                            LinearLayout.LayoutParams(dp(28), dp(44)),
                        )
                        val name =
                            label(item.name + "\n" + "%.1f".format(item.bytes / 1048576.0) + " МБ")
                        row.addView(name, LinearLayout.LayoutParams(0, -2, 1f))
                        row.addView(
                            iconButton("trash", "Удалить ${item.name}") {
                                confirm("Удалить файл", item.name) {
                                    background("", item.remove, { render() })
                                }
                            },
                            LinearLayout.LayoutParams(dp(44), dp(44)),
                        )
                        content.addView(row)
                    }
                    list.addView(content)
                }
                if (all.isEmpty()) list.addView(label("Скачанных файлов пока нет"))
            }
            delete.setOnClickListener {
                val targets = items().filter { it.id in selected }
                confirm("Удалить выбранные файлы?", targets.joinToString("\n") { it.name }) {
                    background(
                        "",
                        { targets.forEach { it.remove() } },
                        {
                            selected.clear()
                            render()
                        },
                    )
                }
            }
            query.onTextChanged { render() }
            render()
            sheet("Скачанные файлы", box, width = 385, close = "‹", panel = true, onClose = onClose)
        }
}

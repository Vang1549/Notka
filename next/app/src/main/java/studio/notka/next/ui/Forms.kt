package studio.notka.next.ui

import android.app.AlertDialog
import android.content.Context
import android.text.InputType
import android.view.View
import android.widget.*

fun Context.dp(value: Int) = (value * resources.displayMetrics.density + .5f).toInt()

fun String.uiNumber(): Double =
    trim().replace(',', '.').toDouble().also { require(it.isFinite()) { "Введи обычное число" } }

fun Context.column() =
    LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(8), dp(16), dp(8))
    }

fun Context.row() =
    LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = android.view.Gravity.CENTER_VERTICAL
    }

fun Context.label(text: String) =
    TextView(this).apply {
        this.text = text
        textSize = 14f
        setPadding(0, dp(6), 0, dp(4))
    }

fun Context.button(text: String, action: () -> Unit) =
    Button(this).apply {
        this.text = text
        isAllCaps = false
        minWidth = dp(44)
        minimumWidth = dp(44)
        setOnClickListener { action() }
    }

fun LinearLayout.addButton(text: String, action: () -> Unit) {
    addView(context.button(text, action))
}

fun Context.field(value: String, numeric: Boolean = false) =
    EditText(this).apply {
        setText(value)
        setSingleLine()
        if (numeric)
            inputType =
                InputType.TYPE_CLASS_NUMBER or
                    InputType.TYPE_NUMBER_FLAG_DECIMAL or
                    InputType.TYPE_NUMBER_FLAG_SIGNED
        selectAll()
    }

fun Context.message(title: String, text: String) {
    AlertDialog.Builder(this)
        .setTitle(title)
        .setMessage(text)
        .setPositiveButton("Понятно", null)
        .show()
}

fun Context.confirm(title: String, text: String, action: () -> Unit) {
    AlertDialog.Builder(this)
        .setTitle(title)
        .setMessage(text)
        .setNegativeButton("Отмена", null)
        .setPositiveButton("Да") { _, _ -> action() }
        .show()
}

fun Context.form(title: String, content: View, save: () -> Unit): AlertDialog {
    val scroll = ScrollView(this).apply { addView(content) }
    val dialog =
        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(scroll)
            .setNegativeButton("Отмена", null)
            .setPositiveButton("Сохранить", null)
            .create()
    dialog.setOnShowListener {
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            try {
                save()
                dialog.dismiss()
            } catch (e: Exception) {
                message("Проверь значения", e.message ?: "Неверное значение")
            }
        }
    }
    dialog.show()
    return dialog
}

fun Context.prompt(
    title: String,
    value: String = "",
    numeric: Boolean = false,
    save: (String) -> Unit,
): AlertDialog {
    val box = column()
    val edit = field(value, numeric)
    box.addView(edit)
    return form(title, box) { save(edit.text.toString().trim()) }
}

fun Context.choice(title: String, labels: List<String>, action: (Int) -> Unit): AlertDialog =
    AlertDialog.Builder(this)
        .setTitle(title)
        .setItems(labels.toTypedArray()) { _, i -> action(i) }
        .setNegativeButton("Закрыть", null)
        .show()

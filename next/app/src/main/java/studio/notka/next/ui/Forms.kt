package studio.notka.next.ui

import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.*

fun Context.dp(value: Int) = (value * resources.displayMetrics.density + .5f).toInt()

fun String.uiNumber(): Double =
    trim().replace(',', '.').toDouble().also { require(it.isFinite()) { "Введи обычное число" } }

fun Context.column() =
    LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, 0, 0, 0)
    }

fun Context.row() =
    LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = android.view.Gravity.CENTER_VERTICAL
    }

fun Context.label(text: String) =
    TextView(this).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f)
        setTextColor(ReferencePalette(this@label).text)
        includeFontPadding = false
        setPadding(0, dp(6), 0, dp(4))
    }

fun Context.button(text: String, action: () -> Unit) =
    ReferenceButton(this).apply {
        this.text = text
        setOnClickListener { action() }
    }

fun LinearLayout.addButton(text: String, action: () -> Unit) {
    addView(
        context.button(text, action),
        LinearLayout.LayoutParams(-1, context.dp(43)).apply {
            topMargin = if (childCount == 0) 0 else context.dp(8)
        },
    )
}

fun Context.field(value: String, numeric: Boolean = false) =
    EditText(this).apply {
        setText(value)
        setSingleLine()
        val palette = ReferencePalette(this@field)
        setTextColor(palette.text)
        setHintTextColor(palette.muted)
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f)
        includeFontPadding = false
        background = this@field.shape(palette.raised, palette.border, 8f)
        setPadding(dp(8), dp(6), dp(8), dp(6))
        minimumHeight = dp(42)
        if (numeric)
            inputType =
                InputType.TYPE_CLASS_NUMBER or
                    InputType.TYPE_NUMBER_FLAG_DECIMAL or
                    InputType.TYPE_NUMBER_FLAG_SIGNED
        selectAll()
    }

/** Same centered card, border, heading and close control as the 0.80 shade. */
fun Context.sheet(
    title: String,
    content: View,
    width: Int = 380,
    close: String = "Готово",
    onClose: () -> Unit = {},
): AlertDialog {
    val palette = ReferencePalette(this)
    val card = column().apply { setPadding(dp(17), dp(17), dp(17), dp(17)) }
    val heading = row()
    if (title.isNotEmpty())
        heading.addView(
            label(title).apply {
                tag = "sheetTitle"
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 20f)
                setTypeface(typeface, Typeface.BOLD)
                setPadding(0, 0, 0, 0)
            },
            LinearLayout.LayoutParams(0, -2, 1f),
        )
    else heading.addView(View(this), LinearLayout.LayoutParams(0, 1, 1f))
    lateinit var dialog: AlertDialog
    heading.addView(
        button(close) {
            onClose()
            dialog.dismiss()
        },
        LinearLayout.LayoutParams(-2, dp(43)),
    )
    card.addView(heading, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = dp(14) })
    card.addView(content)
    val scroll =
        object : ScrollView(this) {
                override fun onMeasure(width: Int, height: Int) {
                    val limit = resources.displayMetrics.heightPixels - context.dp(24)
                    val size = View.MeasureSpec.getSize(height)
                    val mode = View.MeasureSpec.getMode(height)
                    val bounded =
                        if (mode == View.MeasureSpec.UNSPECIFIED || size > limit)
                            View.MeasureSpec.makeMeasureSpec(limit, View.MeasureSpec.AT_MOST)
                        else height
                    super.onMeasure(width, bounded)
                }
            }
            .apply {
                background = shape(palette.bg, palette.border, 18f)
                clipToOutline = true
                isFillViewport = false
                addView(card)
                isVerticalScrollBarEnabled = false
            }
    dialog = AlertDialog.Builder(this).setView(scroll).create()
    dialog.setOnShowListener {
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            decorView.setPadding(0, 0, 0, 0)
            addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setDimAmount(2f / 3)
            setLayout(minOf(dp(width), resources.displayMetrics.widthPixels - dp(24)), -2)
            val maximum = resources.displayMetrics.heightPixels - dp(24)
            scroll.measure(
                View.MeasureSpec.makeMeasureSpec(
                    minOf(dp(width), resources.displayMetrics.widthPixels - dp(24)),
                    View.MeasureSpec.EXACTLY,
                ),
                View.MeasureSpec.makeMeasureSpec(maximum, View.MeasureSpec.AT_MOST),
            )
            if (scroll.measuredHeight >= maximum)
                setLayout(minOf(dp(width), resources.displayMetrics.widthPixels - dp(24)), maximum)
            decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }
    dialog.show()
    return dialog
}

fun Context.message(title: String, text: String) {
    sheet(title, column().apply { addView(label(text)) }, close = "Понятно")
}

fun Context.confirm(title: String, text: String, action: () -> Unit) {
    val box = column()
    box.addView(label(text))
    lateinit var d: AlertDialog
    val actions = row()
    actions.addView(
        button("Да") {
            d.dismiss()
            action()
        },
        LinearLayout.LayoutParams(0, dp(43), 1f),
    )
    actions.addView(
        button("Отмена") { d.dismiss() },
        LinearLayout.LayoutParams(0, dp(43), 1f).apply { leftMargin = dp(8) },
    )
    box.addView(actions)
    d = sheet(title, box, close = "✕")
}

fun Context.form(title: String, content: View, save: () -> Unit): AlertDialog {
    val box = column()
    box.addView(content)
    lateinit var d: AlertDialog
    box.addButton("Сохранить") {
        try {
            save()
            d.dismiss()
        } catch (e: Exception) {
            message("Проверь значения", e.message ?: "Неверное значение")
        }
    }
    d = sheet(title, box, close = "Отмена")
    return d
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

fun Context.choice(title: String, labels: List<String>, action: (Int) -> Unit): AlertDialog {
    val box = column()
    lateinit var d: AlertDialog
    labels.forEachIndexed { i, text ->
        box.addButton(text) {
            d.dismiss()
            action(i)
        }
    }
    d = sheet(title, box, close = "✕")
    return d
}

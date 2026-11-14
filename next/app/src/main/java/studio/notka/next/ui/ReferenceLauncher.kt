package studio.notka.next.ui

import android.content.Context
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.*
import studio.notka.next.BuildConfig

/** APK 0.68's launch card. Version labels describe the installed native release. */
class ReferenceLauncher(
    context: Context,
    onStart: (Boolean) -> Unit,
    onSettings: () -> Unit,
    onUpdate: () -> Unit,
    hasDraft: Boolean,
) : FrameLayout(context) {
    init {
        val p = ReferencePalette(context)
        theme { setBackgroundColor(it.bg) }
        val outer =
            ScrollView(context).apply {
                isFillViewport = true
                isVerticalScrollBarEnabled = false
            }
        val center =
            LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(context.dp(16), context.dp(16), context.dp(16), context.dp(16))
            }
        val card =
            context.column().apply {
                setPadding(context.dp(21), context.dp(21), context.dp(21), context.dp(21))
                theme { background = context.shape(it.bg, it.border, 18f) }
            }
        val top = context.row()
        val badge =
            context.label("♫").apply {
                theme {
                    background = context.shape(it.accent, 0, 7f)
                    setTextColor(it.on)
                }
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, 0)
                setTypeface(typeface, Typeface.BOLD)
            }
        top.addView(badge, LinearLayout.LayoutParams(context.dp(25), context.dp(29)))
        top.addView(
            context.label("Нотка").apply {
                setTypeface(typeface, Typeface.BOLD)
                setPadding(context.dp(9), 0, 0, 0)
            },
            LinearLayout.LayoutParams(0, -2, 1f),
        )
        top.addView(
            context.button("Настройки", onSettings).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
            }
        )
        card.addView(top)
        card.addView(
            context.label("Выбор версии").apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 26f)
                setTypeface(typeface, Typeface.BOLD)
                letterSpacing = -.04f
                setPadding(0, context.dp(3), 0, 0)
            },
            LinearLayout.LayoutParams(-1, -2).apply {
                topMargin = context.dp(10)
                bottomMargin = context.dp(10)
            },
        )
        card.addView(
            context
                .button(
                    "Запустить последнюю\nзагруженную версию:\n${BuildConfig.VERSION_NAME} — Нотка",
                    { onStart(false) },
                )
                .apply {
                    theme {
                        background = context.shape(it.accent, it.border)
                        setTextColor(it.on)
                    }
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                    val styled = android.text.SpannableString(text)
                    styled.setSpan(
                        android.text.style.StyleSpan(Typeface.BOLD),
                        text.lastIndexOf('\n') + 1,
                        text.length,
                        0,
                    )
                    text = styled
                    setLineSpacing(context.dp(3).toFloat(), 1f)
                    setPadding(context.dp(12), context.dp(12), context.dp(12), context.dp(12))
                },
            LinearLayout.LayoutParams(-1, -2),
        )
        val versions = context.column().apply { visibility = View.GONE }
        versions.addButton("${BuildConfig.VERSION_NAME} — Нотка") { onStart(false) }
        card.addButton("Другие версии ▾") {
            versions.visibility =
                if (versions.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
        card.addView(versions)
        card.addView(
            View(context).apply { theme { setBackgroundColor(it.border) } },
            LinearLayout.LayoutParams(-1, context.dp(1)).apply {
                topMargin = context.dp(14)
                bottomMargin = context.dp(12)
            },
        )
        for (line in
            listOf(
                "Редактор ${BuildConfig.VERSION_NAME}",
                "APK ${BuildConfig.VERSION_NAME}",
                "Панель ${BuildConfig.VERSION_NAME}",
            )) card.addView(
            context.label(line).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
                theme { setTextColor(it.muted) }
                setPadding(0, 0, 0, 0)
                minimumHeight = context.dp(19)
                if (line.startsWith("APK")) {
                    contentDescription = "Проверить обновления APK"
                    setOnClickListener { onUpdate() }
                }
            },
            LinearLayout.LayoutParams(-1, -2).apply { topMargin = context.dp(8) },
        )
        center.addView(
            card,
            LinearLayout.LayoutParams(
                minOf(context.dp(385), resources.displayMetrics.widthPixels - context.dp(32)),
                -2,
            ),
        )
        outer.addView(center)
        addView(outer, LayoutParams(-1, -1))
    }
}

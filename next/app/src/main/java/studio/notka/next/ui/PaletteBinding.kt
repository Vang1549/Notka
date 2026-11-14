package studio.notka.next.ui

import android.view.View
import android.view.ViewGroup
import studio.notka.next.R

/** Bind semantic roles, never infer them from RGB values: different roles may share a color. */
fun <T : View> T.theme(apply: T.(ReferencePalette) -> Unit): T {
    val binding: (ReferencePalette) -> Unit = { apply(it) }
    setTag(R.id.palette_binding, binding)
    binding(ReferencePalette(context))
    return this
}

fun applyPalette(view: View, palette: ReferencePalette) {
    @Suppress("UNCHECKED_CAST")
    (view.getTag(R.id.palette_binding) as? (ReferencePalette) -> Unit)?.invoke(palette)
    if (view is ViewGroup)
        for (i in 0 until view.childCount) applyPalette(view.getChildAt(i), palette)
    view.invalidate()
}

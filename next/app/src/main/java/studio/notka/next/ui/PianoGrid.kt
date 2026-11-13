package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.*
import kotlin.math.*
import studio.notka.core.*

class PianoGrid(context: Context, private val editor: Editor) : View(context) {
    private val density = resources.displayMetrics.density
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val selectionRect = RectF()
    var accent = Color.rgb(190, 238, 149)
    var surfaceColor = Color.rgb(19, 26, 23)
    var inkColor = Color.rgb(224, 232, 224)
    var onChange: () -> Unit = {}
    var onSelection: () -> Unit = {}
    var onPreview: (Int, Int) -> Unit = { _, _ -> }
    var onSeek: (Double) -> Unit = {}
    var selected = emptySet<Long>()
        private set

    var selectionMode = false
    var playTick = -1.0
    private var row = 26f * density
    private var beat = 90f * density
    private val keyWidth = 47f * density
    private val ruler = 28f * density
    var scrollXpx = 0.0
        private set

    private var scrollYpx = (119 - 76) * row.toDouble()
    val leftTick
        get() = max(0L, (scrollXpx / beat * PPQ).toLong())

    private var indexes = emptyMap<Long, NoteIndex>()
    private var indexedLists = emptyMap<Long, List<Note>>()
    private var seenProject: Project? = null
    private var downX = 0f
    private var downY = 0f
    private var originX = 0.0
    private var originY = 0.0
    private var hit: Note? = null
    private var mode = ""
    private var moved = false
    private var multi = false
    private var dragged = emptyList<Note>()
    private var draggedIds = emptySet<Long>()
    private var deltaTick = 0L
    private var deltaPitch = 0
    private var longPressed = false
    private var pendingReset = false
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val longPress = Runnable {
        if (!moved && !multi) {
            longPressed = true
            hit?.let {
                selected = if (it.id in selected) selected - it.id else selected + it.id
                onSelection()
                invalidate()
            }
        }
    }
    private val scale =
        ScaleGestureDetector(
                context,
                object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
                        multi = true
                        removeCallbacks(longPress)
                        dragged = emptyList()
                        return true
                    }

                    override fun onScale(detector: ScaleGestureDetector): Boolean {
                        val x = (scrollXpx + detector.focusX - keyWidth) / beat
                        val y = (scrollYpx + detector.focusY - ruler) / row
                        beat = (beat * detector.scaleFactor).coerceIn(24 * density, 480 * density)
                        row = (row * detector.scaleFactor).coerceIn(14 * density, 56 * density)
                        scrollXpx = max(0.0, x * beat - detector.focusX + keyWidth)
                        scrollYpx =
                            (y * row - detector.focusY + ruler).coerceIn(
                                0.0,
                                max(0.0, 96.0 * row - height + ruler),
                            )
                        invalidate()
                        return true
                    }
                },
            )
            .apply { isQuickScaleEnabled = false }

    init {
        isFocusable = true
        contentDescription =
            "Нотный редактор. Касание добавляет ноту, перетаскивание меняет её положение, правый край меняет длину. Масштаб — двумя пальцами."
    }

    fun refresh() {
        if (seenProject !== editor.project) {
            val prior = seenProject
            indexes =
                editor.project.lanes.associate { lane ->
                    lane.id to
                        (indexes[lane.id]?.takeIf { indexedLists[lane.id] === lane.notes }
                            ?: NoteIndex(lane.notes))
                }
            indexedLists = editor.project.lanes.associate { it.id to it.notes }
            if (prior?.lane?.notes !== editor.project.lane.notes)
                selected = selected.intersect(editor.project.lane.notes.map { it.id }.toSet())
            seenProject = editor.project
        }
        invalidate()
    }

    fun clearSelection() {
        selected = emptySet()
        onSelection()
        invalidate()
    }

    fun selectAll() {
        selected = editor.project.lane.notes.map { it.id }.toSet()
        onSelection()
        invalidate()
    }

    fun resetView() {
        if (height == 0) {
            pendingReset = true
            return
        }
        scrollXpx = 0.0
        val first = editor.project.lane.notes.minByOrNull { it.start }
        scrollYpx =
            ((119 - (first?.pitch ?: 66)) * row - height / 2.0).coerceIn(
                0.0,
                max(0.0, 96.0 * row - height + ruler),
            )
        clearSelection()
        refresh()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (pendingReset && h > 0) {
            pendingReset = false
            resetView()
        }
    }

    fun selection() = editor.project.lane.notes.filter { it.id in selected }

    private fun x(tick: Long) = (keyWidth + tick.toDouble() / PPQ * beat - scrollXpx).toFloat()

    private fun y(pitch: Int) = (ruler + (119 - pitch) * row - scrollYpx).toFloat()

    private fun tick(px: Float) =
        max(0.0, (px - keyWidth + scrollXpx) / beat * PPQ)
            .coerceAtMost(MAX_TICK.toDouble())
            .toLong()

    private fun pitch(py: Float) =
        (119 - floor((py - ruler + scrollYpx) / row).toInt()).coerceIn(24, 119)

    private fun snap(tick: Long) =
        max(0L, (tick.toDouble() / editor.project.snapTick).roundToLong() * editor.project.snapTick)

    private fun color(c: Int, alpha: Int = 255) {
        paint.color = c
        paint.alpha = alpha
        paint.style = Paint.Style.FILL
        paint.shader = null
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(surfaceColor)
        val p = editor.project
        val top = pitch(ruler)
        val bottom = pitch(height.toFloat())
        val start = tick(keyWidth)
        val end = tick(width.toFloat()) + 1
        canvas.save()
        canvas.clipRect(keyWidth, ruler, width.toFloat(), height.toFloat())
        for (n in bottom..top) {
            val yy = y(n)
            color(if (n % 12 in sharp) Color.BLACK else inkColor, if (n % 12 in sharp) 30 else 7)
            canvas.drawRect(keyWidth, yy, width.toFloat(), yy + row, paint)
            color(inkColor, 15)
            canvas.drawLine(keyWidth, yy, width.toFloat(), yy, paint)
        }
        val division = p.viewDivision.takeIf { it > 0 } ?: p.division.takeIf { it > 0 } ?: 4
        var step = PPQ * 4 / division
        while (step.toDouble() / PPQ * beat < 7 * density) step *= 2
        var t = start / step * step
        while (t <= end) {
            color(inkColor, if (t % (4 * PPQ) == 0L) 80 else if (t % PPQ == 0L) 40 else 17)
            canvas.drawLine(x(t), ruler, x(t), height.toFloat(), paint)
            t += step
        }
        for (lane in p.lanes.filter { it.id != p.lane.id && it.ghost } + p.lane) {
            val notes = indexes[lane.id]?.query(start, end, bottom, top) ?: emptyList()
            for (original in notes) {
                val n =
                    if (lane.id == p.lane.id && dragged.isNotEmpty() && original.id in draggedIds) {
                        if (mode == "resize") original.copy(len = max(1, original.len + deltaTick))
                        else
                            original.copy(
                                start = original.start + deltaTick,
                                pitch = original.pitch + deltaPitch,
                            )
                    } else original
                val selected = lane.id == p.lane.id && n.id in selected
                val alpha = if (lane.id == p.lane.id) max(55, n.volume * 2 + 55) else 55
                rect.set(
                    x(n.start) + 1,
                    y(n.pitch) + 2,
                    max(x(n.start) + 5 * density, x(n.end) - 1),
                    y(n.pitch) + row - 2,
                )
                color(if (selected) Color.WHITE else accent, alpha)
                canvas.drawRoundRect(rect, 4 * density, 4 * density, paint)
                if (lane.id == p.lane.id && rect.width() > 28 * density) {
                    color(surfaceColor)
                    paint.textSize = min(11 * density, row * .5f)
                    canvas.drawText(
                        noteName(n.pitch),
                        rect.left + 4 * density,
                        rect.centerY() + paint.textSize * .35f,
                        paint,
                    )
                }
            }
        }
        if (playTick >= 0) {
            color(Color.rgb(255, 172, 91))
            paint.strokeWidth = 2 * density
            val px = (keyWidth + playTick / PPQ * beat - scrollXpx).toFloat()
            canvas.drawLine(px, ruler, px, height.toFloat(), paint)
            paint.strokeWidth = 1f
        }
        if (mode == "select" && moved) {
            color(accent, 50)
            canvas.drawRect(selectionRect, paint)
            color(accent)
            paint.style = Paint.Style.STROKE
            canvas.drawRect(selectionRect, paint)
            paint.style = Paint.Style.FILL
        }
        canvas.restore()
        color(surfaceColor)
        canvas.drawRect(0f, 0f, keyWidth, height.toFloat(), paint)
        canvas.drawRect(keyWidth, 0f, width.toFloat(), ruler, paint)
        for (n in bottom..top) {
            val yy = y(n)
            color(if (n % 12 in sharp) Color.rgb(42, 49, 45) else Color.rgb(225, 231, 222))
            canvas.drawRect(0f, yy + 1, keyWidth - 2, yy + row - 1, paint)
            color(if (n % 12 in sharp) Color.WHITE else Color.DKGRAY)
            paint.textSize = 11 * density
            canvas.drawText(noteName(n), 4 * density, yy + row * .65f, paint)
        }
        color(inkColor)
        paint.textSize = 11 * density
        t = start / (PPQ * 4) * (PPQ * 4)
        while (t < end) {
            val px = x(t)
            if (px >= keyWidth)
                canvas.drawText(
                    (t / (PPQ * 4) + 1).toString(),
                    px + 3 * density,
                    ruler * .68f,
                    paint,
                )
            t += PPQ * 4
        }
        color(surfaceColor)
        canvas.drawRect(0f, 0f, keyWidth, ruler, paint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!isEnabled) return false
        scale.onTouchEvent(event)
        if (event.pointerCount > 1) {
            multi = true
            removeCallbacks(longPress)
            return true
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent.requestDisallowInterceptTouchEvent(true)
                downX = event.x
                downY = event.y
                originX = scrollXpx
                originY = scrollYpx
                moved = false
                multi = false
                longPressed = false
                deltaTick = 0
                deltaPitch = 0
                dragged = emptyList()
                hit =
                    if (event.x >= keyWidth && event.y >= ruler)
                        indexes[editor.project.lane.id]
                            ?.query(
                                tick(event.x),
                                tick(event.x) + 1,
                                pitch(event.y),
                                pitch(event.y),
                            )
                            ?.lastOrNull()
                    else null
                mode =
                    when {
                        event.y < ruler -> "seek"
                        event.x < keyWidth -> "key"
                        selectionMode -> "select"
                        hit != null && abs(x(hit!!.end) - event.x) < 12 * density -> "resize"
                        hit != null -> "move"
                        else -> "scroll"
                    }
                postDelayed(longPress, 450)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (multi) return true
                val dx = event.x - downX
                val dy = event.y - downY
                if (hypot(dx, dy) > slop) {
                    moved = true
                    removeCallbacks(longPress)
                }
                if (moved)
                    when (mode) {
                        "scroll" -> {
                            scrollXpx = max(0.0, originX - dx)
                            scrollYpx =
                                (originY - dy).coerceIn(0.0, max(0.0, 96.0 * row - height + ruler))
                        }
                        "move",
                        "resize" -> {
                            if (dragged.isEmpty()) {
                                hit?.let { if (it.id !in selected) selected = setOf(it.id) }
                                dragged = selection()
                                draggedIds = dragged.map { it.id }.toSet()
                                onSelection()
                            }
                            if (dragged.isNotEmpty()) {
                                val step = editor.project.snapTick
                                var d = (dx / beat * PPQ / step).roundToLong() * step
                                if (mode == "resize")
                                    d =
                                        d.coerceIn(
                                            1 - dragged.minOf { it.len },
                                            MAX_TICK - dragged.maxOf { it.end },
                                        )
                                else
                                    d =
                                        d.coerceIn(
                                            -dragged.minOf { it.start },
                                            MAX_TICK - dragged.maxOf { it.end },
                                        )
                                deltaTick = d
                                deltaPitch =
                                    if (mode == "move")
                                        (-dy / row)
                                            .roundToInt()
                                            .coerceIn(
                                                24 - dragged.minOf { it.pitch },
                                                119 - dragged.maxOf { it.pitch },
                                            )
                                    else 0
                            }
                        }
                        "select" ->
                            selectionRect.set(
                                min(downX, event.x),
                                min(downY, event.y),
                                max(downX, event.x),
                                max(downY, event.y),
                            )
                    }
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP -> {
                removeCallbacks(longPress)
                if (!multi && !longPressed) {
                    if (moved && dragged.isNotEmpty()) {
                        val ids = dragged.map { it.id }.toSet()
                        editor.updateNotes(ids) { n ->
                            if (mode == "resize") n.copy(len = n.len + deltaTick)
                            else n.copy(start = n.start + deltaTick, pitch = n.pitch + deltaPitch)
                        }
                        onChange()
                    } else if (mode == "select" && moved) {
                        selected =
                            indexes[editor.project.lane.id]
                                ?.query(
                                    tick(selectionRect.left),
                                    tick(selectionRect.right) + 1,
                                    pitch(selectionRect.bottom),
                                    pitch(selectionRect.top),
                                )
                                ?.map { it.id }
                                ?.toSet() ?: emptySet()
                        onSelection()
                    } else if (!moved)
                        when (mode) {
                            "key" -> onPreview(pitch(event.y), 100)
                            "seek" -> onSeek(tick(event.x) * 60.0 / editor.project.bpm / PPQ)
                            "move",
                            "resize" -> {
                                selected = setOf(hit!!.id)
                                onSelection()
                                onPreview(hit!!.pitch, hit!!.volume)
                            }
                            "select" -> {
                                hit?.let {
                                    selected =
                                        if (it.id in selected) selected - it.id
                                        else selected + it.id
                                }
                                onSelection()
                            }
                            else -> {
                                val p = pitch(event.y)
                                editor.addNote(
                                    snap(tick(event.x))
                                        .coerceAtMost(MAX_TICK - editor.project.defaultNoteLength),
                                    p,
                                )
                                selected = setOf(editor.project.nextNoteId - 1)
                                onChange()
                                onSelection()
                                onPreview(p, 100)
                            }
                        }
                }
                mode = ""
                dragged = emptyList()
                deltaTick = 0
                deltaPitch = 0
                invalidate()
                performClick()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                removeCallbacks(longPress)
                mode = ""
                dragged = emptyList()
                invalidate()
                return true
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    companion object {
        private val sharp = setOf(1, 3, 6, 8, 10)
        private val names = arrayOf("C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B")
        private val noteNames = Array(128) { p -> names[p % 12] + (p / 12 - 1) }

        fun noteName(p: Int) = noteNames[p]
    }
}

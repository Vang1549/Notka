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
    var onHint: (String) -> Unit = {}
    var isPlaying = false
    var palette = ReferencePalette(context)
    var template: Note? = null
    var instrumentMarks = emptyMap<String, Pair<String?, String>>()
    private val laneCenters = mutableMapOf<Long, Double>()
    private var copyLength = false
    private var previousDivision = 4
    private var lastTapId = -1L
    private var lastTapTime = 0L
    private var lastTapX = 0f
    private var lastTapY = 0f
    val editingGesture
        get() = pinchStart != null || (moved && mode in listOf("move", "resize", "select"))

    fun syncTemplate() {
        template = selection().firstOrNull() ?: template
    }

    private var previousSelection = emptySet<Long>()
    private var lastX = 0f
    private var lastY = 0f
    private var pinchStart: FloatArray? = null
    private var pinchScaleX = false
    private var pinchScaleY = false
    private var initialLayout = true
    val newNoteLength
        get() =
            if (copyLength) template?.len ?: editor.project.defaultNoteLength
            else editor.project.defaultNoteLength

    fun resetNoteTemplate() {
        copyLength = false
    }

    fun selectedBounds(): RectF? =
        selection().firstOrNull()?.let {
            RectF(x(it.start), y(it.pitch), x(it.end), y(it.pitch) + row)
        }

    fun duplicateSelection() {
        val notes = selection()
        if (notes.isEmpty()) return
        val shift = notes.maxOf { it.end } - notes.minOf { it.start }
        val first = editor.project.nextNoteId
        val copies = notes.mapIndexed { i, n -> n.copy(id = first + i, start = n.start + shift) }
        editor.change {
            it.replaceLane(it.activeLane, it.lane.copy(notes = it.lane.notes + copies))
        }
        selected = copies.map { it.id }.toSet()
        template = copies.first()
        copyLength = true
        val nx = x(copies.first().start)
        if (nx < keyWidth || nx >= width)
            scrollXpx =
                max(0.0, copies.first().start.toDouble() / PPQ * beat - beat / previousDivision)
        onChange()
        onSelection()
        invalidate()
    }

    fun follow(tick: Double) {
        if (tick < 0) return
        val px = tick / PPQ * beat
        if (px < scrollXpx || px >= scrollXpx + width - keyWidth) {
            scrollXpx = max(0.0, floor(tick / (4 * PPQ)) * 4 * beat)
            invalidate()
        }
    }

    var selected = emptySet<Long>()
        private set

    var selectionMode = false
    var playTick = -1.0
    private var row = 34f * density
    private var beat = 160f * density
    private val keyWidth = 32f * density
    private val ruler = 32f * density
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
        if (!moved && !multi && hit == null && mode == "scroll" && !isPlaying) {
            mode = "select"
            longPressed = true
            selectionRect.set(downX, downY, downX, downY)
            selected = emptySet()
            onSelection()
            invalidate()
        }
    }
    private val edgeScroll =
        object : Runnable {
            override fun run() {
                if (!moved || multi || mode !in listOf("move", "resize", "select")) return
                fun edge(v: Float, lo: Float, hi: Float) =
                    if (v < lo + 14 * density) -min(10 * density, .35f * (lo + 14 * density - v))
                    else if (v > hi - 14 * density)
                        min(10 * density, .35f * (v - hi + 14 * density))
                    else 0f
                val dx = edge(lastX, keyWidth, width.toFloat())
                val dy = if (mode == "resize") 0f else edge(lastY, ruler, height.toFloat())
                scrollXpx = max(0.0, scrollXpx + dx)
                scrollYpx = (scrollYpx + dy).coerceIn(0.0, max(0.0, 96.0 * row - height + ruler))
                updateDrag(lastX, lastY)
                invalidate()
                onSelection()
                postOnAnimation(this)
            }
        }

    private fun updateDrag(px: Float, py: Float) {
        val dx = px - downX + (scrollXpx - originX).toFloat()
        val dy = py - downY + (scrollYpx - originY).toFloat()
        if (mode == "select") {
            selectionRect.set(
                min(downX - (scrollXpx - originX).toFloat(), px),
                min(downY - (scrollYpx - originY).toFloat(), py),
                max(downX - (scrollXpx - originX).toFloat(), px),
                max(downY - (scrollYpx - originY).toFloat(), py),
            )
            selected =
                editor.project.lane.notes
                    .filter { n ->
                        x(n.start) < selectionRect.right &&
                            max(x(n.end) - density, x(n.start) + 6 * density) >
                                selectionRect.left &&
                            y(n.pitch) + 2 * density < selectionRect.bottom &&
                            y(n.pitch) + row - 2 * density > selectionRect.top
                    }
                    .map { it.id }
                    .toSet()
        } else if (dragged.isNotEmpty()) {
            val step = editor.project.snapTick
            var d = (dx / beat * PPQ / step).roundToLong() * step
            d =
                if (mode == "resize")
                    d.coerceIn(
                        dragged.maxOf { min(it.len, step) - it.len },
                        MAX_TICK - dragged.maxOf { it.end },
                    )
                else d.coerceIn(-dragged.minOf { it.start }, MAX_TICK - dragged.maxOf { it.end })
            deltaTick = d
            deltaPitch =
                if (mode == "move")
                    (-dy / row)
                        .roundToInt()
                        .coerceIn(24 - dragged.minOf { it.pitch }, 119 - dragged.maxOf { it.pitch })
                else 0
        }
    }

    init {
        isFocusable = true
        contentDescription =
            "Нотный редактор. Касание добавляет ноту, перетаскивание меняет её положение, правый край меняет длину. Масштаб — двумя пальцами."
    }

    fun refresh() {
        val div =
            editor.project.viewDivision.takeIf { it > 0 }
                ?: editor.project.division.takeIf { it > 0 }
                ?: 4
        if (div != previousDivision) {
            val time = scrollXpx / beat
            beat = beat / previousDivision * div
            scrollXpx = time * beat
            previousDivision = div
        }

        if (seenProject !== editor.project) {
            val prior = seenProject
            if (prior != null && prior.lane.id != editor.project.lane.id) {
                laneCenters[prior.lane.id] = (scrollYpx + (height - ruler) / 2) / row
                laneCenters[editor.project.lane.id]?.let {
                    scrollYpx =
                        (it * row - (height - ruler) / 2).coerceIn(
                            0.0,
                            max(0.0, 96.0 * row - height + ruler),
                        )
                }
                template = null
                copyLength = false
                selected = emptySet()
            }
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
        scrollYpx =
            ((119 - 66) * row - (height - ruler) / 2.0).coerceIn(
                0.0,
                max(0.0, 96.0 * row - height + ruler),
            )
        clearSelection()
        refresh()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (initialLayout && w > 0) {
            initialLayout = false
            beat =
                (w - keyWidth) / max(4, ((ceil(w / density.toDouble()) - 32) / 40).roundToInt()) *
                    previousDivision
            pendingReset = true
        }
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

    var onFrame: () -> Unit = {}

    override fun onDraw(canvas: Canvas) {
        onFrame()
        val theme = palette
        canvas.drawColor(theme.panel)
        val p = editor.project
        val top = pitch(ruler)
        val bottom = pitch(height.toFloat())
        val start = tick(keyWidth)
        val end = tick(width.toFloat()) + 1
        val step = PPQ / previousDivision
        val cellWidth = beat / previousDivision
        fun fill(c: Int) {
            color(c)
            paint.shader = null
            paint.style = Paint.Style.FILL
        }
        fun text(value: String, c: Int, size: Float, cx: Float, cy: Float, bold: Boolean = false) {
            fill(c)
            paint.textSize = size * density
            paint.typeface =
                if (android.os.Build.VERSION.SDK_INT >= 28)
                    Typeface.create(
                        Typeface.create("sans-serif", Typeface.NORMAL),
                        if (bold) 800 else if (size == 11f) 400 else 600,
                        false,
                    )
                else
                    Typeface.create(
                        if (bold) "sans-serif-black" else "sans-serif-medium",
                        Typeface.NORMAL,
                    )
            paint.textAlign = Paint.Align.CENTER
            canvas.drawText(value, cx, cy - (paint.ascent() + paint.descent()) / 2, paint)
        }
        canvas.save()
        canvas.clipRect(keyWidth, ruler, width.toFloat(), height.toFloat())
        for (n in bottom..top) {
            val yy = y(n)
            fill(if (n % 12 in sharp) theme.black else theme.cell)
            canvas.drawRect(keyWidth, yy, width.toFloat(), yy + row, paint)
            fill(theme.border)
            canvas.drawRect(keyWidth, yy + row - density, width.toFloat(), yy + row, paint)
        }
        var t = start / step * step
        while (t <= end) {
            val xx = x(t)
            fill(if (t % (4 * PPQ) == 0L) theme.line else theme.border)
            val sw = if (t % (4 * PPQ) == 0L) 2 * density else density
            canvas.drawRect(xx, ruler, xx + sw, height.toFloat(), paint)
            t += step
        }
        val layers = p.lanes.filter { it.id != p.lane.id && it.ghost } + p.lane
        for (lane in layers) {
            val ghost = lane.id != p.lane.id
            val notes = indexes[lane.id]?.query(start, end, bottom, top) ?: emptyList()
            for (original in notes.sortedBy { if (!ghost && it.id in selected) 1 else 0 }) {
                val n =
                    if (!ghost && original.id in draggedIds) {
                        if (mode == "resize") original.copy(len = max(1, original.len + deltaTick))
                        else
                            original.copy(
                                start = original.start + deltaTick,
                                pitch = original.pitch + deltaPitch,
                            )
                    } else original
                rect.set(
                    x(n.start),
                    y(n.pitch) + 2 * density,
                    max(x(n.start) + 6 * density, x(n.end) - density),
                    y(n.pitch) + row - 2 * density,
                )
                fill(if (ghost) Color.rgb(133, 133, 133) else theme.accent)
                paint.alpha = if (ghost) 166 else 255
                canvas.drawRoundRect(rect, 6 * density, 6 * density, paint)
                if (theme.depth && !ghost) {
                    paint.shader =
                        LinearGradient(
                            0f,
                            rect.top,
                            0f,
                            rect.bottom,
                            intArrayOf(0x66ffffff, 0x00ffffff, 0x33000000),
                            floatArrayOf(0f, .45f, 1f),
                            Shader.TileMode.CLAMP,
                        )
                    canvas.drawRoundRect(rect, 6 * density, 6 * density, paint)
                    paint.shader = null
                }
                fill(Color.argb(68, 0, 0, 0))
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = density
                canvas.drawRoundRect(rect, 6 * density, 6 * density, paint)
                paint.style = Paint.Style.FILL
                if (!ghost) {
                    fill(theme.on)
                    paint.alpha = 153
                    canvas.drawRoundRect(
                        RectF(
                            rect.right - 4 * density,
                            rect.top + rect.height() * .27f,
                            rect.right - 2 * density,
                            rect.top + rect.height() * .73f,
                        ),
                        density,
                        density,
                        paint,
                    )
                }
                if (!ghost && n.id in selected) {
                    fill(theme.cursor)
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = 2 * density
                    canvas.drawRoundRect(
                        RectF(
                            rect.left + density,
                            rect.top + density,
                            rect.right - density,
                            rect.bottom - density,
                        ),
                        5 * density,
                        5 * density,
                        paint,
                    )
                    paint.style = Paint.Style.FILL
                }
                val icon =
                    ReferenceIcon(
                        instrumentMarks[lane.instrument]?.first ?: "",
                        Color.argb(if (ghost) 36 else 56, 0, 0, 0),
                    )
                val sz =
                    min(13 * density, min(rect.width() - 3 * density, rect.height() - 2 * density))
                        .toInt()
                if (sz > 0) {
                    icon.setBounds(
                        (rect.left + 2 * density).toInt(),
                        (rect.bottom - density - sz).toInt(),
                        (rect.left + 2 * density + sz).toInt(),
                        (rect.bottom - density).toInt(),
                    )
                    if (instrumentMarks[lane.instrument]?.first != null) icon.draw(canvas)
                    else {
                        fill(theme.on)
                        paint.alpha = if (ghost) 36 else 56
                        paint.textAlign = Paint.Align.LEFT
                        paint.textSize = min(7 * density, sz.toFloat())
                        canvas.drawText(
                            instrumentMarks[lane.instrument]?.second ?: "Ин",
                            rect.left + 2 * density,
                            rect.bottom - 2 * density,
                            paint,
                        )
                    }
                }
            }
        }
        if (playTick >= 0) {
            fill(theme.cursor)
            val px = (keyWidth + playTick / PPQ * beat - scrollXpx).toFloat()
            canvas.drawRect(px, ruler, px + 2 * density, height.toFloat(), paint)
        }
        if (mode == "select") {
            fill(0x18ffffff)
            canvas.drawRect(selectionRect, paint)
            fill(theme.cursor)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = density
            canvas.drawRect(selectionRect, paint)
            paint.style = Paint.Style.FILL
        }
        canvas.restore()
        canvas.save()
        canvas.clipRect(0f, ruler, keyWidth, height.toFloat())
        for (n in bottom..top) {
            val yy = y(n)
            fill(if (n % 12 in sharp) theme.raised else theme.key)
            canvas.drawRect(0f, yy, keyWidth, yy + row, paint)
            fill(theme.border)
            canvas.drawRect(keyWidth - density, yy, keyWidth, yy + row, paint)
            canvas.drawRect(0f, yy + row - density, keyWidth, yy + row, paint)
            val c =
                if (n % 12 == 0) theme.accent else if (n % 12 in sharp) theme.muted else theme.text
            text(
                names[n % 12],
                c,
                min(12f, row / density * .5f),
                keyWidth / 2,
                yy + row / 2 - if (n % 12 == 0) 3.5f * density else 0f,
                n % 12 == 0,
            )
            if (n % 12 == 0)
                text((n / 12 - 1).toString(), c, 7f, keyWidth / 2, yy + row / 2 + 6 * density, true)
        }
        canvas.restore()
        fill(theme.panel)
        canvas.drawRect(0f, 0f, width.toFloat(), ruler, paint)
        canvas.save()
        canvas.clipRect(keyWidth, 0f, width.toFloat(), ruler)
        t = start / step * step
        val first = t
        while (t <= end) {
            val xx = x(t)
            fill(theme.border)
            canvas.drawRect(xx + cellWidth - density, 0f, xx + cellWidth, ruler, paint)
            canvas.drawRect(xx, ruler - density, xx + cellWidth, ruler, paint)
            val label =
                if (t % (4 * PPQ) == 0L) (1 + t / (4 * PPQ)).toString()
                else if (t % PPQ == 0L) (1 + t % (4 * PPQ) / PPQ).toString() else "·"
            val active = if (playTick >= 0) playTick >= t && playTick < t + step else t == first
            text(
                label,
                if (active) theme.cursor else if (t % (4 * PPQ) == 0L) theme.text else theme.muted,
                11f,
                xx + cellWidth / 2,
                ruler / 2,
                t % (4 * PPQ) == 0L,
            )
            if (active) {
                fill(theme.cursor)
                canvas.drawRect(xx, ruler - 3 * density, xx + cellWidth, ruler, paint)
            }
            t += step
        }
        canvas.restore()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!isEnabled) return false
        lastX = event.x
        lastY = event.y
        if (event.actionMasked == MotionEvent.ACTION_POINTER_UP && event.pointerCount == 2) {
            val remaining = if (event.actionIndex == 0) 1 else 0
            downX = event.getX(remaining)
            downY = event.getY(remaining)
            originX = scrollXpx
            originY = scrollYpx
            pinchStart = null
            multi = false
            moved = true
            mode = "scroll"
            hit = null
            dragged = emptyList()
            draggedIds = emptySet()
            return true
        }
        if (event.pointerCount >= 2) {
            removeCallbacks(longPress)
            removeCallbacks(edgeScroll)
            val cx = (event.getX(0) + event.getX(1)) / 2 - keyWidth
            val cy = (event.getY(0) + event.getY(1)) / 2 - ruler
            val sx = abs(event.getX(0) - event.getX(1))
            val sy = abs(event.getY(0) - event.getY(1))
            if (pinchStart == null) {
                pinchStart =
                    floatArrayOf(
                        cx,
                        cy,
                        sx,
                        sy,
                        beat,
                        row,
                        scrollXpx.toFloat(),
                        scrollYpx.toFloat(),
                    )
                pinchScaleX = sx >= max(12 * density, .4f * sy)
                pinchScaleY = sy >= max(12 * density, .4f * sx)
                dragged = emptyList()
                draggedIds = emptySet()
                if (selected.size < 2) clearSelection()
            }
            val a = pinchStart!!
            if (pinchScaleX && !isPlaying)
                beat =
                    (a[4] * sx / max(1f, a[2])).coerceIn(
                        12 * density * previousDivision,
                        160 * density * previousDivision,
                    )
            if (pinchScaleY) row = (a[5] * sy / max(1f, a[3])).coerceIn(16 * density, 96 * density)
            if (!isPlaying) scrollXpx = max(0.0, ((a[6] + a[0]) / a[4] * beat - cx).toDouble())
            scrollYpx =
                ((a[7] + a[1]) / a[5] * row - cy)
                    .toDouble()
                    .coerceIn(0.0, max(0.0, 96.0 * row - height + ruler))
            multi = true
            onSelection()
            invalidate()
            return true
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent.requestDisallowInterceptTouchEvent(true)
                pinchStart = null
                multi = false
                moved = false
                longPressed = false
                downX = event.x
                downY = event.y
                originX = scrollXpx
                originY = scrollYpx
                deltaTick = 0
                deltaPitch = 0
                dragged = emptyList()
                draggedIds = emptySet()
                previousSelection = selected
                hit =
                    if (!isPlaying && event.x >= keyWidth && event.y >= ruler)
                        editor.project.lane.notes.lastOrNull { n ->
                            n.pitch == pitch(event.y) &&
                                event.x >= x(n.start) &&
                                event.x < max(x(n.end), x(n.start) + 6 * density)
                        }
                    else null
                mode =
                    when {
                        event.y < ruler -> "seek"
                        event.x < keyWidth -> "key"
                        hit != null &&
                            x(hit!!.end) - event.x <=
                                min(
                                    14 * density,
                                    .35f * max(6 * density, x(hit!!.end) - x(hit!!.start)),
                                ) -> "resize"
                        hit != null -> "move"
                        selectionMode && !isPlaying -> "select"
                        else -> "scroll"
                    }
                if (hit != null) {
                    val n = hit!!
                    if (n.id !in selected) selected = setOf(n.id)
                    template = n
                    copyLength = true
                    dragged = selection()
                    draggedIds = dragged.map { it.id }.toSet()
                    onSelection()
                    onPreview(n.pitch, n.volume)
                }
                if (!isPlaying) postDelayed(longPress, 350)
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (multi) return true
                val dx = event.x - downX
                val dy = event.y - downY
                if (
                    hypot(dx, dy) > (if (mode == "move" || mode == "resize") 2 else 7) * density ||
                        mode == "select"
                ) {
                    moved = true
                    removeCallbacks(longPress)
                }
                if (moved) {
                    if (mode in listOf("move", "resize", "select")) {
                        updateDrag(event.x, event.y)
                        removeCallbacks(edgeScroll)
                        postOnAnimation(edgeScroll)
                    } else {
                        if (downX >= keyWidth && !isPlaying) scrollXpx = max(0.0, originX - dx)
                        if (downY >= ruler)
                            scrollYpx =
                                (originY - dy).coerceIn(0.0, max(0.0, 96.0 * row - height + ruler))
                        if (selected.size < 2) selected = emptySet()
                    }
                    onSelection()
                    invalidate()
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                removeCallbacks(longPress)
                removeCallbacks(edgeScroll)
                if (!multi) {
                    if (moved && mode in listOf("move", "resize") && dragged.isNotEmpty()) {
                        editor.updateNotes(draggedIds) { n ->
                            if (mode == "resize") n.copy(len = n.len + deltaTick)
                            else n.copy(start = n.start + deltaTick, pitch = n.pitch + deltaPitch)
                        }
                        template = selection().firstOrNull()
                        onChange()
                    } else if (mode == "select") {
                        template = selection().firstOrNull() ?: template
                        copyLength = selected.isNotEmpty()
                    } else if (!moved && !isPlaying) {
                        when (mode) {
                            "key" -> onPreview(pitch(event.y), template?.volume ?: 100)
                            "seek" -> {
                                clearSelection()
                                scrollXpx = (tick(event.x) / (4 * PPQ) * 4 * beat).toDouble()
                                onSeek(scrollXpx / beat * 60 / editor.project.bpm)
                            }
                            "move",
                            "resize" -> {
                                val n = hit!!
                                val now = android.os.SystemClock.uptimeMillis()
                                if (
                                    selected.size == 1 &&
                                        lastTapId == n.id &&
                                        now - lastTapTime <= 320 &&
                                        hypot(event.x - lastTapX, event.y - lastTapY) < 24 * density
                                ) {
                                    editor.deleteNotes(setOf(n.id))
                                    selected = emptySet()
                                    onChange()
                                    lastTapId = -1
                                } else {
                                    lastTapId = n.id
                                    lastTapTime = now
                                    lastTapX = event.x
                                    lastTapY = event.y
                                }
                            }
                            else -> {
                                if (previousSelection.size > 1) selected = emptySet()
                                else {
                                    val pitch = pitch(event.y)
                                    val step = editor.project.snapTick
                                    val start = tick(event.x) / step * step
                                    val length =
                                        if (copyLength)
                                            template?.len ?: editor.project.defaultNoteLength
                                        else editor.project.defaultNoteLength
                                    if (
                                        editor.project.lane.notes.any {
                                            it.pitch == pitch &&
                                                it.start < start + length &&
                                                it.end > start
                                        }
                                    )
                                        onHint(
                                            "Для этой длины здесь не хватает места. Выбери другую позицию."
                                        )
                                    else {
                                        val volume = template?.volume ?: 100
                                        editor.addNote(start, pitch, length, volume)
                                        template = editor.project.lane.notes.last()
                                        selected = emptySet()
                                        onHint("")
                                        onChange()
                                        onPreview(pitch, volume)
                                    }
                                }
                            }
                        }
                    }
                }
                mode = ""
                dragged = emptyList()
                draggedIds = emptySet()
                pinchStart = null
                onSelection()
                invalidate()
                performClick()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                removeCallbacks(longPress)
                removeCallbacks(edgeScroll)
                selected = previousSelection
                mode = ""
                dragged = emptyList()
                draggedIds = emptySet()
                pinchStart = null
                onSelection()
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

        fun noteName(p: Int) =
            arrayOf(
                "До",
                "До♯",
                "Ре",
                "Ре♯",
                "Ми",
                "Фа",
                "Фа♯",
                "Соль",
                "Соль♯",
                "Ля",
                "Ля♯",
                "Си",
            )[p % 12] + (p / 12 - 1)
    }
}

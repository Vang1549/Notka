package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.View
import kotlin.math.*
import kotlinx.serialization.json.*
import studio.notka.core.*

/** The same renderer is used by the player, preset preview and video exporter. */
class SceneRenderer(val project: Project, private val looping: Boolean = false) {
    private val options = SceneOptions.normalize(project.scene)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val indexes = project.lanes.map { NoteIndex(it.notes) }
    private val secondsPerTick = 60.0 / project.bpm / PPQ
    private val period =
        max(
            .1,
            (project.lanes
                .filter { !it.muted }
                .maxOfOrNull { lane -> lane.notes.maxOfOrNull { it.end } ?: 0L } ?: 0L) *
                secondsPerTick,
        )
    private val black = setOf(1, 3, 6, 8, 10)
    private val palettes =
        mapOf(
            "basic" to listOf("#00ff00", "#0000ff"),
            "aurora" to listOf("#62dfc4", "#a898ff", "#ffbc79", "#74bfff", "#f794bc", "#d9e59b"),
            "ember" to listOf("#ffbc79", "#ff7e76", "#efcf8b", "#f596b2"),
            "ice" to listOf("#76d9ff", "#8cabff", "#8ff0dc", "#bdc9ff"),
            "iris" to listOf("#bca1ff", "#f597d0", "#81b5ff", "#dcadff"),
        )
    private val range: IntRange

    init {
        val notes = project.lanes.filter { !it.muted }.flatMap { it.notes }
        var low = notes.minOfOrNull { it.pitch } ?: 48
        var high = notes.maxOfOrNull { it.pitch } ?: 83
        if (options.text("rangeMode") == "manual") {
            low = options.number("keyStart").toInt()
            high = low + options.number("keyCount").toInt() - 1
        } else {
            if (options.flag("octaveRange", true)) {
                low = (low / 12) * 12
                high = min(127, (high / 12 + 1) * 12 - 1)
            } else {
                low = max(0, floor((low - 2) / 12.0).toInt() * 12)
                high = min(127, ceil((high + 3) / 12.0).toInt() * 12 - 1)
                if (high - low + 1 < 48) {
                    val extra = 48 - (high - low + 1)
                    low = max(0, low - (extra / 24) * 12)
                    high = min(127, low + 47)
                    low = max(0, high - 47)
                }
            }
        }
        range = low..high
    }

    fun color(laneIndex: Int): Int {
        val lane = project.lanes[laneIndex]
        val mode = options.text("colorMode")
        val key =
            when (mode) {
                "single" -> "single"
                "instrument" -> "instrument-${lane.instrumentId}"
                else -> "lane-$laneIndex"
            }
        val custom = (options["colors"] as? JsonObject)?.text(key)
        if (custom == "transparent") return Color.TRANSPARENT
        if (!custom.isNullOrEmpty()) return Color.parseColor(custom)
        val palette = options.text("palette")
        val colors = palettes[palette] ?: palettes.getValue("basic")
        val index =
            when (mode) {
                "single" -> 0
                "instrument" ->
                    project.instruments.indexOfFirst { it.id == lane.instrumentId }.coerceAtLeast(0)
                else -> laneIndex
            }
        if (palette != "basic" || index < 2) return Color.parseColor(colors[index % colors.size])
        var seed = (index + 1) * 2654435761L xor options.number("colorSeed", 1.0).toLong()
        seed = seed xor (seed ushr 16)
        return Color.HSVToColor(floatArrayOf(((seed and 0xffffffffL) % 360).toFloat(), .89f, .95f))
    }

    private fun fill(color: Int, alpha: Int = 255) {
        paint.shader = null
        paint.color = color
        paint.alpha = alpha
        paint.style = Paint.Style.FILL
    }

    fun draw(canvas: Canvas, width: Int, height: Int, seconds: Double) {
        if (width < 1 || height < 1) return
        val w = width.toFloat()
        val h = height.toFloat()
        val keyboard = h * options.number("keyboardHeight", 18.0).toFloat() / 100
        val line = h - keyboard
        val travel = 3.6 / options.number("speed", 1.0)
        val background = Color.parseColor(options.text("background", "#000000"))
        canvas.drawColor(background)
        when (options.text("backdrop")) {
            "aurora" -> {
                paint.shader =
                    LinearGradient(
                        0f,
                        0f,
                        w,
                        h,
                        intArrayOf(background, Color.rgb(14, 29, 40), background),
                        null,
                        Shader.TileMode.CLAMP,
                    )
                paint.alpha = 255
                canvas.drawRect(0f, 0f, w, h, paint)
                paint.shader = null
            }
            "stars" -> {
                fill(Color.WHITE, 100)
                repeat(65) { i ->
                    val x = ((i * 193 + 27) % 997) / 997f * w
                    val y = ((i * 487 + 31) % 991) / 991f * line
                    canvas.drawCircle(x, y, 1f + (i % 2), paint)
                }
            }
        }
        val whites = range.count { it % 12 !in black }.coerceAtLeast(1)
        val leftEdge = if (range.first % 12 in black) -.3f else 0f
        val rightEdge = whites + (if (range.last % 12 in black) .3f else 0f)
        val keyWidth = w / (rightEdge - leftEdge)
        val centers = FloatArray(128)
        var white = 0
        for (p in range) {
            if (p % 12 in black) centers[p] = (white - leftEdge) * keyWidth
            else {
                centers[p] = (white + .5f - leftEdge) * keyWidth
                white++
            }
        }
        if (options.flag("guides")) {
            fill(Color.WHITE, 20)
            for (p in range) if (p % 12 == 0)
                canvas.drawLine(
                    centers[p] - keyWidth / 2,
                    0f,
                    centers[p] - keyWidth / 2,
                    line,
                    paint,
                )
        }
        val active = IntArray(128)
        val activeAge = DoubleArray(128)
        val start = max(0L, ((seconds - 1) * 1 / secondsPerTick).toLong())
        val end = max(1L, ((seconds + travel) / secondsPerTick).toLong())
        canvas.save()
        canvas.clipRect(0f, 0f, w, line)
        for ((laneIndex, lane) in project.lanes.withIndex()) {
            if (lane.muted) continue
            val color = color(laneIndex)
            if (Color.alpha(color) == 0) continue
            val cycles = if (looping) ceil((seconds + travel) / period).toInt() else 0
            for (cycle in 0..cycles) {
                val offset = cycle * period
                val from = max(0L, start - (offset / secondsPerTick).roundToLong())
                val until = end - (offset / secondsPerTick).roundToLong()
                if (until <= from) continue
                for (n in indexes[laneIndex].query(from, until, range.first, range.last)) {
                    val begin = n.start * secondsPerTick + offset
                    val finish = n.end * secondsPerTick + offset
                    val bottom = (line - (begin - seconds) / travel * line).toFloat()
                    val top = (line - (finish - seconds) / travel * line).toFloat()
                    if (begin <= seconds && finish > seconds) {
                        active[n.pitch] = color
                        activeAge[n.pitch] = seconds - begin
                    }
                    val noteWidth =
                        keyWidth *
                            (if (n.pitch % 12 in black) .64f else 1f) *
                            options.number("noteWidth", 80.0).toFloat() / 100
                    rect.set(
                        centers[n.pitch] - noteWidth / 2,
                        top,
                        centers[n.pitch] + noteWidth / 2,
                        bottom - 1,
                    )
                    val radius = noteWidth * options.number("roundness", 25.0).toFloat() / 100
                    if (options.flag("glow") && options.number("glowAmount") > 0) {
                        fill(color, (options.number("glowAmount") * .6).toInt())
                        val halo = 4 + options.number("glowAmount").toFloat() * .08f
                        canvas.drawRoundRect(
                            rect.left - halo,
                            rect.top - halo,
                            rect.right + halo,
                            rect.bottom + halo,
                            radius + halo,
                            radius + halo,
                            paint,
                        )
                    }
                    fill(color, (100 + n.volume * 1.55).toInt())
                    if (options.text("noteStyle") == "glass")
                        paint.shader =
                            LinearGradient(
                                rect.left,
                                0f,
                                rect.right,
                                0f,
                                intArrayOf(color, Color.WHITE, color),
                                null,
                                Shader.TileMode.CLAMP,
                            )
                    if (options.text("noteStyle") == "neon") {
                        paint.style = Paint.Style.STROKE
                        paint.strokeWidth = max(2f, noteWidth * .09f)
                    }
                    canvas.drawRoundRect(rect, radius, radius, paint)
                    paint.shader = null
                    paint.style = Paint.Style.FILL
                }
            }
        }
        canvas.restore()
        for (p in range) if (p % 12 !in black) {
            val x = centers[p]
            fill(
                if (options.flag("keyLights") && active[p] != 0) active[p]
                else Color.rgb(230, 233, 235)
            )
            rect.set(x - keyWidth / 2 + 1, line + 2, x + keyWidth / 2 - 1, h)
            canvas.drawRoundRect(rect, 0f, 0f, paint)
        }
        for (p in range) if (p % 12 in black) {
            val x = centers[p]
            fill(
                if (options.flag("keyLights") && active[p] != 0) active[p]
                else Color.rgb(17, 20, 26)
            )
            rect.set(x - keyWidth * .31f, line, x + keyWidth * .31f, line + keyboard * .64f)
            canvas.drawRoundRect(rect, 2f, 2f, paint)
        }
        for (p in range) {
            if (active[p] != 0) {
                val x = centers[p]
                val age = activeAge[p]
                val c = active[p]
                val rays = options.number("rays").toFloat()
                if (rays > 0) {
                    paint.shader =
                        LinearGradient(
                            x,
                            line - keyboard * 2,
                            x,
                            line,
                            intArrayOf(Color.TRANSPARENT, c),
                            null,
                            Shader.TileMode.CLAMP,
                        )
                    paint.alpha = (rays * 1.3).toInt()
                    canvas.drawRect(
                        x - keyWidth * .3f,
                        line - keyboard * 2,
                        x + keyWidth * .3f,
                        line,
                        paint,
                    )
                    paint.shader = null
                }
                val rings = options.number("rings")
                if (rings > 0) {
                    fill(c, (rings * 1.6).toInt())
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = 2f
                    val r = (age % .7 / .7 * keyWidth * 1.6).toFloat()
                    canvas.drawCircle(x, line, r, paint)
                    paint.style = Paint.Style.FILL
                }
                val trail = options.number("trails")
                if (trail > 0) {
                    fill(c, (trail * .6).toInt())
                    canvas.drawRect(
                        x - 2,
                        line - keyboard * .7f,
                        x + 2,
                        line + keyboard * .3f,
                        paint,
                    )
                }
                if (options.flag("sparks")) {
                    val amount = (options.number("sparkAmount") / 8).roundToInt().coerceIn(0, 12)
                    repeat(amount) { i ->
                        val phase = (age * 1.4 + i * .137) % 1
                        val dx = sin(p * 1.73 + i * 2.39) * phase * keyWidth * 1.4
                        val yy = line - phase * keyboard * 1.4
                        fill(c, ((1 - phase) * 210).toInt())
                        canvas.drawCircle(
                            (x + dx).toFloat(),
                            yy.toFloat(),
                            (1 + options.number("sparkAmount") / 35).toFloat(),
                            paint,
                        )
                    }
                }
            }
            val labels = options.text("keyLabels")
            if (labels == "all" || labels == "c" && p % 12 == 0) {
                fill(if (p % 12 in black) Color.LTGRAY else Color.DKGRAY)
                paint.textSize = min(keyWidth * .4f, keyboard * .14f)
                paint.textAlign = Paint.Align.CENTER
                canvas.drawText(
                    PianoGrid.noteName(p),
                    centers[p],
                    if (p % 12 in black) line + keyboard * .54f else h - keyboard * .12f,
                    paint,
                )
                paint.textAlign = Paint.Align.LEFT
            }
        }
        fill(Color.WHITE, 40)
        canvas.drawRect(0f, line - 1, w, line + 1, paint)
    }
}

class SceneView(context: Context) : View(context) {
    var renderer: SceneRenderer? = null
    var seconds = 0.0

    override fun onDraw(canvas: Canvas) {
        renderer?.draw(canvas, width, height, seconds) ?: canvas.drawColor(Color.BLACK)
    }
}

package studio.notka.next.ui

import android.content.Context
import android.graphics.*
import android.view.View
import kotlin.math.*
import kotlinx.serialization.json.*
import studio.notka.core.*

/**
 * Geometry, colors and effects ported from the unmodified editor 0.80 renderer. Coordinates are
 * CSS-equivalent logical pixels on screen, output pixels in video. The event index avoids scanning
 * the entire score on every frame.
 */
class SceneRenderer(
    val project: Project,
    private val looping: Boolean = false,
    private val keyRange: IntRange? = null,
) {
    private val options = SceneOptions.normalize(project.scene)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    private val indexes = project.lanes.map { NoteIndex(it.notes) }
    private val sec = 60.0 / project.bpm / PPQ
    private val period =
        max(
            .1,
            (project.lanes
                .filter { !it.muted }
                .maxOfOrNull { it.notes.maxOfOrNull { n -> n.end } ?: 0L } ?: 0L) * sec,
        )
    private val blacks = setOf(1, 3, 6, 8, 10)
    private val palettes =
        mapOf(
            "basic" to listOf("#00ff00", "#0000ff"),
            "aurora" to listOf("#62dfc4", "#a898ff", "#ffbc79", "#74bfff", "#f794bc", "#d9e59b"),
            "ember" to listOf("#ffbc79", "#ff7e76", "#efcf8b", "#f596b2"),
            "ice" to listOf("#76d9ff", "#8cabff", "#8ff0dc", "#bdc9ff"),
            "iris" to listOf("#bca1ff", "#f597d0", "#81b5ff", "#dcadff"),
        )

    data class Key(val pitch: Int, val black: Boolean, val center: Float, val width: Float)

    val keys: List<Key>
    val whites: Float
    private val gradients =
        object : LinkedHashMap<String, Shader>(64, .75f, true) {
            override fun removeEldestEntry(e: MutableMap.MutableEntry<String, Shader>?) = size > 512
        }
    private var geometry = ""
    private val active = arrayOfNulls<Pair<Int, Int>>(128)

    init {
        val notes = project.lanes.filter { !it.muted }.flatMap { it.notes }
        var low = options.number("keyStart").toInt()
        var high = min(127, low + options.number("keyCount").toInt() - 1)
        if (options.text("rangeMode") == "auto") {
            val bottom = notes.minOfOrNull { it.pitch } ?: 48
            val top = notes.maxOfOrNull { it.pitch } ?: 83
            if (options.flag("octaveRange", true)) {
                low = 12 * (bottom / 12)
                high = min(127, 12 * (top / 12) + 11)
            } else {
                low = max(0, 12 * floor((bottom - 2) / 12.0).toInt())
                high = min(127, 12 * ceil((top + 3) / 12.0).toInt() - 1)
                if (high - low + 1 < 48) {
                    val extra = 48 - (high - low + 1)
                    low = max(0, low - 12 * (extra / 24))
                    high = min(127, low + 47)
                    low = max(0, high - 47)
                }
            }
        }
        keyRange?.let {
            low = it.first
            high = it.last
        }
        var count = 0
        val left = if (low % 12 in blacks) -.3f else 0f
        keys =
            (low..high).map { pitch ->
                val black = pitch % 12 in blacks
                Key(pitch, black, count + (if (black) 0f else .5f) - left, if (black) .6f else 1f)
                    .also { if (!black) count++ }
            }
        whites = count + (if (high % 12 in blacks) .3f else 0f) - left
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
        var seed = ((index + 1) * 2654435761L).toInt() xor options.number("colorSeed", 1.0).toInt()
        seed = seed xor (seed ushr 16)
        val hue = (seed.toLong() and 0xffffffffL) % 360
        val v = .85
        val x = v * (1 - abs(hue / 60.0 % 2 - 1))
        val components =
            when {
                hue < 60 -> listOf(v, x, 0.0)
                hue < 120 -> listOf(x, v, 0.0)
                hue < 180 -> listOf(0.0, v, x)
                hue < 240 -> listOf(0.0, x, v)
                hue < 300 -> listOf(x, 0.0, v)
                else -> listOf(v, 0.0, x)
            }
        return Color.rgb(
            ((components[0] + .1) * 255).roundToInt(),
            ((components[1] + .1) * 255).roundToInt(),
            ((components[2] + .1) * 255).roundToInt(),
        )
    }

    private fun rgba(color: Int, alpha: Double) =
        Color.argb(
            (alpha.coerceIn(0.0, 1.0) * 255).roundToInt(),
            Color.red(color),
            Color.green(color),
            Color.blue(color),
        )

    private fun fill(color: Int) {
        paint.shader = null
        paint.color = color
        paint.alpha = Color.alpha(color)
        paint.style = Paint.Style.FILL
        paint.clearShadowLayer()
    }

    private fun gradient(key: String, create: () -> Shader): Shader =
        gradients.getOrPut(key, create)

    private fun round(c: Canvas, x: Float, y: Float, w: Float, h: Float, r: Float) {
        val radius = max(0f, min(r, min(w / 2, h / 2)))
        path.reset()
        path.moveTo(x + radius, y)
        path.lineTo(x + w - radius, y)
        path.quadTo(x + w, y, x + w, y + radius)
        path.lineTo(x + w, y + h - radius)
        path.quadTo(x + w, y + h, x + w - radius, y + h)
        path.lineTo(x + radius, y + h)
        path.quadTo(x, y + h, x, y + h - radius)
        path.lineTo(x, y + radius)
        path.quadTo(x, y, x + radius, y)
        path.close()
        c.drawPath(path, paint)
    }

    fun draw(
        canvas: Canvas,
        width: Int,
        height: Int,
        seconds: Double,
        compact: Boolean = false,
        lensRange: IntRange? = null,
        hud: Boolean = false,
        audition: Boolean = false,
    ) {
        if (width < 1 || height < 1) return
        val w = width.toFloat()
        val h = height.toFloat()
        val keyboard =
            min(
                .3f * h,
                max(if (compact) 18f else 36f, h * options.number("keyboardHeight").toFloat() / 100),
            )
        val line = max(20f, h - keyboard)
        val margin = if (compact) 8f else min(24f, .018f * w)
        val unit = (w - 2 * margin) / whites
        val travel = 3.6 / options.number("speed")
        val mainColor =
            Color.parseColor((palettes[options.text("palette")] ?: palettes.getValue("basic"))[0])
        var zoom = 1f
        canvas.save()
        if (lensRange != null) {
            val first = keys.firstOrNull { it.pitch == lensRange.first }
            val last = keys.firstOrNull { it.pitch == lensRange.last }
            if (first != null && last != null) {
                val left = margin + (first.center - first.width / 2) * unit
                val right = margin + (last.center + last.width / 2) * unit
                zoom = max(1f, w / (right - left))
                canvas.translate(-zoom * left, max(h * (1 - zoom), min(0f, .68f * h - zoom * line)))
                canvas.scale(zoom, zoom)
            }
        }
        val shape = "$width/$height/$line/$keyboard/$margin/$unit/$zoom"
        if (shape != geometry) {
            geometry = shape
            gradients.clear()
        }
        active.fill(null)
        val glow = if (options.flag("glow")) options.number("glowAmount") / 100 else 0.0
        val background = Color.parseColor(options.text("background"))
        fill(background)
        canvas.drawRect(0f, 0f, w, h, paint)
        if (options.text("backdrop") == "aurora") {
            paint.shader =
                gradient("aurora/${options.text("palette")}") {
                    RadialGradient(
                        .3f * w,
                        line,
                        .8f * w,
                        intArrayOf(
                            rgba(mainColor, .13),
                            rgba(
                                Color.parseColor(
                                    (palettes[options.text("palette")]
                                        ?: palettes.getValue("basic"))[1]
                                ),
                                .045,
                            ),
                            rgba(mainColor, 0.0),
                        ),
                        floatArrayOf(0f, .5f, 1f),
                        Shader.TileMode.CLAMP,
                    )
                }
            paint.alpha = 255
            canvas.drawRect(0f, 0f, w, line, paint)
        }
        if (options.text("backdrop") == "stars")
            for (i in 1..53) {
                val x = (137.509 * i % 97 / 97 * w).toFloat()
                val y = (i * i * 13.27 % 89 / 89 * line).toFloat()
                fill(rgba(0xffd2e1ff.toInt(), .06 + .12 * (.5 + .5 * sin(i + .35 * seconds))))
                canvas.drawRect(x, y, x + if (i % 7 == 0) 1.5f else 1f, y + 1, paint)
            }
        if (options.flag("guides"))
            for (key in keys) if (!key.black) {
                fill(if (key.pitch % 12 == 0) 0x11bcd4f0 else 0x06bcd4f0)
                val x = margin + (key.center - .5f) * unit
                canvas.drawRect(x, 0f, x + 1, line, paint)
            }
        canvas.save()
        canvas.clipRect(margin, 0f, w - margin, line)
        var particles = 0
        var glowNotes = 0
        val cycles =
            if (looping) {
                val base = floor(seconds / period).toInt()
                max(0, base - 1)..(base + ceil(travel / period).toInt() + 1)
            } else 0..0
        data class Visible(val lane: Int, val note: Note, val start: Double)
        val visible = ArrayList<Visible>()
        for (cycle in cycles) {
            val offset = cycle * period
            val local = seconds - offset
            project.lanes.forEachIndexed { lane, track ->
                if (!track.muted) {
                    val low = floor((local - .9) / sec).toLong().coerceAtLeast(0)
                    val high = ceil((local + travel) / sec).toLong()
                    if (high >= 0)
                        indexes[lane].query(low, high).forEach { note ->
                            if (note.end * sec > local || note.start * sec > local - .9)
                                visible.add(Visible(lane, note, note.start * sec + offset))
                        }
                }
            }
        }
        visible.sortWith(
            compareBy<Visible> { it.start }.thenBy { it.lane }.thenBy { it.note.pitch }
        )
        for (event in visible) {
            val note = event.note
            val key = keys.firstOrNull { it.pitch == note.pitch } ?: continue
            val ink = color(event.lane)
            if (ink == Color.TRANSPARENT) continue
            val center = margin + key.center * unit
            val age = seconds - event.start
            val duration = note.len * sec
            val held = age >= 0 && age < duration
            val rawBottom = line + age * line / travel
            val top = rawBottom - duration * line / travel
            val bottom = min(line.toDouble(), rawBottom)
            if (held && note.volume > 0 && (active[note.pitch]?.second ?: -1) < note.volume)
                active[note.pitch] = ink to note.volume
            if (age < 0 && bottom < 0) continue
            if (held && options.number("rays") > 0 && note.volume > 0) {
                val reach = .48f * line
                fill(ink)
                paint.shader =
                    gradient("ray/$ink/${options.number("rays")}") {
                        LinearGradient(
                            0f,
                            line - reach,
                            0f,
                            line,
                            intArrayOf(rgba(ink, 0.0), rgba(ink, options.number("rays") / 360)),
                            null,
                            Shader.TileMode.CLAMP,
                        )
                    }
                paint.alpha = 255
                path.reset()
                path.moveTo(center - 1.2f * unit, line - reach)
                path.lineTo(center + 1.2f * unit, line - reach)
                path.lineTo(center + .45f * unit, line)
                path.lineTo(center - .45f * unit, line)
                path.close()
                canvas.drawPath(path, paint)
            }
            if (bottom > 0 && top < line && event.start + duration > seconds) {
                val nw =
                    max(
                        2f,
                        unit * options.number("noteWidth").toFloat() / 100 *
                            (if (key.black) .64f else 1f),
                    )
                val x = center - nw / 2
                val y = max(-nw, top.toFloat())
                val nh = max(1f, bottom.toFloat() - y)
                val radius = nw * options.number("roundness").toFloat() / 100
                if (options.number("trails") > 0) {
                    val length = min(.2f * line, 20f + .6f * options.number("trails").toFloat())
                    fill(ink)
                    paint.shader =
                        LinearGradient(
                            0f,
                            y - length,
                            0f,
                            y + 3,
                            intArrayOf(rgba(ink, 0.0), rgba(ink, options.number("trails") / 500)),
                            null,
                            Shader.TileMode.CLAMP,
                        )
                    paint.alpha = 255
                    canvas.drawRect(x, y - length, x + nw, y, paint)
                }
                val opacity = .48 + .0052 * note.volume
                val style = options.text("noteStyle")
                fill(rgba(ink, if (style == "neon") .12 else .88 * opacity))
                if (style == "glass") {
                    paint.shader =
                        gradient("glass/$x/$nw/$ink/$opacity") {
                            LinearGradient(
                                x,
                                0f,
                                x + nw,
                                0f,
                                intArrayOf(
                                    rgba(ink, .7 * opacity),
                                    rgba(ink, opacity),
                                    rgba(ink, .62 * opacity),
                                ),
                                floatArrayOf(0f, .35f, 1f),
                                Shader.TileMode.CLAMP,
                            )
                        }
                    paint.alpha = 255
                }
                if (glow > 0 && glowNotes++ < 100)
                    paint.setShadowLayer((min(18f, .8f * nw) * glow * zoom).toFloat(), 0f, 0f, ink)
                round(canvas, x, y, nw, nh, radius)
                fill(rgba(ink, if (style == "neon") .95 else .65))
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = if (style == "neon") 1.5f else .7f
                round(canvas, x, y, nw, nh, radius)
                if (style == "glass" && nw > 5 && nh > 5) {
                    fill(0x44ffffff)
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = .7f
                    round(canvas, x + 1.5f, y + 1.5f, nw - 3, nh - 3, max(0f, radius - 1))
                }
            }
            if (age >= 0 && age < .85 && note.volume > 0) {
                val phase = age / .85
                if (options.number("rings") > 0) {
                    fill(rgba(ink, (1 - phase) * options.number("rings") / 150))
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = 1f
                    val rx = (unit * (.3 + 1.6 * phase)).toFloat()
                    val ry = (3 + 12 * phase).toFloat()
                    canvas.drawArc(
                        RectF(center - rx, line - ry, center + rx, line + ry),
                        180f,
                        180f,
                        false,
                        paint,
                    )
                }
                if (options.flag("sparks")) {
                    val count = (options.number("sparkAmount") / 8).roundToInt()
                    for (i in 0 until count) {
                        if (particles++ >= 160) break
                        val angle = 2.399 * i + .73 * note.pitch + 1.7 * event.lane
                        val dx = sin(angle) * (14 + 4 * i) * phase
                        val dy = (24 + 60 * abs(cos(angle))) * phase - 20 * phase * phase
                        fill(rgba(ink, .8 * (1 - phase)))
                        canvas.drawCircle(
                            center + dx.toFloat(),
                            line - dy.toFloat(),
                            if (compact) .6f else 1f + i % 2 * .35f,
                            paint,
                        )
                    }
                }
            }
        }
        canvas.restore()
        fill(0xff03060c.toInt())
        round(canvas, margin - 2, line - 1, w - 2 * margin + 4, keyboard + 5, 4f)
        for (black in listOf(false, true)) {
            val kh = if (black) .62f * keyboard else keyboard
            val ivory =
                gradient("ivory/$black") {
                    LinearGradient(
                        0f,
                        line,
                        0f,
                        line + kh,
                        intArrayOf(
                            Color.parseColor(if (black) "#283343" else "#d7e0e8"),
                            Color.parseColor(if (black) "#141d2c" else "#f4f7f8"),
                            Color.parseColor(if (black) "#080c14" else "#bdc9d5"),
                        ),
                        floatArrayOf(0f, .12f, 1f),
                        Shader.TileMode.CLAMP,
                    )
                }
            for (key in keys.filter { it.black == black }) {
                val kw = max(1f, unit * key.width - 1)
                val x = margin + unit * key.center - unit * key.width / 2
                val r = min(3f, .1f * unit)
                fill(Color.WHITE)
                paint.shader = ivory
                round(canvas, x, line, kw, kh, r)
                val light = active[key.pitch]
                if (light != null && options.flag("keyLights")) {
                    fill(Color.WHITE)
                    paint.shader =
                        gradient("light/${light.first}/$black") {
                            LinearGradient(
                                0f,
                                line,
                                0f,
                                line + kh,
                                intArrayOf(
                                    rgba(light.first, .95),
                                    rgba(light.first, if (black) .6 else .65),
                                    rgba(light.first, .1),
                                ),
                                floatArrayOf(0f, .4f, 1f),
                                Shader.TileMode.CLAMP,
                            )
                        }
                    round(canvas, x, line, kw, kh, r)
                }
                if (black) {
                    fill(0x0dffffff)
                    canvas.drawRect(x + 2, line + 3, x + 2 + max(0f, kw - 4), line + 5, paint)
                }
                val labels = options.text("keyLabels")
                if (
                    (!compact || audition) &&
                        labels != "none" &&
                        (labels == "all" || key.pitch % 12 == 0) &&
                        unit > (if (black) 28 else 18)
                ) {
                    fill(Color.parseColor(if (black) "#98a6b9" else "#536175"))
                    paint.textSize = min(11f, .32f * unit)
                    paint.typeface = Typeface.DEFAULT
                    paint.textAlign = Paint.Align.CENTER
                    canvas.drawText(PianoGrid.noteName(key.pitch), x + kw / 2, line + kh - 7, paint)
                }
            }
        }
        fill(rgba(mainColor, .35 + .5 * glow))
        if (glow > 0) paint.setShadowLayer(((8 + 12 * glow) * zoom).toFloat(), 0f, 0f, mainColor)
        canvas.drawRect(margin, line - 1, w - margin, line + .5f, paint)
        for (key in keys) {
            val light = active[key.pitch] ?: continue
            val x = margin + key.center * unit
            fill(light.first)
            if (glow > 0) paint.setShadowLayer((14 * glow * zoom).toFloat(), 0f, 0f, light.first)
            canvas.drawRect(x - .35f * unit, line - 1, x + .35f * unit, line + 1, paint)
        }
        if (hud && !compact) {
            fill(Color.WHITE)
            paint.shader =
                gradient("fade/$background") {
                    LinearGradient(
                        0f,
                        0f,
                        0f,
                        72f,
                        intArrayOf(rgba(background, .9), rgba(background, 0.0)),
                        null,
                        Shader.TileMode.CLAMP,
                    )
                }
            canvas.drawRect(0f, 0f, w, 72f, paint)
        }
        paint.clearShadowLayer()
        canvas.restore()
    }
}

class SceneView(context: Context) : View(context) {
    var renderer: SceneRenderer? = null
    var seconds = 0.0
    var compact = false
    var lensRange: IntRange? = null
    var hud = false
    var audition = false
    private var buffer: Bitmap? = null
    private var target: Canvas? = null
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)

    var onFrame: () -> Unit = {}

    override fun onDraw(canvas: Canvas) {
        onFrame()
        val density = resources.displayMetrics.density
        val quality =
            min(density, renderer?.project?.scene?.number("quality", 1.5)?.toFloat() ?: 1.5f)
        val w = max(1, (width / density * quality).roundToInt())
        val h = max(1, (height / density * quality).roundToInt())
        if (buffer?.width != w || buffer?.height != h) {
            buffer?.recycle()
            buffer = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            target = Canvas(buffer!!)
        }
        val offscreen = target!!
        offscreen.save()
        offscreen.scale(quality, quality)
        renderer?.draw(
            offscreen,
            (width / density).roundToInt(),
            (height / density).roundToInt(),
            seconds,
            compact,
            lensRange,
            hud,
            audition,
        ) ?: offscreen.drawColor(Color.BLACK)
        offscreen.restore()
        canvas.drawBitmap(buffer!!, null, Rect(0, 0, width, height), bitmapPaint)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        buffer?.recycle()
        buffer = null
        target = null
    }
}

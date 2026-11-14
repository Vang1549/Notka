package studio.notka.next.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.*
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.View
import android.widget.*
import kotlin.math.*
import studio.notka.core.*

/** Android interaction/accessibility with the range geometry used by the reference WebView. */
class ReferenceSlider(
    context: Context,
    fixedAccent: Int? = null,
) : SeekBar(context) {
  private var accent = fixedAccent ?: ReferencePalette(context).accent
  private val d = resources.displayMetrics.density
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val track = Path()

  fun recolor(old: ReferencePalette, next: ReferencePalette) {
    if (accent == old.accent) accent = next.accent
    invalidate()
  }

  init {
    if (fixedAccent == null)
        theme {
          accent = it.accent
          invalidate()
        }
    progressTintList = null
    thumbTintList = null
    progressDrawable = null
    thumb = context.shape(accent, 0, 8f).apply { setSize(context.dp(16), context.dp(16)) }
    thumbOffset = context.dp(8)
    splitTrack = false
    setPadding(context.dp(8), 0, context.dp(8), 0)
    minimumHeight = context.dp(22)
  }

  override fun onDraw(c: Canvas) {
    val y = height / 2f
    val r = RectF(.5f * d, y - 3.5f * d, width - .5f * d, y + 3.5f * d)
    val x =
        paddingLeft +
            (width - paddingLeft - paddingRight) * (if (max > 0) progress.toFloat() / max else 0f)
    paint.style = Paint.Style.FILL
    paint.color = 0xff3b3b3b.toInt()
    c.drawRoundRect(r, 4 * d, 4 * d, paint)
    c.save()
    track.reset()
    track.addRoundRect(r, 4 * d, 4 * d, Path.Direction.CW)
    c.clipPath(track)
    paint.color = accent
    c.drawRect(0f, r.top, x, r.bottom, paint)
    c.restore()
    paint.style = Paint.Style.STROKE
    paint.color = 0xff858585.toInt()
    paint.strokeWidth = d
    c.drawRoundRect(r, 4 * d, 4 * d, paint)
    paint.style = Paint.Style.FILL
    paint.color = accent
    c.drawCircle(x, y, 8 * d, paint)
  }
}

fun EditText.onTextChanged(action: (String) -> Unit) {
  addTextChangedListener(
      object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
          action(s.toString())
        }

        override fun afterTextChanged(e: Editable?) {}
      })
}

/** A web select's compact outline, with the platform's accessible choice popup. */
fun Context.select(
    labels: List<String>,
    selected: Int,
    size: Float = 15f,
    changed: (Int) -> Unit,
): Spinner {
  val palette = ReferencePalette(this)
  return Spinner(this).apply {
    adapter =
        object :
            ArrayAdapter<String>(
                this@select,
                android.R.layout.simple_spinner_dropdown_item,
                labels,
            ) {
          override fun getView(
              position: Int,
              convertView: View?,
              parent: android.view.ViewGroup,
          ): View =
              (convertView as? TextView ?: TextView(this@select)).apply {
                text = getItem(position)
                setTextColor(ReferencePalette(this@select).text)
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, size)
                includeFontPadding = false
                gravity = android.view.Gravity.CENTER_VERTICAL
                setSingleLine()
                setPadding(dp(7), 0, dp(20), 0)
                layoutParams = android.view.ViewGroup.LayoutParams(-1, -1)
              }
        }
    background =
        object : android.graphics.drawable.Drawable() {
          val bg = shape(palette.panel, palette.border, 6f)
          val p = Paint(Paint.ANTI_ALIAS_FLAG)

          override fun draw(c: Canvas) {
            val current = ReferencePalette(this@select)
            val surface = shape(current.panel, current.border, 6f)
            surface.bounds = bounds
            surface.draw(c)
            p.color = current.text
            p.style = Paint.Style.STROKE
            p.strokeWidth = dp(1).toFloat()
            val x = bounds.right - dp(10).toFloat()
            val y = bounds.centerY().toFloat()
            val path = Path()
            path.moveTo(x - dp(3), y - dp(2))
            path.lineTo(x, y + dp(1))
            path.lineTo(x + dp(3), y - dp(2))
            c.drawPath(path, p)
          }

          override fun setAlpha(a: Int) {}

          override fun setColorFilter(f: ColorFilter?) {}

          override fun getOpacity() = PixelFormat.TRANSLUCENT
        }
    // The platform background reserves 48 dp for its own arrow. Our background
    // draws the arrow itself, so retaining that inset clips the selected text.
    setPadding(0, 0, 0, 0)
    minimumHeight = dp(34)
    setSelection(selected.coerceIn(labels.indices), false)
    var last = selected
    onItemSelectedListener =
        object : AdapterView.OnItemSelectedListener {
          override fun onNothingSelected(parent: AdapterView<*>?) {}

          override fun onItemSelected(
              parent: AdapterView<*>?,
              v: View?,
              position: Int,
              id: Long,
          ) {
            if (position != last) {
              last = position
              changed(position)
            }
          }
        }
  }
}

fun LinearLayout.selectRow(
    title: String,
    choices: List<String>,
    selected: Int,
    compact: Boolean = false,
    changed: (Int) -> Unit,
): Spinner {
  val r = context.row()
  r.addView(
      context.label(title).apply { if (compact) setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f) },
      LinearLayout.LayoutParams(0, -2, 1f),
  )
  val s = context.select(choices, selected, if (compact) 12f else 15f, changed)
  s.contentDescription = title
  val choiceWidth =
      if (compact) {
        val paint = Paint().apply { textSize = 12f * resources.displayMetrics.density }
        (choices.maxOfOrNull { paint.measureText(it) } ?: 0f).roundToInt() + context.dp(28)
      } else -2
  r.addView(
      s,
      LinearLayout.LayoutParams(choiceWidth, context.dp(if (compact) 29 else 34)).apply {
        leftMargin = context.dp(8)
      },
  )
  addView(r, LinearLayout.LayoutParams(-1, context.dp(38)))
  return s
}

fun Context.fieldset(title: String, legendSize: Float = 13f): LinearLayout =
    column().apply {
      val palette = ReferencePalette(this@fieldset)
      setPadding(dp(10), 0, dp(10), dp(10))
      background =
          object : android.graphics.drawable.Drawable() {
            val shape = this@fieldset.shape(palette.bg, palette.border, 10f)

            override fun draw(c: Canvas) {
              shape.setBounds(bounds.left, bounds.top + dp(9), bounds.right, bounds.bottom)
              shape.draw(c)
            }

            override fun setAlpha(a: Int) {
              shape.alpha = a
            }

            override fun setColorFilter(f: ColorFilter?) {}

            override fun getOpacity() = PixelFormat.TRANSLUCENT
          }
      addView(
          label(title).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, legendSize)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(2), 0, dp(2), 0)
            setBackgroundColor(palette.bg)
          },
          LinearLayout.LayoutParams(-2, dp(18)),
      )
    }

fun LinearLayout.checkRow(
    title: String,
    checked: Boolean,
    changed: (Boolean) -> Unit,
): ReferenceCheck {
  val r = context.row()
  r.addView(context.label(title), LinearLayout.LayoutParams(0, -2, 1f))
  val check = ReferenceCheck(context, checked, title, changed)
  r.addView(check, LinearLayout.LayoutParams(context.dp(34), context.dp(34)))
  addView(r)
  return check
}

/** Editable number and range share one value; no extra save step. */
class ReferenceRange(
    context: Context,
    title: String,
    unit: String,
    val low: Double,
    val high: Double,
    val step: Double,
    value: Double?,
    private val soundField: Boolean = false,
    private val sceneField: Boolean = false,
    private val changed: (Double?) -> Unit,
) : LinearLayout(context) {
  val edit = context.field(value?.let(::formatNumber) ?: "", true)
  val slider = ReferenceSlider(context)
  private var syncing = false

  init {
    orientation = VERTICAL
    val palette = ReferencePalette(context)
    val head = context.row()
    head.addView(
        context.label(title).apply {
          if (soundField || sceneField)
              setTextSize(TypedValue.COMPLEX_UNIT_DIP, if (sceneField) 13f else 12f)
        },
        LayoutParams(0, -2, 1f),
    )
    edit.contentDescription = title
    edit.minimumHeight = context.dp(30)
    edit.minHeight = 0
    edit.setPadding(context.dp(4), 0, context.dp(4), 0)
    edit.gravity =
        (if (soundField) android.view.Gravity.LEFT else android.view.Gravity.RIGHT) or
            android.view.Gravity.CENTER_VERTICAL
    if (soundField) edit.setPadding(context.dp(6), 0, context.dp(6), 0)
    if (sceneField) {
      val number =
          context.row().apply {
            background = context.shape(palette.bg, palette.border, 6f)
            setPadding(context.dp(5), context.dp(2), context.dp(5), context.dp(2))
          }
      edit.background = null
      edit.setTextColor(palette.accent)
      edit.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
      number.addView(edit, LayoutParams(context.dp(38), context.dp(27)))
      if (unit.isNotEmpty())
          number.addView(
              context.label(unit).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                setTextColor(palette.accent)
                setPadding(context.dp(2), 0, 0, 0)
              })
      head.addView(number)
    } else {
      head.addView(
          edit,
          LayoutParams(
              context.dp(if (soundField) 90 else 70),
              context.dp(if (soundField) 32 else 30),
          ),
      )
      if (unit.isNotEmpty())
          head.addView(
              context.label(unit).apply {
                setTextSize(TypedValue.COMPLEX_UNIT_DIP, 12f)
                setTextColor(palette.muted)
              },
              LayoutParams(-2, -2).apply { leftMargin = context.dp(4) },
          )
    }
    if (soundField) head.minimumHeight = context.dp(38)
    addView(head)
    slider.max = ((high - low) / step).roundToInt()
    slider.progress = (((value ?: low) - low) / step).roundToInt()
    slider.contentDescription = title
    slider.progressTintList = ColorStateList.valueOf(palette.accent)
    slider.thumbTintList = ColorStateList.valueOf(palette.accent)
    slider.setPadding(context.dp(8), 0, context.dp(8), 0)
    addView(
        slider,
        LayoutParams(-1, context.dp(if (soundField) 24 else 22)).apply {
          if (soundField || sceneField) topMargin = context.dp(if (sceneField) 8 else 7)
          if (soundField) {
            bottomMargin = context.dp(2)
            leftMargin = context.dp(2)
            rightMargin = -context.dp(2)
          }
        },
    )
    slider.setOnSeekBarChangeListener(
        object : SeekBar.OnSeekBarChangeListener {
          override fun onStartTrackingTouch(s: SeekBar) {}

          override fun onStopTrackingTouch(s: SeekBar) {}

          override fun onProgressChanged(s: SeekBar, p: Int, user: Boolean) {
            if (user && !syncing) {
              val n = (low + p * step).coerceIn(low, high)
              edit.setText(formatNumber(n))
              changed(n)
            }
          }
        })
    fun commit() {
      if (!syncing)
          runCatching {
                val n = edit.text.toString().trim().takeIf { it.isNotEmpty() }?.uiNumber()
                require(n == null || n in low..high)
                changed(n)
                setValue(n)
              }
              .onFailure { edit.error = "От ${formatNumber(low)} до ${formatNumber(high)}" }
    }
    edit.setOnFocusChangeListener { _, focus -> if (!focus) commit() }
    edit.setOnEditorActionListener { _, _, _ ->
      commit()
      edit.clearFocus()
      true
    }
  }

  fun setValue(value: Double?, fallback: Double = low) {
    syncing = true
    if (!edit.hasFocus()) edit.setText(value?.let(::formatNumber) ?: "")
    slider.progress = (((value ?: fallback) - low) / step).roundToInt()
    syncing = false
  }

  fun enable(value: Boolean) {
    edit.isEnabled = value
    slider.isEnabled = value
    alpha = if (value) 1f else .45f
  }

  companion object {
    fun formatNumber(value: Double) =
        if (value == floor(value)) value.toLong().toString()
        else "%.3f".format(java.util.Locale.US, value).trimEnd('0').trimEnd('.')
  }
}

class GridPreview(
    context: Context,
    private val project: () -> Project,
    private val noteLength: () -> Long,
) : View(context) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

  override fun onMeasure(w: Int, h: Int) {
    val width = MeasureSpec.getSize(w)
    setMeasuredDimension(width, (width * 140f / 320).roundToInt())
  }

  override fun onDraw(c: Canvas) {
    val p = ReferencePalette(context)
    val score = project()
    val division = score.viewDivision.takeIf { it > 0 } ?: score.division.takeIf { it > 0 } ?: 4
    c.save()
    c.scale(width / 320f, height / 140f)
    fun fill(color: Int) {
      paint.color = color
      paint.style = Paint.Style.FILL
    }
    fill(p.panel)
    c.drawRect(0f, 0f, 320f, 140f, paint)
    for (i in 0..4) {
      fill(if (i % 2 == 1) p.black else p.cell)
      c.drawRect(30f, 22f + 18 * i, 310f, 40f + 18 * i, paint)
      fill(p.muted)
      paint.textSize = 10f
      paint.textAlign = Paint.Align.CENTER
      c.drawText(listOf("G", "F", "E", "D", "C")[i], 14f, 35f + 18 * i, paint)
    }
    paint.strokeWidth = 1f
    for (i in 0..4 * division) {
      fill(if (i % division == 0) p.line else p.border)
      val x = 30f + 70f * i / division
      c.drawLine(x, 22f, x, 112f, paint)
    }
    fill(p.border)
    for (i in 0..5) c.drawLine(30f, 22f + 18 * i, 310f, 22f + 18 * i, paint)
    fill(p.muted)
    paint.textAlign = Paint.Align.LEFT
    for (i in 0..3) c.drawText("${i+1}", 34f + 70 * i, 15f, paint)
    fill(p.accent)
    c.drawRoundRect(
        RectF(31f, 60f, 31f + max(2f, 70f * min(4f, noteLength().toFloat() / PPQ) - 2), 74f),
        3f,
        3f,
        paint,
    )
    fill(p.muted)
    c.drawText(
        if (score.division == 0) "Без привязки" else "Привязка: 1/${score.division}",
        8f,
        131f,
        paint,
    )
    c.restore()
  }
}

/** Match the reference's deliberate one-second rename, while retaining ordinary click. */
fun View.onHold(delay: Long, action: () -> Unit) {
  var x = 0f
  var y = 0f
  var fired = false
  val pending = Runnable {
    fired = true
    performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
    action()
  }
  setOnTouchListener { v, e ->
    when (e.actionMasked) {
      android.view.MotionEvent.ACTION_DOWN -> {
        x = e.x
        y = e.y
        fired = false
        v.postDelayed(pending, delay)
      }
      android.view.MotionEvent.ACTION_MOVE ->
          if (hypot(e.x - x, e.y - y) > android.view.ViewConfiguration.get(context).scaledTouchSlop)
              v.removeCallbacks(pending)
      android.view.MotionEvent.ACTION_UP,
      android.view.MotionEvent.ACTION_CANCEL -> v.removeCallbacks(pending)
    }
    fired
  }
}

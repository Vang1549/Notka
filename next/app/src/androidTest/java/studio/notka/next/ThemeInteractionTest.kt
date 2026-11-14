package studio.notka.next

import android.content.Intent
import android.graphics.Color
import android.os.SystemClock
import android.view.*
import android.view.inspector.WindowInspector
import android.widget.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import studio.notka.next.ui.*

@RunWith(AndroidJUnit4::class)
class ThemeInteractionTest {
    private val test = InstrumentationRegistry.getInstrumentation()
    private val context = test.targetContext
    private lateinit var activity: MainActivity

    private fun views(view: View): List<View> =
        listOf(view) +
            if (view is ViewGroup) (0 until view.childCount).flatMap { views(view.getChildAt(it)) }
            else emptyList()

    private fun roots() = WindowInspector.getGlobalWindowViews().filter { it.isShown }

    private fun all() = roots().flatMap { views(it) }

    private fun click(text: String) {
        test.runOnMainSync {
            (all().lastOrNull { it is Button && it.text.toString() == text }
                    ?: error("Missing button $text"))
                .performClick()
        }
        test.waitForIdleSync()
    }

    @Before
    fun launch() {
        context.getSharedPreferences("settings", 0).edit().clear().commit()
        activity =
            test.startActivitySync(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ) as MainActivity
        test.waitForIdleSync()
    }

    @After
    fun finish() {
        test.runOnMainSync { activity.finish() }
        test.waitForIdleSync()
    }

    @Test
    fun paletteDragInsideScrollableThemeAndNavigation() {
        click("Настройки")
        click("Темы")
        click("＋")
        test.runOnMainSync {
            val v = all().filterIsInstance<EditText>().last()
            (activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                    as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(v.windowToken, 0)
            v.clearFocus()
        }
        test.waitForIdleSync()
        test.runOnMainSync {
            val pad = all().filterIsInstance<ColorPlane>().single()
            var parent = pad.parent
            while (parent !is ScrollView) parent = parent.parent
            val scroll = parent as ScrollView
            scroll.scrollTo(0, 0)
            val location = IntArray(2)
            pad.getLocationOnScreen(location)
            val origin = IntArray(2)
            scroll.getLocationOnScreen(origin)
            val x = location[0] - origin[0] + pad.width * .7f
            val y = location[1] - origin[1] + pad.height * .8f
            val start = SystemClock.uptimeMillis()
            fun touch(action: Int, px: Float, py: Float, t: Long) {
                val e = MotionEvent.obtain(start, start + t, action, px, py, 0)
                scroll.dispatchTouchEvent(e)
                e.recycle()
            }
            touch(MotionEvent.ACTION_DOWN, x, y, 0)
            for (i in 1..12) touch(
                MotionEvent.ACTION_MOVE,
                x,
                y - pad.height * .6f * i / 12,
                16L * i,
            )
            touch(MotionEvent.ACTION_UP, x, y - pad.height * .6f, 210)
            assertEquals("ScrollView must not steal the color gesture", 0, scroll.scrollY)
            assertEquals(.7f, pad.hsv[1], .005f)
            assertEquals(.8f, pad.hsv[2], .005f)
            touch(MotionEvent.ACTION_DOWN, x, y, 300)
            val before = pad.hsv.copyOf()
            touch(MotionEvent.ACTION_CANCEL, 0f, 0f, 320)
            assertArrayEquals("Cancelled coordinates must not change color", before, pad.hsv, 0f)
            val down =
                MotionEvent.obtain(
                    start,
                    start + 400,
                    MotionEvent.ACTION_DOWN,
                    pad.width * .7f,
                    pad.height * .8f,
                    0,
                )
            pad.dispatchTouchEvent(down)
            down.recycle()
            val properties =
                arrayOf(
                    MotionEvent.PointerProperties().apply {
                        id = 0
                        toolType = MotionEvent.TOOL_TYPE_FINGER
                    },
                    MotionEvent.PointerProperties().apply {
                        id = 7
                        toolType = MotionEvent.TOOL_TYPE_FINGER
                    },
                )
            val coordinates =
                arrayOf(
                    MotionEvent.PointerCoords().apply {
                        this.x = pad.width * .7f
                        this.y = pad.height * .8f
                        pressure = 1f
                        size = 1f
                    },
                    MotionEvent.PointerCoords().apply {
                        this.x = pad.width * .1f
                        this.y = pad.height * .1f
                        pressure = 1f
                        size = 1f
                    },
                )
            fun multi(action: Int) {
                val event =
                    MotionEvent.obtain(
                        start,
                        start + 420,
                        action,
                        2,
                        properties,
                        coordinates,
                        0,
                        0,
                        1f,
                        1f,
                        0,
                        0,
                        android.view.InputDevice.SOURCE_TOUCHSCREEN,
                        0,
                    )
                pad.dispatchTouchEvent(event)
                event.recycle()
            }
            multi(MotionEvent.ACTION_POINTER_DOWN or (1 shl MotionEvent.ACTION_POINTER_INDEX_SHIFT))
            assertEquals(.7f, pad.hsv[1], .005f)
            coordinates[0].x = pad.width * .8f
            coordinates[0].y = pad.height * .4f
            multi(MotionEvent.ACTION_MOVE)
            assertEquals(.8f, pad.hsv[1], .005f)
            assertEquals(.6f, pad.hsv[2], .005f)
            multi(MotionEvent.ACTION_CANCEL)

            // Same RGB for background/accent must not merge their text roles.
            context
                .getSharedPreferences("settings", 0)
                .edit()
                .putString("background", "#000000")
                .putString("accent", "#000000")
                .apply()
            activity.applyTheme()
            context
                .getSharedPreferences("settings", 0)
                .edit()
                .putString("accent", "#ffffff")
                .apply()
            activity.applyTheme()
            val launch =
                all().filterIsInstance<Button>().first { it.text.startsWith("Запустить последнюю") }
            assertEquals(Color.rgb(18, 18, 18), launch.currentTextColor)
            val heading =
                all().filterIsInstance<TextView>().first { it.text.toString() == "Выбор версии" }
            assertEquals(Color.WHITE, heading.currentTextColor)
        }
        click("‹")
        test.runOnMainSync {
            assertFalse("Closing theme must not recreate Activity", activity.isDestroyed)
            assertTrue(
                all().filterIsInstance<TextView>().any { it.text.toString() == "Настройки панели" }
            )
            assertEquals("Only activity and one panel remain", 2, roots().size)
        }
        click("Скачанные файлы")
        click("‹")
        click("Диагностика")
        click("‹")
        click("✕")
        test.runOnMainSync { assertEquals(1, roots().size) }
    }

    @Test
    fun hexKeepsHueAndDynamicSheetShrinks() {
        test.runOnMainSync {
            val hsv = floatArrayOf(160f, .5f, .5f)
            readHsv(Color.GRAY, hsv)
            assertEquals(160f, hsv[0], 0f)
        }
        click("Настройки")
        click("Темы")
        click("＋")
        test.runOnMainSync {
            val v = all().filterIsInstance<EditText>().last()
            (activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                    as android.view.inputmethod.InputMethodManager)
                .hideSoftInputFromWindow(v.windowToken, 0)
            v.clearFocus()
        }
        test.waitForIdleSync()
        var large = 0
        test.runOnMainSync {
            large = roots().last().height
            val hex =
                all().filterIsInstance<EditText>().single {
                    it.contentDescription == "Код выбранного цвета"
                }
            hex.requestFocus()
            hex.setText("00ff00")
            hex.clearFocus()
            val pad = all().filterIsInstance<ColorPlane>().single()
            assertEquals(120f, pad.hsv[0], .01f)
            assertEquals(120, all().filterIsInstance<HueSlider>().single().progress)
            hex.requestFocus()
            hex.setText("oops")
            hex.clearFocus()
            assertEquals("#00ff00", hex.text.toString())
            all().filterIsInstance<Spinner>().single().setSelection(0)
        }
        test.waitForIdleSync()
        test.runOnMainSync {
            assertFalse(all().any { it is ColorPlane })
            assertTrue(
                "Switching to built-in theme must shrink the card",
                roots().last().height < large - activity.dp(100),
            )
        }
    }

    @Test
    fun editorDialogsCommitValuesAndReturnToTheirParent() {
        val deadline = SystemClock.elapsedRealtime() + 30000
        while (!activity.app.ready && SystemClock.elapsedRealtime() < deadline) Thread.sleep(50)
        assertTrue(activity.app.ready)
        fun described(prefix: String) {
            test.runOnMainSync {
                (all().lastOrNull { it.contentDescription?.toString()?.startsWith(prefix) == true }
                        ?: error("Missing control $prefix"))
                    .performClick()
            }
            test.waitForIdleSync()
        }
        fun shot(name: String) {
            Thread.sleep(400)
            test.waitForIdleSync()
            val file = java.io.File(context.filesDir, "verification/audit-$name.png")
            file.parentFile!!.mkdirs()
            test.uiAutomation.takeScreenshot().let { bitmap ->
                file.outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }
                bitmap.recycle()
            }
        }
        test.runOnMainSync {
            all()
                .filterIsInstance<Button>()
                .first { it.text.startsWith("Запустить последнюю") }
                .performClick()
        }
        test.waitForIdleSync()
        described("Дорожки")
        click("＋")
        assertEquals(2, activity.editor.project.lanes.size)
        shot("lanes")
        val laneName = activity.editor.project.lane.name
        described("Звук · $laneName")
        assertTrue(activity.editor.project.lane.muted)
        described("Звук · $laneName")
        assertFalse(activity.editor.project.lane.muted)
        described("Инструмент · $laneName")
        shot("library")
        described("Настроить ")
        test.runOnMainSync {
            val name =
                all().filterIsInstance<EditText>().first {
                    it.text.toString() ==
                        activity.editor.project.instrument(activity.editor.project.lane).name
                }
            name.requestFocus()
            name.setText("Проверка названия")
        }
        click("Готово")
        assertEquals(
            "Проверка названия",
            activity.editor.project.instrument(activity.editor.project.lane).name,
        )
        click("Готово")
        described("Настройка сетки")
        shot("grid-options")
        click("Готово")
        described("Меню трека")
        click("Загрузить")
        shot("saved-tracks")
        test.runOnMainSync {
            all()
                .filterIsInstance<Button>()
                .first { it.text.toString().contains("Memory") }
                .performClick()
        }
        val loadDeadline = SystemClock.elapsedRealtime() + 10000
        while (
            activity.editor.project.bpm != 150 && SystemClock.elapsedRealtime() < loadDeadline
        ) Thread.sleep(50)
        assertEquals(150, activity.editor.project.bpm)
        assertEquals(2, activity.editor.project.lanes.size)
        described("Визуальное пианино")
        Thread.sleep(500)
        described("Настройки визуала")
        test.waitForIdleSync()
        shot("scene-options")
        click("✕")
        described("Сохранить аудио или видео")
        test.waitForIdleSync()
        shot("export-basic")
        click("Advanced")
        shot("export-advanced")
        click("‹")
        assertTrue(activity.editor.project.endTick > 0)
        test.runOnMainSync {
            activity.app.projects.save("audit-roundtrip", activity.editor.project, true)
        }
        assertEquals(activity.editor.project, activity.app.projects.load("audit-roundtrip"))
        activity.app.projects.delete("audit-roundtrip")
    }

    @Test
    fun sceneCustomPickerStartsAtLastSelectedSwatch() {
        var selected: String? = null
        test.runOnMainSync {
            ColorPicker(activity).show("Проверка цвета", Color.GREEN, true, Color.BLUE) {
                selected = it
            }
        }
        test.waitForIdleSync()
        test.runOnMainSync { all().first { it.contentDescription == "#ff4040" }.performClick() }
        assertEquals("#ff4040", selected)
        click("＋")
        test.runOnMainSync {
            val pad = all().filterIsInstance<ColorPlane>().single()
            assertEquals(Color.parseColor("#ff4040"), Color.HSVToColor(pad.hsv))
        }
        click("Готово")
        test.runOnMainSync { all().first { it.contentDescription == "Прозрачный" }.performClick() }
        click("＋")
        test.runOnMainSync {
            assertEquals(
                Color.BLUE,
                Color.HSVToColor(all().filterIsInstance<ColorPlane>().single().hsv),
            )
        }
        click("Готово")
        click("✕")
    }
}

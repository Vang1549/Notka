package studio.notka.next

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.SystemClock
import android.view.MotionEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.zip.ZipInputStream
import org.junit.*
import org.junit.Assert.*
import org.junit.runner.RunWith
import studio.notka.core.*
import studio.notka.next.audio.NativeAudio
import studio.notka.next.data.*
import studio.notka.next.export.*
import studio.notka.next.ui.SceneRenderer

@RunWith(AndroidJUnit4::class)
class NativeIntegrationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val app
        get() = context.applicationContext as NotkaApplication

    private val outputs
        get() = File(context.filesDir, "verification").apply { mkdirs() }

    private fun awaitReady() {
        val deadline = SystemClock.elapsedRealtime() + 30000
        while (!app.ready && SystemClock.elapsedRealtime() < deadline) Thread.sleep(50)
        assertTrue("Application failed to initialize: ${app.startupError}", app.ready)
    }

    private fun score(): Project =
        Project(
            bpm = 120,
            lanes =
                listOf(
                    Lane(
                        1,
                        "Пианино",
                        "inst-1",
                        DEFAULT_SOURCE,
                        listOf(Note(1, 0, 960, 60), Note(2, 960, 960, 64), Note(3, 1920, 960, 67)),
                    )
                ),
        )

    @Before
    fun initialize() {
        awaitReady()
    }

    @Test
    fun shippedBanksAndMemory() {
        val piano = app.banks.load(DEFAULT_SOURCE)
        val grand = app.banks.load("lib-mda-grand-1")
        assertEquals(12, piano.samples.size)
        assertTrue(grand.samples.isNotEmpty())
        assertTrue(piano.samples.all { it.pcm.samples.any { value -> value != 0f } })
        val memory =
            ProjectCodec.decode(
                context.assets.open("presets/memory.notka").bufferedReader().use { it.readText() }
            )
        assertEquals(2, memory.lanes.size)
        assertEquals(150, memory.bpm)
        val valid = context.assets.open("catalog.json").use { it.readBytes() }
        app.banks.verify(valid)
        val assets = instrumentation.context.assets
        val trumpet = app.banks.entries.first { it.preview == "preview-trumpet-1" }
        val preview = assets.open("preview-trumpet-1.json").use { it.readBytes() }
        val mp3 = app.banks.decodePreview(trumpet, preview)
        assertTrue(mp3.size in 1000..180000)
        File(outputs, "preview.mp3").writeBytes(mp3)
        val box = app.banks.entries.first { it.asset == "bank-musicbox-1" }
        val bank =
            app.banks.decode(
                box,
                app.banks.verify(assets.open("bank-musicbox-1.json").use { it.readBytes() }),
            )
        assertEquals(3, bank.samples.size)
        try {
            app.banks.decodePreview(trumpet, preview.copyOf().also { it[it.lastIndex - 1] = 0 })
            fail("Changed preview was accepted")
        } catch (_: IllegalArgumentException) {}
        val envelope = org.json.JSONObject(valid.toString(Charsets.UTF_8))
        envelope.put("record", envelope.getString("record") + " ")
        try {
            app.banks.verify(envelope.toString().toByteArray())
            fail("Changed catalog signature was accepted")
        } catch (_: IllegalArgumentException) {}
    }

    @Test
    fun soundRoundTripAndSharedExports() {
        val p = score()
        val options = ExportOptions()
        val wav = File(outputs, "piano.wav")
        wav.outputStream().use { AudioExport.wave(p, app.banks, options, it, {}) {} }
        val pcm = Wave.decode(wav.readBytes())
        assertEquals(48000, pcm.rate)
        assertEquals(2, pcm.channels)
        assertTrue(pcm.samples.any { kotlin.math.abs(it) > .01f })
        assertTrue(pcm.samples.all { it.isFinite() && kotlin.math.abs(it) <= .95f })
        NativeAudio.build(p, app.banks).use { engine ->
            val buffer = FloatArray(4096)
            engine.render(buffer, 2048)
            for (i in buffer.indices) assertEquals(buffer[i], pcm.samples[i], .00004f)
            engine.seek(.75)
            engine.render(buffer, 2048)
            assertTrue(buffer.any { kotlin.math.abs(it) > .001f })
            engine.play()
            Thread.sleep(250)
            engine.pause()
            assertTrue(engine.seconds() > .85)
        }
        val zip = File(outputs, "stems.zip")
        zip.outputStream().use {
            AudioExport.archive(p, app.banks, options.copy(type = "zip"), it, {}) {}
        }
        val names = mutableListOf<String>()
        ZipInputStream(zip.inputStream()).use { input ->
            while (true) {
                val entry = input.nextEntry ?: break
                names.add(entry.name)
                if (entry.name.endsWith(".wav"))
                    assertEquals(pcm.frames, Wave.decode(input.readBounded(8 * 1024 * 1024)).frames)
            }
        }
        assertTrue(
            names.containsAll(listOf("original.notka", "track.mid", "mix.wav", "tracks.json"))
        )
        assertTrue(names.any { it.startsWith("stems/") })
    }

    @Test
    fun codecAudioVideoAndCancel() {
        val deadline = SystemClock.elapsedRealtime() + 120000
        val check = { check(SystemClock.elapsedRealtime() < deadline) { "Codec timed out" } }
        val p = score().replaceLane(0, score().lane.copy(notes = listOf(Note(1, 0, 480, 60))))
        val options = ExportOptions(type = "aac", height = 480, fps = 24)
        val audio = File(outputs, "audio.m4a")
        CodecExport.audio(p, app.banks, options, audio, check) {}
        val video = File(outputs, "scene.mp4")
        CodecExport.video(p, app.banks, options.copy(type = "mp4"), video, check) {}
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(video.path)
            assertEquals(2, extractor.trackCount)
            val types =
                (0 until extractor.trackCount).map {
                    extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)
                }
            assertTrue(types.contains("video/avc"))
            assertTrue(types.contains("audio/mp4a-latm"))
        } finally {
            extractor.release()
        }
        val formats = ExportOptions.formats().map { it.first }
        for (type in listOf("opus", "webm-audio", "webm").filter { it in formats }) {
            val option = options.copy(type = type)
            val file = File(outputs, "$type.${option.extension}")
            if (type == "webm") CodecExport.video(p, app.banks, option, file, check) {}
            else CodecExport.audio(p, app.banks, option, file, check) {}
            val media = MediaExtractor()
            try {
                media.setDataSource(file.path)
                assertEquals(if (type == "webm") 2 else 1, media.trackCount)
            } finally {
                media.release()
            }
        }
        var calls = 0
        try {
            AudioExport.wave(
                score(),
                app.banks,
                ExportOptions(),
                java.io.ByteArrayOutputStream(),
                { if (++calls > 2) throw java.util.concurrent.CancellationException() },
            ) {}
            fail("Cancellation was ignored")
        } catch (_: java.util.concurrent.CancellationException) {}
    }

    @Test
    fun frozenRepositoryDownloads() {
        Assume.assumeTrue(InstrumentationRegistry.getArguments().getString("network") == "true")
        val cancel = java.util.concurrent.atomic.AtomicBoolean(false)
        val e = app.banks.entries.first { it.asset == "bank-musicbox-1" }
        val existed = app.banks.installed(e.id)
        try {
            app.banks.download(e.id, cancel)
            assertTrue(app.banks.installed(e.id))
            assertEquals(3, app.banks.load(e.id).samples.size)
            val trumpet = app.banks.entries.first { it.preview == "preview-trumpet-1" }
            val preview = app.banks.preview(trumpet.id, cancel)
            assertTrue(preview.length() > 1000)
            val hash =
                java.security.MessageDigest.getInstance("SHA-256").digest(preview.readBytes())
            assertArrayEquals(
                hash,
                java.security.MessageDigest.getInstance("SHA-256")
                    .digest(app.banks.preview(trumpet.id, cancel).readBytes()),
            )
        } finally {
            if (!existed && app.banks.installed(e.id)) app.banks.remove(e.id)
        }
    }

    @Test
    @androidx.test.filters.SdkSuppress(minSdkVersion = 29)
    fun foregroundExportSurvivesLeavingEditor() {
        val activity =
            instrumentation.startActivitySync(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ) as MainActivity
        instrumentation.waitForIdleSync()
        val uri =
            context.contentResolver.insert(
                android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                android.content.ContentValues().apply {
                    put(
                        android.provider.MediaStore.MediaColumns.DISPLAY_NAME,
                        "Notka-verification-${System.currentTimeMillis()}.mp4",
                    )
                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
                    put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                },
            )!!
        try {
            val p =
                score()
                    .replaceLane(
                        0,
                        score()
                            .lane
                            .copy(
                                notes =
                                    (0 until 16).map { Note(it + 1L, it * 960L, 960, 60 + it % 8) }
                            ),
                    )
            instrumentation.runOnMainSync {
                ExportService.launch(
                    activity,
                    p,
                    uri,
                    ExportOptions(type = "mp4", height = 480, fps = 24).json(),
                )
            }
            assertTrue(ExportService.busy)
            instrumentation.uiAutomation.executeShellCommand("input keyevent KEYCODE_HOME").close()
            val deadline = SystemClock.elapsedRealtime() + 120000
            while (ExportService.busy && SystemClock.elapsedRealtime() < deadline) Thread.sleep(100)
            assertFalse("Foreground export timed out", ExportService.busy)
            assertEquals("Экспорт завершён", ExportService.status)
            val file = File(outputs, "background.mp4")
            context.contentResolver.openInputStream(uri)!!.use { source ->
                file.outputStream().use { source.copyTo(it) }
            }
            val extractor = MediaExtractor()
            try {
                extractor.setDataSource(file.path)
                assertEquals(2, extractor.trackCount)
            } finally {
                extractor.release()
            }
        } finally {
            context.contentResolver.delete(uri, null, null)
            instrumentation.runOnMainSync { activity.finish() }
        }
    }

    @Test
    fun editorGesturesPersistenceAndScene() {
        val activity =
            instrumentation.startActivitySync(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ) as MainActivity
        instrumentation.runOnMainSync {
            activity.mutate { app.editor.load(Project()) }
            activity.grid.resetView()
        }
        instrumentation.waitForIdleSync()
        fun touch(action: Int, x: Float, y: Float, time: Long) {
            val event = MotionEvent.obtain(time, time, action, x, y, 0)
            instrumentation.runOnMainSync { activity.grid.dispatchTouchEvent(event) }
            event.recycle()
        }
        val density = context.resources.displayMetrics.density
        val x = 140 * density
        val y = 160 * density
        val time = SystemClock.uptimeMillis()
        touch(MotionEvent.ACTION_DOWN, x, y, time)
        touch(MotionEvent.ACTION_UP, x, y, time + 30)
        assertEquals(1, app.editor.project.lane.notes.size)
        val first = app.editor.project.lane.notes.first()
        touch(MotionEvent.ACTION_DOWN, x + 5 * density, y, time + 100)
        touch(MotionEvent.ACTION_MOVE, x + 95 * density, y - 26 * density, time + 150)
        touch(MotionEvent.ACTION_UP, x + 95 * density, y - 26 * density, time + 180)
        assertEquals(first.start + 960, app.editor.project.lane.notes.first().start)
        assertEquals(first.pitch + 1, app.editor.project.lane.notes.first().pitch)
        instrumentation.runOnMainSync {
            app.editor.undo()
            activity.refresh()
        }
        assertEquals(first, app.editor.project.lane.notes.first())
        app.projects.save("Проверка", app.editor.project, true)
        assertEquals(
            ProjectCodec.encode(app.editor.project),
            ProjectCodec.encode(app.projects.load("Проверка")),
        )
        app.projects.delete("Проверка")
        app.projects.saveDraft(app.editor.project, null)
        assertEquals(
            ProjectCodec.encode(app.editor.project),
            ProjectCodec.encode(app.projects.readDraft()!!),
        )
        instrumentation.runOnMainSync {
            val bitmap =
                Bitmap.createBitmap(
                    activity.grid.width,
                    activity.grid.height,
                    Bitmap.Config.ARGB_8888,
                )
            activity.grid.draw(Canvas(bitmap))
            File(outputs, "editor.png").outputStream().use {
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
            val frame = Bitmap.createBitmap(960, 540, Bitmap.Config.ARGB_8888)
            SceneRenderer(score()).draw(Canvas(frame), 960, 540, .4)
            File(outputs, "scene.png").outputStream().use {
                frame.compress(Bitmap.CompressFormat.PNG, 100, it)
            }
            frame.recycle()
            activity.finish()
        }
    }
}

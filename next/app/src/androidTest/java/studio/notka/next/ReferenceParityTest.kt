package studio.notka.next

import android.content.Intent
import android.graphics.*
import android.os.SystemClock
import android.util.Base64
import android.webkit.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import kotlinx.serialization.json.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import studio.notka.core.*
import studio.notka.next.ui.SceneRenderer

/** The old WebView exists only in the test APK, as an independent rendering oracle. */
@RunWith(AndroidJUnit4::class)
class ReferenceParityTest {
    private val runner = InstrumentationRegistry.getInstrumentation()
    private val context = runner.targetContext

    private fun js(web: WebView, script: String): String {
        val done = CountDownLatch(1)
        var result = ""
        runner.runOnMainSync {
            web.evaluateJavascript(
                "(()=>{try{return " + script + "}catch(e){return 'ERROR:'+e.stack}})()"
            ) {
                result = it
                done.countDown()
            }
        }
        assertTrue("JavaScript timed out", done.await(15, TimeUnit.SECONDS))
        val decoded = org.json.JSONArray("[$result]").optString(0)
        assertFalse(decoded, decoded.startsWith("ERROR:"))
        return decoded
    }

    @Test
    fun sceneFramesAgainstUnmodifiedEditor80() {
        val activity =
            runner.startActivitySync(
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ) as MainActivity
        val deadline = SystemClock.elapsedRealtime() + 30000
        while (!activity.app.ready && SystemClock.elapsedRealtime() < deadline) Thread.sleep(50)
        assertTrue(activity.app.ready)
        val directory = File(context.cacheDir, "reference-80").apply { mkdirs() }
        ZipInputStream(runner.context.assets.open("editor-80.zip")).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                val file = File(directory, e.name)
                require(file.canonicalPath.startsWith(directory.canonicalPath + File.separator))
                if (!e.isDirectory) {
                    file.parentFile!!.mkdirs()
                    file.outputStream().use { zip.copyTo(it) }
                }
            }
        }
        val loaded = CountDownLatch(1)
        lateinit var web: WebView
        runner.runOnMainSync {
            web = WebView(activity)
            web.settings.javaScriptEnabled = true
            web.settings.domStorageEnabled = true
            web.settings.allowFileAccess = true
            web.settings.allowFileAccessFromFileURLs = true
            web.webViewClient =
                object : WebViewClient() {
                    override fun onPageFinished(v: WebView, u: String) {
                        loaded.countDown()
                    }
                }
            activity.setContentView(web)
            web.loadUrl(File(directory, "index.html").toURI().toString())
        }
        assertTrue(loaded.await(15, TimeUnit.SECONDS))
        val rendererScript = File(directory, "scene-renderer.js").readText()
        js(
            web,
            "(()=>{const s=document.createElement('script');s.textContent=${JSONObject.quote(rendererScript)};document.body.append(s);return typeof NotkaSceneRenderer})()",
        )
        val score =
            Project(
                bpm = 120,
                lanes =
                    listOf(
                        Lane(
                            1,
                            "Низ",
                            "inst-1",
                            DEFAULT_SOURCE,
                            listOf(Note(1, 0, 960, 48), Note(2, 960, 480, 55)),
                        ),
                        Lane(
                            2,
                            "Верх",
                            "inst-1",
                            DEFAULT_SOURCE,
                            listOf(Note(3, 0, 480, 60), Note(4, 480, 1440, 64)),
                        ),
                        Lane(
                            3,
                            "Акцент",
                            "inst-1",
                            DEFAULT_SOURCE,
                            listOf(Note(5, 240, 480, 72), Note(6, 1200, 960, 61)),
                        ),
                    ),
            )
        val outputs = File(context.filesDir, "verification/parity").apply { mkdirs() }
        File(outputs, "fixture.notka").writeText(ProjectCodec.encode(score))
        val variants =
            listOf(
                "basic" to score,
                "effects" to
                    score.copy(
                        scene =
                            JsonObject(
                                score.scene.toMutableMap().apply {
                                    put("palette", JsonPrimitive("aurora"))
                                    put("backdrop", JsonPrimitive("stars"))
                                    put("noteStyle", JsonPrimitive("glass"))
                                    put("rays", JsonPrimitive(35))
                                    put("rings", JsonPrimitive(40))
                                    put("trails", JsonPrimitive(25))
                                    put("keyLabels", JsonPrimitive("all"))
                                    put("guides", JsonPrimitive(true))
                                }
                            )
                    ),
            )
        for ((name, project) in variants) {
            js(
                web,
                "(()=>{applyTrack(readTrack(${JSONObject.quote(ProjectCodec.encode(project))}));return 'ok'})()",
            )
            val native = SceneRenderer(project)
            val expected =
                JSONObject(
                    js(
                        web,
                        "(()=>{const t=overviewTrack(),k=keyLayout(t.events);return JSON.stringify({whites:k.whites,pitches:[...k.keys.keys()],colors:t.events.map(sceneColor)})})()",
                    )
                )
            assertEquals(expected.getDouble("whites"), native.whites.toDouble(), .0001)
            assertEquals(
                expected.getJSONArray("pitches").toString(),
                org.json.JSONArray(native.keys.map { it.pitch }).toString(),
            )
            for (time in listOf(-1.0, .4, 1.0)) {
                val raw =
                    js(
                        web,
                        "(()=>{const t=overviewTrack();Object.assign(t,keyLayout(t.events),{next:0,visible:[],cycle:0,exporting:true});const c=document.createElement('canvas');c.style='position:absolute;left:0;top:0;width:960px;height:540px';document.body.append(c);NotkaSceneRenderer(c,t,$time,false);const result=c.toDataURL('image/png');c.remove();return result})()",
                    )
                File(outputs, "$name-$time-reference.png")
                    .writeBytes(Base64.decode(raw.substringAfter(','), Base64.DEFAULT))
                runner.runOnMainSync {
                    val frame = Bitmap.createBitmap(960, 540, Bitmap.Config.ARGB_8888)
                    native.draw(Canvas(frame), 960, 540, time)
                    File(outputs, "$name-$time-native.png").outputStream().use {
                        frame.compress(Bitmap.CompressFormat.PNG, 100, it)
                    }
                    frame.recycle()
                }
            }
        }
        runner.runOnMainSync {
            web.destroy()
            activity.finish()
        }
    }
}

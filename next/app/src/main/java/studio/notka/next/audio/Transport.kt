package studio.notka.next.audio

import android.content.*
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.ExecutorService
import studio.notka.core.*
import studio.notka.next.data.BankStore

/** UI-thread controller; expensive decoding and immutable sequence preparation use the worker. */
class Transport(
    private val context: Context,
    private val banks: () -> BankStore,
    private val worker: ExecutorService,
) {
    private val main = Handler(Looper.getMainLooper())
    private var serial = 0L
    private var engine: NativeAudio? = null
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var onState: () -> Unit = {}
    var onError: (Throwable) -> Unit = {}
    var onInterruption: () -> Unit = {}
    var diagnosticsEnabled: () -> Boolean = { false }
    var onMetrics: (Long, Long) -> Unit = { _, _ -> }
    private var measuredAt = 0L
    var playing = false
        private set

    var preparing = false
        private set

    var position = 0.0
        private set

    var duration = 0.0
        private set

    private var revision = -1L
    private var focus: AudioFocusRequest? = null
    private val focusListener =
        AudioManager.OnAudioFocusChangeListener { change ->
            if (change < 0)
                main.post {
                    pause()
                    onInterruption()
                }
        }
    private val noisy =
        object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                pause()
                onInterruption()
            }
        }

    init {
        if (Build.VERSION.SDK_INT >= 33)
            context.registerReceiver(
                noisy,
                IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
                Context.RECEIVER_NOT_EXPORTED,
            )
        else context.registerReceiver(noisy, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
    }

    private fun gainFocus(): Boolean {
        val result =
            if (Build.VERSION.SDK_INT >= 26) {
                val request =
                    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                                .build()
                        )
                        .setOnAudioFocusChangeListener(focusListener, main)
                        .build()
                focus = request
                audio.requestAudioFocus(request)
            } else
                audio.requestAudioFocus(
                    focusListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN,
                )
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandon() {
        if (Build.VERSION.SDK_INT >= 26) focus?.let { audio.abandonAudioFocusRequest(it) }
        else audio.abandonAudioFocus(focusListener)
        focus = null
    }

    fun canResume(currentRevision: Long) = engine != null && revision == currentRevision

    fun auditionFocus() = gainFocus()

    fun endAudition() {
        if (!playing) abandon()
    }

    fun play(project: Project, currentRevision: Long) {
        if (preparing) return
        if (engine != null && revision == currentRevision) {
            resume()
            return
        }
        stop(false)
        val token = ++serial
        preparing = true
        onState()
        val start = position
        worker.execute {
            val result = runCatching {
                NativeAudio.build(project, banks(), loop = project.scene.flag("loop"))
            }
            main.post {
                if (token != serial) {
                    result.getOrNull()?.close()
                    return@post
                }
                preparing = false
                result
                    .onSuccess {
                        engine = it
                        duration = it.duration
                        revision = currentRevision
                        it.seek(start.coerceIn(0.0, duration))
                        resume()
                    }
                    .onFailure {
                        onError(it)
                        onState()
                    }
            }
        }
    }

    private fun resume() {
        runCatching {
                check(gainFocus()) { "Другое приложение сейчас использует звук" }
                if (position >= duration) engine?.seek(0.0)
                engine?.play()
                playing = true
            }
            .onFailure {
                playing = false
                abandon()
                onError(it)
            }
        onState()
    }

    fun pause() {
        serial++
        preparing = false
        engine?.pause()
        position = engine?.seconds() ?: position
        playing = false
        abandon()
        onState()
    }

    fun stop(reset: Boolean = true) {
        serial++
        preparing = false
        engine?.close()
        engine = null
        playing = false
        revision = -1
        abandon()
        if (reset) position = 0.0
        onState()
    }

    fun seek(seconds: Double) {
        val wasPlaying = playing
        engine?.pause()
        position =
            if (engine == null) seconds.coerceAtLeast(0.0)
            else seconds.coerceIn(0.0, maxOf(duration, 0.0))
        engine?.seek(position)
        if (wasPlaying) engine?.play()
        onState()
    }

    fun poll(): Double {
        engine?.let {
            val now = android.os.SystemClock.elapsedRealtime()
            if (diagnosticsEnabled() && now - measuredAt >= 1000) {
                measuredAt = now
                val metrics = it.diagnostics()
                onMetrics(metrics[0], metrics[1])
            }
            position = it.seconds()
            if (playing && it.status() != 0) {
                playing = false
                abandon()
                if (it.status() == 2)
                    onError(
                        IllegalStateException("Аудиоустройство отключено. Нажми «Играть» ещё раз")
                    )
                onState()
            }
        }
        return position
    }

    fun close() {
        stop()
        context.unregisterReceiver(noisy)
    }
}

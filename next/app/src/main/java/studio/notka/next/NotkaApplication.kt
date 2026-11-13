package studio.notka.next

import android.app.Application
import android.os.Handler
import android.os.Looper
import java.util.concurrent.Executors
import studio.notka.core.*
import studio.notka.next.data.*

class NotkaApplication : Application() {
    val editor = Editor()
    val worker = Executors.newSingleThreadExecutor()
    val io = Executors.newSingleThreadExecutor()
    val network = Executors.newFixedThreadPool(2)
    val main = Handler(Looper.getMainLooper())
    lateinit var projects: ProjectStore
        private set

    lateinit var diagnostics: Diagnostics
        private set

    lateinit var banks: BankStore
        private set

    @Volatile
    var ready = false
        private set

    var startupError: Throwable? = null
        private set

    var restored = false
        private set

    var observer: () -> Unit = {}
    var saveError: (Throwable) -> Unit = {}
    var songName: String? = null
    private var savedRevision = -1L
    private var scheduled = false

    override fun onCreate() {
        super.onCreate()
        projects = ProjectStore(this)
        diagnostics = Diagnostics(this)
        diagnostics.installCrashHandler()
        worker.execute {
            val result = runCatching {
                banks = BankStore(this)
                projects.readDraft()
            }
            main.post {
                result
                    .onSuccess {
                        if (it != null) {
                            editor.load(it)
                            restored = true
                            songName = projects.lastDraftName
                        }
                    }
                    .onFailure {
                        startupError = it
                        diagnostics.record("startup", it)
                    }
                savedRevision = editor.revision
                ready = ::banks.isInitialized
                observer()
            }
        }
    }

    fun changed() {
        if (!scheduled) {
            scheduled = true
            main.postDelayed(
                {
                    scheduled = false
                    flush()
                },
                60000,
            )
        }
        observer()
    }

    fun flush(force: Boolean = false) {
        if (!ready || (!force && editor.revision == savedRevision)) return
        val project = editor.project
        val revision = editor.revision
        val name = songName
        io.execute {
            runCatching { projects.saveDraft(project, name) }
                .onSuccess { main.post { savedRevision = maxOf(savedRevision, revision) } }
                .onFailure { e ->
                    diagnostics.record("autosave", e)
                    main.post { saveError(e) }
                }
        }
    }
}

package studio.notka.next.data

import android.content.Context
import android.util.AtomicFile
import java.io.*
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean
import studio.notka.core.Project
import studio.notka.core.ProjectCodec

fun InputStream.readBounded(limit: Int, cancel: AtomicBoolean? = null): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(32768)
    while (true) {
        if (cancel?.get() == true) throw CancellationException()
        val n = read(buffer)
        if (n < 0) break
        require(out.size() + n <= limit) { "Файл слишком большой" }
        out.write(buffer, 0, n)
    }
    return out.toByteArray()
}

fun atomicWrite(file: File, bytes: ByteArray) {
    file.parentFile?.mkdirs()
    val atomic = AtomicFile(file)
    val stream = atomic.startWrite()
    try {
        stream.write(bytes)
        atomic.finishWrite(stream)
    } catch (e: Throwable) {
        atomic.failWrite(stream)
        throw e
    }
}

fun atomicRead(file: File, limit: Int): ByteArray =
    AtomicFile(file).openRead().use { it.readBounded(limit) }

class ProjectStore(context: Context) {
    private val root = File(context.filesDir, "projects").apply { mkdirs() }
    private val draft = File(context.filesDir, "draft.notka")
    var lastDraftName: String? = null
        private set

    fun list(): List<String> =
        root
            .listFiles()
            ?.filter { it.isFile && it.extension == "notka" }
            ?.map { it.nameWithoutExtension }
            ?.sortedBy { it.lowercase() } ?: emptyList()

    private fun file(name: String): File {
        require(
            name.isNotBlank() &&
                name.length <= 80 &&
                !name.startsWith('.') &&
                !Regex("[\\\\/:*?\"<>|\\p{Cntrl}]").containsMatchIn(name)
        ) {
            "Введи название до 80 символов без знаков пути"
        }
        return File(root, "$name.notka")
    }

    fun exists(name: String) = file(name).exists()

    @Synchronized
    fun save(name: String, project: Project, overwrite: Boolean) {
        val target = file(name)
        require(overwrite || !target.exists()) { "Такой трек уже есть" }
        atomicWrite(target, ProjectCodec.encode(project).toByteArray())
    }

    fun load(name: String) =
        ProjectCodec.decode(
            atomicRead(file(name), ProjectCodec.MAX_FILE_BYTES).toString(Charsets.UTF_8)
        )

    @Synchronized
    fun delete(name: String) {
        require(file(name).delete()) { "Не удалось удалить файл" }
    }

    @Synchronized
    fun saveDraft(project: Project, name: String? = null) {
        val json = org.json.JSONObject(ProjectCodec.encode(project))
        if (name != null) json.put("draftName", name)
        atomicWrite(draft, json.toString().toByteArray())
    }

    fun readDraft(): Project? {
        if (!draft.exists() && !File(draft.path + ".bak").exists()) return null
        val raw = atomicRead(draft, ProjectCodec.MAX_FILE_BYTES)
        try {
            val text = raw.toString(Charsets.UTF_8)
            val project = ProjectCodec.decode(text)
            lastDraftName =
                org.json.JSONObject(text).optString("draftName").takeIf {
                    it.isNotEmpty() && runCatching { file(it).exists() }.getOrDefault(false)
                }
            return project
        } catch (e: Exception) {
            atomicWrite(
                File(draft.parentFile, "recovery/draft-${System.currentTimeMillis()}.notka"),
                raw,
            )
            throw e
        }
    }
}

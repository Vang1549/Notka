package studio.notka.core

import kotlin.math.*

/** One committed gesture is one undo entry; drawing previews never mutate this history. */
class Editor(initial: Project = Project()) {
    var project: Project = initial.validate()
        private set

    var revision = 0L
        private set

    private val past = ArrayDeque<Project>()
    private val future = ArrayDeque<Project>()
    val canUndo
        get() = past.isNotEmpty()

    val canRedo
        get() = future.isNotEmpty()

    fun load(value: Project) {
        project = value.validate()
        past.clear()
        future.clear()
        revision++
    }

    fun change(transform: (Project) -> Project) {
        val next = transform(project).validate()
        if (next == project) return
        past.addLast(project)
        while (past.size > 80) past.removeFirst()
        project = next
        future.clear()
        revision++
    }

    fun selectLane(index: Int) {
        require(index in project.lanes.indices)
        if (project.activeLane == index) return
        project = project.copy(activeLane = index)
        revision++
    }

    fun undo() {
        if (past.isNotEmpty()) {
            future.addLast(project)
            project = past.removeLast()
            revision++
        }
    }

    fun redo() {
        if (future.isNotEmpty()) {
            past.addLast(project)
            project = future.removeLast()
            revision++
        }
    }

    fun addNote(
        start: Long,
        pitch: Int,
        length: Long = project.defaultNoteLength,
        volume: Int = 100,
    ) = change { p ->
        val n = Note(p.nextNoteId, start.coerceAtLeast(0), length, pitch, volume).validate()
        p.replaceLane(p.activeLane, p.lane.copy(notes = p.lane.notes + n))
    }

    fun updateNotes(ids: Set<Long>, transform: (Note) -> Note) = change { p ->
        p.replaceLane(
            p.activeLane,
            p.lane.copy(notes = p.lane.notes.map { if (it.id in ids) transform(it) else it }),
        )
    }

    fun deleteNotes(ids: Set<Long>) = change { p ->
        p.replaceLane(p.activeLane, p.lane.copy(notes = p.lane.notes.filterNot { it.id in ids }))
    }

    fun paste(notes: List<Note>, at: Long, pitchShift: Int = 0) {
        if (notes.isEmpty()) return
        val first = notes.minOf { it.start }
        val low = notes.minOf { it.pitch }
        val high = notes.maxOf { it.pitch }
        val shift = pitchShift.coerceIn(24 - low, 119 - high)
        change { p ->
            var id = p.nextNoteId
            p.replaceLane(
                p.activeLane,
                p.lane.copy(
                    notes =
                        p.lane.notes +
                            notes.map {
                                it.copy(
                                    id = id++,
                                    start = max(0, at) + it.start - first,
                                    pitch = it.pitch + shift,
                                )
                            }
                ),
            )
        }
    }

    fun addLane() = change { p ->
        val id = p.lanes.maxOf { it.id } + 1
        p.copy(
            lanes =
                p.lanes +
                    Lane(id, "Дорожка ${p.lanes.size + 1}", p.lane.instrumentId, p.lane.instrument),
            activeLane = p.lanes.size,
        )
    }

    fun deleteLane(index: Int) = change { p ->
        require(p.lanes.size > 1) { "Нужна хотя бы одна дорожка" }
        p.copy(
            lanes = p.lanes.filterIndexed { i, _ -> i != index },
            activeLane =
                (p.activeLane - if (index <= p.activeLane) 1 else 0).coerceIn(0, p.lanes.size - 2),
        )
    }

    fun moveLane(index: Int, direction: Int) = change { p ->
        val dest = (index + direction).coerceIn(p.lanes.indices)
        val list = p.lanes.toMutableList()
        val item = list.removeAt(index)
        list.add(dest, item)
        p.copy(lanes = list, activeLane = list.indexOfFirst { it.id == p.lane.id })
    }

    fun addInstrument(
        source: String,
        name: String,
        settings: SoundSettings = SoundSettings(),
    ): String {
        var n = 1
        while (project.instruments.any { it.id == "inst-$n" }) n++
        val id = "inst-$n"
        change {
            it.copy(instruments = it.instruments + Instrument(id, source, name.take(48), settings))
        }
        return id
    }

    fun assignInstrument(id: String) = change { p ->
        val instrument = p.instruments.first { it.id == id }
        p.replaceLane(p.activeLane, p.lane.copy(instrumentId = id, instrument = instrument.source))
    }

    fun removeInstrument(id: String) = change { p ->
        require(p.lanes.none { it.instrumentId == id }) { "Инструмент используется дорожкой" }
        p.copy(instruments = p.instruments.filterNot { it.id == id })
    }
}

/** Per-pitch interval index. Long sustained notes remain visible after horizontal scrolling. */
class NoteIndex(notes: List<Note>) {
    private class Row(notes: List<Note>) {
        val sorted = notes.sortedBy { it.start }
        val maxEnd =
            LongArray(sorted.size).also { result ->
                var end = 0L
                sorted.forEachIndexed { i, n ->
                    end = max(end, n.end)
                    result[i] = end
                }
            }
    }

    private val rows = notes.groupBy { it.pitch }.mapValues { Row(it.value) }

    fun query(start: Long, end: Long, low: Int = 24, high: Int = 119): List<Note> {
        val result = ArrayList<Note>()
        for (pitch in low..high) {
            val row = rows[pitch] ?: continue
            var lo = 0
            var hi = row.sorted.size
            while (lo < hi) {
                val mid = (lo + hi) / 2
                if (row.maxEnd[mid] <= start) lo = mid + 1 else hi = mid
            }
            var i = lo
            while (i < row.sorted.size && row.sorted[i].start < end) {
                val n = row.sorted[i++]
                if (n.end > start) result.add(n)
            }
        }
        return result
    }
}

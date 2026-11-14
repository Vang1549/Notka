package studio.notka.core

import java.io.ByteArrayInputStream
import javax.sound.midi.MidiSystem
import kotlin.test.*
import kotlinx.serialization.json.*

class CoreTest {
    @Test
    fun addedLaneStartsWithPianoInsteadOfCurrentSound() {
        val editor = Editor()
        val id = editor.addInstrument("lib-mda-grand-1", "Другой инструмент")
        editor.assignInstrument(id)
        editor.addLane()
        assertEquals(DEFAULT_SOURCE, editor.project.lane.instrument)
        assertEquals(DEFAULT_SOURCE, editor.project.instrument(editor.project.lane).source)
        assertEquals(2, editor.project.lanes.size)
    }

    @Test
    fun legacyFilesAndRoundTrip() {
        val v1 =
            """{"format":"notka.track","version":1,"ppq":960,"bpm":100,"division":4,"notes":[{"start":1440,"len":240,"pitch":63,"volume":72}]}"""
        val p = ProjectCodec.decode(v1)
        assertEquals(1440, p.lane.notes.single().start)
        assertEquals(DEFAULT_SOURCE, p.lane.instrument)
        assertEquals(p, ProjectCodec.decode(ProjectCodec.encode(p)))
        val v2 =
            """{"format":"notka.track","version":2,"ppq":960,"bpm":150,"division":3,"activeLane":1,"lanes":[{"name":"А","muted":false,"instrument":"classic","notes":[]},{"name":"Б","muted":true,"ghost":true,"instrument":"vsco-flute-1","notes":[]}],"scene":{"fall":2.4}}"""
        val q = ProjectCodec.decode(v2)
        assertEquals("lib-vsco-flute-1", q.lane.instrument)
        assertEquals(2, q.instruments.size)
        assertEquals(1.875, q.scene.number("speed"))
        assertEquals("glass", q.scene.text("noteStyle"))
        assertEquals(28.0, q.scene.number("rays"))
        assertEquals(q, ProjectCodec.decode(ProjectCodec.encode(q)))
    }

    @Test
    fun invalidImportNeverReplacesCurrentSong() {
        val editor = Editor()
        editor.addNote(100, 60)
        val original = editor.project
        val raw = ProjectCodec.encode(original)
        for (bad in
            listOf(
                raw.replace("\"len\":${original.lane.notes.single().len}", "\"len\":0"),
                raw.replace("\"pitch\":60", "\"pitch\":200"),
                raw.replace("\"bpm\":${original.bpm}", "\"bpm\":\"${original.bpm}\""),
                raw.replace("\"instrumentId\":\"inst-1\"", "\"instrumentId\":\"inst-missing\""),
            )) {
            assertNotEquals(raw, bad, "Each malformed fixture must actually change the input")
            assertFails { editor.load(ProjectCodec.decode(bad)) }
            assertEquals(original, editor.project)
        }
        assertFails { Note(1, MAX_TICK, 1, 60).validate() }
        assertFails { SoundSettings(start = 60.0, end = 50.0).validate() }
    }

    @Test
    fun editor80DivisionsAreFractionsOfABeat() {
        assertEquals(100, Project().bpm)
        for (division in DIVISIONS.filter { it > 0 }) {
            val project = Project(division = division)
            assertEquals(960L / division, project.snapTick)
            assertEquals(960L / division, project.defaultNoteLength)
            assertEquals(120L, project.copy(viewDivision = 8).defaultNoteLength)
            assertEquals(320L, project.copy(viewDivision = 8, noteDivision = 3).defaultNoteLength)
        }
        assertEquals(1L, Project(division = 0).snapTick)
        assertEquals(240L, Project(division = 0).defaultNoteLength)
    }

    @Test
    fun fullSettingsAndUnknownBankSurvive() {
        val s =
            SoundSettings(
                134.0,
                -13.0,
                -5,
                18.5,
                .13,
                .75,
                .2,
                .4,
                .3,
                44.0,
                "bandpass",
                642.0,
                4.3,
                14.0,
                74.0,
                true,
                "off",
                1.7,
            )
        val p =
            Project(
                    instruments = listOf(Instrument("inst-test", "lib-new-bank-1", "Новый", s)),
                    lanes =
                        listOf(
                            Lane(
                                1,
                                "Трек",
                                "inst-test",
                                "lib-new-bank-1",
                                listOf(Note(1, 0, 1, 119, 0)),
                            )
                        ),
                )
                .validate()
        assertEquals(p, ProjectCodec.decode(ProjectCodec.encode(p)))
    }

    @Test
    fun undoGestureAndIndependentRack() {
        val e = Editor()
        e.addNote(0, 60)
        e.addNote(960, 64)
        val p = e.project
        e.updateNotes(p.lane.notes.map { it.id }.toSet()) {
            it.copy(start = it.start + 240, pitch = it.pitch + 2)
        }
        e.undo()
        assertEquals(p, e.project)
        e.redo()
        assertEquals(listOf(62, 66), e.project.lane.notes.map { it.pitch })
        e.undo()
        e.deleteNotes(setOf(p.lane.notes.first().id))
        assertFalse(e.canRedo)
        val id = e.addInstrument(DEFAULT_SOURCE, "Другое пианино", SoundSettings(pan = 80.0))
        e.assignInstrument(id)
        assertFails { e.removeInstrument(id) }
        assertEquals(0.0, e.project.instruments.first().settings.pan)
        e.addLane()
        e.moveLane(1, -1)
        assertEquals(0, e.project.activeLane)
    }

    @Test
    fun intervalIndexMatchesBruteForce() {
        val random = kotlin.random.Random(1729)
        val notes =
            (1L..10000L).map {
                Note(
                    it,
                    random.nextLong(100000),
                    random.nextLong(1, 30000),
                    random.nextInt(24, 120),
                )
            }
        val index = NoteIndex(notes)
        repeat(200) {
            val start = random.nextLong(110000)
            val end = start + random.nextLong(1, 5000)
            val low = random.nextInt(24, 100)
            val high = low + 10
            assertEquals(
                notes
                    .filter { it.start < end && it.end > start && it.pitch in low..high }
                    .map { it.id }
                    .toSet(),
                index.query(start, end, low, high).map { it.id }.toSet(),
            )
        }
    }

    @Test
    fun midiIsReadableAndKeepsLeadingSilence() {
        val p =
            Project(
                lanes =
                    listOf(
                        Lane(
                            1,
                            "Мелодия",
                            "inst-1",
                            DEFAULT_SOURCE,
                            listOf(Note(1, 2880, 960, 60, 100), Note(2, 3840, 240, 64, 80)),
                        )
                    )
            )
        val bytes = Midi.encode(p, "Проверка", mapOf(DEFAULT_SOURCE to 0))
        val midi = MidiSystem.getSequence(ByteArrayInputStream(bytes))
        assertEquals(960, midi.resolution)
        assertEquals(2, midi.tracks.size)
        assertEquals(4080, midi.tickLength)
        val notes =
            (0 until midi.tracks[1].size())
                .map { midi.tracks[1][it] }
                .filter { it.message.status and 0xf0 == 0x90 }
        assertEquals(2880, notes.first().tick)
    }

    @Test
    fun wavBoundsAndDecode() {
        val samples = byteArrayOf(0, 0, -1, 127, 0, -128)
        val wav = Wave.header(3, 32000, 1, 16) + samples
        val pcm = Wave.decode(wav)
        assertEquals(3, pcm.frames)
        assertEquals(-1f, pcm.samples.last())
        assertTrue(pcm.samples[1] > .99f)
        assertFails { Wave.decode(wav.copyOf(wav.size - 1)) }
        assertFails { Wave.decode(wav.copyOf().also { it[40] = 100 }) }
    }
}

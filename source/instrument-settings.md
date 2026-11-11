# Instrument rack and project format v3 (editor 0.47)

The downloaded library stores source banks. A project stores independent instances
in `instruments`, each with `id`, `source` (bank ID), `name`, and `settings`.
Lanes reference instances through `instrumentId`; `instrument` mirrors their bank
ID for existing rendering and download code. Several lanes can share an instance.
Duplicating one copies its settings, not its PCM buffers. Deleting an unused instance
does not delete its bank. Banks used anywhere in the rack are protected from removal.

`soundSettings` validates bounds and fills omitted fields. All settings are JSON
values: volume/pan/sustain/start/end are percentages; transpose is semitones;
fine is cents; delay/attack/hold/decay/release are seconds; cutoff is Hz;
resonance is Q. Velocity is an exponent applied to the note's normalized volume.
Attack/release `null` uses bank defaults. Filter: off/lowpass/highpass/bandpass.
Loop: original/off. Reverse: boolean. Sample start must be less than end.
Original looping is used only when the whole source loop lies inside the trim.
Reverse mirrors the original loop markers and caches a separate reversed buffer.

Version 1/2 projects migrate to one default instance per bank. Version 3 validates
unique instance IDs and lane references. Invalid references or settings reject the
load before changing the current project. Old editors do not support v3 saves.

Live playback, preview, and offline WAV rendering share `createInstrumentVoice`.
The gain envelope is interrupted at note-off at its current amplitude, then releases.
WAV is stereo 16-bit PCM, 32000 Hz; 8-second chunks include a one-second warmup
for the filter and limiter. Notes active at a chunk boundary resume with their
original sample position, pitch, loop phase, and envelope age.

MIDI exports lane tracks, GM program, CC7 volume, CC10 pan, transposed notes and
velocity curve. Volume above 100% is limited to MIDI's maximum. Out-of-range
transposed MIDI pitches reject export. Fine tuning, sample manipulation, filters,
and envelopes are preserved in Original.notka and Tracks.json, and baked into
WAV, not claimed to be portable sampler settings in MIDI or native FLP files.

Validation: test-rack.cjs covers instances, persistence/migration, invalid files,
envelopes and audio routing. test-catalog.cjs covers protected banks and offline
reuse. test-web-audio.js is a browser-only QA fixture, never shipped in the app:
it checks real OfflineAudioContext output, stereo isolation, attack/release,
filter attenuation, and WAV continuity across a chunk boundary.

Build: run `npm ci` in source to install the pinned Terser dependency.
`editor_channel.py` minifies only new editor editions (47+), leaving source readable.
It enforces the 190000-character base64 limit of existing launchers before signing.
Compression transformations are disabled; local identifiers and whitespace are compacted.
Run audio/model tests against the decoded signed HTML with `NOTKA_EDITOR_HTML`.

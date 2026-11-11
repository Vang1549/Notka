# 0.48 — Личное трио (personal APK only)

The user explicitly chose a private APK instead of an open update because
FrozenPlain permits personal format conversion but not redistribution of its
samples inside production tools. Do not publish the APK, source FLACs, converted
musicbox-floe.json, or any archives containing those files on the update Site.
The public channel remains 0.47. Source code can be synced without those assets.

The three visible bundled banks are the existing VSCO piano, unchanged MDA grand,
and FrozenPlain Music Box Suite Free. Legacy downloaded banks remain addressable
by old project IDs but are hidden in this edition's library. Old music-box IDs are
not remapped to FrozenPlain. Bundled files are part of the APK: their delete
buttons are disabled, sizes are under those buttons, and status labels are absent.

The Floe source package has 37 region declarations referencing 31 unique stereo
FLACs in four round-robin groups. `build_personal_musicbox.py` retains every unique
recording, converts to stereo 32000 Hz PCM16 without individual normalization,
and records each sample's root and RR group. It does not reproduce Floe's effect
rack or unknown modifications to the screenshot's preset. Live and WAV playback
choose the same RR group from each note's position in its lane. Source PCM buffers
remain shared between instrument instances.

Inputs (private, excluded from git): download the official package from
https://www.frozenplain.com/product/music-box-suite-free and extract it under
`private-48/floe`. Run `build_personal_musicbox.py` with numpy, scipy and soundfile.
The MDA bank is copied unchanged from the existing signed public bank's record.
The original FrozenPlain License.pdf, MDA MIT license and credits are in the APK.

Stage editor 48 with `editor_channel.py private-48 48 0.48 'Личное трио'` after
copying previous edition records into private-48/editions. Build bundled-editions.js
from that private catalogue, then run build.py and verify.py. Keep the existing
signing identity. `publish_release.py` refuses to stage personal-marked APKs anywhere
except private-48. Do not deploy that directory.

Song deletion: the UI confirms the exact name; Android resolves only a validated
.notka filename in Download/Notka (MediaStore on Android 10+, app-specific folder
on older releases). It deletes the corresponding write journal only after a
successful MediaStore deletion. Failures preserve the UI item. Deleting the open
file clears its save target while retaining the editor and draft; presets have no
delete action. Other media and arbitrary paths are not accepted.

Checks: test-personal48.cjs, test-instruments.cjs, test-tracks.cjs,
test-presets.cjs, test-instrument-browser.cjs, test-catalog.cjs, test-rack.cjs,
test-export.cjs, test-loop.cjs, test-native.py. Use NOTKA_DIST=private-48 for
test-launcher.cjs/test-update.cjs and NOTKA_EDITOR_HTML for minified-editor tests.
Browser QA decoded all three banks, verified 31 stereo recordings and four RR
groups, checked WAV continuity and cancellation/confirmation of test-song deletion.
No physical Android device test was available.

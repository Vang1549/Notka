# 0.50 · Импорт инструментов

Public APK and signed editor. Built-in VSCO piano and MDA Grand; no FrozenPlain samples are shipped. Users upgrading personal APK 0.48 must import Music Box Suite Free once; note/project IDs remain unchanged.

The split control enables import only after visiting the official source and returning. This detects return, not download completion. Source-step state is stored through soundWrite; visibility fallback and native onResume notification cover return/recreation.

Supported input: original FrozenPlain Music Box Suite Free package (.floe-pkg), SHA-256 1eeb2d224e158225b2fc6f53aecf1c3f486ae12f65ae43fbdd9bf9141cb02438. No arbitrary Floe/Lua execution or general package import. Package hash is checked before ZIP traversal. Outer input <16 MiB, sample <512 KiB, PDF <64 KiB; allowlisted paths from the template select 31 stereo 44.1 kHz FLAC recordings and four round-robin groups. Original License.pdf is retained inside the private bank JSON as licensePdf. No sample content is sent to a server.

Native picker request 4213 has instrumentUri separate from song import. Bank is staged as musicbox-import.pending; WebAudio decodes all samples before commitInstrumentImport atomically writes musicbox-import.json. Cancellation/decode failure preserves the previous bank. In-use imported instruments cannot be deleted. Imported bank is available to earlier compatible editors via instrumentData.

APK verification: manifest, DEX checksums, signed APK digest/RSA, guarded constructor cleanup and exposed APIs. Functional tests: test-import (source and packed), test-source-links, test-instruments, test-personal48, test-rack, test-tracks, test-presets, test-export, test-launcher, test-update. test-import-package checks upstream package metadata/audio, native structure and public APK sample boundaries. Browser QA exercised the split control and real 31-file FLAC decode plus stereo offline render (peak 0.291). Android system picker and runtime ART verification remain untested on a physical device.

Editor 0.50 uses conservative Terser compression and compact literal preset note tuples, expanded into exactly the original Memory note data. Signed edition remains below older launcher 190000-character base64 limit.

Build with NODE_PATH pointing at Terser, sign editor 50 with editor_channel.py, regenerate bundled-editions.js from public catalogue, python build.py, python verify.py. Tests needing the original licensed fixture use the untracked private-48/musicbox.floe-pkg downloaded from the official author; never commit it.

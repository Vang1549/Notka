# 0.51 · Точное чтение

User reported the generic package read error on a real phone with APK 0.50. Inspection found that the upstream Floe archive stores FLAC entries with ZIP method STORED plus bit-3 data descriptors. ZipInputStream is unsuitable for this package: the JVM repro fails before the first FLAC with `only DEFLATED entries can have EXT descriptor`. Android implementations differ in stream handling; the exact exception from the user device was not available.

The importer now verifies the same package hash and bounded input, stages a private archive, then uses ZipFile and its central directory. It opens streams only for the allowlisted samples and license, closes each stream and the ZipFile on success/failure, and removes temporary archive data. Hash, entry limits, 31 sample count, PDF retention, validation before bank commit and private storage remain intact. No FrozenPlain audio is redistributed.

Native error codes identify URI/access, outer read, temporary storage, ZIP, template, sample/license, completeness and final bank save errors. Exception class names are included without messages/paths. Editor 0.51 recommends APK 0.51 for the old APK 0.50 generic read failure.

Validation: `java TestImportZip.java private-48/musicbox.floe-pkg` reproduces the stream failure and reads all 31 original FLACs (4708843 bytes) through ZipFile with correct CRCs and retained license. Native constructor cleanup/DEX assembly, APK manifest/signature/digest, source+packed import scenarios and error stages, package bounds, launcher and updater tests passed. No physical Android runtime/picker test was possible. The new parser's Java ZIP API path was tested directly, beyond the earlier Python extraction/browser decode checks.

Update APK, not only editor. Existing downloads need not be unpacked or repacked; use the author's original .floe-pkg.

package studio.notka.piano;

import java.io.File;
import java.io.IOException;

/** Deliberately excludes preferences, staging files and arbitrary paths. */
public final class StoragePolicy {
    private StoragePolicy() {}
    public static String publicKind(String name) {
        if (name == null || name.length() > 200 || name.startsWith(".") || name.matches(".*[/\\\\:*?\"<>|\\p{Cntrl}].*")) return null;
        if (name.endsWith(".notka")) return "tracks";
        if (name.matches(".+\\.(wav|m4a|weba|webm|mp4|ogg|mid|zip)")) return "exports";
        return null;
    }
    public static boolean sound(String name) {
        return name != null && (name.equals("musicbox-import.json") || name.matches("sound-bank-[a-z0-9-]{1,42}\\.json"));
    }
    public static boolean apkUrl(String url) {
        return url != null && url.matches("https://(?:notka-piano-updates\\.zentas\\.chatgpt\\.site/Notka-[1-9][0-9]{0,9}|github\\.com/Vang1549/Notka/releases/download/apk-([1-9][0-9]{0,9})/Notka-\\1)\\.apk");
    }
    public static boolean child(File dir, File file) throws IOException {
        // Do not follow symlinks, even when they point into another managed category.
        return file.getAbsoluteFile().equals(file.getCanonicalFile()) && dir.getCanonicalFile().equals(file.getCanonicalFile().getParentFile());
    }
}

package studio.notka.piano;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

/** Immersive mode belongs to the APK, independently of the selected editor. */
public final class SystemUi {
    private SystemUi() {}

    public static void apply(Activity activity) {
        Window window = activity.getWindow();
        if (window == null) return;
        View decor = window.getDecorView();
        if (Build.VERSION.SDK_INT >= 30 && Modern.hide(window)) return;
        // Keep unrelated appearance flags and let Android reveal the bars by
        // an edge swipe. Do not consume touch, Back, or keyboard events.
        decor.setSystemUiVisibility(decor.getSystemUiVisibility()
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    public static void focus(Activity activity, boolean hasFocus) {
        if (hasFocus) apply(activity);
    }

    // Isolate newer framework references from Android 5–10 class verification.
    private static final class Modern {
        static boolean hide(Window window) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller == null) return false;
            controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsets.Type.systemBars());
            return true;
        }
    }
}

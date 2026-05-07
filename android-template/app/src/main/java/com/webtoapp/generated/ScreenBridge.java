package com.webtoapp.generated;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

/**
 * ScreenBridge — جسر JavaScript بين الموقع و WebView.
 * يسمح للموقع باستدعاء بث/تسجيل الشاشة عبر:
 *   window.ScreenBridge.startBroadcast();
 *   window.ScreenBridge.stopBroadcast();
 *   window.ScreenBridge.isActive();
 *
 * هذا الملف اختياري وقابل للحذف بدون التأثير على باقي التطبيق.
 */
public class ScreenBridge {
    private final Activity activity;
    private final WebView webView;
    private static volatile boolean active = false;

    public ScreenBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    static void setActive(boolean v) { active = v; }

    @JavascriptInterface
    public void startBroadcast() {
        activity.runOnUiThread(() -> {
            try {
                MediaProjectionManager mpm = (MediaProjectionManager)
                    activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                if (mpm == null) return;
                if (activity instanceof MainActivity) {
                    ((MainActivity) activity).launchScreenCapture(mpm.createScreenCaptureIntent());
                }
            } catch (Exception ignored) {}
        });
    }

    @JavascriptInterface
    public void stopBroadcast() {
        activity.runOnUiThread(() -> {
            try {
                activity.stopService(new Intent(activity, ScreenCaptureService.class));
            } catch (Exception ignored) {}
            active = false;
        });
    }

    @JavascriptInterface
    public boolean isActive() {
        return active;
    }

    /** يُحقن في كل صفحة لتسهيل اكتشاف الجسر من الويب. */
    public static String injectionScript() {
        return "(function(){try{" +
            "if(window.ScreenBridgeNative){" +
            "window.ScreenBridge=window.ScreenBridge||{" +
            "startBroadcast:function(){return window.ScreenBridgeNative.startBroadcast();}," +
            "stopBroadcast:function(){return window.ScreenBridgeNative.stopBroadcast();}," +
            "isActive:function(){return window.ScreenBridgeNative.isActive();}" +
            "};" +
            "window.dispatchEvent(new Event('screenbridgeready'));" +
            "}}catch(e){}})();";
    }
}

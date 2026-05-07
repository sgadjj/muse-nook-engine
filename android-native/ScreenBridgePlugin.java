package app.lovable.edb15656bc724204a1f7f2ab66fe665f.bridge;

/*
 * ScreenBridgePlugin
 * ------------------
 * Capacitor plugin خاص بمشروع واحد فقط (package: app.lovable.edb15656bc724204a1f7f2ab66fe665f).
 * يربط موقع الويب (داخل WebView) بنظام بث/تسجيل الشاشة في Android (MediaProjection).
 *
 * طريقة الاستخدام من الويب:
 *   import { registerPlugin } from '@capacitor/core';
 *   const ScreenBridge = registerPlugin('ScreenBridge');
 *   await ScreenBridge.startBroadcast();   // يفتح اختيار الشاشة ثم يبدأ التسجيل/البث
 *   await ScreenBridge.stopBroadcast();
 *   const { active } = await ScreenBridge.isActive();
 *
 * هذا الملف اختياري — يمكن حذفه بدون التأثير على باقي التطبيق.
 *
 * الوجهة الصحيحة (يجب نسخه إليها):
 *   android/app/src/main/java/app/lovable/edb15656bc724204a1f7f2ab66fe665f/bridge/ScreenBridgePlugin.java
 *
 * في MainActivity.java أضف داخل onCreate قبل super:
 *   registerPlugin(ScreenBridgePlugin.class);
 *
 * في AndroidManifest.xml تأكد من:
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION"/>
 *   <uses-permission android:name="android.permission.RECORD_AUDIO"/>
 *   <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
 */

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.os.Build;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "ScreenBridge",
    permissions = {
        @Permission(strings = { "android.permission.RECORD_AUDIO" }, alias = "audio"),
        @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications")
    }
)
public class ScreenBridgePlugin extends Plugin {

    private static volatile boolean active = false;

    @PluginMethod
    public void startBroadcast(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        MediaProjectionManager mpm =
            (MediaProjectionManager) activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        if (mpm == null) {
            call.reject("MediaProjection not supported on this device");
            return;
        }

        Intent captureIntent = mpm.createScreenCaptureIntent();
        startActivityForResult(call, captureIntent, "onProjectionResult");
    }

    @ActivityCallback
    private void onProjectionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("User denied screen sharing");
            return;
        }

        try {
            Intent svc = new Intent(getContext(), ScreenCaptureService.class)
                .putExtra("resultCode", result.getResultCode())
                .putExtra("data", result.getData());

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(svc);
            } else {
                getContext().startService(svc);
            }

            active = true;
            JSObject ret = new JSObject();
            ret.put("active", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopBroadcast(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), ScreenCaptureService.class));
        } catch (Exception ignored) {}
        active = false;
        JSObject ret = new JSObject();
        ret.put("active", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void isActive(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("active", active);
        call.resolve(ret);
    }
}

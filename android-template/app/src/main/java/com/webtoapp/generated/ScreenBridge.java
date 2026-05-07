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
    public String streamUrl() {
        return "http://127.0.0.1:" + ScreenCaptureService.STREAM_PORT + "/screen.mjpeg?t=" + System.currentTimeMillis();
    }

    @JavascriptInterface
    public void stopBroadcast() {
        activity.runOnUiThread(() -> {
            try {
                Intent stop = new Intent(activity, ScreenCaptureService.class);
                stop.setAction(ScreenCaptureService.ACTION_STOP);
                activity.startService(stop);
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
            "startBroadcast:function(){window.ScreenBridgeNative.startBroadcast();return new Promise(function(res,rej){var n=0;(function wait(){if(window.ScreenBridgeNative.isActive())res(true);else if(n++>120)rej(new Error('تعذر تسجيل الشاشة'));else setTimeout(wait,250);})();});}," +
            "stopBroadcast:function(){return window.ScreenBridgeNative.stopBroadcast();}," +
            "isActive:function(){return window.ScreenBridgeNative.isActive();}," +
            "streamUrl:function(){return window.ScreenBridgeNative.streamUrl();}," +
            "createDisplayStream:function(c){return new Promise(function(res,rej){try{var img=new Image();img.crossOrigin='anonymous';img.src=window.ScreenBridgeNative.streamUrl();var canvas=document.createElement('canvas');canvas.width=(c&&c.video&&c.video.width)||720;canvas.height=(c&&c.video&&c.video.height)||1280;var ctx=canvas.getContext('2d',{alpha:false});function draw(){try{if(img.naturalWidth>0){canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;ctx.drawImage(img,0,0,canvas.width,canvas.height);}}catch(e){}requestAnimationFrame(draw);}img.onload=function(){draw();var s=canvas.captureStream(15);res(s);};img.onerror=function(){rej(new Error('تعذر فتح بث الشاشة المحلي'));};setTimeout(function(){if(img.naturalWidth>0){var s=canvas.captureStream(15);res(s);}},1500);}catch(e){rej(e);}});}" +
            "};" +
            "window.dispatchEvent(new Event('screenbridgeready'));" +
            "}}catch(e){}})();";
    }
}

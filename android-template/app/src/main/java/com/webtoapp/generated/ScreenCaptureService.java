package com.webtoapp.generated;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service required by Android 10+ to start MediaProjection (screen capture / sharing).
 * Keeps the screen-sharing session alive even when the app is in the background.
 */
public class ScreenCaptureService extends Service {
    private static final String CHANNEL_ID = "screen_capture_channel";
    private static final int NOTIF_ID = 4242;
    private WindowManager windowManager;
    private View floatingBubble;

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "مشاركة الشاشة",
                NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("مشاركة الشاشة نشطة")
            .setContentText("يتم بث/تسجيل الشاشة الآن")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIF_ID, notification);
        }
        showFloatingBubble();
        return START_NOT_STICKY;
    }

    private void showFloatingBubble() {
        if (floatingBubble != null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return;

        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        if (windowManager == null) return;

        TextView bubble = new TextView(this);
        bubble.setText("●");
        bubble.setTextSize(28);
        bubble.setGravity(Gravity.CENTER);
        bubble.setTextColor(0xffffffff);
        bubble.setBackgroundColor(0xccd946ef);
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            72,
            72,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.END;
        params.x = 24;
        params.y = 120;

        floatingBubble = bubble;
        try { windowManager.addView(floatingBubble, params); } catch (Exception ignored) { floatingBubble = null; }
    }

    @Override
    public void onDestroy() {
        if (floatingBubble != null && windowManager != null) {
            try { windowManager.removeView(floatingBubble); } catch (Exception ignored) {}
            floatingBubble = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

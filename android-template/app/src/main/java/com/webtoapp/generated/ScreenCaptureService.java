package com.webtoapp.generated;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.PixelFormat;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;

/**
 * Foreground MediaProjection service.
 * يلتقط شاشة الهاتف Native ويعرضها كـ MJPEG محلي على 127.0.0.1 كي يستطيع WebView
 * تحويلها إلى Canvas MediaStream وإرسالها داخل مكالمات WebRTC.
 */
public class ScreenCaptureService extends Service {
    static final String ACTION_STOP = "com.webtoapp.generated.STOP_SCREEN_CAPTURE";
    static final String EXTRA_RESULT_CODE = "resultCode";
    static final String EXTRA_RESULT_DATA = "resultData";
    static final int STREAM_PORT = 18777;

    private static final String CHANNEL_ID = "screen_capture_channel";
    private static final int NOTIF_ID = 4242;
    private static final int TARGET_WIDTH = 720;
    private static final int JPEG_QUALITY = 62;
    private static final long FRAME_INTERVAL_MS = 66;

    private WindowManager windowManager;
    private View floatingBubble;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;
    private HandlerThread captureThread;
    private Handler captureHandler;
    private ServerSocket serverSocket;
    private Thread serverThread;
    private volatile boolean serverRunning = false;
    private volatile byte[] latestJpeg;
    private long lastFrameAt = 0;

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
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }

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

        if (intent != null && mediaProjection == null) {
            int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
            Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
            if (resultCode != 0 && resultData != null) {
                startNativeCapture(resultCode, resultData);
            }
        }
        return START_NOT_STICKY;
    }

    private void startNativeCapture(int resultCode, Intent resultData) {
        try {
            MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            if (manager == null) return;

            mediaProjection = manager.getMediaProjection(resultCode, resultData);
            if (mediaProjection == null) return;
            mediaProjection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopSelf();
                }
            }, new Handler(getMainLooper()));

            DisplayMetrics metrics = getResources().getDisplayMetrics();
            int width = Math.max(360, Math.min(TARGET_WIDTH, metrics.widthPixels));
            int height = Math.max(640, Math.round(width * (metrics.heightPixels / (float) metrics.widthPixels)));
            int dpi = Math.max(160, metrics.densityDpi);

            captureThread = new HandlerThread("ScreenBridgeCapture");
            captureThread.start();
            captureHandler = new Handler(captureThread.getLooper());

            imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2);
            imageReader.setOnImageAvailableListener(reader -> captureLatestFrame(width, height), captureHandler);

            virtualDisplay = mediaProjection.createVirtualDisplay(
                "ScreenBridgeDisplay",
                width,
                height,
                dpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                imageReader.getSurface(),
                null,
                captureHandler
            );

            startMjpegServer();
            ScreenBridge.setActive(true);
        } catch (Exception ignored) {
            ScreenBridge.setActive(false);
        }
    }

    private void captureLatestFrame(int width, int height) {
        long now = System.currentTimeMillis();
        if (now - lastFrameAt < FRAME_INTERVAL_MS) return;
        lastFrameAt = now;

        Image image = null;
        try {
            if (imageReader == null) return;
            image = imageReader.acquireLatestImage();
            if (image == null) return;

            Image.Plane[] planes = image.getPlanes();
            ByteBuffer buffer = planes[0].getBuffer();
            int pixelStride = planes[0].getPixelStride();
            int rowStride = planes[0].getRowStride();
            int rowPadding = rowStride - pixelStride * width;

            Bitmap raw = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888);
            raw.copyPixelsFromBuffer(buffer);
            Bitmap cropped = Bitmap.createBitmap(raw, 0, 0, width, height);
            raw.recycle();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            cropped.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out);
            cropped.recycle();
            latestJpeg = out.toByteArray();
        } catch (Exception ignored) {
        } finally {
            if (image != null) image.close();
        }
    }

    private void startMjpegServer() {
        if (serverRunning) return;
        serverRunning = true;
        serverThread = new Thread(() -> {
            try {
                serverSocket = new ServerSocket(STREAM_PORT, 8, InetAddress.getByName("127.0.0.1"));
                while (serverRunning) {
                    try {
                        Socket client = serverSocket.accept();
                        new Thread(() -> serveMjpegClient(client), "ScreenBridgeClient").start();
                    } catch (Exception ignored) {}
                }
            } catch (Exception ignored) {
                serverRunning = false;
            }
        }, "ScreenBridgeServer");
        serverThread.start();
    }

    private void serveMjpegClient(Socket client) {
        try (Socket socket = client; BufferedOutputStream out = new BufferedOutputStream(socket.getOutputStream())) {
            out.write(("HTTP/1.1 200 OK\r\n" +
                "Connection: close\r\n" +
                "Cache-Control: no-cache, no-store, must-revalidate\r\n" +
                "Pragma: no-cache\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Content-Type: multipart/x-mixed-replace; boundary=screenbridge\r\n\r\n").getBytes("UTF-8"));
            out.flush();

            while (serverRunning && !socket.isClosed()) {
                byte[] frame = latestJpeg;
                if (frame != null) {
                    out.write(("--screenbridge\r\n" +
                        "Content-Type: image/jpeg\r\n" +
                        "Content-Length: " + frame.length + "\r\n\r\n").getBytes("UTF-8"));
                    out.write(frame);
                    out.write("\r\n".getBytes("UTF-8"));
                    out.flush();
                }
                try { Thread.sleep(FRAME_INTERVAL_MS); } catch (InterruptedException ignored) { break; }
            }
        } catch (Exception ignored) {}
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
        ScreenBridge.setActive(false);
        serverRunning = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (Exception ignored) {}
        try { if (virtualDisplay != null) virtualDisplay.release(); } catch (Exception ignored) {}
        try { if (imageReader != null) imageReader.close(); } catch (Exception ignored) {}
        try { if (mediaProjection != null) mediaProjection.stop(); } catch (Exception ignored) {}
        if (captureThread != null) captureThread.quitSafely();
        virtualDisplay = null;
        imageReader = null;
        mediaProjection = null;
        captureThread = null;
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

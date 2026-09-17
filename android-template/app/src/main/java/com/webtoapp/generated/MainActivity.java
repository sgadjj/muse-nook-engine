package com.webtoapp.generated;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.ContentResolver;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.widget.Button;
import android.widget.Toast;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Collections;

public class MainActivity extends AppCompatActivity {
    // Injected at build time by GitHub Actions (sed). DO NOT rename these tokens.
    private static final boolean PERMISSION_CAMERA_ENABLED = "__PERMISSION_CAMERA_ENABLED__".equalsIgnoreCase("true");
    private static final boolean PERMISSION_MIC_ENABLED = "__PERMISSION_MIC_ENABLED__".equalsIgnoreCase("true");
    private static final boolean PERMISSION_LOCATION_ENABLED = "__PERMISSION_LOCATION_ENABLED__".equalsIgnoreCase("true");
    private static final boolean PERMISSION_STORAGE_ENABLED = "__PERMISSION_STORAGE_ENABLED__".equalsIgnoreCase("true");
    private static final boolean PERMISSION_NOTIFICATIONS_ENABLED = "__PERMISSION_NOTIFICATIONS_ENABLED__".equalsIgnoreCase("true");
    // Replaced by the build workflow with a plain integer (10..100).
    // Keep this token identical to the workflow's APP_SCALE_PERCENT replacement.
    private static final int DISPLAY_SCALE_PERCENT = Integer.parseInt("APP_SCALE_PERCENT");
    private static final String NOTIF_CHANNEL_ID = "web_notifications";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private long pendingApkDownloadId = -1L;
    private long lastPauseTime = 0L;
    private BroadcastReceiver apkInstallReceiver;
    private int notificationCounter = 1000;

    private PermissionRequest pendingWebPermissionRequest;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    private final ActivityResultLauncher<Intent> filePickerLauncher =
        registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (filePathCallback == null) return;
            Uri[] uris = null;
            if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                Intent data = result.getData();
                Uri dataUri = data.getData();
                if (dataUri != null) {
                    uris = new Uri[]{dataUri};
                } else if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    uris = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        uris[i] = data.getClipData().getItemAt(i).getUri();
                    }
                }
            }
            filePathCallback.onReceiveValue(uris);
            filePathCallback = null;
        });

    /** Shows the real Android permission dialog and resumes any pending web request. */
    private final ActivityResultLauncher<String[]> permissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> {
            PermissionRequest req = pendingWebPermissionRequest;
            pendingWebPermissionRequest = null;
            if (req != null) handleWebPermission(req, false);

            GeolocationPermissions.Callback geoCb = pendingGeoCallback;
            String geoOrigin = pendingGeoOrigin;
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
            if (geoCb != null) {
                geoCb.invoke(geoOrigin, hasPerm(Manifest.permission.ACCESS_FINE_LOCATION), false);
            }
        });

    @SuppressLint({"SetJavaScriptEnabled", "InlinedApi"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Keep the app process alive in the background (even after swipe-away)
        KeepAliveService.start(this);
        requestIgnoreBatteryOptimizations();
        requestEnabledPermissions();

        final View offlineView = findViewById(R.id.offline_view);
        Button retryBtn = findViewById(R.id.retry_button);

        // Shared, process-wide WebView: it survives activity destruction so the
        // website (bots, timers, sockets) keeps running in the background.
        webView = WebViewHolder.get(this);
        WebViewHolder.detach();
        android.widget.FrameLayout container = findViewById(R.id.webview_container);
        if (container != null) {
            container.addView(webView, new android.widget.FrameLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
            applyViewScale(container);
        }

        retryBtn.setOnClickListener(v -> {
            if (isOnline()) {
                offlineView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                webView.loadUrl(addCacheBustParam("APP_URL"));
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        webView.addJavascriptInterface(new NativeBlobBridge(), "WebToAppNative");
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(PERMISSION_LOCATION_ENABLED);
        // Scale is applied on the View itself (see applyViewScale), exactly like the
        // web preview does with a wider layout box + a single CSS transform.
        // The page keeps its own natural viewport, so no meta-tag tampering here.
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        // No long-press context menu / selection popups inside the app
        webView.setLongClickable(false);
        webView.setHapticFeedbackEnabled(false);
        webView.setOnLongClickListener(v -> true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        if (!WebViewHolder.isLoadedOnce()) webView.clearCache(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleSpecialUrl(request.getUrl().toString());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleSpecialUrl(url);
            }
            @Override
            public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    String u = request != null && request.getUrl() != null ? request.getUrl().toString().toLowerCase() : "";
                    if (u.contains("gpteng.co") || u.contains("gptengineer.app")
                        || u.contains("lovable.dev/badge") || u.contains("cdn.gpteng.co")
                        || u.contains("lovable-badge") || u.contains("/badge.js")) {
                        return new android.webkit.WebResourceResponse("text/javascript", "utf-8",
                            new java.io.ByteArrayInputStream(new byte[0]));
                    }
                } catch (Exception ignored) {}
                return super.shouldInterceptRequest(view, request);
            }
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectBadgeRemover(view);
                injectDownloadBridge(view);
                injectNotificationBridge(view);
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                
                injectBadgeRemover(view);
                injectDownloadBridge(view);
                injectNotificationBridge(view);
                if (isOnline()) {
                    View off = findViewById(R.id.offline_view);
                    if (off != null) off.setVisibility(View.GONE);
                    view.setVisibility(View.VISIBLE);
                }
            }
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame() && !isOnline()) showOfflineView();
            }
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                if (!isOnline()) showOfflineView();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // Permissions enabled in the builder are requested from the user with the
            // real Android dialog the first time the website needs them.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handleWebPermission(request, true));
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!PERMISSION_LOCATION_ENABLED) { callback.invoke(origin, false, false); return; }
                if (hasPerm(Manifest.permission.ACCESS_FINE_LOCATION)) { callback.invoke(origin, true, false); return; }
                if (pendingGeoCallback != null) { callback.invoke(origin, false, false); return; }
                pendingGeoCallback = callback;
                pendingGeoOrigin = origin;
                askPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION});
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
                if (!PERMISSION_STORAGE_ENABLED) { callback.onReceiveValue(null); return false; }
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent;
                try {
                    intent = fileChooserParams != null ? fileChooserParams.createIntent() : new Intent(Intent.ACTION_GET_CONTENT);
                } catch (Exception e) {
                    filePathCallback = null; return false;
                }
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (intent.getType() == null) intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    filePickerLauncher.launch(intent);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null; return false;
                }
            }
        });

        // AUTO-INSTALL: intercept .apk downloads -> save -> open install prompt
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimetype, long contentLength) {
                handleDownload(url, userAgent, contentDisposition, mimetype);
            }
        });

        registerApkInstallReceiver();
        setupNotifications();

        try {
            webView.setBackgroundColor(Color.WHITE);
            getWindow().setStatusBarColor(Color.BLACK);
            getWindow().setNavigationBarColor(Color.BLACK);
            findViewById(android.R.id.content).setBackgroundColor(Color.WHITE);
        } catch (Exception ignored) {}

        // Only load the site the first time. On later launches the shared WebView
        // is still running in the background, so we simply re-attach it.
        if (!WebViewHolder.isLoadedOnce() || webView.getUrl() == null) {
            if (isOnline()) {
                webView.loadUrl(addCacheBustParam("APP_URL"));
                WebViewHolder.markLoaded();
            } else {
                showOfflineView();
            }
        } else if (!isOnline()) {
            showOfflineView();
        }

        hideSystemUI();
    }

    private boolean hasPerm(String perm) {
        return ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED;
    }

    /** Launches the system permission dialog for the ones not granted yet. */
    private void askPermissions(String[] perms) {
        java.util.ArrayList<String> missing = new java.util.ArrayList<>();
        for (String p : perms) {
            if (p != null && !hasPerm(p)) missing.add(p);
        }
        if (missing.isEmpty()) return;
        try {
            permissionLauncher.launch(missing.toArray(new String[0]));
        } catch (Exception ignored) {}
    }

    /** Grants a website permission request, asking the user first when needed. */
    private void handleWebPermission(PermissionRequest request, boolean allowAsk) {
        if (request == null) return;
        String[] requested = request.getResources();
        java.util.ArrayList<String> needed = new java.util.ArrayList<>();
        for (String r : requested) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                if (!PERMISSION_CAMERA_ENABLED) { request.deny(); return; }
                if (!hasPerm(Manifest.permission.CAMERA)) needed.add(Manifest.permission.CAMERA);
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                if (!PERMISSION_MIC_ENABLED) { request.deny(); return; }
                if (!hasPerm(Manifest.permission.RECORD_AUDIO)) needed.add(Manifest.permission.RECORD_AUDIO);
            }
        }
        if (needed.isEmpty()) { request.grant(requested); return; }
        if (!allowAsk || pendingWebPermissionRequest != null) { request.deny(); return; }
        pendingWebPermissionRequest = request;
        askPermissions(needed.toArray(new String[0]));
    }

    /** Asks up-front for every permission the builder enabled for this app. */
    private void requestEnabledPermissions() {
        java.util.ArrayList<String> perms = new java.util.ArrayList<>();
        if (PERMISSION_CAMERA_ENABLED) perms.add(Manifest.permission.CAMERA);
        if (PERMISSION_MIC_ENABLED) perms.add(Manifest.permission.RECORD_AUDIO);
        if (PERMISSION_LOCATION_ENABLED) {
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
            perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (PERMISSION_NOTIFICATIONS_ENABLED && Build.VERSION.SDK_INT >= 33) {
            perms.add("android.permission.POST_NOTIFICATIONS");
        }
        if (PERMISSION_STORAGE_ENABLED) {
            if (Build.VERSION.SDK_INT >= 33) {
                perms.add("android.permission.READ_MEDIA_IMAGES");
                perms.add("android.permission.READ_MEDIA_VIDEO");
            } else {
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }
        if (perms.isEmpty()) return;
        askPermissions(perms.toArray(new String[0]));
    }

    /** Ask once to be excluded from battery optimization so background work is not killed. */
    private void requestIgnoreBatteryOptimizations() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {}
    }

    // ===================== Web -> Native notifications =====================
    private void setupNotifications() {
        if (!PERMISSION_NOTIFICATIONS_ENABLED) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    NOTIF_CHANNEL_ID, "APP_NAME", NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("إشعارات الموقع");
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) nm.createNotificationChannel(channel);
            }
        } catch (Exception ignored) {}
    }

    private void showNativeNotification(String title, String body) {
        if (!PERMISSION_NOTIFICATIONS_ENABLED) return;
        if (Build.VERSION.SDK_INT >= 33 && !hasPerm("android.permission.POST_NOTIFICATIONS")) return;
        try {
            Intent open = new Intent(this, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, flags);

            NotificationCompat.Builder b = new NotificationCompat.Builder(this, NOTIF_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title == null || title.trim().isEmpty() ? "APP_NAME" : title)
                .setContentText(body == null ? "" : body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(Notification.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pi);
            NotificationManagerCompat.from(this).notify(notificationCounter++, b.build());
        } catch (Exception ignored) {}
    }

    private void injectNotificationBridge(WebView view) {
        if (view == null || !PERMISSION_NOTIFICATIONS_ENABLED) return;
        String js =
            "(function(){" +
            "if(window.__wtaNotif)return;window.__wtaNotif=true;" +
            "function send(t,b){try{WebToAppNative.notify(String(t||''),String(b||''));}catch(e){}}" +
            "function WTANotification(title,opts){opts=opts||{};send(title,opts.body||'');" +
            "  this.title=title;this.body=opts.body||'';this.close=function(){};this.onclick=null;}" +
            "WTANotification.permission='granted';" +
            "WTANotification.requestPermission=function(cb){if(cb)cb('granted');return Promise.resolve('granted');};" +
            "try{Object.defineProperty(window,'Notification',{value:WTANotification,writable:true,configurable:true});}" +
            "catch(e){window.Notification=WTANotification;}" +
            "try{if(navigator.serviceWorker){var sw=navigator.serviceWorker;" +
            "  sw.addEventListener('message',function(ev){var d=ev.data||{};" +
            "    if(d&&(d.type==='notification'||d.notification)){var n=d.notification||d;send(n.title,n.body);}});}" +
            "}catch(e){}" +
            "})();";
        try { view.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }


    // ===================== APK Auto-Install =====================
    private void handleDownload(String url, String userAgent, String contentDisposition, String mimetype) {
        try {
            if (url != null && url.startsWith("blob:")) {
                triggerBlobSave(url, "app.apk");
                return;
            }
            String filename = URLUtil.guessFileName(url, contentDisposition, mimetype);
            boolean isApk = (filename != null && filename.toLowerCase().endsWith(".apk"))
                         || (mimetype != null && mimetype.contains("application/vnd.android.package-archive"));

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setMimeType(isApk ? "application/vnd.android.package-archive" : mimetype);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) req.addRequestHeader("cookie", cookies);
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            req.setTitle(filename);
            req.setDescription(isApk ? "تنزيل التطبيق..." : "تنزيل ملف");
            req.allowScanningByMediaScanner();

            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (dm == null) return;
            long id = dm.enqueue(req);
            if (isApk) {
                pendingApkDownloadId = id;
                Toast.makeText(this, "جاري تنزيل التطبيق، سيبدأ التثبيت تلقائيًا...", Toast.LENGTH_LONG).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "تعذر بدء التنزيل", Toast.LENGTH_SHORT).show();
        }
    }

    private void triggerBlobSave(String blobUrl, String fallbackName) {
        if (webView == null) return;
        String safeUrl = blobUrl.replace("\\", "\\\\").replace("'", "\\'");
        String safeName = fallbackName.replace("\\", "\\\\").replace("'", "\\'");
        String js = "(function(){fetch('" + safeUrl + "').then(function(r){return r.blob();}).then(function(b){var fr=new FileReader();fr.onloadend=function(){var s=String(fr.result||'');var x=s.indexOf(',');WebToAppNative.saveApk('" + safeName + "',x>=0?s.slice(x+1):s);};fr.readAsDataURL(b);}).catch(function(){});})();";
        try { webView.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    public class NativeBlobBridge {
        @JavascriptInterface
        public void notify(String title, String body) {
            runOnUiThread(() -> showNativeNotification(title, body));
        }

        @JavascriptInterface
        public void saveApk(String fileName, String base64Data) {
            if (base64Data == null || base64Data.length() < 100) return;
            try {
                String safeName = (fileName == null || fileName.trim().isEmpty()) ? "app.apk" : fileName.trim();
                safeName = safeName.replaceAll("[^a-zA-Z0-9._-]", "-");
                if (!safeName.toLowerCase().endsWith(".apk")) safeName = safeName + ".apk";
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                Uri apkUri = saveApkBytes(safeName, bytes);
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "تم تنزيل APK، جاري فتح التثبيت...", Toast.LENGTH_LONG).show();
                    if (apkUri != null) promptInstall(apkUri);
                });
            } catch (Exception ignored) {}
        }
    }

    private Uri saveApkBytes(String fileName, byte[] bytes) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/vnd.android.package-archive");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) return null;
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out != null) out.write(bytes);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }

        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists()) dir.mkdirs();
        File file = new File(dir, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
    }

    private void registerApkInstallReceiver() {
        apkInstallReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (id != pendingApkDownloadId || id == -1L) return;
                pendingApkDownloadId = -1L;
                try {
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    if (dm == null) return;
                    Uri apkUri = dm.getUriForDownloadedFile(id); // content:// uri
                    if (apkUri == null) return;
                    promptInstall(apkUri);
                } catch (Exception ignored) {}
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(apkInstallReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(apkInstallReceiver, filter);
        }
    }

    private void promptInstall(Uri apkUri) {
        try {
            // On Android 8+, app needs REQUEST_INSTALL_PACKAGES + user-granted "Install unknown apps".
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
                Intent settings = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                Toast.makeText(this, "فعّل \"تثبيت تطبيقات غير معروفة\" ثم أعد المحاولة", Toast.LENGTH_LONG).show();
                startActivity(settings);
                return;
            }
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(install);
        } catch (Exception e) {
            Toast.makeText(this, "تعذر فتح المثبت", Toast.LENGTH_SHORT).show();
        }
    }

    // ===================== Misc =====================
    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) { return true; }
    }

    private void showOfflineView() {
        runOnUiThread(() -> {
            View off = findViewById(R.id.offline_view);
            if (off != null) off.setVisibility(View.VISIBLE);
            if (webView != null) {
                webView.setVisibility(View.GONE);
                try { webView.stopLoading(); } catch (Exception ignored) {}
            }
        });
    }

    /**
     * Mirror the web preview exactly: lay the WebView out wider than the screen
     * (size / scale) and shrink it back with one visual transform. This is the
     * native equivalent of `width:10000/pct%` + `transform:scale(pct/100)`.
     */
    private void applyViewScale(final android.widget.FrameLayout container) {
        if (container == null || webView == null) return;
        final float scale = Math.max(10, Math.min(100, DISPLAY_SCALE_PERCENT)) / 100f;
        container.setClipChildren(true);
        container.getViewTreeObserver().addOnGlobalLayoutListener(
            new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
                @Override public void onGlobalLayout() {
                    if (webView == null) return;
                    int w = container.getWidth();
                    int h = container.getHeight();
                    if (w == 0 || h == 0) return;
                    int targetW = Math.round(w / scale);
                    int targetH = Math.round(h / scale);
                    android.view.ViewGroup.LayoutParams lp = webView.getLayoutParams();
                    if (lp == null) lp = new android.widget.FrameLayout.LayoutParams(targetW, targetH);
                    if (lp.width != targetW || lp.height != targetH) {
                        lp.width = targetW;
                        lp.height = targetH;
                        webView.setLayoutParams(lp);
                    }
                    webView.setPivotX(0f);
                    webView.setPivotY(0f);
                    if (webView.getScaleX() != scale) {
                        webView.setScaleX(scale);
                        webView.setScaleY(scale);
                    }
                }
            });
    }

    private boolean handleSpecialUrl(String url) {
        if (url == null) return false;
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            // Always use the dialer / sms composer (no runtime perm dialogs)
            if ("tel".equalsIgnoreCase(scheme)) {
                Intent i = new Intent(Intent.ACTION_DIAL, uri);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i); return true;
            }
            if ("sms".equalsIgnoreCase(scheme) || "smsto".equalsIgnoreCase(scheme)
                || "mms".equalsIgnoreCase(scheme) || "mmsto".equalsIgnoreCase(scheme)) {
                Intent i = new Intent(Intent.ACTION_SENDTO, uri);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i); return true;
            }
            if ("mailto".equalsIgnoreCase(scheme) || "whatsapp".equalsIgnoreCase(scheme)) {
                Intent i = new Intent(Intent.ACTION_VIEW, uri);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i); return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private void injectBadgeRemover(WebView view) {
        if (view == null) return;
        String js =
            "(function(){" +
            "  var css = '" +
            "a[href*=\"lovable.dev\"],a[href*=\"lovable.app/?via\"],a[href*=\"gptengineer.app\"],a[href*=\"gpteng.co\"]," +
            "#lovable-badge,[id*=\"lovable-badge\"],[class*=\"lovable-badge\"],[id*=\"lovable\"][style*=\"fixed\"]," +
            "[data-lovable-badge],[data-lov-badge],iframe[src*=\"lovable\"],iframe[src*=\"gpteng\"]," +
            "div[style*=\"z-index: 999999\"] a[href*=\"lovable\"]" +
            "{display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;height:0 !important;width:0 !important;}';" +
            "  function style(root){var d=root===document?document:root;var s=d.getElementById?d.getElementById('__wta_hide_badge'):null;" +
            "    if(!s){s=document.createElement('style');s.id='__wta_hide_badge';s.innerHTML=css;((d.head||d.documentElement||d)).appendChild(s);}}" +
            "  try{style(document);}catch(e){}" +
            "  function bad(el){try{" +
            "    var h=((el.getAttribute&&el.getAttribute('href'))||'').toLowerCase();" +
            "    var t=((el.innerText||el.textContent)||'').toLowerCase().trim();" +
            "    if(h.indexOf('lovable.dev')>-1||h.indexOf('gptengineer.app')>-1||h.indexOf('gpteng.co')>-1)return true;" +
            "    if(t.length<40&&(t.indexOf('edit with lovable')>-1||t.indexOf('made with lovable')>-1||t.indexOf('built with lovable')>-1))return true;" +
            "  }catch(e){}return false;}" +
            "  function scan(root){try{" +
            "    var all=root.querySelectorAll('a,iframe,div,span,button');" +
            "    for(var i=0;i<all.length;i++){var el=all[i];" +
            "      if(el.shadowRoot){try{style(el.shadowRoot);}catch(e){} scan(el.shadowRoot);}" +
            "      if(bad(el)){var p=(el.closest&&el.closest('div,section,aside'))||el;" +
            "        try{p.remove();}catch(e){try{el.remove();}catch(e2){}}}" +
            "    }" +
            "  }catch(e){}}" +
            "  function nuke(){scan(document);}" +
            "  nuke();" +
            "  try{new MutationObserver(nuke).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}" +
            "  setInterval(nuke,1200);" +
            "})();";
        try { view.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    private void injectDownloadBridge(WebView view) {
        if (view == null) return;
        String js =
            "(function(){" +
            "if(window.__wtaApkBridge)return;window.__wtaApkBridge=true;" +
            "document.addEventListener('click',function(e){" +
            "var a=e.target&&e.target.closest?e.target.closest('a[download],a[href]'):null;if(!a)return;" +
            "var href=a.href||'';var name=a.getAttribute('download')||'app.apk';" +
            "if((href.indexOf('blob:')===0)&&((name||'').toLowerCase().endsWith('.apk')||a.type==='application/vnd.android.package-archive')){" +
            "e.preventDefault();fetch(href).then(function(r){return r.blob();}).then(function(b){var fr=new FileReader();fr.onloadend=function(){var s=String(fr.result||'');var i=s.indexOf(',');WebToAppNative.saveApk(name,i>=0?s.slice(i+1):s);};fr.readAsDataURL(b);});" +
            "}" +
            "},true);" +
            "})();";
        try { view.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    private String addCacheBustParam(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            return uri.buildUpon()
                .appendQueryParameter("_wvts", String.valueOf(System.currentTimeMillis()))
                .build().toString();
        } catch (Exception ignored) { return rawUrl; }
    }

    private void hideSystemUI() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
        );
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onPause() {
        super.onPause();
        lastPauseTime = System.currentTimeMillis();
    }

    @Override protected void onResume() {
        super.onResume();
        KeepAliveService.start(this);
        
        // The session keeps running in the background, so we never reload on
        // return unless the page never loaded or the device was offline.
        if (webView != null && isOnline()) {
            View off = findViewById(R.id.offline_view);
            boolean wasOffline = off != null && off.getVisibility() == View.VISIBLE;
            if (wasOffline) {
                off.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }
            String current = webView.getUrl();
            if (wasOffline || current == null) {
                webView.loadUrl(addCacheBustParam(current == null ? "APP_URL" : current));
                WebViewHolder.markLoaded();
            }
        }
        try { webView.onResume(); webView.resumeTimers(); } catch (Exception ignored) {}
    }


    @Override protected void onDestroy() {
        if (filePathCallback != null) { filePathCallback.onReceiveValue(null); filePathCallback = null; }
        if (apkInstallReceiver != null) {
            try { unregisterReceiver(apkInstallReceiver); } catch (Exception ignored) {}
            apkInstallReceiver = null;
        }
        // IMPORTANT: never destroy the shared WebView — just detach it so the
        // website keeps running inside the foreground service process.
        WebViewHolder.detach();
        webView = null;
        KeepAliveService.start(getApplicationContext());
        super.onDestroy();
    }
}

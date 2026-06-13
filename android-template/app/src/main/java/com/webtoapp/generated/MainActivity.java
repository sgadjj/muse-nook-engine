package com.webtoapp.generated;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private static final int REQ_RUNTIME_PERMS = 1001;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingWebPermissionRequest;

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

    @SuppressLint({"SetJavaScriptEnabled", "InlinedApi"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        final View offlineView = findViewById(R.id.offline_view);
        Button retryBtn = findViewById(R.id.retry_button);
        Button settingsBtn = findViewById(R.id.settings_button);

        webView = findViewById(R.id.webview);

        retryBtn.setOnClickListener(v -> {
            if (isOnline()) {
                offlineView.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                webView.loadUrl(addCacheBustParam("APP_URL"));
            }
        });
        settingsBtn.setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));

        webView.setOnLongClickListener(v -> {
            startActivity(new Intent(this, SettingsActivity.class));
            return true;
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        webView.clearCache(true);
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
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectBadgeRemover(view);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectBadgeRemover(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request != null && request.isForMainFrame()) {
                    showOfflineView();
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                showOfflineView();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    String[] requested = request.getResources();
                    java.util.List<String> needed = new java.util.ArrayList<>();
                    for (String r : requested) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) {
                            if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA)
                                != PackageManager.PERMISSION_GRANTED) {
                                needed.add(Manifest.permission.CAMERA);
                            }
                        } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) {
                            if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                                != PackageManager.PERMISSION_GRANTED) {
                                needed.add(Manifest.permission.RECORD_AUDIO);
                            }
                        }
                    }

                    if (needed.isEmpty()) {
                        request.grant(requested);
                    } else {
                        pendingWebPermissionRequest = request;
                        ActivityCompat.requestPermissions(MainActivity.this,
                            needed.toArray(new String[0]), REQ_RUNTIME_PERMS);
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    ActivityCompat.requestPermissions(MainActivity.this,
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                                     Manifest.permission.ACCESS_COARSE_LOCATION},
                        REQ_RUNTIME_PERMS);
                    callback.invoke(origin, false, false);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent intent;
                try {
                    intent = fileChooserParams != null ? fileChooserParams.createIntent() : new Intent(Intent.ACTION_GET_CONTENT);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }

                intent.addCategory(Intent.CATEGORY_OPENABLE);
                if (intent.getType() == null) intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    filePickerLauncher.launch(intent);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        try {
            int black = Color.BLACK;
            int white = Color.WHITE;
            webView.setBackgroundColor(white);
            getWindow().setStatusBarColor(black);
            getWindow().setNavigationBarColor(black);
            findViewById(android.R.id.content).setBackgroundColor(white);
        } catch (Exception ignored) {
        }

        if (isOnline()) {
            webView.loadUrl(addCacheBustParam("APP_URL"));
        } else {
            showOfflineView();
        }
        hideSystemUI();
    }

    private boolean isOnline() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            NetworkInfo ni = cm.getActiveNetworkInfo();
            return ni != null && ni.isConnected();
        } catch (Exception e) {
            return true;
        }
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

    private boolean handleSpecialUrl(String url) {
        if (url == null) return false;
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if ("tel".equalsIgnoreCase(scheme)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CALL_PHONE}, REQ_RUNTIME_PERMS);
                    startActivity(new Intent(Intent.ACTION_DIAL, uri));
                } else {
                    startActivity(new Intent(Intent.ACTION_CALL, uri));
                }
                return true;
            }
            if ("sms".equalsIgnoreCase(scheme) || "smsto".equalsIgnoreCase(scheme) || "mms".equalsIgnoreCase(scheme) || "mmsto".equalsIgnoreCase(scheme)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
                    ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.SEND_SMS}, REQ_RUNTIME_PERMS);
                }
                startActivity(new Intent(Intent.ACTION_SENDTO, uri));
                return true;
            }
            if ("mailto".equalsIgnoreCase(scheme) || "whatsapp".equalsIgnoreCase(scheme)) {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_RUNTIME_PERMS && pendingWebPermissionRequest != null) {
            boolean allGranted = true;
            for (int r : grantResults) {
                if (r != PackageManager.PERMISSION_GRANTED) { allGranted = false; break; }
            }
            if (allGranted) {
                pendingWebPermissionRequest.grant(pendingWebPermissionRequest.getResources());
            } else {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = null;
        }
    }

    private void injectBadgeRemover(WebView view) {
        if (view == null) return;
        String js =
            "(function(){" +
            "  var css = '" +
            "a[href*=\"lovable.dev\"],a[href*=\"lovable.app/?via\"],a[href*=\"gptengineer.app\"]," +
            "#lovable-badge,[id*=\"lovable-badge\"],[class*=\"lovable-badge\"]," +
            "[data-lovable-badge],[data-lov-badge],iframe[src*=\"lovable.dev/badge\"]," +
            "div[style*=\"z-index: 999999\"] a[href*=\"lovable\"]" +
            "{display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important;height:0 !important;width:0 !important;}';" +
            "  var s=document.getElementById('__wta_hide_badge');" +
            "  if(!s){s=document.createElement('style');s.id='__wta_hide_badge';s.innerHTML=css;(document.head||document.documentElement).appendChild(s);}" +
            "  function nuke(){" +
            "    document.querySelectorAll('a').forEach(function(a){" +
            "      var h=(a.getAttribute('href')||'').toLowerCase();" +
            "      var t=(a.innerText||'').toLowerCase();" +
            "      if(h.indexOf('lovable.dev')>-1||h.indexOf('gptengineer.app')>-1||t.indexOf('edit with lovable')>-1||t.indexOf('made with lovable')>-1){" +
            "        var p=a.closest('div,section,aside')||a; p.remove();" +
            "      }" +
            "    });" +
            "    document.querySelectorAll('iframe[src*=\"lovable\"]').forEach(function(f){f.remove();});" +
            "  }" +
            "  nuke();" +
            "  try{new MutationObserver(nuke).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}" +
            "  setInterval(nuke,1500);" +
            "})();";
        try { view.evaluateJavascript(js, null); } catch (Exception ignored) {}
    }

    private String addCacheBustParam(String rawUrl) {
        try {
            Uri uri = Uri.parse(rawUrl);
            return uri.buildUpon()
                .appendQueryParameter("_wvts", String.valueOf(System.currentTimeMillis()))
                .build()
                .toString();
        } catch (Exception ignored) {
            return rawUrl;
        }
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

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUI();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

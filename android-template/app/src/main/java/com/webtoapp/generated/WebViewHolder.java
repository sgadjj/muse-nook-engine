package com.webtoapp.generated;

import android.annotation.SuppressLint;
import android.content.Context;
import android.view.ViewGroup;
import android.webkit.WebView;

/**
 * Keeps ONE WebView instance alive for the whole process lifetime.
 * The activity only attaches / detaches it, so the website (and any
 * JavaScript it runs) keeps executing even when the app is swiped away
 * from the recents list, as long as KeepAliveService holds the process.
 */
public final class WebViewHolder {

    private static WebView instance;
    private static boolean loadedOnce = false;

    private WebViewHolder() {}

    @SuppressLint("StaticFieldLeak")
    public static synchronized WebView get(Context context) {
        if (instance == null) {
            // Application context on purpose: survives activity destruction.
            instance = new WebView(context.getApplicationContext());
            instance.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        }
        return instance;
    }

    public static synchronized WebView peek() {
        return instance;
    }

    public static boolean isLoadedOnce() {
        return loadedOnce;
    }

    public static void markLoaded() {
        loadedOnce = true;
    }

    public static void detach() {
        WebView wv = peek();
        if (wv == null) return;
        try {
            ViewGroup parent = (ViewGroup) wv.getParent();
            if (parent != null) parent.removeView(wv);
        } catch (Exception ignored) {}
    }
}

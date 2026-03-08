import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, BlobWriter } from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOUDAPK_URL = "https://pwabuilder-cloudapk.azurewebsites.net";

function normalizeHexColor(color: string): string {
  const hex = (color || "").replace("#", "").trim();
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : "22c55e";
}

function makeFallbackIconUrl(appName: string, appColor: string): string {
  const bg = normalizeHexColor(appColor);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(appName || "App")}&size=512&format=png&rounded=true&bold=true&background=${bg}&color=ffffff`;
}

function sanitizeTargetUrl(rawUrl: string): string {
  const parsed = new URL((rawUrl || "").trim());
  parsed.searchParams.delete("__lovable_token");
  return parsed.toString();
}

// Fast icon check with 3s timeout per URL
async function quickFetchIcon(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (r.ok && ct.startsWith("image/") && !ct.includes("x-icon")) return url;
  } catch { /* skip */ }
  return null;
}

// Resolve icon with max 5s total timeout
async function resolveBestIconUrl(siteUrl: string, host: string): Promise<string | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    // Try common paths in parallel (fastest approach)
    const candidates = [
      `${host}/apple-touch-icon.png`,
      `${host}/favicon.png`,
      `${host}/icon-512x512.png`,
      `https://logo.clearbit.com/${new URL(siteUrl).hostname}`,
    ];

    const results = await Promise.all(candidates.map(quickFetchIcon));
    clearTimeout(timeout);
    return results.find(Boolean) || undefined;
  } catch {
    clearTimeout(timeout);
    return undefined;
  }
}

function makeManifestPayload(appName: string, appColor: string, startUrl: string, iconUrl: string) {
  return {
    name: appName,
    short_name: appName,
    start_url: startUrl || "/",
    display: "standalone",
    orientation: "portrait",
    background_color: appColor,
    theme_color: appColor,
    icons: [
      { src: iconUrl, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any maskable" },
    ],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);

    // Public manifest endpoint
    if (req.method === "GET" && reqUrl.searchParams.get("mode") === "manifest") {
      const appName = reqUrl.searchParams.get("appName") || "WebApp";
      const appColor = reqUrl.searchParams.get("appColor") || "#22c55e";
      const startUrl = reqUrl.searchParams.get("startUrl") || "/";
      const iconUrl = reqUrl.searchParams.get("iconUrl") || "https://logo.clearbit.com/example.com";

      return new Response(
        JSON.stringify(makeManifestPayload(appName, appColor, startUrl, iconUrl), null, 2),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=60" },
        }
      );
    }

    const { url, appName, appColor, packageId, iconUrl } = await req.json();

    if (!url || !appName || !appColor) {
      return new Response(
        JSON.stringify({ error: "url, appName, appColor are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedUrl = sanitizeTargetUrl(url);
    const parsedUrl = new URL(sanitizedUrl);
    const host = parsedUrl.origin;
    const startUrl = `${parsedUrl.pathname || "/"}${parsedUrl.search}${parsedUrl.hash}`;
    const finalPackageId = packageId || `com.pwa.${appName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app"}`;

    // Fast icon resolution (max 5s) or immediate fallback
    const resolvedIconUrl = iconUrl || await resolveBestIconUrl(sanitizedUrl, host) || makeFallbackIconUrl(appName, appColor);

    const publicBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-apk`;
    const generatedManifestUrl = `${publicBaseUrl}?mode=manifest&appName=${encodeURIComponent(appName)}&appColor=${encodeURIComponent(appColor)}&startUrl=${encodeURIComponent(startUrl)}&iconUrl=${encodeURIComponent(resolvedIconUrl)}`;

    const apkOptions = {
      appVersion: "1.0.0",
      appVersionCode: 1,
      backgroundColor: appColor,
      display: "standalone",
      enableNotifications: false,
      enableSiteSettingsShortcut: false,
      fallbackType: "webview",
      isChromeOSOnly: false,
      host,
      iconUrl: resolvedIconUrl,
      includeSourceCode: false,
      launcherName: appName,
      name: appName,
      navigationColor: appColor,
      navigationColorDark: appColor,
      navigationDividerColor: appColor,
      navigationDividerColorDark: appColor,
      orientation: "default",
      packageId: finalPackageId,
      signingMode: "new",
      signing: {
        alias: "my-key-alias",
        fullName: appName,
        organization: appName,
        organizationalUnit: appName,
        countryCode: "US",
      },
      splashScreenFadeOutDuration: 300,
      startUrl,
      themeColor: appColor,
      webManifestUrl: generatedManifestUrl,
      pwaUrl: sanitizedUrl,
      additionalTrustedOrigins: [],
      shareTarget: {},
    };

    const response = await fetch(`${CLOUDAPK_URL}/generateAppPackage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "platform-identifier": "pwabuilder-webtoapp",
        "platform-identifier-version": "1.0.0",
      },
      body: JSON.stringify(apkOptions),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: "فشل توليد APK", details: errorText, status: response.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zipBlob = await response.blob();

    // Extract APK from ZIP
    try {
      const zipReader = new ZipReader(new BlobReader(zipBlob));
      const entries = await zipReader.getEntries();
      const apkEntry = entries.find((e: any) => e.filename.endsWith(".apk"));

      if (apkEntry) {
        const apkBlob = await apkEntry.getData(new BlobWriter("application/vnd.android.package-archive"));
        const apkBuffer = await apkBlob.arrayBuffer();
        await zipReader.close();

        return new Response(apkBuffer, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition": `attachment; filename="${appName.replace(/\s/g, "-") || "app"}.apk"`,
          },
        });
      }
      await zipReader.close();
    } catch {
      // fallback to zip
    }

    const zipBuffer = await zipBlob.arrayBuffer();
    return new Response(zipBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${appName.replace(/\s/g, "-") || "app"}.zip"`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

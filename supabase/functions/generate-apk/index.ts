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

function isUnsupportedHostForFullscreen(hostname: string): boolean {
  return hostname.endsWith("lovable.app");
}

async function resolveBestIconUrl(siteUrl: string, host: string): Promise<string | undefined> {
  const candidates: string[] = [];

  try {
    const pageResp = await fetch(siteUrl, { method: "GET" });
    if (pageResp.ok) {
      const html = await pageResp.text();
      const iconMatches = [...html.matchAll(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
      for (const m of iconMatches) {
        try {
          candidates.push(new URL(m[1], host).toString());
        } catch {
          // ignore invalid icon URL
        }
      }
    }
  } catch {
    // continue to fallback candidates
  }

  candidates.push(`${host}/apple-touch-icon.png`);
  candidates.push(`${host}/favicon.png`);
  candidates.push(`https://logo.clearbit.com/${new URL(siteUrl).hostname}`);

  for (const candidate of [...new Set(candidates)]) {
    try {
      const r = await fetch(candidate, { method: "GET" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (r.ok && ct.startsWith("image/") && !ct.includes("x-icon")) {
        return candidate;
      }
    } catch {
      // try next
    }
  }

  return undefined;
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
      {
        src: iconUrl,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: iconUrl,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);

    // Public manifest endpoint used by CloudAPK (prevents 404 manifest errors)
    if (req.method === "GET" && reqUrl.searchParams.get("mode") === "manifest") {
      const appName = reqUrl.searchParams.get("appName") || "WebApp";
      const appColor = reqUrl.searchParams.get("appColor") || "#22c55e";
      const startUrl = reqUrl.searchParams.get("startUrl") || "/";
      const iconUrl = reqUrl.searchParams.get("iconUrl") || "https://logo.clearbit.com/example.com";

      return new Response(
        JSON.stringify(makeManifestPayload(appName, appColor, startUrl, iconUrl), null, 2),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/manifest+json",
            "Cache-Control": "public, max-age=60",
          },
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
    const resolvedIconUrl = iconUrl || await resolveBestIconUrl(sanitizedUrl, host) || makeFallbackIconUrl(appName, appColor);

    const publicBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-apk`;
    const generatedManifestUrl = `${publicBaseUrl}?mode=manifest&appName=${encodeURIComponent(appName)}&appColor=${encodeURIComponent(appColor)}&startUrl=${encodeURIComponent(startUrl)}&iconUrl=${encodeURIComponent(resolvedIconUrl)}`;

    const apkOptions = {
      appVersion: "1.0.0",
      appVersionCode: 1,
      backgroundColor: appColor,
      display: "fullscreen",
      enableNotifications: false,
      enableSiteSettingsShortcut: true,
      fallbackType: "webview",
      host,
      iconUrl: resolvedIconUrl,
      includeSourceCode: false,
      launcherName: appName,
      name: appName,
      navigationColor: appColor,
      navigationColorDark: appColor,
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
      // fallback to zip response below
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

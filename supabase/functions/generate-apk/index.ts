import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, BlobWriter } from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOUDAPK_URL = "https://pwabuilder-cloudapk.azurewebsites.net";

async function resolveManifestUrl(siteUrl: string, host: string): Promise<string | undefined> {
  const candidates: string[] = [];

  try {
    const pageResp = await fetch(siteUrl, { method: "GET" });
    if (pageResp.ok) {
      const html = await pageResp.text();
      const manifestMatch = html.match(/<link[^>]+rel=["'][^"']*manifest[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/i);
      if (manifestMatch?.[1]) {
        candidates.push(new URL(manifestMatch[1], host).toString());
      }
    }
  } catch {
    // ignore
  }

  candidates.push(`${host}/manifest.webmanifest`);
  candidates.push(`${host}/manifest.json`);

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    try {
      const r = await fetch(candidate, { method: "GET" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (r.ok && (ct.includes("application/manifest+json") || ct.includes("application/json") || ct.includes("text/plain"))) {
        return candidate;
      }
    } catch {
      // try next
    }
  }

  return undefined;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, appName, appColor, packageId, iconUrl } = await req.json();

    if (!url || !appName || !appColor) {
      return new Response(
        JSON.stringify({ error: "url, appName, appColor are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsedUrl = new URL(url);
    const host = parsedUrl.origin;
    const startUrl = parsedUrl.pathname || "/";

    const finalPackageId = packageId || 
      `com.pwa.${appName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app"}`;
    const resolvedManifestUrl = await resolveManifestUrl(url, host);

    if (!resolvedIconUrl) {
      return new Response(
        JSON.stringify({ error: "تعذر العثور على أيقونة PNG صالحة للموقع" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apkOptions = {
      appVersion: "1.0.0",
      appVersionCode: 1,
      backgroundColor: appColor,
      display: "standalone",
      enableNotifications: false,
      enableSiteSettingsShortcut: true,
      fallbackType: "customtabs",
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
      ...(resolvedManifestUrl ? { webManifestUrl: resolvedManifestUrl } : {}),
      pwaUrl: url,
    };

    console.log("Sending request to CloudAPK");

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
      console.error("CloudAPK error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "فشل توليد APK", details: errorText, status: response.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the zip and extract the .apk file from it
    const zipBlob = await response.blob();
    
    try {
      const zipReader = new ZipReader(new BlobReader(zipBlob));
      const entries = await zipReader.getEntries();
      
      // Find the .apk file inside the zip
      const apkEntry = entries.find((e: any) => e.filename.endsWith(".apk"));
      
      if (apkEntry) {
        const apkBlob = await apkEntry.getData(new BlobWriter("application/vnd.android.package-archive"));
        const apkBuffer = await apkBlob.arrayBuffer();
        await zipReader.close();
        
        const safeName = appName.replace(/\s/g, "-");
        return new Response(apkBuffer, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition": `attachment; filename="${safeName}.apk"`,
          },
        });
      }
      
      await zipReader.close();
    } catch (zipErr) {
      console.log("Could not extract APK from zip, returning zip as-is:", zipErr);
    }

    // Fallback: return the zip if we couldn't extract
    const zipBuffer = await zipBlob.arrayBuffer();
    return new Response(zipBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${appName.replace(/\s/g, "-")}.zip"`,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

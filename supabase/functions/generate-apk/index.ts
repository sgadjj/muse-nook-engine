import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOUDAPK_URL = "https://pwabuilder-cloudapk.azurewebsites.net";

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

    // Parse the URL to get host and start path
    const parsedUrl = new URL(url);
    const host = parsedUrl.origin;
    const startUrl = parsedUrl.pathname || "/";

    // Generate a package ID if not provided
    const finalPackageId = packageId || 
      `com.pwa.${appName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app"}`;

    // Default icon if none provided
    const finalIconUrl = iconUrl || `${host}/favicon.ico`;

    // Build the request body for PWABuilder CloudAPK
    const apkOptions = {
      appVersion: "1.0.0",
      appVersionCode: 1,
      backgroundColor: appColor,
      display: "standalone",
      enableNotifications: false,
      enableSiteSettingsShortcut: true,
      fallbackType: "customtabs",
      host: host,
      iconUrl: finalIconUrl,
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
      startUrl: startUrl,
      themeColor: appColor,
      webManifestUrl: `${host}/manifest.json`,
      pwaUrl: url,
    };

    console.log("Sending request to CloudAPK:", JSON.stringify(apkOptions));

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
        JSON.stringify({ 
          error: "فشل توليد APK", 
          details: errorText,
          status: response.status 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The response is a zip file containing the APK
    const zipBuffer = await response.arrayBuffer();
    
    return new Response(zipBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${appName.replace(/\s/g, "-")}-apk.zip"`,
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

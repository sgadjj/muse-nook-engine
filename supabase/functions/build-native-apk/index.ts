import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GITHUB_API = "https://api.github.com";

function getGitHubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const githubRepo = Deno.env.get("GITHUB_REPO"); // format: "owner/repo"

  if (!githubToken || !githubRepo) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN and GITHUB_REPO secrets are required" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);

  try {
    // GET: Check build status or download artifact
    if (req.method === "GET") {
      const runId = url.searchParams.get("runId");
      if (!runId) {
        return new Response(
          JSON.stringify({ error: "runId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check workflow run status
      const runResp = await fetch(
        `${GITHUB_API}/repos/${githubRepo}/actions/runs/${runId}`,
        { headers: getGitHubHeaders(githubToken) }
      );

      if (!runResp.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to check build status", status: runResp.status }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const runData = await runResp.json();
      const status = runData.status; // queued, in_progress, completed
      const conclusion = runData.conclusion; // success, failure, cancelled

      if (status !== "completed") {
        return new Response(
          JSON.stringify({ status, conclusion: null, message: "Build in progress..." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (conclusion !== "success") {
        return new Response(
          JSON.stringify({ status: "completed", conclusion, message: "Build failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get artifacts
      const artifactsResp = await fetch(
        `${GITHUB_API}/repos/${githubRepo}/actions/runs/${runId}/artifacts`,
        { headers: getGitHubHeaders(githubToken) }
      );

      if (!artifactsResp.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to get artifacts" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const artifactsData = await artifactsResp.json();
      const apkArtifact = artifactsData.artifacts?.find(
        (a: any) => a.name === "native-apk"
      );

      if (!apkArtifact) {
        return new Response(
          JSON.stringify({ status: "completed", conclusion: "success", error: "APK artifact not found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Download the artifact (it's a ZIP containing the APK)
      const downloadResp = await fetch(
        apkArtifact.archive_download_url,
        { headers: getGitHubHeaders(githubToken) }
      );

      if (!downloadResp.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to download artifact" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return the ZIP containing the APK
      const blob = await downloadResp.blob();
      const buffer = await blob.arrayBuffer();

      return new Response(buffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="native-apk.zip"`,
        },
      });
    }

    // POST: Trigger a new build
    if (req.method === "POST") {
      const { appUrl, appName, appColor, packageId } = await req.json();

      if (!appUrl || !appName) {
        return new Response(
          JSON.stringify({ error: "appUrl and appName are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const safePackageId = packageId || 
        `com.webtoapp.${appName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app"}`;

      // Get the default branch
      const repoResp = await fetch(
        `${GITHUB_API}/repos/${githubRepo}`,
        { headers: getGitHubHeaders(githubToken) }
      );
      
      if (!repoResp.ok) {
        const errText = await repoResp.text();
        return new Response(
          JSON.stringify({ error: "Cannot access GitHub repo", details: errText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const repoData = await repoResp.json();
      const defaultBranch = repoData.default_branch || "main";

      // Trigger workflow_dispatch
      const dispatchResp = await fetch(
        `${GITHUB_API}/repos/${githubRepo}/actions/workflows/build-apk.yml/dispatches`,
        {
          method: "POST",
          headers: {
            ...getGitHubHeaders(githubToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ref: defaultBranch,
            inputs: {
              app_url: appUrl,
              app_name: appName,
              app_color: appColor || "#22c55e",
              package_id: safePackageId,
            },
          }),
        }
      );

      if (!dispatchResp.ok) {
        const errText = await dispatchResp.text();
        return new Response(
          JSON.stringify({ error: "Failed to trigger build", details: errText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Wait a moment then find the run ID
      await new Promise(r => setTimeout(r, 3000));

      const runsResp = await fetch(
        `${GITHUB_API}/repos/${githubRepo}/actions/workflows/build-apk.yml/runs?per_page=1&status=queued`,
        { headers: getGitHubHeaders(githubToken) }
      );

      let runId = null;
      if (runsResp.ok) {
        const runsData = await runsResp.json();
        if (runsData.workflow_runs?.length > 0) {
          runId = runsData.workflow_runs[0].id;
        }
      }

      // If not found as queued, try in_progress
      if (!runId) {
        const runsResp2 = await fetch(
          `${GITHUB_API}/repos/${githubRepo}/actions/workflows/build-apk.yml/runs?per_page=1`,
          { headers: getGitHubHeaders(githubToken) }
        );
        if (runsResp2.ok) {
          const runsData2 = await runsResp2.json();
          if (runsData2.workflow_runs?.length > 0) {
            runId = runsData2.workflow_runs[0].id;
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          runId,
          message: "Build triggered successfully. Poll GET with runId to check status."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

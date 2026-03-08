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

async function resolveGitHubRepo(configuredRepo: string, token: string) {
  const repo = configuredRepo.trim();
  if (repo.includes("/")) {
    return { repo, inferred: false };
  }

  const userResp = await fetch(`${GITHUB_API}/user`, {
    headers: getGitHubHeaders(token),
  });

  if (!userResp.ok) {
    const errText = await userResp.text();
    throw new Error(`Failed to resolve repo owner from token: ${errText}`);
  }

  const userData = await userResp.json();
  if (!userData?.login) {
    throw new Error("Failed to resolve repo owner from token: missing login");
  }

  return { repo: `${userData.login}/${repo}`, inferred: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const githubRepo = Deno.env.get("GITHUB_REPO");

  if (!githubToken || !githubRepo) {
    return new Response(
      JSON.stringify({ error: "GITHUB_TOKEN and GITHUB_REPO secrets are required" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);

  try {
    const { repo: resolvedRepo, inferred } = await resolveGitHubRepo(githubRepo, githubToken);
    if (inferred) {
      console.log(`Resolved GITHUB_REPO automatically: ${resolvedRepo}`);
    }

      const runId = url.searchParams.get("runId");
      if (!runId) {
        return new Response(
          JSON.stringify({ error: "runId is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const runResp = await fetch(
        `${GITHUB_API}/repos/${githubRepo}/actions/runs/${runId}`,
        { headers: getGitHubHeaders(githubToken) }
      );
      if (!runResp.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to check build status" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const runData = await runResp.json();
      if (runData.status !== "completed") {
        return new Response(
          JSON.stringify({ status: runData.status, conclusion: null, message: "Build in progress..." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (runData.conclusion !== "success") {
        return new Response(
          JSON.stringify({ status: "completed", conclusion: runData.conclusion, message: "Build failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
      const apkArtifact = artifactsData.artifacts?.find((a: any) => a.name === "native-apk");
      if (!apkArtifact) {
        return new Response(
          JSON.stringify({ status: "completed", conclusion: "success", error: "APK artifact not found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const downloadResp = await fetch(apkArtifact.archive_download_url, { headers: getGitHubHeaders(githubToken) });
      if (!downloadResp.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to download artifact" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const buffer = await (await downloadResp.blob()).arrayBuffer();
      return new Response(buffer, {
        headers: { ...corsHeaders, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="native-apk.zip"` },
      });
    }

    if (req.method === "POST") {
      const { appUrl, appName, appColor, packageId } = await req.json();
      if (!appUrl || !appName) {
        return new Response(
          JSON.stringify({ error: "appUrl and appName are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const safePackageId = packageId || `com.webtoapp.${appName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app"}`;

      console.log("Using GITHUB_REPO (configured):", githubRepo);
      console.log("Using GITHUB_REPO (resolved):", resolvedRepo);
      console.log("Token length:", githubToken?.length);
      const repoResp = await fetch(`${GITHUB_API}/repos/${resolvedRepo}`, { headers: getGitHubHeaders(githubToken) });
      if (!repoResp.ok) {
        const errText = await repoResp.text();
        console.error("Repo access failed:", repoResp.status, errText);
        return new Response(
          JSON.stringify({ error: "Cannot access GitHub repo", details: errText, repoUsed: resolvedRepo, repoConfigured: githubRepo }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const repoData = await repoResp.json();
      const defaultBranch = repoData.default_branch || "main";

      const dispatchResp = await fetch(
          `${GITHUB_API}/repos/${resolvedRepo}/actions/workflows/build-apk.yml/dispatches`,
        {
          method: "POST",
          headers: { ...getGitHubHeaders(githubToken), "Content-Type": "application/json" },
          body: JSON.stringify({
            ref: defaultBranch,
            inputs: { app_url: appUrl, app_name: appName, app_color: appColor || "#22c55e", package_id: safePackageId },
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

      await new Promise(r => setTimeout(r, 3000));

      let runId = null;
      for (const status of ["queued", ""]) {
        const q = status ? `&status=${status}` : "";
        const runsResp = await fetch(
          `${GITHUB_API}/repos/${resolvedRepo}/actions/workflows/build-apk.yml/runs?per_page=1${q}`,
          { headers: getGitHubHeaders(githubToken) }
        );
        if (runsResp.ok) {
          const runsData = await runsResp.json();
          if (runsData.workflow_runs?.length > 0) { runId = runsData.workflow_runs[0].id; break; }
        }
      }

      return new Response(
        JSON.stringify({ success: true, runId, message: "Build triggered" }),
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

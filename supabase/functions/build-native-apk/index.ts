import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

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
  if (repo.includes("/")) return { repo, inferred: false };

  const userResp = await fetch(`${GITHUB_API}/user`, { headers: getGitHubHeaders(token) });
  if (!userResp.ok) throw new Error(`Failed to resolve repo owner: ${await userResp.text()}`);
  const userData = await userResp.json();
  if (!userData?.login) throw new Error("Failed to resolve repo owner: missing login");
  return { repo: `${userData.login}/${repo}`, inferred: true };
}

function sanitizePackageId(rawPackageId: string | undefined, appName: string) {
  const fallback = `com.webtoapp.${appName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app"}`;
  if (!rawPackageId || !rawPackageId.trim()) return fallback;
  const cleaned = rawPackageId.trim().toLowerCase().replace(/[^a-z0-9.]/g, ".").replace(/\.+/g, ".").replace(/^\.|\.$/g, "");
  const segments = cleaned.split(".").map((s) => s.replace(/^[^a-z]+/, "").replace(/[^a-z0-9_]/g, "")).filter(Boolean);
  if (segments.length < 2) return fallback;
  return segments.join(".");
}

// Upload custom icon to repo via GitHub Contents API
async function uploadCustomIcon(base64Data: string, resolvedRepo: string, branch: string, token: string): Promise<boolean> {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const filePath = "android-template/custom_icon.png";
  const apiUrl = `${GITHUB_API}/repos/${resolvedRepo}/contents/${filePath}`;

  // Check if file already exists (need SHA to update)
  let sha: string | undefined;
  try {
    const existResp = await fetch(`${apiUrl}?ref=${branch}`, { headers: getGitHubHeaders(token) });
    if (existResp.ok) {
      const existData = await existResp.json();
      sha = existData.sha;
    }
  } catch { /* file doesn't exist */ }

  const body: any = {
    message: "chore: add custom icon for APK build",
    content: cleanBase64,
    branch,
  };
  if (sha) body.sha = sha;

  const resp = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error("Failed to upload custom icon:", resp.status, await resp.text());
    return false;
  }
  console.log("Custom icon uploaded successfully");
  return true;
}

async function getRunStatusResponse(runId: string, resolvedRepo: string, githubToken: string, appName?: string) {
  const runResp = await fetch(
    `${GITHUB_API}/repos/${resolvedRepo}/actions/runs/${runId}`,
    { headers: getGitHubHeaders(githubToken) }
  );
  if (!runResp.ok) {
    const errText = await runResp.text();
    console.error("Failed to check build status:", runResp.status, errText);
    if (runResp.status === 404) {
      return new Response(
        JSON.stringify({ status: "queued", conclusion: null, message: "Build started, waiting for status..." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to check build status", details: errText }),
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
    let failureDetails: any = null;
    try {
      const jobsResp = await fetch(
        `${GITHUB_API}/repos/${resolvedRepo}/actions/runs/${runId}/jobs?per_page=100`,
        { headers: getGitHubHeaders(githubToken) }
      );
      if (jobsResp.ok) {
        const jobsData = await jobsResp.json();
        const failedJobs = (jobsData.jobs || []).filter((j: any) => j.conclusion === "failure");
        const enriched = await Promise.all(failedJobs.map(async (job: any) => {
          let logSnippet: string | null = null;
          try {
            const lr = await fetch(`${GITHUB_API}/repos/${resolvedRepo}/actions/jobs/${job.id}/logs`, { headers: getGitHubHeaders(githubToken) });
            if (lr.ok) {
              const raw = await lr.text();
              const cleaned = raw.split("\n").filter((l) => /(error|failed|exception|what went wrong|could not)/i.test(l)).slice(-25).join("\n");
              logSnippet = cleaned || raw.slice(-2000);
            }
          } catch {}
          return { id: job.id, name: job.name, conclusion: job.conclusion, url: job.html_url, failedSteps: (job.steps || []).filter((s: any) => s.conclusion === "failure").map((s: any) => s.name), logSnippet };
        }));
        failureDetails = enriched;
      }
    } catch {}
    return new Response(
      JSON.stringify({ status: "completed", conclusion: runData.conclusion, message: "Build failed", failureDetails }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Build succeeded - get artifact
  const artifactsResp = await fetch(
    `${GITHUB_API}/repos/${resolvedRepo}/actions/runs/${runId}/artifacts`,
    { headers: getGitHubHeaders(githubToken) }
  );
  if (!artifactsResp.ok) {
    return new Response(JSON.stringify({ error: "Failed to get artifacts" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
    return new Response(JSON.stringify({ error: "Failed to download artifact" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const buffer = await (await downloadResp.blob()).arrayBuffer();
  const safeName = (appName || "app").replace(/[^a-zA-Z0-9-]/g, "-");

  // Extract APK from the zip artifact and serve directly
  try {
    const uint8 = new Uint8Array(buffer);
    const unzipped = unzipSync(uint8);
    const apkFileName = Object.keys(unzipped).find((name) => name.endsWith(".apk"));
    if (apkFileName) {
      console.log("Extracted APK:", apkFileName, "size:", unzipped[apkFileName].length);
      return new Response(unzipped[apkFileName], {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": `attachment; filename="${safeName}.apk"`,
        },
      });
    }
  } catch (e) {
    console.error("Failed to extract APK from zip, sending zip instead:", e);
  }

  // Fallback: send the zip as-is
  return new Response(buffer, {
    headers: { ...corsHeaders, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${safeName}.zip"` },
  });
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

  try {
    const { repo: resolvedRepo, inferred } = await resolveGitHubRepo(githubRepo, githubToken);
    if (inferred) console.log(`Resolved GITHUB_REPO: ${resolvedRepo}`);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const runId = url.searchParams.get("runId");
      if (!runId) {
        return new Response(JSON.stringify({ error: "runId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return await getRunStatusResponse(runId, resolvedRepo, githubToken);
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const { runId, appUrl, appName, appColor, packageId, customIcon } = payload;

      if (runId) {
        return await getRunStatusResponse(String(runId), resolvedRepo, githubToken, appName);
      }

      if (!appUrl || !appName) {
        return new Response(JSON.stringify({ error: "appUrl and appName are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const safePackageId = sanitizePackageId(packageId, appName);

      // Get repo info for default branch
      const repoResp = await fetch(`${GITHUB_API}/repos/${resolvedRepo}`, { headers: getGitHubHeaders(githubToken) });
      if (!repoResp.ok) {
        const errText = await repoResp.text();
        console.error("Repo access failed:", repoResp.status, errText);
        return new Response(
          JSON.stringify({ error: "Cannot access GitHub repo", details: errText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const repoData = await repoResp.json();
      const defaultBranch = repoData.default_branch || "main";

      // Upload custom icon to repo if provided
      let hasCustomIcon = false;
      if (customIcon && typeof customIcon === "string" && customIcon.length > 100) {
        console.log("Uploading custom icon to repo...");
        hasCustomIcon = await uploadCustomIcon(customIcon, resolvedRepo, defaultBranch, githubToken);
        if (hasCustomIcon) {
          // Wait for GitHub to process the commit
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      // Trigger workflow
      const dispatchResp = await fetch(
        `${GITHUB_API}/repos/${resolvedRepo}/actions/workflows/build-apk.yml/dispatches`,
        {
          method: "POST",
          headers: { ...getGitHubHeaders(githubToken), "Content-Type": "application/json" },
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
        return new Response(JSON.stringify({ error: "Failed to trigger build", details: errText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await new Promise((r) => setTimeout(r, 3000));

      let latestRunId = null;
      for (const status of ["queued", ""]) {
        const q = status ? `&status=${status}` : "";
        const runsResp = await fetch(
          `${GITHUB_API}/repos/${resolvedRepo}/actions/workflows/build-apk.yml/runs?per_page=1${q}`,
          { headers: getGitHubHeaders(githubToken) }
        );
        if (runsResp.ok) {
          const runsData = await runsResp.json();
          if (runsData.workflow_runs?.length > 0) {
            latestRunId = runsData.workflow_runs[0].id;
            break;
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, runId: latestRunId, message: "Build triggered", hasCustomIcon }),
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

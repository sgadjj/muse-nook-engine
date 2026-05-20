import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GITHUB_API = "https://api.github.com";
const BUILD_WORKFLOW_FILE = "build-apk.yml";
const BUILD_WORKFLOW_PATH = `.github/workflows/${BUILD_WORKFLOW_FILE}`;
const EMBEDDED_BUILD_WORKFLOW_BASE64 = "bmFtZTogQnVpbGQgTmF0aXZlIFdlYlZpZXcgQVBLCgpvbjoKICB3b3JrZmxvd19kaXNwYXRjaDoKICAgIGlucHV0czoKICAgICAgYXBwX3VybDoKICAgICAgICBkZXNjcmlwdGlvbjogJ1RhcmdldCB3ZWJzaXRlIFVSTCcKICAgICAgICByZXF1aXJlZDogdHJ1ZQogICAgICAgIHR5cGU6IHN0cmluZwogICAgICBhcHBfbmFtZToKICAgICAgICBkZXNjcmlwdGlvbjogJ0FwcCBkaXNwbGF5IG5hbWUnCiAgICAgICAgcmVxdWlyZWQ6IHRydWUKICAgICAgICBkZWZhdWx0OiAnTXlBcHAnCiAgICAgICAgdHlwZTogc3RyaW5nCiAgICAgIGFwcF9jb2xvcjoKICAgICAgICBkZXNjcmlwdGlvbjogJ1RoZW1lIGNvbG9yIGhleCAoZS5nLiAjMjJjNTVlKScKICAgICAgICByZXF1aXJlZDogdHJ1ZQogICAgICAgIGRlZmF1bHQ6ICcjMjJjNTVlJwogICAgICAgIHR5cGU6IHN0cmluZwogICAgICBwYWNrYWdlX2lkOgogICAgICAgIGRlc2NyaXB0aW9uOiAnQW5kcm9pZCBwYWNrYWdlIElEJwogICAgICAgIHJlcXVpcmVkOiB0cnVlCiAgICAgICAgZGVmYXVsdDogJ2NvbS53ZWJ0b2FwcC5hcHAnCiAgICAgICAgdHlwZTogc3RyaW5nCgpqb2JzOgogIGJ1aWxkOgogICAgcnVucy1vbjogdWJ1bnR1LWxhdGVzdAogICAgdGltZW91dC1taW51dGVzOiAyMAoKICAgIHN0ZXBzOgogICAgICAtIG5hbWU6IENoZWNrb3V0CiAgICAgICAgdXNlczogYWN0aW9ucy9jaGVja291dEB2NAoKICAgICAgLSBuYW1lOiBTZXQgdXAgSkRLIDE3CiAgICAgICAgdXNlczogYWN0aW9ucy9zZXR1cC1qYXZhQHY0CiAgICAgICAgd2l0aDoKICAgICAgICAgIGphdmEtdmVyc2lvbjogJzE3JwogICAgICAgICAgZGlzdHJpYnV0aW9uOiAndGVtdXJpbicKICAgICAgICAgIGNhY2hlOiAnZ3JhZGxlJwoKICAgICAgLSBuYW1lOiBTZXR1cCBHcmFkbGUKICAgICAgICB1c2VzOiBncmFkbGUvYWN0aW9ucy9zZXR1cC1ncmFkbGVAdjQKICAgICAgICB3aXRoOgogICAgICAgICAgZ3JhZGxlLXZlcnNpb246IDguNQogICAgICAgICAgY2FjaGUtcmVhZC1vbmx5OiBmYWxzZQoKICAgICAgLSBuYW1lOiBDb25maWd1cmUgYXBwIHBhcmFtZXRlcnMKICAgICAgICB3b3JraW5nLWRpcmVjdG9yeTogYW5kcm9pZC10ZW1wbGF0ZQogICAgICAgIHJ1bjogfAogICAgICAgICAgc2V0IC1lCiAgICAgICAgICBBUFBfVVJMPSIke3sgaW5wdXRzLmFwcF91cmwgfX0iCiAgICAgICAgICBBUFBfTkFNRT0iJHt7IGlucHV0cy5hcHBfbmFtZSB9fSIKICAgICAgICAgIEFQUF9DT0xPUj0iJHt7IGlucHV0cy5hcHBfY29sb3IgfX0iCiAgICAgICAgICBQQUNLQUdFX0lEPSIke3sgaW5wdXRzLnBhY2thZ2VfaWQgfX0iCiAgICAgICAgICAKICAgICAgICAgICMgRXNjYXBlIHNwZWNpYWwgY2hhcmFjdGVycyBmb3Igc2VkCiAgICAgICAgICBBUFBfVVJMX0VTQz0kKHByaW50ZiAnJXNcbicgIiRBUFBfVVJMIiB8IHNlZCAncy9bJi9cXS9cXCYvZycpCiAgICAgICAgICBBUFBfTkFNRV9FU0M9JChwcmludGYgJyVzXG4nICIkQVBQX05BTUUiIHwgc2VkICdzL1smL1xdL1xcJi9nJykKICAgICAgICAgIEFQUF9DT0xPUl9FU0M9JChwcmludGYgJyVzXG4nICIkQVBQX0NPTE9SIiB8IHNlZCAncy9bJi9cXS9cXCYvZycpCiAgICAgICAgICBQQUNLQUdFX0lEX0VTQz0kKHByaW50ZiAnJXNcbicgIiRQQUNLQUdFX0lEIiB8IHNlZCAncy9bJi9cXS9cXCYvZycpCiAgICAgICAgICAKICAgICAgICAgIGZpbmQgLiAtdHlwZSBmIFwoIC1uYW1lICIqLmphdmEiIC1vIC1uYW1lICIqLnhtbCIgLW8gLW5hbWUgIiouZ3JhZGxlIiBcKSAtZXhlYyBzZWQgLWkgInN8QVBQX1VSTHwke0FQUF9VUkxfRVNDfXxnIiB7fSArCiAgICAgICAgICBmaW5kIC4gLXR5cGUgZiBcKCAtbmFtZSAiKi5qYXZhIiAtbyAtbmFtZSAiKi54bWwiIC1vIC1uYW1lICIqLmdyYWRsZSIgXCkgLWV4ZWMgc2VkIC1pICJzfEFQUF9OQU1FfCR7QVBQX05BTUVfRVNDfXxnIiB7fSArCiAgICAgICAgICBmaW5kIC4gLXR5cGUgZiBcKCAtbmFtZSAiKi5qYXZhIiAtbyAtbmFtZSAiKi54bWwiIC1vIC1uYW1lICIqLmdyYWRsZSIgXCkgLWV4ZWMgc2VkIC1pICJzfEFQUF9DT0xPUnwke0FQUF9DT0xPUl9FU0N9fGciIHt9ICsKICAgICAgICAgIGZpbmQgLiAtdHlwZSBmIFwoIC1uYW1lICIqLmphdmEiIC1vIC1uYW1lICIqLnhtbCIgLW8gLW5hbWUgIiouZ3JhZGxlIiBcKSAtZXhlYyBzZWQgLWkgInN8QVBQX1BBQ0tBR0VfSUR8JHtQQUNLQUdFX0lEX0VTQ318ZyIge30gKwoKICAgICAgLSBuYW1lOiBHZW5lcmF0ZSBhcHAgaWNvbnMKICAgICAgICB3b3JraW5nLWRpcmVjdG9yeTogYW5kcm9pZC10ZW1wbGF0ZQogICAgICAgIHJ1bjogfAogICAgICAgICAgc2V0IC1lCiAgICAgICAgICBzdWRvIGFwdC1nZXQgdXBkYXRlIC1xcSAmJiBzdWRvIGFwdC1nZXQgaW5zdGFsbCAteSAtcXEgaW1hZ2VtYWdpY2sKICAgICAgICAgIAogICAgICAgICAgIyBDaGVjayBpZiBjdXN0b20gaWNvbiB3YXMgdXBsb2FkZWQgdG8gdGhlIHJlcG8KICAgICAgICAgIGlmIFsgLWYgImN1c3RvbV9pY29uLnBuZyIgXTsgdGhlbgogICAgICAgICAgICBlY2hvICLinIUgVXNpbmcgY3VzdG9tIGljb24gZnJvbSBjdXN0b21faWNvbi5wbmciCiAgICAgICAgICAgIGZvciBkZW5zaXR5IGluIG1kcGkgaGRwaSB4aGRwaSB4eGhkcGkgeHh4aGRwaTsgZG8KICAgICAgICAgICAgICBjYXNlICRkZW5zaXR5IGluCiAgICAgICAgICAgICAgICBtZHBpKSBTSVpFPTQ4IDs7CiAgICAgICAgICAgICAgICBoZHBpKSBTSVpFPTcyIDs7CiAgICAgICAgICAgICAgICB4aGRwaSkgU0laRT05NiA7OwogICAgICAgICAgICAgICAgeHhoZHBpKSBTSVpFPTE0NCA7OwogICAgICAgICAgICAgICAgeHh4aGRwaSkgU0laRT0xOTIgOzsKICAgICAgICAgICAgICBlc2FjCiAgICAgICAgICAgICAgRElSPSJhcHAvc3JjL21haW4vcmVzL21pcG1hcC0ke2RlbnNpdHl9IgogICAgICAgICAgICAgIG1rZGlyIC1wICIkRElSIgogICAgICAgICAgICAgIGNvbnZlcnQgImN1c3RvbV9pY29uLnBuZyIgLXJlc2l6ZSAiJHtTSVpFfXgke1NJWkV9ISIgIiR7RElSfS9pY19sYXVuY2hlci5wbmciCiAgICAgICAgICAgIGRvbmUKICAgICAgICAgIGVsc2UKICAgICAgICAgICAgZWNobyAi4oS577iPIE5vIGN1c3RvbSBpY29uIGZvdW5kLCBnZW5lcmF0aW5nIGxldHRlci1iYXNlZCBpY29uIgogICAgICAgICAgICBDT0xPUj0iJHt7IGlucHV0cy5hcHBfY29sb3IgfX0iCiAgICAgICAgICAgIE5BTUU9IiR7eyBpbnB1dHMuYXBwX25hbWUgfX0iCiAgICAgICAgICAgIExFVFRFUj0kKGVjaG8gIiROQU1FIiB8IGhlYWQgLWMgMSB8IHRyICdbOmxvd2VyOl0nICdbOnVwcGVyOl0nKQogICAgICAgICAgICAKICAgICAgICAgICAgaWYgWyAteiAiJExFVFRFUiIgXSB8fCAhIGVjaG8gIiRMRVRURVIiIHwgZ3JlcCAtcUUgJ15bQS1aYS16MC05XSQnOyB0aGVuCiAgICAgICAgICAgICAgTEVUVEVSPSJBIgogICAgICAgICAgICBmaQoKICAgICAgICAgICAgZm9yIGRlbnNpdHkgaW4gbWRwaSBoZHBpIHhoZHBpIHh4aGRwaSB4eHhoZHBpOyBkbwogICAgICAgICAgICAgIGNhc2UgJGRlbnNpdHkgaW4KICAgICAgICAgICAgICAgIG1kcGkpIFNJWkU9NDggOzsKICAgICAgICAgICAgICAgIGhkcGkpIFNJWkU9NzIgOzsKICAgICAgICAgICAgICAgIHhoZHBpKSBTSVpFPTk2IDs7CiAgICAgICAgICAgICAgICB4eGhkcGkpIFNJWkU9MTQ0IDs7CiAgICAgICAgICAgICAgICB4eHhoZHBpKSBTSVpFPTE5MiA7OwogICAgICAgICAgICAgIGVzYWMKICAgICAgICAgICAgICBESVI9ImFwcC9zcmMvbWFpbi9yZXMvbWlwbWFwLSR7ZGVuc2l0eX0iCiAgICAgICAgICAgICAgbWtkaXIgLXAgIiRESVIiCiAgICAgICAgICAgICAgY29udmVydCAtc2l6ZSAiJHtTSVpFfXgke1NJWkV9IiB4YzoiJHtDT0xPUn0iIFwKICAgICAgICAgICAgICAgIC1ncmF2aXR5IGNlbnRlciAtcG9pbnRzaXplICQoKFNJWkUgKiA0NSAvIDEwMCkpIFwKICAgICAgICAgICAgICAgIC1maWxsIHdoaXRlIC1mb250IERlamFWdS1TYW5zLUJvbGQgLWFubm90YXRlIDAgIiR7TEVUVEVSfSIgXAogICAgICAgICAgICAgICAgIiR7RElSfS9pY19sYXVuY2hlci5wbmciCiAgICAgICAgICAgIGRvbmUKICAgICAgICAgIGZpCgogICAgICAtIG5hbWU6IEJ1aWxkIGRlYnVnIEFQSwogICAgICAgIHdvcmtpbmctZGlyZWN0b3J5OiBhbmRyb2lkLXRlbXBsYXRlCiAgICAgICAgcnVuOiB8CiAgICAgICAgICBzZXQgLWUKICAgICAgICAgIGdyYWRsZSBhc3NlbWJsZURlYnVnIC0tbm8tZGFlbW9uIC0tc3RhY2t0cmFjZSAtLWluZm8KCiAgICAgIC0gbmFtZTogUmVuYW1lIGFuZCBwcmVwYXJlIEFQSwogICAgICAgIHJ1bjogfAogICAgICAgICAgc2V0IC1lCiAgICAgICAgICBBUFBfTkFNRT0iJHt7IGlucHV0cy5hcHBfbmFtZSB9fSIKICAgICAgICAgIFNBRkVfTkFNRT0kKGVjaG8gIiRBUFBfTkFNRSIgfCB0ciAnICcgJy0nIHwgdHIgLWNkICdbOmFsbnVtOl0tJyB8IGhlYWQgLWMgNTApCiAgICAgICAgICBbIC16ICIkU0FGRV9OQU1FIiBdICYmIFNBRkVfTkFNRT0iYXBwIgogICAgICAgICAgQVBLX1BBVEg9JChmaW5kIGFuZHJvaWQtdGVtcGxhdGUvYXBwL2J1aWxkL291dHB1dHMvYXBrL2RlYnVnIC1uYW1lICIqLmFwayIgfCBoZWFkIC0xKQogICAgICAgICAgaWYgWyAteiAiJEFQS19QQVRIIiBdOyB0aGVuCiAgICAgICAgICAgIGVjaG8gIkVSUk9SOiBBUEsgbm90IGZvdW5kISIKICAgICAgICAgICAgZXhpdCAxCiAgICAgICAgICBmaQogICAgICAgICAgY3AgIiRBUEtfUEFUSCIgImFuZHJvaWQtdGVtcGxhdGUvJHtTQUZFX05BTUV9LmFwayIKICAgICAgICAgIGVjaG8gIkFQS19GSUxFPSR7U0FGRV9OQU1FfS5hcGsiID4+ICRHSVRIVUJfRU5WCgogICAgICAtIG5hbWU6IFVwbG9hZCBBUEsgYXJ0aWZhY3QKICAgICAgICB1c2VzOiBhY3Rpb25zL3VwbG9hZC1hcnRpZmFjdEB2NAogICAgICAgIHdpdGg6CiAgICAgICAgICBuYW1lOiBuYXRpdmUtYXBrCiAgICAgICAgICBwYXRoOiBhbmRyb2lkLXRlbXBsYXRlLyR7eyBlbnYuQVBLX0ZJTEUgfX0KICAgICAgICAgIHJldGVudGlvbi1kYXlzOiA3Cg==";

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

async function uploadCustomIcon(base64Data: string, resolvedRepo: string, branch: string, token: string): Promise<boolean> {
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const filePath = "android-template/custom_icon.png";
  const apiUrl = `${GITHUB_API}/repos/${resolvedRepo}/contents/${filePath}`;
  let sha: string | undefined;
  try {
    const existResp = await fetch(`${apiUrl}?ref=${branch}`, { headers: getGitHubHeaders(token) });
    if (existResp.ok) {
      const existData = await existResp.json();
      sha = existData.sha;
    }
  } catch { /* file doesn't exist */ }
  const body: any = { message: "chore: add custom icon for APK build", content: cleanBase64, branch };
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

async function ensureBuildWorkflow(resolvedRepo: string, branch: string, token: string) {
  const apiUrl = `${GITHUB_API}/repos/${resolvedRepo}/contents/${BUILD_WORKFLOW_PATH}`;
  const existingResp = await fetch(`${apiUrl}?ref=${branch}`, { headers: getGitHubHeaders(token) });
  if (existingResp.ok) return { ready: true, created: false };

  if (existingResp.status !== 404) {
    return { ready: false, created: false, status: existingResp.status, details: await existingResp.text() };
  }

  const createResp = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "chore: add APK build workflow",
      content: EMBEDDED_BUILD_WORKFLOW_BASE64,
      branch,
    }),
  });

  if (!createResp.ok) {
    return { ready: false, created: false, status: createResp.status, details: await createResp.text() };
  }

  console.log("Build workflow uploaded successfully");
  return { ready: true, created: true };
}

async function dispatchBuildWorkflow(resolvedRepo: string, branch: string, token: string, inputs: Record<string, string>) {
  const dispatchResp = await fetch(
    `${GITHUB_API}/repos/${resolvedRepo}/actions/workflows/${BUILD_WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: branch, inputs }),
    }
  );

  if (dispatchResp.status !== 404) return dispatchResp;

  return fetch(`${GITHUB_API}/repos/${resolvedRepo}/actions/workflows/${encodeURIComponent(BUILD_WORKFLOW_PATH)}/dispatches`, {
    method: "POST",
    headers: { ...getGitHubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: branch, inputs }),
  });
}

async function fetchRunProgress(runId: string, resolvedRepo: string, githubToken: string) {
  try {
    const jobsResp = await fetch(
      `${GITHUB_API}/repos/${resolvedRepo}/actions/runs/${runId}/jobs?per_page=100`,
      { headers: getGitHubHeaders(githubToken) }
    );
    if (!jobsResp.ok) return null;

    const jobsData = await jobsResp.json();
    const jobs = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
    if (!jobs.length) {
      return { progress: 8, totalSteps: 0, completedSteps: 0, failedSteps: 0 };
    }

    let totalSteps = 0;
    let completedSteps = 0;
    let failedSteps = 0;

    for (const job of jobs) {
      const steps = Array.isArray(job.steps) && job.steps.length > 0 ? job.steps : [job];
      totalSteps += steps.length;
      completedSteps += steps.filter((step: any) => step.status === "completed").length;
      failedSteps += steps.filter((step: any) => step.conclusion === "failure").length;
    }

    const rawProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const progress = Math.max(8, Math.min(rawProgress, 99));

    return { progress, totalSteps, completedSteps, failedSteps };
  } catch {
    return null;
  }
}

// Status-only check: returns JSON, never binary
async function getRunStatus(runId: string, resolvedRepo: string, githubToken: string) {
  const runResp = await fetch(
    `${GITHUB_API}/repos/${resolvedRepo}/actions/runs/${runId}`,
    { headers: getGitHubHeaders(githubToken) }
  );
  if (!runResp.ok) {
    if (runResp.status === 404) {
      return { status: "queued", conclusion: null, message: "Build started, waiting for status...", progress: 8 };
    }
    return { status: "unknown", conclusion: null, message: "Failed to check status", progress: 0 };
  }

  const runData = await runResp.json();
  const progressInfo = await fetchRunProgress(runId, resolvedRepo, githubToken);

  if (runData.status !== "completed") {
    return {
      status: runData.status,
      conclusion: null,
      message: "Build in progress...",
      progress: progressInfo?.progress ?? (runData.status === "queued" ? 8 : 15),
      totalSteps: progressInfo?.totalSteps ?? null,
      completedSteps: progressInfo?.completedSteps ?? null,
      startedAt: runData.run_started_at || runData.created_at || null,
    };
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
          return {
            id: job.id,
            name: job.name,
            conclusion: job.conclusion,
            failedSteps: (job.steps || []).filter((s: any) => s.conclusion === "failure").map((s: any) => s.name),
            logSnippet,
          };
        }));
        failureDetails = enriched;
      }
    } catch {}

    return {
      status: "completed",
      conclusion: runData.conclusion,
      message: "Build failed",
      failureDetails,
      progress: 100,
      totalSteps: progressInfo?.totalSteps ?? null,
      completedSteps: progressInfo?.completedSteps ?? null,
      startedAt: runData.run_started_at || runData.created_at || null,
      completedAt: runData.updated_at || null,
    };
  }

  // Success!
  return {
    status: "completed",
    conclusion: "success",
    message: "Build completed!",
    downloadReady: true,
    progress: 100,
    totalSteps: progressInfo?.totalSteps ?? null,
    completedSteps: progressInfo?.completedSteps ?? null,
    startedAt: runData.run_started_at || runData.created_at || null,
    completedAt: runData.updated_at || null,
  };
}

// Download APK: fetches artifact from GitHub and returns binary
async function downloadApk(runId: string, resolvedRepo: string, githubToken: string, appName?: string) {
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
    return new Response(JSON.stringify({ error: "APK artifact not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const downloadResp = await fetch(apkArtifact.archive_download_url, { headers: getGitHubHeaders(githubToken) });
  if (!downloadResp.ok) {
    return new Response(JSON.stringify({ error: "Failed to download artifact" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const buffer = await (await downloadResp.blob()).arrayBuffer();
  const safeName = (appName || "app").replace(/[^a-zA-Z0-9-]/g, "-");
  try {
    const uint8 = new Uint8Array(buffer);
    const unzipped = unzipSync(uint8);
    const apkFileName = Object.keys(unzipped).find((name) => name.endsWith(".apk"));
    if (apkFileName) {
      console.log("Extracted APK:", apkFileName, "size:", unzipped[apkFileName].length);
      const apkData = unzipped[apkFileName];
      const apkBytes = new Uint8Array(apkData.length);
      apkBytes.set(apkData);
      return new Response(apkBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": `attachment; filename="${safeName}.apk"`,
        },
      });
    }
  } catch (e) {
    console.error("Failed to extract APK from zip:", e);
  }
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
      const download = url.searchParams.get("download");
      const appName = url.searchParams.get("appName");
      if (!runId) {
        return new Response(JSON.stringify({ error: "runId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      // If download=true, return binary APK
      if (download === "true") {
        return await downloadApk(runId, resolvedRepo, githubToken, appName || undefined);
      }
      // Otherwise return status JSON only
      const status = await getRunStatus(runId, resolvedRepo, githubToken);
      return new Response(JSON.stringify(status), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const payload = await req.json();
      const { runId, appUrl, appName, appColor, packageId, customIcon, download } = payload;

      if (runId && download) {
        return await downloadApk(String(runId), resolvedRepo, githubToken, appName);
      }

      if (runId) {
        const status = await getRunStatus(String(runId), resolvedRepo, githubToken);
        return new Response(JSON.stringify(status), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!appUrl || !appName) {
        return new Response(JSON.stringify({ error: "appUrl and appName are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const safePackageId = sanitizePackageId(packageId, appName);
      const repoResp = await fetch(`${GITHUB_API}/repos/${resolvedRepo}`, { headers: getGitHubHeaders(githubToken) });
      if (!repoResp.ok) {
        const errText = await repoResp.text();
        return new Response(JSON.stringify({ error: "Cannot access GitHub repo", details: errText }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const repoData = await repoResp.json();
      const defaultBranch = repoData.default_branch || "main";

      let hasCustomIcon = false;
      if (customIcon && typeof customIcon === "string" && customIcon.length > 100) {
        console.log("Uploading custom icon to repo...");
        hasCustomIcon = await uploadCustomIcon(customIcon, resolvedRepo, defaultBranch, githubToken);
        if (hasCustomIcon) await new Promise((r) => setTimeout(r, 2000));
      }

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

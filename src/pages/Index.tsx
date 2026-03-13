import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import {
  Globe,
  Smartphone,
  Loader2,
  Box,
  Sparkles,
  CheckCircle2,
  FileDown,
  ImagePlus,
  X,
  Timer,
  Download,
  Eye,
} from "lucide-react";

import { toast } from "sonner";
import { downloadAllFiles, type AppConfig } from "@/lib/generateFiles";

type BuildStatus = "idle" | "triggering" | "building" | "downloading" | "done" | "error";

type BuildStatusResponse = {
  status: string;
  conclusion: string | null;
  message?: string;
  downloadReady?: boolean;
  progress?: number;
  totalSteps?: number | null;
  completedSteps?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

type PersistedBuildSession = {
  runId: string;
  appName: string;
  startedAt: number;
  status: "triggering" | "building" | "downloading";
  progress?: number;
};

const BUILD_SESSION_STORAGE_KEY = "webtoapp-native-build-session-v1";

function toBrandName(raw: string): string {
  const cleaned = raw
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

  const words = cleaned.split(/\s+/).filter(Boolean);
  const compact = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
    .replace(/[^\p{L}\p{N}]/gu, "");

  return compact.slice(0, 14) || "MyApp";
}

function isNoisyLabel(label: string): boolean {
  if (!label) return true;
  const digits = (label.match(/\d/g) || []).length;
  const digitRatio = digits / label.length;
  const looksUuid = /^[a-f0-9-]{16,}$/i.test(label);
  return digitRatio > 0.35 || looksUuid || label.length > 24;
}

function extractAppName(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const parts = host.split(".").filter(Boolean);
    if (!parts.length) return "MyApp";

    if (host.endsWith("lovable.app") && parts.length >= 3) {
      const subdomain = parts[0].replace(/^id-preview--/i, "").replace(/--/g, "-");
      if (!isNoisyLabel(subdomain)) return toBrandName(subdomain);
    }

    const commonSecondLevel = new Set(["co", "com", "net", "org", "gov", "edu", "ac"]);
    const genericLabels = new Set(["www", "m", "app", "web", "site", "online", "store", "shop", "lovable", "preview", "id"]);
    const platformDomains = new Set(["vercel.app", "netlify.app", "github.io", "lovable.app"]);

    const domainTail = parts.length >= 2 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : "";

    let baseLabel = parts[Math.max(parts.length - 2, 0)] || parts[0];

    if (platformDomains.has(domainTail) && parts.length >= 3) {
      baseLabel = parts[0];
    } else if (
      parts.length >= 3 &&
      commonSecondLevel.has(parts[parts.length - 2]) &&
      parts[parts.length - 1].length === 2
    ) {
      baseLabel = parts[parts.length - 3];
    }

    const picked =
      [baseLabel, ...parts].find(
        (label) => !genericLabels.has(label) && !isNoisyLabel(label) && /[\p{L}\p{N}]/u.test(label)
      ) || baseLabel;

    return toBrandName(picked);
  } catch {
    return "MyApp";
  }
}

function extractThemeColor(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    let hash = 0;
    for (let i = 0; i < host.length; i++) {
      hash = host.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 45%)`;
  } catch {
    return "#22c55e";
  }
}

function hslToHex(hsl: string): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return hsl;
  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;
  const a2 = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const color = l - a2 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function sanitizeAppUrl(raw: string): string {
  try {
    const parsed = new URL(raw.trim());
    parsed.searchParams.delete("__lovable_token");
    return parsed.toString();
  } catch {
    return raw;
  }
}

function hasPreviewToken(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    return parsed.searchParams.has("__lovable_token");
  } catch {
    return false;
  }
}

const Index = () => {
  const [url, setUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [appColor, setAppColor] = useState("#22c55e");

  const [isReady, setIsReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  const [nativeBuildStatus, setNativeBuildStatus] = useState<BuildStatus>("idle");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const downloadingRef = useRef(false);

  const [buildStartTime, setBuildStartTime] = useState<number | null>(null);
  const [buildElapsed, setBuildElapsed] = useState(0);
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildCompletedAt, setBuildCompletedAt] = useState<number | null>(null);
  const [buildTotalSteps, setBuildTotalSteps] = useState<number | null>(null);
  const [buildCompletedSteps, setBuildCompletedSteps] = useState<number | null>(null);

  const isBuildInProgress =
    nativeBuildStatus === "triggering" ||
    nativeBuildStatus === "building" ||
    nativeBuildStatus === "downloading";

  const normalizedUrl = sanitizeAppUrl(url);

  const isValidUrl = useCallback((u: string) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, []);

  const persistBuildSession = useCallback((session: PersistedBuildSession) => {
    localStorage.setItem(BUILD_SESSION_STORAGE_KEY, JSON.stringify(session));
  }, []);

  const clearBuildSession = useCallback(() => {
    localStorage.removeItem(BUILD_SESSION_STORAGE_KEY);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const downloadBuiltApk = useCallback(
    async (runId: string, fileLabel: string) => {
      if (downloadingRef.current) return;
      downloadingRef.current = true;
      setNativeBuildStatus("downloading");
      setBuildProgress(99);
      persistBuildSession({
        runId,
        appName: fileLabel,
        startedAt: buildStartTime ?? Date.now(),
        status: "downloading",
        progress: 99,
      });

      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      try {
        const dlResp = await fetch(
          `${backendUrl}/functions/v1/build-native-apk?runId=${runId}&download=true&appName=${encodeURIComponent(fileLabel)}`,
          {
            headers: {
              apikey: publishableKey,
              Authorization: `Bearer ${publishableKey}`,
            },
          }
        );

        if (!dlResp.ok) throw new Error("Download failed");

        const blob = await dlResp.blob();
        const ct = dlResp.headers.get("content-type") || "";
        const ext = ct.includes("android") ? ".apk" : ".zip";
        const dlUrl = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = `${fileLabel.replace(/\s/g, "-") || "app"}${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(dlUrl), 3000);

        stopPolling();
        clearBuildSession();
        setBuildProgress(100);
        setBuildCompletedAt((prev) => prev ?? Date.now());
        setNativeBuildStatus("done");
        toast.success("✅ اكتمل البناء وتم تنزيل التطبيق مباشرة");
      } catch (error) {
        console.error("Download error:", error);
        setBuildProgress(100);
        setNativeBuildStatus("error");
        toast.error("اكتمل البناء لكن فشل التنزيل المباشر. جرّب مرة ثانية.");
      } finally {
        downloadingRef.current = false;
      }
    },
    [buildStartTime, clearBuildSession, persistBuildSession, stopPolling]
  );

  const startPollingBuild = useCallback(
    (runId: string, fileLabel: string, startedAt: number) => {
      stopPolling();
      setActiveRunId(runId);
      setBuildStartTime(startedAt);

      const backendUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const checkStatus = async () => {
        try {
          const sr = await fetch(`${backendUrl}/functions/v1/build-native-apk?runId=${runId}`, {
            headers: {
              apikey: publishableKey,
              Authorization: `Bearer ${publishableKey}`,
            },
          });

          if (!sr.ok) return;
          const sd = (await sr.json()) as BuildStatusResponse;

          const serverProgress =
            typeof sd.progress === "number" ? Math.max(0, Math.min(100, Math.round(sd.progress))) : null;
          if (serverProgress !== null) setBuildProgress(serverProgress);
          if (typeof sd.totalSteps === "number") setBuildTotalSteps(sd.totalSteps);
          if (typeof sd.completedSteps === "number") setBuildCompletedSteps(sd.completedSteps);

          if (sd.startedAt) {
            const serverStartedAt = Date.parse(sd.startedAt);
            if (Number.isFinite(serverStartedAt) && serverStartedAt > 0) {
              setBuildStartTime(serverStartedAt);
              setBuildElapsed(Math.floor((Date.now() - serverStartedAt) / 1000));
            }
          }

          if (sd.status === "completed" && sd.conclusion === "success" && sd.downloadReady) {
            setBuildProgress(100);
            if (sd.completedAt) {
              const completedTs = Date.parse(sd.completedAt);
              if (Number.isFinite(completedTs) && completedTs > 0) setBuildCompletedAt(completedTs);
            }
            await downloadBuiltApk(runId, fileLabel);
            return;
          }

          if (sd.status === "completed" && sd.conclusion && sd.conclusion !== "success") {
            stopPolling();
            clearBuildSession();
            setBuildProgress(100);
            if (sd.completedAt) {
              const completedTs = Date.parse(sd.completedAt);
              if (Number.isFinite(completedTs) && completedTs > 0) setBuildCompletedAt(completedTs);
            }
            setNativeBuildStatus("error");
            toast.error("فشل بناء التطبيق.");
            return;
          }

          if (["queued", "in_progress", "requested", "waiting", "pending"].includes(sd.status)) {
            setNativeBuildStatus("building");
            persistBuildSession({
              runId,
              appName: fileLabel,
              startedAt,
              status: "building",
              progress: serverProgress ?? 10,
            });
          }
        } catch {
          // keep polling silently
        }
      };

      void checkStatus();
      pollTimerRef.current = setInterval(() => {
        void checkStatus();
      }, 8000);
    },
    [clearBuildSession, downloadBuiltApk, persistBuildSession, stopPolling]
  );

  useEffect(() => {
    if (isValidUrl(normalizedUrl)) {
      const name = extractAppName(normalizedUrl);
      setAppName(name);
      const color = extractThemeColor(normalizedUrl);
      setAppColor(hslToHex(color));
      setIsReady(true);
    } else {
      setIsReady(false);
      setShowPreview(false);
    }
  }, [normalizedUrl, isValidUrl]);

  // Restore ongoing build if user closes page and returns
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BUILD_SESSION_STORAGE_KEY);
      if (!raw) return;

      const session = JSON.parse(raw) as PersistedBuildSession;
      if (!session?.runId || !session?.startedAt) return;

      setBuildStartTime(session.startedAt);
      setBuildElapsed(Math.floor((Date.now() - session.startedAt) / 1000));
      setNativeBuildStatus(session.status === "triggering" ? "building" : session.status);
      setActiveRunId(session.runId);

      toast.info("🔄 تم استئناف متابعة البناء تلقائيًا");
      startPollingBuild(session.runId, session.appName || "app", session.startedAt);
    } catch {
      clearBuildSession();
    }
  }, [clearBuildSession, startPollingBuild]);

  useEffect(() => {
    if (buildStartTime && isBuildInProgress) {
      const timer = setInterval(() => {
        setBuildElapsed(Math.floor((Date.now() - buildStartTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [buildStartTime, isBuildInProgress]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const config: AppConfig = { url: normalizedUrl, appName, appColor };

  const handleIconUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يرجى اختيار ملف صورة");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setCustomIcon(ev.target?.result as string);
      toast.success("تم تحميل الأيقونة ✅");
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPWA = () => {
    downloadAllFiles(config);
    toast.success("تم تحميل ملفات PWA! 📦");
  };

  const handleNativeBuild = async () => {
    if (!isValidUrl(normalizedUrl)) {
      toast.error("أدخل رابط صحيح أولاً");
      return;
    }

    if (hasPreviewToken(url)) {
      toast.error("استخدم رابط منشور نهائي.");
      return;
    }

    stopPolling();
    clearBuildSession();
    setActiveRunId(null);
    downloadingRef.current = false;
    const startedAt = Date.now();
    setBuildStartTime(startedAt);
    setBuildElapsed(0);
    setNativeBuildStatus("triggering");

    const backendUrl = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      const resp = await fetch(`${backendUrl}/functions/v1/build-native-apk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
        },
        body: JSON.stringify({
          appUrl: config.url,
          appName: config.appName,
          appColor: config.appColor,
          customIcon: customIcon || undefined,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || data.details || "فشل بدء البناء");

      const runId = data.runId;
      if (!runId) throw new Error("لم يتم العثور على معرّف البناء");

      setNativeBuildStatus("building");
      setActiveRunId(runId);
      persistBuildSession({
        runId,
        appName: config.appName || "app",
        startedAt,
        status: "building",
      });

      toast.info("⚙️ بدء البناء بنجاح، سيتم التنزيل فور الاكتمال");
      startPollingBuild(runId, config.appName || "app", startedAt);
    } catch (err: any) {
      console.error("Native build error:", err);
      clearBuildSession();
      setNativeBuildStatus("error");
      toast.error(err?.message || "فشل بدء البناء");
    }
  };

  const handleRetryDownload = async () => {
    if (!activeRunId) return;
    await downloadBuiltApk(activeRunId, appName || "app");
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const estimatedSeconds = 240;
  const progress =
    nativeBuildStatus === "done"
      ? 100
      : Math.min(Math.round((buildElapsed / estimatedSeconds) * 100), nativeBuildStatus === "downloading" ? 99 : 95);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <header className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-3 shadow-md sticky top-0 z-30">
        <div className="w-9 h-9 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">WebToApp</h1>
          <p className="text-[11px] opacity-80">حوّل أي موقع لتطبيق أندرويد</p>
        </div>
        <div className="flex items-center gap-1 bg-primary-foreground/15 px-2.5 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium">تلقائي</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        <div className="bg-card rounded-2xl border border-border p-4 shadow-soft space-y-3">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            رابط الموقع
          </label>
          <div className="relative">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              dir="ltr"
              className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all font-mono text-sm"
            />
            {isReady && (
              <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-in fade-in" />
            )}
          </div>
        </div>

        {isReady && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-soft space-y-3 animate-in slide-in-from-top-2 duration-300">
            <p className="text-xs font-semibold text-muted-foreground">⚙️ إعدادات التطبيق</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">اسم التطبيق</span>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full bg-secondary/60 text-foreground font-semibold text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>

              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">لون التطبيق</span>
                <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2">
                  <input
                    type="color"
                    value={appColor}
                    onChange={(e) => setAppColor(e.target.value)}
                    className="w-7 h-7 rounded border-none cursor-pointer bg-transparent"
                  />
                  <span className="text-xs font-mono text-muted-foreground">{appColor}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">أيقونة التطبيق</span>
              <input
                ref={iconInputRef}
                type="file"
                accept="image/*"
                onChange={handleIconUpload}
                className="hidden"
              />

              {customIcon ? (
                <div className="flex items-center gap-3 bg-secondary/60 rounded-lg px-3 py-2">
                  <img src={customIcon} alt="أيقونة التطبيق" className="w-10 h-10 rounded-xl object-cover shadow-sm" loading="lazy" />
                  <span className="text-xs text-foreground flex-1">تم رفع الأيقونة</span>
                  <button
                    onClick={() => setCustomIcon(null)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => iconInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-secondary/60 rounded-lg px-3 py-3 text-sm text-primary font-semibold hover:bg-secondary transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  رفع أيقونة مخصصة
                </button>
              )}
            </div>
          </div>
        )}

        {nativeBuildStatus !== "idle" && nativeBuildStatus !== "done" && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-soft space-y-3 animate-in fade-in">
            <div className="flex items-center gap-3">
              {(nativeBuildStatus === "triggering" || nativeBuildStatus === "building") && (
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                </div>
              )}
              {nativeBuildStatus === "downloading" && (
                <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                  <Download className="w-5 h-5 text-primary animate-bounce" />
                </div>
              )}
              {nativeBuildStatus === "error" && (
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-destructive" />
                </div>
              )}

              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {nativeBuildStatus === "triggering" && "جاري بدء البناء..."}
                  {nativeBuildStatus === "building" && "جاري بناء التطبيق..."}
                  {nativeBuildStatus === "downloading" && "اكتمل البناء... جاري التنزيل المباشر"}
                  {nativeBuildStatus === "error" && "حصل خطأ في البناء أو التنزيل"}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" />
                  <span className="font-mono">{formatTime(buildElapsed)}</span>
                  {isBuildInProgress && <span>• يستمر تلقائياً حتى لو خرجت من الصفحة</span>}
                </div>
              </div>
            </div>

            {(nativeBuildStatus === "triggering" || nativeBuildStatus === "building" || nativeBuildStatus === "downloading") && (
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-1000 ease-out" style={{ width: `${progress}%` }} />
              </div>
            )}

            {nativeBuildStatus === "error" && activeRunId && (
              <button
                onClick={handleRetryDownload}
                className="w-full py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:bg-secondary/80 transition-colors"
              >
                إعادة محاولة التنزيل
              </button>
            )}
          </div>
        )}

        {nativeBuildStatus === "done" && (
          <div className="bg-accent rounded-2xl border border-primary/20 p-4 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-accent-foreground">تم تنزيل التطبيق بنجاح ✅</p>
                <p className="text-xs text-muted-foreground">الوقت الكلي: {formatTime(buildElapsed)}</p>
              </div>
            </div>
          </div>
        )}

        {isReady && (
          <div className="space-y-3 animate-in slide-in-from-bottom-3 duration-400">
            <button
              onClick={handleNativeBuild}
              disabled={isBuildInProgress}
              className="w-full py-4 rounded-2xl gradient-main text-primary-foreground font-bold text-base shadow-glow hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2.5 active:scale-[0.98]"
            >
              {isBuildInProgress ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري البناء... {formatTime(buildElapsed)}
                </>
              ) : (
                <>
                  <Box className="w-5 h-5" />
                  بناء تطبيق APK
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleDownloadPWA}
                className="w-full py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-secondary/60 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <FileDown className="w-4 h-4 text-primary" />
                ملفات PWA
              </button>

              <button
                onClick={() => setShowPreview((prev) => !prev)}
                className="w-full py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-secondary/60 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <Eye className="w-4 h-4 text-primary" />
                {showPreview ? "إخفاء المعاينة" : "معاينة التطبيق"}
              </button>
            </div>
          </div>
        )}

        {isReady && showPreview && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-soft space-y-3 animate-in fade-in">
            <p className="text-xs font-semibold text-muted-foreground">📱 معاينة التطبيق (بدون زوم)</p>

            <div className="flex justify-center overflow-x-auto">
              <div className="relative shrink-0 w-[320px] h-[568px]">
                <div className="w-full h-full rounded-[2.5rem] border-[6px] border-foreground/80 bg-foreground overflow-hidden shadow-xl relative">
                  <div
                    className="h-7 px-3 flex items-center justify-between text-[10px] font-semibold text-primary-foreground relative z-10"
                    style={{ backgroundColor: appColor }}
                  >
                    <span className="truncate">{appName}</span>
                    {customIcon ? (
                      <img src={customIcon} alt="أيقونة التطبيق" className="w-4 h-4 rounded object-cover" loading="lazy" />
                    ) : (
                      <Smartphone className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground/80 rounded-b-2xl z-20" />

                  <div className="w-full overflow-hidden relative bg-card" style={{ height: "calc(100% - 28px)" }}>
                    <iframe
                      src={normalizedUrl}
                      title="معاينة التطبيق"
                      sandbox="allow-scripts allow-same-origin allow-popups"
                      loading="lazy"
                      className="w-full h-full border-none block"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isReady && (
          <div className="bg-accent/40 border border-primary/10 rounded-xl p-3.5 text-xs text-muted-foreground space-y-1.5 animate-in fade-in">
            <p className="font-semibold text-accent-foreground">💡 ملاحظة:</p>
            <p>• اللون الذي تختاره يُستخدم في شاشة فتح التطبيق أثناء التشغيل.</p>
            <p>• الأيقونة التي ترفعها تُستخدم كأيقونة التطبيق على الجهاز.</p>
            <p>• البناء يستمر في الخلفية ويمكن استئناف حالته عند الرجوع.</p>
          </div>
        )}
      </main>

      <footer className="bg-card border-t border-border px-4 py-3 text-center">
        <p className="text-[11px] text-muted-foreground">WebToApp — حوّل أي موقع لتطبيق بسهولة</p>
      </footer>
    </div>
  );
};

export default Index;

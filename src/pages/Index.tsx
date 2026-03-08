import { useState, useEffect, useCallback, useRef } from "react";
import {
  Globe,
  Smartphone,
  Loader2,
  Box,
  Sparkles,
  CheckCircle2,
  FileDown,
  Eye,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateManifest,
  generateServiceWorker,
  generateIndexHtml,
  downloadAllFiles,
  type AppConfig,
} from "@/lib/generateFiles";


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

    const picked = [baseLabel, ...parts].find(
      (label) => !genericLabels.has(label) && !isNoisyLabel(label) && /[\p{L}\p{N}]/u.test(label)
    ) || baseLabel;

    return toBrandName(picked);
  } catch {
    return "MyApp";
  }
}

function extractThemeColor(url: string): string {
  // Generate a consistent color from URL
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
    return Math.round(255 * color).toString(16).padStart(2, "0");
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
  const [isGeneratingApk, setIsGeneratingApk] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [nativeBuildStatus, setNativeBuildStatus] = useState<string | null>(null); // null, "triggering", "building", "downloading", "done", "error"
  const [nativeBuildRunId, setNativeBuildRunId] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isValidUrl = useCallback((u: string) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, []);

  const normalizedUrl = sanitizeAppUrl(url);

  // Auto-extract app name and color when URL changes
  useEffect(() => {
    if (isValidUrl(normalizedUrl)) {
      const name = extractAppName(normalizedUrl);
      setAppName(name);
      const color = extractThemeColor(normalizedUrl);
      setAppColor(hslToHex(color));
      setIsReady(true);
    } else {
      setIsReady(false);
    }
  }, [normalizedUrl, isValidUrl]);

  const config: AppConfig = { url: normalizedUrl, appName, appColor };

  const handleDownloadPWA = () => {
    downloadAllFiles(config);
    toast.success("تم تحميل ملفات PWA! 📦");
  };

  const handleGenerateApk = async () => {
    if (hasPreviewToken(url)) {
      toast.error("احذف __lovable_token من الرابط أو استخدم رابط منشور نهائي للتطبيق.");
      return;
    }

    setIsGeneratingApk(true);
    toast.info("جاري توليد التطبيق... قد يستغرق دقيقة");
    try {
      // Call edge function directly via fetch for proper binary handling
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-apk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          url: config.url,
          appName: config.appName,
          appColor: config.appColor,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
      }

      const blob = await response.blob();
      const safeName = config.appName.replace(/\s/g, "-") || "app";
      const contentType = response.headers.get("content-type") || blob.type;
      const disposition = response.headers.get("content-disposition") || "";
      const headerName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const isApk = contentType.includes("android") || (headerName?.endsWith(".apk") ?? false);
      const ext = isApk ? "apk" : "zip";
      const filename = headerName || `${safeName}.${ext}`;

      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
      toast.success("تم تنزيل التطبيق مباشرة ✅");
    } catch (err: any) {
      console.error("APK generation error:", err);
      const message = typeof err?.message === "string" && err.message.length < 160
        ? err.message
        : "فشل توليد APK حالياً. جرّب رابط موقع آخر أو أعد المحاولة خلال دقيقة.";
      toast.error(message);
    } finally {
      setIsGeneratingApk(false);
    }
  };
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const handleNativeBuild = async () => {
    if (hasPreviewToken(url)) {
      toast.error("استخدم رابط منشور نهائي للتطبيق.");
      return;
    }

    setNativeBuildStatus("triggering");
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/build-native-apk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          appUrl: config.url,
          appName: config.appName,
          appColor: config.appColor,
        }),
      });

      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || data.details || "فشل بدء البناء");
      }

      const runId = data.runId;
      if (!runId) {
        throw new Error("لم يتم العثور على معرّف البناء");
      }

      setNativeBuildRunId(runId);
      setNativeBuildStatus("building");
      toast.info("⚙️ بدأ بناء التطبيق الأصلي... يستغرق ٣-٥ دقائق");

      // Start polling
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusResp = await fetch(
            `${supabaseUrl}/functions/v1/build-native-apk?runId=${runId}`,
            {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
              },
            }
          );

          if (!statusResp.ok) return;

          const contentType = statusResp.headers.get("content-type") || "";

          // If it's a ZIP (artifact download), save it
          if (contentType.includes("zip") || contentType.includes("octet")) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setNativeBuildStatus("downloading");

            const blob = await statusResp.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = `${config.appName.replace(/\s/g, "-") || "app"}-native.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);

            setNativeBuildStatus("done");
            toast.success("✅ تم تحميل التطبيق الأصلي! فك الضغط وثبّت APK");
            return;
          }

          const statusData = await statusResp.json();

          if (statusData.status === "completed" && statusData.conclusion === "success") {
            // Artifact should have been returned as binary, but if JSON returned, try again
            return;
          }

          if (statusData.status === "completed" && statusData.conclusion !== "success") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setNativeBuildStatus("error");
            toast.error("فشل بناء التطبيق. جرّب مرة أخرى.");
          }
        } catch {
          // Continue polling
        }
      }, 12000);
    } catch (err: any) {
      console.error("Native build error:", err);
      setNativeBuildStatus("error");
      toast.error(err?.message || "فشل بدء البناء");
    }
  };


    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-main flex items-center justify-center shadow-glow">
              <Smartphone className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">WebToApp</h1>
          </div>
          <span className="text-xs text-muted-foreground bg-secondary px-3 py-1 rounded-full">
            أدخل الرابط واحصل على تطبيقك
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Hero - compact */}
        <div className="text-center space-y-3 py-4">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-foreground bg-accent px-3 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            سريع وتلقائي
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
            حوّل أي موقع لـ
            <span className="bg-clip-text text-transparent bg-gradient-to-l from-primary to-[hsl(170,60%,45%)]">
              {" "}تطبيق جوال
            </span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            الصق رابط الموقع وسنجهز لك كل شي تلقائياً
          </p>
        </div>

        {/* URL Input - the main action */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-soft space-y-4">
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
              className="w-full px-4 py-3.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all font-mono text-sm pl-4 pr-12"
            />
            {isReady && (
              <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary animate-in fade-in" />
            )}
          </div>

          {/* Auto-detected info */}
          {isReady && (
            <div className="flex flex-wrap items-center gap-3 animate-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">الاسم:</span>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="bg-transparent text-foreground font-semibold w-24 focus:outline-none border-b border-transparent focus:border-primary/40"
                />
              </div>
              <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">اللون:</span>
                <input
                  type="color"
                  value={appColor}
                  onChange={(e) => setAppColor(e.target.value)}
                  className="w-6 h-6 rounded border border-input cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action buttons - appear when URL is valid */}
        {isReady && (
          <div className="space-y-3 animate-in slide-in-from-bottom-3 duration-400">
            {/* Primary: APK */}
            <button
              onClick={handleGenerateApk}
              disabled={isGeneratingApk}
              className="w-full py-4 rounded-2xl gradient-main text-primary-foreground font-bold text-base shadow-glow hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2.5"
            >
              {isGeneratingApk ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري توليد APK...
                </>
              ) : (
                <>
                  <Box className="w-5 h-5" />
                  تحميل APK (أندرويد)
                </>
              )}
            </button>

            {/* Secondary row */}
            <div className="flex gap-3">
              <button
                onClick={handleDownloadPWA}
                className="flex-1 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-secondary/60 transition-all flex items-center justify-center gap-2"
              >
                <FileDown className="w-4 h-4" />
                ملفات PWA
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex-1 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-secondary/60 transition-all flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4" />
                معاينة التطبيق
              </button>
            </div>

            {/* WebView APK alternative */}
            <button
              onClick={() => {
                const webIntoAppUrl = `https://www.webintoapp.com/app-maker?url=${encodeURIComponent(normalizedUrl)}`;
                window.open(webIntoAppUrl, '_blank');
                toast.info("يفتح WebIntoApp - أداة مجانية تعطيك APK بدون شريط عنوان نهائياً");
              }}
              className="w-full py-3 rounded-xl bg-accent/60 border border-primary/20 text-accent-foreground font-semibold text-sm hover:bg-accent transition-all flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" />
              APK بدون شريط عنوان (WebIntoApp)
            </button>
          </div>
        )}

        {/* Mobile Preview */}
        {isReady && showPreview && (
          <div className="flex justify-center animate-in fade-in duration-300">
            <div className="relative">
              {/* Phone frame */}
              <div
                className="w-[280px] h-[560px] rounded-[2.5rem] border-[6px] border-foreground/80 bg-foreground/5 overflow-hidden shadow-xl relative"
              >
                {/* Status bar */}
                <div
                  className="h-7 flex items-center justify-center text-[10px] font-semibold text-primary-foreground"
                  style={{ backgroundColor: appColor }}
                >
                  {appName}
                </div>
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground/80 rounded-b-2xl" />
                {/* Content */}
                <iframe
                  src={url}
                  className="w-full border-none"
                  style={{ height: "calc(100% - 28px)" }}
                  title="معاينة التطبيق"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              </div>
            </div>
          </div>
        )}

        {/* Info note */}
        {isReady && (
          <div className="bg-accent/40 border border-primary/10 rounded-xl p-4 text-sm text-muted-foreground space-y-2 animate-in fade-in">
            <p className="font-semibold text-accent-foreground">💡 ملاحظة:</p>
            <p>• ملف <strong>APK</strong> يُثبّت مباشرة على أجهزة أندرويد.</p>
            <p>• ملفات <strong>PWA</strong> ترفعها على استضافتك ويتم تثبيت التطبيق من المتصفح.</p>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-12 py-5 text-center text-xs text-muted-foreground">
        WebToApp — حوّل أي موقع لتطبيق بسهولة
      </footer>
    </div>
  );
};

export default Index;

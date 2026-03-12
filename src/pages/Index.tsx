import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";

import { toast } from "sonner";
import {
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
    } else if (parts.length >= 3 && commonSecondLevel.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) {
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

  const [isReady, setIsReady] = useState(false);

  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [nativeBuildStatus, setNativeBuildStatus] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [buildStartTime, setBuildStartTime] = useState<number | null>(null);
  const [buildElapsed, setBuildElapsed] = useState(0);

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const isValidUrl = useCallback((u: string) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, []);

  const normalizedUrl = sanitizeAppUrl(url);

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

  // Timer for build elapsed
  useEffect(() => {
    if (buildStartTime && (nativeBuildStatus === "building" || nativeBuildStatus === "triggering")) {
      const timer = setInterval(() => {
        setBuildElapsed(Math.floor((Date.now() - buildStartTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [buildStartTime, nativeBuildStatus]);

  useEffect(() => {
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleNativeBuild = async () => {
    if (hasPreviewToken(url)) { toast.error("استخدم رابط منشور نهائي."); return; }
    setNativeBuildStatus("triggering");
    setBuildStartTime(Date.now());
    setBuildElapsed(0);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/build-native-apk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ appUrl: config.url, appName: config.appName, appColor: config.appColor, customIcon: customIcon || undefined }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || data.details || "فشل بدء البناء");
      const runId = data.runId;
      if (!runId) throw new Error("لم يتم العثور على معرّف البناء");
      setNativeBuildStatus("building");
      toast.info("⚙️ جاري بناء التطبيق... ٣-٥ دقائق");
      pollTimerRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`${supabaseUrl}/functions/v1/build-native-apk?runId=${runId}`, {
            headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          });
          if (!sr.ok) return;
          const sd = await sr.json();

          if (sd.status === "completed" && sd.conclusion === "success" && sd.downloadReady) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setNativeBuildStatus("downloading");
            toast.info("⬇️ جاري تحميل التطبيق...");
            try {
              const dlResp = await fetch(`${supabaseUrl}/functions/v1/build-native-apk?runId=${runId}&download=true&appName=${encodeURIComponent(config.appName)}`, {
                headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
              });
              if (!dlResp.ok) throw new Error("Download failed");
              const blob = await dlResp.blob();
              const ct = dlResp.headers.get("content-type") || "";
              const ext = ct.includes("android") ? ".apk" : ".zip";
              const dlUrl = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = dlUrl;
              a.download = `${config.appName.replace(/\s/g, "-") || "app"}${ext}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(dlUrl), 2000);
              setNativeBuildStatus("done");
              toast.success("✅ تم تحميل التطبيق بنجاح!");
            } catch (dlErr) {
              console.error("Download error:", dlErr);
              setNativeBuildStatus("error");
              toast.error("فشل تحميل الملف. حاول مرة أخرى.");
            }
            return;
          }

          if (sd.status === "completed" && sd.conclusion !== "success") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setNativeBuildStatus("error");
            toast.error("فشل بناء التطبيق.");
          }
        } catch { /* continue polling */ }
      }, 10000);
    } catch (err: any) {
      console.error("Native build error:", err);
      setNativeBuildStatus("error");
      toast.error(err?.message || "فشل بدء البناء");
    }
  };

  const ESTIMATED_TIME = 180;
  const progress = Math.min(Math.round((buildElapsed / ESTIMATED_TIME) * 100), 95);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Top bar - app style */}
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

      {/* Main content */}
      <main className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full">
        {/* URL Input Card */}
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

        {/* Settings - show when URL valid */}
        {isReady && (
          <div className="bg-card rounded-2xl border border-border p-4 shadow-soft space-y-3 animate-in slide-in-from-top-2 duration-300">
            <p className="text-xs font-semibold text-muted-foreground">⚙️ إعدادات التطبيق</p>
            <div className="grid grid-cols-2 gap-3">
              {/* App Name */}
              <div className="space-y-1">
                <span className="text-[11px] text-muted-foreground">اسم التطبيق</span>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full bg-secondary/60 text-foreground font-semibold text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              {/* App Color */}
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
            {/* Icon */}
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
                  <img src={customIcon} alt="أيقونة" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
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

        {/* Build Status Card - shows during/after build */}
        {nativeBuildStatus && nativeBuildStatus !== "done" && (
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
                  {nativeBuildStatus === "downloading" && "جاري تحميل الملف..."}
                  {nativeBuildStatus === "error" && "فشل البناء"}
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" />
                  <span className="font-mono">{formatTime(buildElapsed)}</span>
                  {(nativeBuildStatus === "building" || nativeBuildStatus === "triggering") && (
                    <span>• تقريباً ٣-٥ دقائق</span>
                  )}
                </div>
              </div>
            </div>
            {/* Progress bar */}
            {(nativeBuildStatus === "building" || nativeBuildStatus === "triggering") && (
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Build Done Card */}
        {nativeBuildStatus === "done" && (
          <div className="bg-accent rounded-2xl border border-primary/20 p-4 space-y-2 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-accent-foreground">تم التحميل بنجاح! ✅</p>
                <p className="text-xs text-muted-foreground">الوقت: {formatTime(buildElapsed)} • ثبّت الملف على جهازك</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {isReady && (
          <div className="space-y-3 animate-in slide-in-from-bottom-3 duration-400">
            {/* Main CTA - Build APK */}
            <button
              onClick={handleNativeBuild}
              disabled={nativeBuildStatus === "triggering" || nativeBuildStatus === "building" || nativeBuildStatus === "downloading"}
              className="w-full py-4 rounded-2xl gradient-main text-primary-foreground font-bold text-base shadow-glow hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2.5 active:scale-[0.98]"
            >
              {nativeBuildStatus === "building" || nativeBuildStatus === "triggering" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  جاري البناء... {formatTime(buildElapsed)}
                </>
              ) : nativeBuildStatus === "downloading" ? (
                <>
                  <Download className="w-5 h-5 animate-bounce" />
                  جاري التحميل...
                </>
              ) : (
                <>
                  <Box className="w-5 h-5" />
                  بناء تطبيق APK
                </>
              )}
            </button>

            {/* Secondary - PWA */}
            <button
              onClick={handleDownloadPWA}
              className="w-full py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm hover:bg-secondary/60 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <FileDown className="w-4 h-4 text-primary" />
              تحميل ملفات PWA
            </button>
          </div>
        )}

        {/* Info */}
        {isReady && (
          <div className="bg-accent/40 border border-primary/10 rounded-xl p-3.5 text-xs text-muted-foreground space-y-1.5 animate-in fade-in">
            <p className="font-semibold text-accent-foreground">💡 ملاحظة:</p>
            <p>• ملف APK يُثبّت مباشرة على أجهزة أندرويد</p>
            <p>• ملفات PWA ترفعها على استضافتك للتثبيت من المتصفح</p>
          </div>
        )}
      </main>

      {/* Bottom bar - app style */}
      <footer className="bg-card border-t border-border px-4 py-3 text-center">
        <p className="text-[11px] text-muted-foreground">WebToApp — حوّل أي موقع لتطبيق بسهولة</p>
      </footer>
    </div>
  );
};

export default Index;

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
  ZoomIn,
  ZoomOut,
  ImagePlus,
  X,
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
  
  const [isReady, setIsReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewScale, setPreviewScale] = useState(50);

  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [nativeBuildStatus, setNativeBuildStatus] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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


  useEffect(() => {
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  const handleNativeBuild = async () => {
    if (hasPreviewToken(url)) { toast.error("استخدم رابط منشور نهائي."); return; }
    setNativeBuildStatus("triggering");
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
      toast.info("⚙️ جاري بناء تطبيق أصلي بدون شريط عنوان... ٣-٥ دقائق");
      pollTimerRef.current = setInterval(async () => {
        try {
          // Status check only - returns JSON, never binary
          const sr = await fetch(`${supabaseUrl}/functions/v1/build-native-apk?runId=${runId}`, {
            headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          });
          if (!sr.ok) return;
          const sd = await sr.json();
          
          if (sd.status === "completed" && sd.conclusion === "success" && sd.downloadReady) {
            // Build done! Stop polling and start download
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
              toast.success("✅ تم تحميل التطبيق! ثبّته على جهازك");
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

  return (
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
              {/* App Icon Upload */}
              <div className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-2 text-sm">
                <span className="text-muted-foreground">الأيقونة:</span>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconUpload}
                  className="hidden"
                />
                {customIcon ? (
                  <div className="flex items-center gap-1.5">
                    <img src={customIcon} alt="أيقونة" className="w-6 h-6 rounded object-cover" />
                    <button
                      onClick={() => setCustomIcon(null)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => iconInputRef.current?.click()}
                    className="flex items-center gap-1 text-primary hover:text-primary/80 font-semibold transition-colors"
                  >
                    <ImagePlus className="w-4 h-4" />
                    تحميل
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons - appear when URL is valid */}
        {isReady && (
          <div className="space-y-3 animate-in slide-in-from-bottom-3 duration-400">
            {/* Native APK - بدون شريط عنوان */}
            <button
              onClick={handleNativeBuild}
              disabled={nativeBuildStatus === "triggering" || nativeBuildStatus === "building"}
              className="w-full py-4 rounded-2xl gradient-main text-primary-foreground font-bold text-base shadow-glow hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2.5"
            >
              {nativeBuildStatus === "triggering" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري بدء البناء...</>
              ) : nativeBuildStatus === "building" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري البناء... (٣-٥ دقائق)</>
              ) : nativeBuildStatus === "downloading" ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> جاري التحميل...</>
              ) : nativeBuildStatus === "done" ? (
                <><CheckCircle2 className="w-5 h-5" /> تم التحميل! ✅</>
              ) : (
                <><Box className="w-5 h-5" /> تحميل APK (أندرويد)</>
              )}
            </button>

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
          </div>
        )}

        {/* Mobile Preview */}
        {isReady && showPreview && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Zoom Preset Buttons */}
            <div className="flex items-center justify-center gap-3 bg-card rounded-xl border border-border p-3">
              <ZoomOut className="w-4 h-4 text-muted-foreground" />
              {[25, 50].map((val) => (
                <button
                  key={val}
                  onClick={() => setPreviewScale(val)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    previewScale === val
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {val}%
                </button>
              ))}
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="flex justify-center overflow-auto max-h-[80vh]">
              <div
                className="relative shrink-0"
                style={{ width: "320px", height: "568px" }}
              >
                {/* Phone frame - fixed size */}
                <div className="w-full h-full rounded-[2.5rem] border-[6px] border-foreground/80 bg-black overflow-hidden shadow-xl relative">
                  {/* Status bar */}
                  <div
                    className="h-7 flex items-center justify-center text-[10px] font-semibold text-primary-foreground relative z-10"
                    style={{ backgroundColor: appColor }}
                  >
                    {appName}
                  </div>
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-foreground/80 rounded-b-2xl z-20" />
                  {/* Content area - website zooms inside this fixed container */}
                  <div
                    className="w-full overflow-hidden relative bg-white"
                    style={{ height: "calc(100% - 28px)" }}
                  >
                    <div
                      style={{
                        width: `${32000 / previewScale}px`,
                        height: `${54000 / previewScale}px`,
                        transform: `scale(${previewScale / 100})`,
                        transformOrigin: "top left",
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                    >
                      <iframe
                        src={normalizedUrl}
                        title="معاينة التطبيق"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        style={{
                          border: "none",
                          width: "100%",
                          height: "100%",
                          display: "block",
                        }}
                      />
                    </div>
                  </div>
                </div>
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

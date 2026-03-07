import { useState, useEffect, useCallback } from "react";
import {
  Globe,
  Smartphone,
  Download,
  Loader2,
  Box,
  Sparkles,
  CheckCircle2,
  FileDown,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateManifest,
  generateServiceWorker,
  generateIndexHtml,
  downloadAllFiles,
  type AppConfig,
} from "@/lib/generateFiles";


function extractAppName(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove www. and get domain name
    const host = parsed.hostname.replace(/^www\./, "");
    // Take first part before dot
    const name = host.split(".")[0];
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "";
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

const Index = () => {
  const [url, setUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [appColor, setAppColor] = useState("#22c55e");
  const [isGeneratingApk, setIsGeneratingApk] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isValidUrl = useCallback((u: string) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, []);

  // Auto-extract app name and color when URL changes
  useEffect(() => {
    if (isValidUrl(url)) {
      const name = extractAppName(url);
      setAppName(name);
      const color = extractThemeColor(url);
      setAppColor(hslToHex(color));
      setIsReady(true);
    } else {
      setIsReady(false);
    }
  }, [url, isValidUrl]);

  const config: AppConfig = { url, appName, appColor };

  const handleDownloadPWA = () => {
    downloadAllFiles(config);
    toast.success("تم تحميل ملفات PWA! 📦");
  };

  const handleGenerateApk = async () => {
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
      a.target = "_blank";
      a.rel = "noopener noreferrer";
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

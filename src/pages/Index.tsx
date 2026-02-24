import { useState } from "react";
import {
  Globe,
  Smartphone,
  Download,
  FileCode,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  Package,
  Copy,
} from "lucide-react";
import CodePreview from "@/components/CodePreview";
import StepCard from "@/components/StepCard";
import {
  generateManifest,
  generateServiceWorker,
  generateIndexHtml,
  downloadAllFiles,
  type AppConfig,
} from "@/lib/generateFiles";

const Index = () => {
  const [url, setUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [appColor, setAppColor] = useState("#22c55e");
  const [step, setStep] = useState<"form" | "result">("form");
  const [copiedUrl, setCopiedUrl] = useState(false);

  const config: AppConfig = { url, appName, appColor };

  const isValid = url.startsWith("http") && appName.trim().length > 0;

  const handleGenerate = () => {
    if (isValid) setStep("result");
  };

  const handleDownload = () => {
    downloadAllFiles(config);
  };

  const handleCopySiteUrl = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg gradient-main flex items-center justify-center shadow-glow">
              <Smartphone className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold text-foreground">WebToApp</h1>
          </div>
          {step === "result" && (
            <button
              onClick={() => setStep("form")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              تعديل
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {step === "form" ? (
          <div className="space-y-10">
            {/* Hero */}
            <div className="text-center space-y-4 py-8">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-accent-foreground bg-accent px-4 py-1.5 rounded-full">
                <Sparkles className="w-4 h-4" />
                بدون Android Studio
              </div>
              <h2 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight">
                حوّل موقعك لتطبيق
                <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-l from-primary to-[hsl(170,60%,45%)]">
                  بضغطة زر
                </span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-lg mx-auto">
                أدخل رابط موقعك واسم التطبيق وراح نولّد لك كل الملفات اللازمة
              </p>
            </div>

            {/* Form */}
            <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-soft space-y-6 max-w-xl mx-auto">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  رابط الموقع
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  dir="ltr"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  اسم التطبيق
                </label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="تطبيقي"
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border border-border"
                    style={{ backgroundColor: appColor }}
                  />
                  لون التطبيق
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="color"
                    value={appColor}
                    onChange={(e) => setAppColor(e.target.value)}
                    className="w-12 h-10 rounded-lg border border-input cursor-pointer"
                  />
                  <input
                    type="text"
                    value={appColor}
                    onChange={(e) => setAppColor(e.target.value)}
                    dir="ltr"
                    className="flex-1 px-4 py-3 rounded-xl border border-input bg-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!isValid}
                className="w-full py-3.5 rounded-xl gradient-main text-primary-foreground font-semibold text-base shadow-glow hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <FileCode className="w-5 h-5" />
                توليد الملفات
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Success Banner */}
            <div className="bg-accent/60 border border-primary/20 rounded-2xl p-6 text-center space-y-3">
              <div className="text-3xl">🎉</div>
              <h2 className="text-xl font-bold text-foreground">
                ملفات تطبيق "{appName}" جاهزة!
              </h2>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl gradient-main text-primary-foreground font-semibold shadow-glow hover:opacity-90 transition-all"
              >
                <Download className="w-5 h-5" />
                تحميل كل الملفات
              </button>
            </div>

            {/* Cloud APK Tools */}
            <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-soft space-y-4">
              <h3 className="text-lg font-bold text-foreground">⚡ تحويل APK بدون جهازك</h3>
              <p className="text-sm text-muted-foreground">
                التحويل يتم على سيرفرات أدوات خارجية، وليس على جهازك. انسخ رابط موقعك ثم افتح أي أداة وحوّله مباشرة.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleCopySiteUrl}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-secondary text-secondary-foreground hover:opacity-90 transition-all"
                >
                  <Copy className="w-4 h-4" />
                  {copiedUrl ? "تم نسخ الرابط" : "نسخ رابط الموقع"}
                </button>

                <a
                  href="https://www.pwabuilder.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-main text-primary-foreground font-medium hover:opacity-90 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  فتح PWABuilder
                </a>

                <a
                  href="https://webintoapp.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground hover:opacity-90 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  فتح WebIntoApp
                </a>
              </div>
            </div>

            {/* Generated Files */}
            <div className="space-y-5">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileCode className="w-5 h-5 text-primary" />
                الملفات المُولّدة
              </h3>
              <CodePreview filename="manifest.json" code={generateManifest(config)} />
              <CodePreview filename="sw.js" code={generateServiceWorker(config)} />
              <CodePreview filename="index.html" code={generateIndexHtml(config)} />
            </div>

            {/* Steps to APK */}
            <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-soft space-y-6">
              <h3 className="text-lg font-bold text-foreground">
                📱 كيف تحوّل الملفات لـ APK؟
              </h3>
              <div className="space-y-6">
                <StepCard step={1} title="ارفع الملفات على موقعك">
                  <p>
                    ارفع الملفات الثلاثة (manifest.json, sw.js, index.html) على
                    استضافتك أو استخدمها مع أي خدمة استضافة مجانية مثل Netlify أو
                    Vercel.
                  </p>
                </StepCard>

                <StepCard step={2} title="افتح PWABuilder">
                  <p className="mb-3">
                    روح لموقع PWABuilder المجاني من مايكروسوفت وأدخل رابط موقعك:
                  </p>
                  <a
                    href="https://www.pwabuilder.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    pwabuilder.com
                  </a>
                </StepCard>

                <StepCard step={3} title="حمّل الـ APK">
                  <p>
                    PWABuilder راح يفحص موقعك ويعطيك خيار تحميل APK جاهز للأندرويد
                    بدون ما تحتاج Android Studio أو أي أداة تطوير!
                  </p>
                </StepCard>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16 py-6 text-center text-sm text-muted-foreground">
        WebToApp — حوّل أي موقع لتطبيق بسهولة
      </footer>
    </div>
  );
};

export default Index;

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
  MonitorSmartphone,
  Loader2,
  Box,
} from "lucide-react";
import { toast } from "sonner";
import CodePreview from "@/components/CodePreview";
import StepCard from "@/components/StepCard";
import {
  generateManifest,
  generateServiceWorker,
  generateIndexHtml,
  downloadAllFiles,
  type AppConfig,
} from "@/lib/generateFiles";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const [url, setUrl] = useState("");
  const [appName, setAppName] = useState("");
  const [appColor, setAppColor] = useState("#22c55e");
  const [step, setStep] = useState<"form" | "result">("form");

  const config: AppConfig = { url, appName, appColor };

  const isValid = url.startsWith("http") && appName.trim().length > 0;

  const handleGenerate = () => {
    if (isValid) setStep("result");
  };

  const [isGeneratingApk, setIsGeneratingApk] = useState(false);

  const handleDownload = () => {
    downloadAllFiles(config);
  };

  const handleGenerateApk = async () => {
    setIsGeneratingApk(true);
    toast.info("جاري توليد ملف APK... قد يستغرق دقيقة أو أكثر");
    try {
      const { data, error } = await supabase.functions.invoke("generate-apk", {
        body: {
          url: config.url,
          appName: config.appName,
          appColor: config.appColor,
        },
      });

      if (error) throw error;

      // data is the zip ArrayBuffer
      const blob = new Blob([data], { type: "application/zip" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `${config.appName.replace(/\s/g, "-")}-apk.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      toast.success("تم تحميل ملف APK بنجاح! 🎉");
    } catch (err: any) {
      console.error("APK generation error:", err);
      toast.error("فشل توليد APK. تأكد أن الموقع يحتوي على manifest.json صالح.");
    } finally {
      setIsGeneratingApk(false);
    }
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
                تحميل ملفات PWA
              </button>
              <button
                onClick={handleGenerateApk}
                disabled={isGeneratingApk}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold border border-border hover:bg-accent transition-all disabled:opacity-50"
              >
                {isGeneratingApk ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Box className="w-5 h-5" />
                )}
                {isGeneratingApk ? "جاري التوليد..." : "توليد APK (أندرويد)"}
              </button>
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

            {/* Steps */}
            <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 shadow-soft space-y-6">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <MonitorSmartphone className="w-5 h-5 text-primary" />
                📲 كيف تثبّت التطبيق على جوالك؟
              </h3>
              <div className="space-y-6">
                <StepCard step={1} title="حمّل الملفات وارفعها على استضافتك">
                  <p>
                    حمّل الملفات (manifest.json, sw.js, index.html) وارفعها على 
                    استضافتك. يمكنك استخدام استضافة مجانية مثل{" "}
                    <a href="https://netlify.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Netlify</a>
                    {" "}أو{" "}
                    <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Vercel</a>
                    .
                  </p>
                </StepCard>

                <StepCard step={2} title="أضف أيقونات التطبيق">
                  <p>
                    أضف ملفين للأيقونة بنفس المجلد: <code className="font-mono bg-secondary px-1.5 py-0.5 rounded text-sm">icon-192.png</code> و <code className="font-mono bg-secondary px-1.5 py-0.5 rounded text-sm">icon-512.png</code>.
                    يمكنك إنشاؤها مجاناً من{" "}
                    <a href="https://favicon.io/favicon-generator/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      favicon.io
                    </a>
                  </p>
                </StepCard>

                <StepCard step={3} title="افتح الرابط من جوالك وثبّت التطبيق">
                  <div className="space-y-3">
                    <p>
                      افتح رابط موقعك من متصفح الجوال. راح يظهر لك بانر <strong>"ثبّت التطبيق"</strong> تلقائياً — اضغط عليه وخلاص! 🎉
                    </p>
                    <div className="bg-accent/60 rounded-xl p-4 space-y-2 text-sm">
                      <p className="font-semibold text-accent-foreground">💡 إذا ما ظهر البانر:</p>
                      <p><strong>أندرويد (Chrome):</strong> اضغط ⋮ ثم "إضافة إلى الشاشة الرئيسية"</p>
                      <p><strong>آيفون (Safari):</strong> اضغط مشاركة ↑ ثم "إضافة للشاشة الرئيسية"</p>
                    </div>
                  </div>
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

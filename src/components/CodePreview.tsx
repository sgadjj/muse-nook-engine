import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodePreviewProps {
  code: string;
  filename: string;
}

const CodePreview = ({ code, filename }: CodePreviewProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden shadow-soft">
      <div className="flex items-center justify-between px-4 py-2 bg-secondary/60 border-b border-border">
        <span className="text-sm font-mono text-muted-foreground">{filename}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "تم النسخ" : "نسخ"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm leading-relaxed bg-card" dir="ltr">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
    </div>
  );
};

export default CodePreview;

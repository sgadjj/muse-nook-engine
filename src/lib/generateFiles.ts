export interface AppConfig {
  url: string;
  appName: string;
  appColor: string;
}

export function generateManifest(config: AppConfig): string {
  return JSON.stringify(
    {
      name: config.appName,
      short_name: config.appName,
      start_url: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: config.appColor,
      theme_color: config.appColor,
      icons: [
        {
          src: "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
          purpose: "any maskable",
        },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
    null,
    2
  );
}

export function generateServiceWorker(config: AppConfig): string {
  return `const CACHE_NAME = '${config.appName.replace(/\\s/g, "-").toLowerCase()}-v1';
const APP_URL = '${config.url}';

// الملفات اللي نبي نخزنها للعمل بدون نت
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // نخزن نسخة من الردود الناجحة
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});`;
}

export function generateIndexHtml(config: AppConfig): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="${config.appColor}" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="${config.appName}" />
  <meta name="description" content="${config.appName} - تطبيق ويب" />
  <title>${config.appName}</title>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { width: 100%; height: 100%; overflow: hidden; font-family: sans-serif; }
    iframe { width: 100%; height: 100%; border: none; }
    
    /* زر التثبيت */
    #install-banner {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: ${config.appColor};
      color: white;
      padding: 16px 20px;
      text-align: center;
      z-index: 9999;
      font-size: 16px;
      font-weight: bold;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.2);
      cursor: pointer;
      direction: rtl;
    }
    #install-banner .close-btn {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <iframe src="${config.url}" allow="camera; microphone; geolocation; fullscreen"></iframe>
  
  <!-- بانر التثبيت التلقائي -->
  <div id="install-banner" onclick="installApp()">
    📲 ثبّت "${config.appName}" كتطبيق على جهازك
    <button class="close-btn" onclick="event.stopPropagation(); document.getElementById('install-banner').style.display='none';">✕</button>
  </div>

  <script>
    // تسجيل Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('SW registered'))
        .catch((err) => console.log('SW failed:', err));
    }

    // التقاط حدث التثبيت
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // نعرض بانر التثبيت
      document.getElementById('install-banner').style.display = 'block';
    });

    function installApp() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((result) => {
        if (result.outcome === 'accepted') {
          console.log('تم تثبيت التطبيق!');
        }
        deferredPrompt = null;
        document.getElementById('install-banner').style.display = 'none';
      });
    }

    // نخفي البانر إذا التطبيق مثبت
    window.addEventListener('appinstalled', () => {
      document.getElementById('install-banner').style.display = 'none';
      deferredPrompt = null;
    });
  </script>
</body>
</html>`;
}

export function generateIconHtml(): string {
  return `<!-- 
  📌 ملاحظة مهمة: الأيقونات
  
  تحتاج تضيف ملفين للأيقونة في نفس مجلد الملفات:
  
  1. icon-192.png  (192×192 بكسل)
  2. icon-512.png  (512×512 بكسل)
  
  يمكنك إنشاء الأيقونات مجاناً من:
  - https://favicon.io/favicon-generator/
  - https://realfavicongenerator.net/
  
  أو استخدم أي صورة مربعة بالأحجام المطلوبة.
-->`;
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAllFiles(config: AppConfig) {
  downloadFile(generateManifest(config), "manifest.json");
  setTimeout(() => downloadFile(generateServiceWorker(config), "sw.js"), 300);
  setTimeout(() => downloadFile(generateIndexHtml(config), "index.html"), 600);
  setTimeout(() => downloadFile(generateIconHtml(), "README-icons.html"), 900);
}

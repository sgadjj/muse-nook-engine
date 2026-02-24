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
      start_url: config.url,
      display: "standalone",
      orientation: "portrait",
      background_color: config.appColor,
      theme_color: config.appColor,
      icons: [
        {
          src: "/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
    null,
    2
  );
}

export function generateServiceWorker(config: AppConfig): string {
  return `const CACHE_NAME = '${config.appName.replace(/\\s/g, "-").toLowerCase()}-v1';
const OFFLINE_URL = '${config.url}';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
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
    fetch(event.request).catch(() => caches.match(event.request))
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
  <title>${config.appName}</title>
  <link rel="manifest" href="/manifest.json" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="${config.url}" allow="camera; microphone; geolocation; fullscreen"></iframe>
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
  </script>
</body>
</html>`;
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
}

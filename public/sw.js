// Flare Song DB — 서비스워커 (설치/오프라인)
const VERSION = "flare-v1";
const CORE = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 외부(YouTube/썸네일 등)는 그대로 통과

  // 콘텐츠 해시 에셋: cache-first
  if (url.pathname.startsWith("/_astro/")) {
    e.respondWith(
      caches.match(req).then((c) => c || fetch(req).then((r) => {
        const cp = r.clone();
        caches.open(VERSION).then((ca) => ca.put(req, cp));
        return r;
      })),
    );
    return;
  }

  // 그 외(HTML/JSON/이미지): network-first, 실패 시 캐시 → 마지막으로 홈
  e.respondWith(
    fetch(req).then((r) => {
      const cp = r.clone();
      caches.open(VERSION).then((ca) => ca.put(req, cp));
      return r;
    }).catch(() => caches.match(req).then((c) => c || caches.match("/"))),
  );
});

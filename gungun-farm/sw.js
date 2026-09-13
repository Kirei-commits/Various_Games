/**
 * オフラインでも開けるようにする。**ビルド工程を持たないので、配るものをここに並べる。**
 *
 * 並びが index.html とずれると、**入れたつもりのファイルだけ取りに行って失敗する**。
 * `tests/lint.mjs` が「index.html が読むもの ＝ ここに並ぶもの」を突き合わせる。
 *
 * 作りかた:
 *  - **キャッシュを返してから、裏で取り直す**（stale-while-revalidate）。
 *    ビルド工程が無いので「版を上げ忘れて古いまま」が起きやすい。
 *    キャッシュ優先で置きっぱなしにすると、直したはずの不具合が直らない画面ができる。
 *    裏で取り直しておけば、次に開いたときには新しいものになっている
 *  - 画面の移動（navigate）は index.html を返す。オフラインで白紙にしない
 *  - `CACHE` を上げると古いキャッシュを activate で捨てる（作りを変えたときだけ）
 */
const CACHE = 'gungun-farm-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './css/style.css',
  './js/data.js',
  './js/engine.js',
  './js/storage.js',
  './js/audio.js',
  './js/render.js',
  './js/main.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 触るのは自分のところの GET だけ。ほかは素通しする
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then((hit) => {
      // 裏で取り直す。**返すのは待たない**（速さのためにキャッシュを先に返す）
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => null);

      if (hit) {
        e.waitUntil(fresh);
        return hit;
      }
      return fresh.then((res) => {
        if (res) return res;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});

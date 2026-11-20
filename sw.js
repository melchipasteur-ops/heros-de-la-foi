// Service worker de l'application Héro de la Foi.
// - Pages et scripts : réseau d'abord (les mises à jour arrivent tout de suite), copie locale si hors ligne.
// - Cours (modules/*.json), images et icônes : copie locale d'abord, mise à jour en arrière-plan.
// - Jamais mis en cache : /api/ et la base de données (comptes, notes, examens restent toujours en ligne).
const VERSION = "hdf-v5";
const COQUILLE = ["/", "/index.html", "/enseignant.html", "/app.js", "/enseignant.js", "/commun.js", "/vendor/libphonenumber-max-1.13.15.js", "/styles.css",
  "/programme.json", "/manifest.webmanifest", "/manifest-enseignant.webmanifest", "/icones/etudiant-192.png", "/icones/enseignant-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  const statique = /^\/(modules|images|icones|marque)\//.test(url.pathname);
  if (statique) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const local = await c.match(req);
      const reseau = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => local);
      return local || reseau;
    }));
    return;
  }
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copie = r.clone(); caches.open(VERSION).then(c => c.put(req, copie)); }
    return r;
  }).catch(async () => (await caches.match(req, {ignoreSearch: true})) || (req.mode === "navigate" ? caches.match(url.pathname.startsWith("/enseignant") ? "/enseignant.html" : "/index.html") : Response.error())));
});

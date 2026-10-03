// RĀSI legacy PWA migration worker.
// This file intentionally replaces the old v8 cache instead of serving it.
const LEGACY_CACHE_PREFIX="rasi-";
self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith(LEGACY_CACHE_PREFIX)).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  if(event.request.mode==="navigate"){
    const url=new URL(event.request.url);
    if(url.pathname.endsWith("/rasi.html")||url.pathname.endsWith("/rasi.html/")){
      event.respondWith(fetch(new URL("./index.html",self.location.href),{cache:"no-store"}));
      return;
    }
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .catch(()=>caches.match("./index.html"))
    );
  }
});

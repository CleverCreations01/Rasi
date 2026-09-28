const CACHE_NAME="rasi-v19-stable";
const CORE=["./","./index.html","./manifest.json","./rasi-brain.js?v=7.1"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith("rasi-")&&k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  if(event.request.mode==="navigate"){
    event.respondWith(
      fetch(event.request,{cache:"no-store"})
        .then(response=>{
          caches.open(CACHE_NAME).then(cache=>cache.put("./index.html",response.clone())).catch(()=>{});
          return response;
        })
        .catch(()=>caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:"no-store"})
      .then(response=>{
        if(response.ok)caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});

const C='tab-v2',A=['/','/index.html','/manifest.json','/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():clients.openWindow('/')))});

/* ---- Web Push: tampil saat aplikasi DITUTUP. Judul = nama tablet, suara = suara notifikasi bawaan sistem ---- */
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data.json()}catch(_){d={title:'Koneksi Tablet',body:e.data?e.data.text():''}}
  e.waitUntil((async()=>{
    await self.registration.showNotification(d.title||'Koneksi Tablet',{
      body:d.body||'',
      icon:'/icon-192.png',
      badge:'/icon-192.png',
      vibrate:[300,150,300,150,300],
      tag:d.tag||'tablet',
      renotify:true,
      requireInteraction:true,
      silent:false,
      data:d
    });
    // Jika ada jendela aplikasi yang masih hidup (mis. di latar belakang), minta ia membunyikan suara juga
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    list.forEach(c=>c.postMessage({type:'play'}));
  })());
});

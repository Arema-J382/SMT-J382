/* Service Worker - Portal Karyawan
 * Menerima Web Push dari server sehingga notifikasi BREAK_ALERT tetap
 * muncul walau tab ditutup atau layar HP mati. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: event.data ? event.data.text() : '' };
    }

    const title = data.title || 'Portal Karyawan';
    const options = {
        body: data.body || 'WAKTUNYA KEMBALI BEKERJA',
        tag: 'break-alert-' + (data.alertNo || 0),
        renotify: false,
        requireInteraction: true,
        silent: false, // false = bunyi mengikuti nada notifikasi bawaan HP
        vibrate: [500, 200, 500, 200, 500],
        timestamp: Date.now(),
        data: { url: data.url || '/', alertNo: data.alertNo || 0 }
    };

    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const visible = wins.filter(c => c.visibilityState === 'visible');

        // Jika aplikasi sedang terbuka di layar, halaman yang menampilkan notifikasi (hindari bunyi ganda)
        if (visible.length > 0) {
            visible.forEach(c => c.postMessage({ type: 'BREAK_ALERT_PUSH', alertNo: options.data.alertNo }));
            return;
        }
        await self.registration.showNotification(title, options);
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of wins) {
            if ('focus' in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })());
});

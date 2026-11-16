/* Service Worker - Portal Karyawan  (v3)
 * Menerima Web Push dari server sehingga notifikasi tetap muncul + berbunyi
 * walau tab ditutup, layar mati (sleep) atau perangkat idle.
 *
 * Perbaikan utama v3:
 *  1. Notifikasi SELALU ditampilkan (sebelumnya ditahan bila ada jendela "visible",
 *     padahal tablet idle layar-menyala tetap berstatus visible -> tidak ada notif/suara).
 *  2. Setiap push yang sama-tag tetap BERBUNYI (notifikasi lama ditutup dulu, tidak lagi
 *     "diganti diam-diam" oleh renotify:false).
 *  3. Dedup untuk alarm istirahat: bila halaman sudah menampilkan notif yg sama < 15 dtk lalu, tidak bunyi ganda.
 *  4. Handler 'pushsubscriptionchange' -> langganan otomatis diperbarui (tanpa ini tablet
 *     berhenti menerima push setelah endpoint kedaluwarsa).
 *  5. Mendukung payload jenis lain (mis. bel tablet) lewat field title/body/tag/type/url.
 */

const SW_VERSION = 'v3';
const CFG_CACHE = 'portal-push-cfg';
const CFG_KEY = '/__push_cfg__';
const BREAK_DEDUPE_MS = 15000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* ---------- Penyimpanan konfigurasi kecil (dikirim halaman) ---------- */
async function saveCfg(cfg) {
    try {
        const c = await caches.open(CFG_CACHE);
        await c.put(CFG_KEY, new Response(JSON.stringify(cfg), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) {}
}
async function readCfg() {
    try {
        const c = await caches.open(CFG_CACHE);
        const r = await c.match(CFG_KEY);
        return r ? await r.json() : null;
    } catch (e) { return null; }
}
function b64ToU8(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

self.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'PUSH_CONFIG') event.waitUntil(saveCfg(msg));
    if (msg.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ---------- Terima push ---------- */
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { body: event.data ? event.data.text() : '' };
    }

    const alertNo = Number(data.alertNo || 0);
    const isBreak = alertNo > 0 && (!data.type || data.type === 'break');
    const tag = data.tag && data.tag !== 'break-alert'
        ? String(data.tag)
        : 'break-alert-' + alertNo;

    const title = data.title || 'Portal Karyawan';
    const options = {
        body: data.body || 'WAKTUNYA KEMBALI BEKERJA',
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        tag: tag,
        renotify: true,            // wajib berbunyi lagi bila tag sama
        requireInteraction: true,  // tetap tampil sampai disentuh
        silent: false,             // false = bunyi mengikuti nada notifikasi bawaan perangkat
        vibrate: [500, 200, 500, 200, 500, 200, 500],
        timestamp: Date.now(),
        data: { url: data.url || '/', alertNo: alertNo, type: data.type || (isBreak ? 'break' : 'generic') }
    };

    event.waitUntil((async () => {
        // 1) SELALU tampilkan notifikasi (jangan ditahan walau jendela terlihat)
        const existing = await self.registration.getNotifications({ tag: tag });
        const now = Date.now();
        const justShown = isBreak && existing.some(n => now - (n.timestamp || 0) < BREAK_DEDUPE_MS);

        if (!justShown) {
            existing.forEach(n => n.close()); // tutup yang lama agar yang baru pasti berbunyi
            await self.registration.showNotification(title, options);
        }

        // 2) Beritahu halaman yang sedang terbuka (hanya untuk sinkron penanda, tanpa notifikasi ganda)
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        wins.forEach(c => c.postMessage({
            type: isBreak ? 'BREAK_ALERT_PUSH' : 'PUSH_RECEIVED',
            alertNo: alertNo,
            payloadType: options.data.type,
            shown: true
        }));
    })());
});

/* ---------- Klik notifikasi ---------- */
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

/* ---------- Langganan push kedaluwarsa / berubah ---------- */
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        const cfg = await readCfg();
        try {
            let key = event.oldSubscription && event.oldSubscription.options
                ? event.oldSubscription.options.applicationServerKey : null;
            if (!key && cfg && cfg.vapid) key = b64ToU8(cfg.vapid);

            const sub = event.newSubscription ||
                (key ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }) : null);

            if (sub && cfg && cfg.url && cfg.anon && cfg.nip) {
                const j = sub.toJSON();
                await fetch(cfg.url + '/rest/v1/push_subscriptions?on_conflict=endpoint', {
                    method: 'POST',
                    headers: {
                        apikey: cfg.anon,
                        Authorization: 'Bearer ' + cfg.anon,
                        'Content-Type': 'application/json',
                        Prefer: 'resolution=merge-duplicates,return=minimal'
                    },
                    body: JSON.stringify({ nip: Number(cfg.nip), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth })
                });
            }
        } catch (e) { /* halaman akan mendaftarkan ulang saat dibuka */ }

        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        wins.forEach(c => c.postMessage({ type: 'PUSH_SUB_CHANGED' }));
    })());
});

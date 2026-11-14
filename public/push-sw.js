// Service Worker handlers: Web Share Target POST receiver, Push Notification & Notification Click
const SHARE_CACHE = 'trackme-share-tmp';
const SHARE_KEY = '/__pending-shared-slip__';

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'POST') return;
  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (!url.pathname.endsWith('/share-target')) return;

  event.respondWith((async () => {
    const baseUrl = (self.registration && self.registration.scope) || '/';
    try {
      const formData = await req.formData();
      let file = formData.get('slip') || formData.get('image') || formData.get('file');
      if (!file) {
        for (const val of formData.values()) {
          if (val && typeof val === 'object' && 'arrayBuffer' in val) {
            file = val;
            break;
          }
        }
      }
      if (file && file.size > 0) {
        const cache = await caches.open(SHARE_CACHE);
        const headers = new Headers({
          'Content-Type': file.type || 'image/jpeg',
          'X-Share-Filename': encodeURIComponent(file.name || 'slip.jpg')
        });
        await cache.put(SHARE_KEY, new Response(file, { headers }));
      }
    } catch (e) {
      // Redirect back to app cleanly even if share payload is empty/unsupported
    }
    return Response.redirect(`${baseUrl}?shared-slip=1`, 303);
  })());
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Track Me', body: event.data ? event.data.text() : 'แตะเพื่อเปิดดูรายละเอียดในแอป' };
  }
  const title = payload.title || 'Track Me';
  const baseUrl = (self.registration && self.registration.scope) || '/';
  const options = {
    body: payload.body || 'แตะเพื่อเปิดดูรายละเอียดในแอป',
    icon: payload.icon || `${baseUrl}icon-192.png`,
    badge: payload.badge || `${baseUrl}icon-192.png`,
    tag: payload.tag || 'trackme-daily-push',
    renotify: true,
    data: {
      url: payload.url || baseUrl,
      tab: payload.tab || 'home'
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const baseUrl = (self.registration && self.registration.scope) || '/';
  const data = event.notification.data || {};
  const targetUrl = data.url || baseUrl;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'TRACKME_OPEN_TAB', tab: data.tab || 'home' });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

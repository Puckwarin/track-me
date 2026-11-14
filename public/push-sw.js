// Service Worker Push Notification & Notification Click handler (loaded by Workbox via importScripts)
self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Track Me', body: event.data ? event.data.text() : 'มีรายการที่ต้องดูแลวันนี้' };
  }
  const title = payload.title || 'Track Me';
  const baseUrl = (self.registration && self.registration.scope) || '/';
  const options = {
    body: payload.body || 'เปิดแอปเพื่อดูรายการวันนี้',
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

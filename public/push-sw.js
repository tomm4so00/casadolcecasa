// Service worker di Casa dolce casa: mostra gli avvisi arrivati dal server anche a gioco chiuso
// (es. "il tuo personaggio sta per morire") e apre il gioco quando si tocca la notifica.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { body: event.data ? event.data.text() : '' } };
  }
  const data = payload.data || {};
  const note = payload.notification || {};
  const title = data.title || note.title || 'Casa dolce casa';
  const body = data.body || note.body || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: data.tag || 'casadolcecasa',
      renotify: true,
      data: { link: data.link || (payload.fcmOptions && payload.fcmOptions.link) || './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow(link);
    }),
  );
});

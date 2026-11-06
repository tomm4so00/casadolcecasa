// Service worker di Casa dolce casa: mostra gli avvisi arrivati dal server anche a gioco chiuso
// (es. "il tuo personaggio sta per morire") e apre il gioco quando si tocca la notifica.
// Serve anche a rendere il gioco installabile come app. Il nome del file resta questo: i
// telefoni che hanno già attivato le notifiche ci hanno legato il loro codice.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // La pagina parte a scaricarsi mentre il service worker si sveglia.
      self.registration.navigationPreload?.enable(),
    ]),
  ),
);

// Pagina mostrata dall'app installata quando manca la connessione, al posto dell'errore del browser.
const OFFLINE_PAGE = `<!doctype html><html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Casa dolce casa</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
justify-content:center;gap:16px;background:#0f0f18;color:#dfe6e9;font-family:sans-serif;
text-align:center;padding:24px;box-sizing:border-box}button{font:inherit;padding:10px 20px;
border:0;border-radius:8px;background:#feca57;color:#0f0f18;font-weight:bold}</style></head>
<body><img src="icons/icon-192.png" width="96" height="96" alt="">
<h1 style="margin:0;font-size:22px">Sei senza connessione</h1>
<p style="margin:0">Casa dolce casa è un gioco in compagnia: serve internet per entrare.</p>
<button onclick="location.reload()">Riprova</button></body></html>`;

// Niente copie dei file del gioco: una versione vecchia rimasta in memoria potrebbe scrivere nel
// database in un formato superato. Le pagine vanno sempre in rete; il resto non passa di qui.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return new Response(OFFLINE_PAGE, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    })(),
  );
});

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

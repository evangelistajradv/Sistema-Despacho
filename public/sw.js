// Service Worker - ASSTEC Sistema de Despacho
// Responsável por receber e exibir push notifications nativas

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'ASSTEC', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/pedra-furada.png',
    badge: '/pedra-furada.png',
    data: { tab: data.tab || '', itemId: data.itemId || '' },
    requireInteraction: true,
    vibrate: [200, 100, 200],
    tag: data.tag || 'asstec-notif',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ASSTEC', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { tab, itemId } = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Tenta focar janela já aberta
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', tab, itemId });
          return client.focus();
        }
      }
      // Abre nova janela se não houver nenhuma
      const url = tab ? `/?tab=${tab}` : '/';
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

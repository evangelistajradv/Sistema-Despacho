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
    icon: '/notification-icon.png',
    badge: '/notification-badge.png',
    data: { tab: data.tab || '', itemId: data.itemId || '', notifId: data.notifId || '' },
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

  const { tab, itemId, notifId } = event.notification.data || {};

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Tenta focar janela já aberta
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', tab, itemId, notifId });
          return client.focus();
        }
      }
      // Abre nova janela se não houver nenhuma
      const url = tab ? `/?tab=${tab}&notifId=${notifId || ''}` : '/';
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Fecha um push nativo quando a notificação correspondente é lida no sino (app aberto)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLOSE_NOTIF' && event.data.tag) {
    self.registration.getNotifications({ tag: event.data.tag }).then((notifs) => {
      notifs.forEach((n) => n.close());
    });
  }
});

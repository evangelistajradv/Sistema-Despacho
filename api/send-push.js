// Vercel Serverless Function - Envio de Push Notifications
// Rota: POST /api/send-push
// Requer variáveis de ambiente no painel Vercel:
//   REACT_APP_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT (ex: mailto:seu@email.com)

const webpush = require('web-push');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const vapidPublicKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:evangelistajradv@gmail.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('VAPID keys not configured');
    return res.status(500).json({ error: 'Push notifications not configured' });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { subscriptions, notification } = req.body || {};

  if (!subscriptions || !Array.isArray(subscriptions) || subscriptions.length === 0) {
    return res.status(400).json({ error: 'No subscriptions provided' });
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification(sub, JSON.stringify(notification)))
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  console.log(`Push enviado: ${sent} ok, ${failed} falhou`);
  return res.status(200).json({ sent, failed });
};

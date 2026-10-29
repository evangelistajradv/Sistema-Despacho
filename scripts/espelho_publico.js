// Cria o documento agregado publico/ambiental e (com --regras) publica firestore.rules.
const admin = require('firebase-admin'); const fs = require('fs'); const path = require('path');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE, 'Downloads', 'asstec---semarh-firebase-adminsdk-fbsvc-4e13416711.json'), 'utf8'))) });
(async () => {
  const db = admin.firestore();
  const snap = await db.collection('processosAmbientais').get();
  const estados = {}; const prontos = []; let total = 0;
  snap.forEach((d) => { const p = d.data();
    if (p.estado !== 'arquivado') total++;
    if (p.concluido || p.incidente?.ativo) return;
    const e = estados[p.estado] || (estados[p.estado] = { total: 0, urgentes: 0 });
    e.total++; if (p.urgente) e.urgentes++;
    if (p.estado === 'processos_prontos_consema') prontos.push(p.parte || '');
  });
  prontos.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  await db.doc('publico/ambiental').set({ estados, totalTramitando: total, prontos, atualizadoEm: new Date().toISOString() });
  console.log('agregado criado:', total, 'em tramitação,', Object.keys(estados).length, 'estados');
  if (process.argv.includes('--regras')) {
    await admin.securityRules().releaseFirestoreRulesetFromSource(fs.readFileSync('firestore.rules', 'utf8'));
    console.log('regras publicadas');
  }
  process.exit(0);
})();

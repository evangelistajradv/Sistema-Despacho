const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ FIREBASE_CREDENTIALS não está definido');
  process.exit(1);
}

try {
  const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({ credential: admin.credential.cert(credentials) });
} catch (err) {
  console.error('❌ Erro ao inicializar Firebase:', err.message);
  process.exit(1);
}

const db = admin.firestore();

async function backup() {
  try {
    console.log('📦 Iniciando backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupDir = path.join(__dirname, '..', 'backups');
    const backupFile = path.join(backupDir, `firestore-${timestamp}.json`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const snapshot = await db.collection('processosAmbientais').get();
    const data = {
      timestamp: new Date().toISOString(),
      quantidade: snapshot.size,
      processos: []
    };

    snapshot.forEach(doc => {
      data.processos.push({ id: doc.id, ...doc.data() });
    });

    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    console.log(`✅ Backup: ${backupFile}`);
    console.log(`📊 Processos: ${data.quantidade}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

backup().then(() => {
  admin.app().delete();
  process.exit(0);
});

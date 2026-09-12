/**
 * Script para Criar Snapshot Versionado
 * Cria um backup com versão específica para marcos importantes
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const labelIndex = args.indexOf('--label');
const label = labelIndex !== -1 ? args[labelIndex + 1] : 'snapshot';

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ Erro: FIREBASE_CREDENTIALS não está definido');
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

async function createSnapshot() {
  try {
    console.log(`📸 Criando snapshot: "${label}"...`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupDir = path.join(__dirname, '..', 'backups', 'snapshots');
    const snapshotFile = path.join(backupDir, `${label}-${timestamp}.json`);

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const snapshot = await db.collection('processosAmbientais').get();
    const data = {
      label,
      timestamp: new Date().toISOString(),
      quantidade: snapshot.size,
      processos: []
    };

    snapshot.forEach(doc => {
      data.processos.push({
        id: doc.id,
        ...doc.data()
      });
    });

    fs.writeFileSync(snapshotFile, JSON.stringify(data, null, 2));
    console.log(`✅ Snapshot criado: ${snapshotFile}`);
    console.log(`📊 Total de processos: ${data.quantidade}`);

  } catch (error) {
    console.error('❌ Erro ao criar snapshot:', error.message);
    process.exit(1);
  }
}

createSnapshot().then(() => {
  admin.app().delete();
  process.exit(0);
});

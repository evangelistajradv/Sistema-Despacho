const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const backupFile = fileIndex !== -1 ? args[fileIndex + 1] : null;

if (!backupFile || !fs.existsSync(backupFile)) {
  console.error('❌ Arquivo não encontrado');
  console.log('Uso: node scripts/restore-from-backup.js --file <caminho>');
  process.exit(1);
}

if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ FIREBASE_CREDENTIALS não definido');
  process.exit(1);
}

try {
  const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({ credential: admin.credential.cert(credentials) });
} catch (err) {
  console.error('❌ Erro:', err.message);
  process.exit(1);
}

const db = admin.firestore();

async function restore() {
  try {
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    console.log(`📊 Processos: ${backupData.quantidade}`);
    console.log(`📅 Data: ${backupData.timestamp}`);
    console.log('⚠️  ATENÇÃO: Vai sobrescrever dados!');
    
    let restored = 0;
    for (const processo of backupData.processos) {
      const { id, ...data } = processo;
      await db.collection('processosAmbientais').doc(id).set(data);
      restored++;
    }

    console.log(`✅ Restaurado: ${restored} processos`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

restore().then(() => {
  admin.app().delete();
  process.exit(0);
});

/**
 * Script de Restauração de Backup
 * Importa dados de um arquivo JSON para o Firestore
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const args = process.argv.slice(2);
const fileIndex = args.indexOf('--file');
const backupFile = fileIndex !== -1 ? args[fileIndex + 1] : null;

if (!backupFile) {
  console.error('❌ Erro: Arquivo de backup não especificado');
  console.log('\nUso: node scripts/restore-from-backup.js --file <caminho>');
  process.exit(1);
}

if (!fs.existsSync(backupFile)) {
  console.error(`❌ Arquivo não encontrado: ${backupFile}`);
  process.exit(1);
}

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

async function confirmRestore() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('⚠️  ATENÇÃO: Isso vai sobrescrever os dados atuais. Continuar? (s/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 's');
    });
  });
}

async function restore() {
  try {
    console.log(`📂 Lendo backup: ${backupFile}...`);
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));

    console.log(`\n📊 Informações do Backup:`);
    console.log(`   └─ Processos: ${backupData.quantidade}`);
    console.log(`   └─ Data: ${backupData.timestamp}`);

    const confirmed = await confirmRestore();
    if (!confirmed) {
      console.log('❌ Restauração cancelada');
      process.exit(0);
    }

    console.log('\n⏳ Restaurando dados...');
    let restored = 0;

    for (const processo of backupData.processos) {
      const { id, ...data } = processo;
      await db.collection('processosAmbientais').doc(id).set(data);
      restored++;
      if (restored % 10 === 0) {
        console.log(`   ✓ ${restored}/${backupData.quantidade} processos restaurados`);
      }
    }

    console.log(`\n✅ Restauração concluída!`);
    console.log(`   └─ Total restaurado: ${restored} processo(s)`);

  } catch (error) {
    console.error('❌ Erro durante restauração:', error.message);
    process.exit(1);
  }
}

restore().then(() => {
  admin.app().delete();
  process.exit(0);
});

/**
 * Script de Backup do Firestore
 * Exporta todos os dados da coleção 'processosAmbientais' em JSON
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Verificar se as credenciais foram fornecidas
if (!process.env.FIREBASE_CREDENTIALS) {
  console.error('❌ Erro: FIREBASE_CREDENTIALS não está definido');
  console.log('\nConfigure a variável de ambiente:');
  console.log('export FIREBASE_CREDENTIALS="$(cat serviceAccountKey.json)"');
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
    console.log('📦 Iniciando backup do Firestore...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupDir = path.join(__dirname, '..', 'backups');
    const backupFile = path.join(backupDir, `firestore-${timestamp}.json`);

    // Criar diretório de backups se não existir
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log('✓ Diretório de backups criado');
    }

    // Buscar todos os documentos
    const snapshot = await db.collection('processosAmbientais').get();
    const data = {
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

    // Salvar em arquivo
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
    console.log(`✅ Backup concluído: ${backupFile}`);
    console.log(`📊 Total de processos: ${data.quantidade}`);

    // Informações de restauração
    console.log('\n💡 Para restaurar este backup, use:');
    console.log(`   node scripts/restore-from-backup.js --file ${backupFile}`);

  } catch (error) {
    console.error('❌ Erro durante backup:', error.message);
    process.exit(1);
  }
}

backup().then(() => {
  admin.app().delete();
  console.log('\n✓ Conexão fechada');
  process.exit(0);
});

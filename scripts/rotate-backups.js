const fs = require('fs');
const path = require('path');

const RETENTION_DAYS = 30;
const backupDir = path.join(__dirname, '..', 'backups');

function rotateBackups() {
  if (!fs.existsSync(backupDir)) {
    console.log('📁 Backups não encontrados');
    return;
  }

  const now = Date.now();
  const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0, kept = 0;

  try {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));

    console.log(`🔄 Rotacionando (${RETENTION_DAYS} dias)...`);

    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Deletado: ${file}`);
        deleted++;
      } else {
        console.log(`✓ Mantido: ${file}`);
        kept++;
      }
    });

    console.log(`✅ Deletados: ${deleted} | Mantidos: ${kept}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

rotateBackups();

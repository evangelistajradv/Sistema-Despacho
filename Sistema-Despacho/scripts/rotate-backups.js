/**
 * Script de Rotação de Backups
 * Remove backups com mais de 30 dias mantendo o histórico limpo
 */

const fs = require('fs');
const path = require('path');

const RETENTION_DAYS = 30;
const backupDir = path.join(__dirname, '..', 'backups');

function rotateBackups() {
  if (!fs.existsSync(backupDir)) {
    console.log('📁 Diretório de backups não encontrado');
    return;
  }

  const now = Date.now();
  const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  let kept = 0;

  try {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));

    console.log(`🔄 Rotacionando backups (mantendo últimos ${RETENTION_DAYS} dias)...`);

    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Deletado: ${file}`);
        deleted++;
      } else {
        const daysOld = Math.floor(age / (24 * 60 * 60 * 1000));
        console.log(`✓ Mantido: ${file} (${daysOld} dias)`);
        kept++;
      }
    });

    console.log(`\n✅ Rotação concluída:`);
    console.log(`   ├─ Deletados: ${deleted} arquivo(s)`);
    console.log(`   └─ Mantidos: ${kept} arquivo(s)`);

  } catch (error) {
    console.error('❌ Erro durante rotação:', error.message);
    process.exit(1);
  }
}

rotateBackups();

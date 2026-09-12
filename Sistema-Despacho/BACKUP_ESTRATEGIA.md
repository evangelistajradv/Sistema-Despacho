# 🔒 Estratégia de Backup e Segurança do Sistema

## Visão Geral
Este documento descreve as ferramentas e procedimentos para garantir backups automáticos e segurança dos dados do Sistema de Despacho.

## 1. Backup Automático via GitHub Actions

### Arquivo: `.github/workflows/backup-diario.yml`
Executa um backup diário automaticamente para preservar o histórico do projeto.

**Frequência:** Diariamente às 2h da manhã (UTC-3)
**Ação:** Commit automático com dados e timestamp

---

## 2. Backup de Dados do Firestore

### Arquivo: `scripts/backup-firestore.js`
Script Node.js que exporta dados do Firestore em JSON para arquivo local.

**Uso:**
```bash
node scripts/backup-firestore.js
```

**Gera:** `backups/firestore-YYYY-MM-DD-HH-mm-ss.json`

---

## 3. Versionamento Seguro de Dados

### Arquivo: `scripts/create-snapshot.js`
Cria snapshots versionados dos dados em momentos críticos.

**Uso:**
```bash
node scripts/create-snapshot.js --label "v1.2.0"
```

---

## 4. Rotação de Backups

### Arquivo: `scripts/rotate-backups.js`
Limpa backups antigos mantendo os últimos 30 dias.

**Uso:**
```bash
node scripts/rotate-backups.js
```

---

## 5. Restauração de Backup

### Arquivo: `scripts/restore-from-backup.js`
Restaura dados a partir de um backup anterior.

**Uso:**
```bash
node scripts/restore-from-backup.js --file backups/firestore-2026-09-12.json
```

---

## Integração com CI/CD

Todas as ferramentas são integradas no GitHub Actions para rodar automaticamente.


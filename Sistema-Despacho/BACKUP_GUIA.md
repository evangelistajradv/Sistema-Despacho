# 📚 Guia de Backup e Segurança

## 🚀 Início Rápido

### 1. Configurar Credenciais Firebase

**Passo 1:** Obtenha a chave de serviço do Firebase
- Acesse: https://console.firebase.google.com
- Navegue para: Projeto → Configurações → Contas de Serviço
- Clique em "Gerar nova chave privada"
- Salve o arquivo `serviceAccountKey.json` **de forma segura**

**Passo 2:** Configure a variável de ambiente
```bash
export FIREBASE_CREDENTIALS="$(cat serviceAccountKey.json)"
```

**Passo 3:** No GitHub (para CI/CD)
- Vá para: Repositório → Settings → Secrets and variables → Actions
- Clique em "New repository secret"
- Nome: `FIREBASE_CREDENTIALS`
- Valor: Cole o conteúdo de `serviceAccountKey.json`

---

## 🔧 Scripts Disponíveis

### Backup Manual
```bash
cd Sistema-Despacho
node scripts/backup-firestore.js
```
**Resultado:** Cria arquivo em `backups/firestore-YYYY-MM-DD-HH-mm-ss.json`

### Criar Snapshot Versionado
```bash
node scripts/create-snapshot.js --label "v1.2.0"
```
**Resultado:** `backups/snapshots/v1.2.0-YYYY-MM-DD.json`

### Limpar Backups Antigos
```bash
node scripts/rotate-backups.js
```
**Remove:** Backups com mais de 30 dias
**Mantém:** Últimos 30 dias

### Restaurar Backup
```bash
node scripts/restore-from-backup.js --file backups/firestore-2026-09-12.json
```
**Atenção:** Vai sobrescrever todos os dados atuais!

---

## 🤖 Automação (GitHub Actions)

### Backup Diário
- **Frequência:** Todos os dias às 2h da manhã
- **Workflow:** `.github/workflows/backup-diario.yml`
- **Ação:** Executa backup → Rotação → Commit automático

### Snapshot em Release
- **Trigger:** Quando uma release é publicada
- **Workflow:** `.github/workflows/backup-release.yml`
- **Ação:** Cria snapshot com versão da release

### Usar Manualmente
No GitHub, vá para:
**Actions → Selecione o workflow → Run workflow**

---

## 📊 Estrutura de Backups

```
backups/
├── firestore-2026-09-12-10-30-45.json  # Backup diário
├── firestore-2026-09-11-10-30-45.json
└── snapshots/
    ├── v1.0.0-2026-09-10.json           # Snapshot versionado
    └── v1.1.0-2026-09-12.json
```

---

## ⚠️ Boas Práticas

### ✅ Faça
- ✓ Fazer backup antes de atualizações importantes
- ✓ Testar restauração em ambiente de teste
- ✓ Manter snapshots para cada versão importante
- ✓ Revisar logs de backup regularmente

### ❌ Não Faça
- ✗ Commitar `serviceAccountKey.json` no GitHub
- ✗ Compartilhar credenciais Firebase
- ✗ Restaurar backup sem confirmação
- ✗ Deletar backups manualmente

---

## 🔐 Segurança

### Proteger Credenciais
```bash
# ✓ Correto: Usar variáveis de ambiente
export FIREBASE_CREDENTIALS="$(cat serviceAccountKey.json)"

# ✗ Errado: Commitar a chave
git add serviceAccountKey.json
```

### Verificar Integridade de Backup
```bash
# Ver conteúdo
cat backups/firestore-*.json | head -20

# Contar documentos
node -e "console.log(JSON.parse(require('fs').readFileSync('backups/firestore-2026-09-12.json')).quantidade)"
```

---

## 🆘 Troubleshooting

### Erro: "FIREBASE_CREDENTIALS não está definido"
```bash
# Solução:
export FIREBASE_CREDENTIALS="$(cat serviceAccountKey.json)"
# ou
echo $FIREBASE_CREDENTIALS  # verificar se está definido
```

### Erro: "Arquivo não encontrado"
```bash
# Listar backups disponíveis:
ls -la backups/
```

### Backup muito lento/grande
- Considere usar Firebase Admin SDK com paginação
- Ou dividir em coleções menores
- Veja `scripts/backup-firestore.js` para otimizações

---

## 📞 Suporte

Para questões sobre backup:
1. Verifique os logs do GitHub Actions
2. Revise a documentação do Firebase Admin SDK
3. Consulte `BACKUP_ESTRATEGIA.md` para visão geral


# Configurar CORS no Firebase Storage (necessário para upload de PDF)

O upload de PDF é bloqueado pelo navegador com erro de **CORS** enquanto o bucket
do Storage não tiver uma política de CORS. Isso é configurado UMA única vez no
bucket do Google Cloud Storage (não nas `storage.rules`).

Bucket deste projeto: `gs://asstec---semarh.firebasestorage.app`

## Passo a passo (sem instalar nada — Google Cloud Shell)

1. Acesse: https://console.cloud.google.com/  → selecione o projeto **asstec---semarh**.
2. Clique no ícone de terminal **"Ativar o Cloud Shell"** (canto superior direito).
3. No terminal que abrir, crie o arquivo de CORS colando:

   ```bash
   cat > cors.json <<'JSON'
   [
     {
       "origin": ["*"],
       "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
       "responseHeader": ["Content-Type", "Authorization", "Content-Length", "User-Agent", "x-goog-resumable", "x-goog-meta-*"],
       "maxAgeSeconds": 3600
     }
   ]
   JSON
   ```

4. Aplique no bucket:

   ```bash
   gcloud storage buckets update gs://asstec---semarh.firebasestorage.app --cors-file=cors.json
   ```

   (Alternativa, se o comando acima não existir na sua versão:)

   ```bash
   gsutil cors set cors.json gs://asstec---semarh.firebasestorage.app
   ```

5. Conferir se aplicou:

   ```bash
   gcloud storage buckets describe gs://asstec---semarh.firebasestorage.app --format="default(cors_config)"
   ```

6. Volte ao app, recarregue com **Ctrl+Shift+R** e tente o upload de novo.

> Observação de segurança: `"origin": ["*"]` libera o upload a partir de qualquer
> site. Para restringir, troque por algo como
> `["https://SEU-DOMINIO.vercel.app", "http://localhost:3000"]`.
> O controle de QUEM pode gravar continua nas `storage.rules`.

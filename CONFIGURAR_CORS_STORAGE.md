# Ativar o Firebase Storage (necessário para o upload de PDF)

## Causa do erro

O upload de PDF falha porque **o Firebase Storage ainda não foi ativado** neste
projeto — o "balde" (bucket) onde os arquivos ficam não existe, então o envio
retorna **404** (e o navegador mostra isso como erro de CORS).

> Não é preciso configurar CORS manualmente: o endpoint do Firebase já devolve
> os cabeçalhos de CORS corretos. Basta o bucket existir.

## O que fazer (só cliques, ~2 minutos)

1. Acesse https://console.firebase.google.com/ e entre no projeto **asstec---semarh**.
2. No menu da esquerda, em **Criação/Build**, clique em **Storage**.
3. Clique em **Começar / Get started**.
4. Na janela:
   - **Regras de segurança**: escolha **"Iniciar no modo de teste"** (start in test mode) e avance.
   - **Local (location)**: deixe o sugerido (ex.: `southamerica-east1` ou `us-central`) e confirme. (Esse local não pode ser mudado depois — qualquer um serve.)
5. Aguarde criar. Vai aparecer o nome do bucket no topo, algo como
   **`gs://asstec---semarh.firebasestorage.app`**.

   👉 **Anote esse nome e me envie.** Preciso conferir se bate com o que está no
   app. Se for diferente (por ex. terminar em `.appspot.com`), eu ajusto o código.

6. Ainda em **Storage → aba Regras (Rules)**, confirme que está assim e clique em **Publicar**:

   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   (O "modo de teste" expira em 30 dias; essas regras acima não expiram.)

7. Volte ao app, recarregue com **Ctrl + Shift + R** e tente enviar o PDF de novo.

---

## (Só se AINDA der erro de CORS depois disso)

Aí sim aplique a política de CORS via Google Cloud Shell. Veja `cors.json` na raiz
e rode no Cloud Shell (https://console.cloud.google.com/ → ícone do terminal):

```bash
gcloud storage buckets update gs://SEU-BUCKET --cors-file=cors.json
```
Troque `SEU-BUCKET` pelo nome anotado no passo 5.

# Fechar o acesso ao banco (remover o aviso "regras públicas")

O app tem login próprio (senha no banco), então não usa o "Authentication" do
Firebase — por isso as regras estavam abertas (`if true`) e o Firebase mostra o
aviso vermelho. A solução é o **Login Anônimo**: o app faz um login técnico
invisível, e as regras passam a exigir "só acessa quem está logado".

> ⚠️ **Siga exatamente nesta ordem.** Se você apertar as regras ANTES de ativar o
> Login Anônimo, o app para de funcionar.

## Passo 1 — Esperar o deploy do código (já enviado)

O código que faz o login anônimo já foi publicado. Aguarde o Vercel terminar o
deploy (1–2 min). Enquanto isso, com as regras ainda abertas, o app continua
funcionando normalmente.

## Passo 2 — Ativar o Login Anônimo (no painel)

1. https://console.firebase.google.com/ → projeto **asstec---semarh**.
2. Menu esquerdo: **Criação/Build → Authentication**.
3. Se aparecer, clique em **Começar / Get started**.
4. Aba **Sign-in method** (Método de login).
5. Na lista de provedores, clique em **Anônimo / Anonymous** → **Ativar** → **Salvar**.

## Passo 3 — Confirmar que o app ainda funciona

Abra o app, recarregue com **Ctrl + Shift + R**, faça login e navegue. Tudo deve
funcionar igual (o login anônimo é invisível). Abra o F12 → Console; **não** deve
haver erro de login anônimo.

## Passo 4 — Apertar as regras do Firestore

1. Console Firebase → **Firestore Database** → aba **Regras (Rules)**.
2. Apague tudo, cole o conteúdo do arquivo `firestore.rules` deste projeto:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. **Publicar**. O aviso vermelho some.

## Passo 5 — Apertar as regras do Storage

1. Console Firebase → **Storage** → aba **Regras (Rules)**.
2. Apague tudo, cole o conteúdo de `storage.rules`:

   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. **Publicar**.

## Pronto

O banco e os arquivos agora só aceitam acesso do app (via login anônimo) e o
aviso de "regras públicas" desaparece.

### Se algo parar de funcionar
- Erro `permission-denied` / `Missing or insufficient permissions`: o Login
  Anônimo não está ativado (volte ao Passo 2) **ou** as regras foram publicadas
  antes do deploy do código. Para destravar na hora, volte a regra para
  `allow read, write: if true;`, publique, e refaça na ordem.

### Observação honesta sobre o nível de segurança
Isto bloqueia o acesso casual por quem só tem o endereço do banco e remove o
aviso. Não é proteção máxima: como a configuração do app é pública, alguém
tecnicamente avançado ainda conseguiria fazer o login anônimo. Para segurança
forte de verdade (cada pessoa com sua conta), o caminho é migrar o login para o
Firebase Authentication de verdade — é um projeto maior, posso planejar quando
você quiser.

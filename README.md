# Sistema de Despacho de Processos

Aplicativo web para gerenciamento de processos administrativos em assessoria técnica.

## 📋 Requisitos

- Node.js instalado (https://nodejs.org)
- Navegador web moderno

## 🚀 Instalação Rápida

### 1. Abra o Prompt de Comando (ou Terminal)

**Windows**: Pressione `Win + R`, digite `cmd` e enter
**Mac**: Pressione `Cmd + Space`, digite `terminal` e enter
**Linux**: Abra o terminal normalmente

### 2. Navegue até a pasta do projeto

```bash
cd caminho/completo/para/sistema-despacho
```

Exemplo (Windows):
```bash
cd C:\Users\SeuNome\Downloads\sistema-despacho
```

### 3. Instale as dependências

```bash
npm install
```

Isso vai baixar todas as bibliotecas necessárias. Aguarde (pode levar 2-3 minutos na primeira vez).

### 4. Inicie o aplicativo

```bash
npm start
```

Seu navegador abrirá automaticamente com o aplicativo rodando.

## 🔐 Acesso

**Senha padrão**: `senha123`

⚠️ **Recomendação**: Altere a senha padrão!

Para alterar, edite o arquivo `src/App.js` e procure por:
```javascript
if (loginPass === 'senha123')
```

Substitua `'senha123'` pela senha que desejar.

## 📱 Usando o Aplicativo

1. **Login**: Digite a senha e clique em "Acessar"

2. **Abas**: 
   - "Despacho com o Gabinete" para processos do Secretário
   - "Despacho ASSTEC" para processos da assessoria

3. **Processos**:
   - Clique em um processo para ver detalhes completos
   - Visualize análise, documentos anexados e diligências

4. **Ações**:
   - **Autorizo**: Aprova o processo
   - **Dê seguimento**: Marca como processado
   - **Não autorizo**: Rejeita o processo
   - **Diligência**: Solicita complementação de documentos

5. **Documentos**: 
   - Clique em "Anexar arquivo" para adicionar documentos de suporte
   - Os arquivos são salvos localmente no navegador

## 💾 Dados

Os dados são armazenados **localmente no seu computador** (no navegador), sem acesso à internet ou nuvem.

## 📤 Publicar Online (Grátis)

Quando quiser colocar online para acessar de qualquer lugar:

1. Crie uma conta em https://vercel.com (grátis)
2. Conecte seu GitHub
3. Faça upload do projeto
4. Clique "Deploy"

## ⚙️ Troubleshooting

**Erro: "npm command not found"**
- Node.js não foi instalado corretamente. Reinstale.

**Porta 3000 já está em uso**
- Digite em outro terminal:
```bash
npm start -- --port 3001
```

**Dados desapareceram**
- Limpar cache/cookies do navegador apaga os dados locais.
- Recomenda-se fazer backup periodicamente.

## 📞 Suporte

Para questões técnicas, consulte a documentação do React: https://react.dev

# Script de configuração automática do Vercel
# Execute UMA VEZ no terminal do projeto após instalar o Vercel CLI
# Para instalar o Vercel CLI: npm install -g vercel

Write-Host "Configurando variáveis de ambiente no Vercel..." -ForegroundColor Cyan

# Adiciona a chave privada VAPID (necessária para push notifications)
$privateKey = "gSmOtP0cDIMgRT7oHvZHhbbwAiYpvJXR9S3AGuztLVc"
$publicKey  = "BKyDhTAMY-TX8tE055ZPjCTI0yXWbatZznD_jsrB3MetFiL-6Hxr5k55IhIyrFZvc8nuQNp3EZe5-tlBu0rJphU"
$subject    = "mailto:evangelistajradv@gmail.com"

echo $privateKey | vercel env add VAPID_PRIVATE_KEY production
echo $publicKey  | vercel env add REACT_APP_VAPID_PUBLIC_KEY production
echo $subject    | vercel env add VAPID_SUBJECT production

Write-Host "Pronto! Agora rode: vercel --prod" -ForegroundColor Green

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAdi51LAN4exaJyNSofJHhWJrObPFeFSn8",
  authDomain: "asstec---semarh.firebaseapp.com",
  databaseURL: "https://asstec---semarh-default-rtdb.firebaseio.com",
  projectId: "asstec---semarh",
  storageBucket: "asstec---semarh.firebasestorage.app",
  messagingSenderId: "282894994416",
  appId: "1:282894994416:web:2b7493707c166b28472b35"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Cada usuário do sistema (master, secretario, chefe_gab, servidora, estagiaria)
// é uma conta real do Firebase Authentication, identificada por um e-mail técnico
// interno (não é um e-mail de verdade, é só o "nome de usuário" para o Firebase).
const ROLE_EMAIL_DOMAIN = 'asstec-semarh.app';
export const roleEmail = (role) => `${role}@${ROLE_EMAIL_DOMAIN}`;
export const roleFromEmail = (email) => (email || '').split('@')[0];

// Login anônimo automático (invisível ao usuário), usado apenas ANTES do login
// real, para poder ler as configurações do app (config/dados) e verificar a
// senha antiga de quem ainda não migrou para o Firebase Authentication.
// Depois do login, o usuário passa a ter uma sessão real (e-mail/senha) e as
// regras do Firebase passam a exigir essa sessão real para tudo o mais.
let authReadyResolve;
export const authReady = new Promise((resolve) => { authReadyResolve = resolve; });

onAuthStateChanged(auth, (user) => {
  if (user) {
    authReadyResolve(user);
  } else {
    signInAnonymously(auth).catch((e) => {
      // Se o "Login Anônimo" ainda não estiver ativado no console, apenas avisa.
      console.warn('⚠️ Login anônimo do Firebase falhou (ative em Authentication > Sign-in method):', e.message);
      authReadyResolve(null);
    });
  }
});

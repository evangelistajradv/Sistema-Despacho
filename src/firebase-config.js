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

// Login anônimo automático (invisível ao usuário). Dá um "passaporte" técnico ao
// app para que as regras do Firebase possam exigir autenticação — fechando o
// acesso de quem não está usando o app, sem mexer no login próprio do sistema.
// É seguro mesmo com as regras ainda abertas: só passa a ser exigido quando você
// publicar as regras com "request.auth != null".
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

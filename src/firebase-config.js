import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

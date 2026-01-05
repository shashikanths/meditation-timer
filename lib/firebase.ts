import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbgq5y0S-XoHIcLxIubS1BRoCbv20uLuM",
  authDomain: "mdtimer.firebaseapp.com",
  projectId: "mdtimer",
  storageBucket: "mdtimer.firebasestorage.app",
  messagingSenderId: "438381630726",
  appId: "1:438381630726:web:961731b480fe19cbf4ba87"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Helper to generate UUID
export const generateUUID = (): string => {
  return crypto.randomUUID();
};

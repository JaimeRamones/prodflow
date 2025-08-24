// src/firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAiloB-runjMwG5E9yTmy-tYwGSYBe7O-A",
  authDomain: "prodflow-d297d.firebaseapp.com",
  projectId: "prodflow-d297d",
  storageBucket: "prodflow-d297d.firebasestorage.app",
  messagingSenderId: "278168285880",
  appId: "1:278168285880:web:4fb7702f4c66ce7c23ba4d",
  measurementId: "G-04W1JN9W46"
};

// Inicializamos Firebase y exportamos los servicios que necesitamos
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);

export { db, auth, functions };
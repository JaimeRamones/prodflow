/ src/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAiloB-runjMwG5E9yTmy-tYwGSYBe7O-A",
  authDomain: "prodflow-d297d.firebaseapp.com",
  projectId: "prodflow-d297d",
  storageBucket: "prodflow-d297d.firebasestorage.app",
  messagingSenderId: "278168285880",
  appId: "1:278168285880:web:4fb7702f4c66ce7c23ba4d",
  measurementId: "G-04W1JN9W46"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize and export Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
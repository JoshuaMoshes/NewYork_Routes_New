// lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyAFmls2Oz0QjdER39cBg0V6J86MaBZEO14",
    authDomain: "new-york-routes.firebaseapp.com",
    projectId: "new-york-routes",
    storageBucket: "new-york-routes.firebasestorage.app",
    messagingSenderId: "869845944309",
    appId: "1:869845944309:web:3b342cf92b81c6f2ce42bc",
    measurementId: "G-DMDY79XLBH"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

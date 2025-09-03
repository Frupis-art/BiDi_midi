// Файл: src/lib/firebase.ts

// Импортируем необходимые функции из Firebase SDK
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Для базы данных Firestore
// import { getAuth } from "firebase/auth"; // Раскомментируйте позже, если понадобится авторизация

// Ваша конфигурация из Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyCaKfY2hXzBN8pboqmwNZY6m9-crs6xSPs",
  authDomain: "bidi-midi-firebase.firebaseapp.com",
  projectId: "bidi-midi-firebase",
  storageBucket: "bidi-midi-firebase.firebasestorage.app",
  messagingSenderId: "251892322763",
  appId: "1:251892322763:web:6daff14846429726a9e64e",
  measurementId: "G-VBCLVG21L3"
};

// Инициализируем Firebase
const app = initializeApp(firebaseConfig);

// Инициализируем сервисы, которые будем использовать
export const db = getFirestore(app); // Экспортируем базу данных
// export const auth = getAuth(app); // Раскомментируйте позже, если понадобится авторизация

// Экспортируем сам app на всякий случай
export default app;
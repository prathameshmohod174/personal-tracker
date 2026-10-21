import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function hasFirebaseConfig() {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function getFirebaseApp(): FirebaseApp {
  if (!hasFirebaseConfig()) throw new Error("Add your Firebase web app values to .env.local.");
  return getApps().length ? getApps()[0] : initializeApp(config);
}

const app = hasFirebaseConfig() ? getFirebaseApp() : null;
// These clients are only used after configuration has been checked by the app.
export const firebaseAuth = app ? getAuth(app) : (null as unknown as ReturnType<typeof getAuth>);
export const firebaseDb = app ? getFirestore(app) : (null as unknown as ReturnType<typeof getFirestore>);

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminServices() {
  const credential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!credential) throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is missing");
  const serviceAccount = JSON.parse(credential);
  const app = getApps().find((item) => item.name === "dayframe-admin") ?? initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, "dayframe-admin");
  return { auth: getAuth(app), db: getFirestore(app) };
}

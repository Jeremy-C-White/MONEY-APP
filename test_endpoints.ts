import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gen-lang-client-0864937792";
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046";
const app = initializeApp({ credential: applicationDefault(), projectId: FIREBASE_PROJECT_ID });
const db = getFirestore(app, FIRESTORE_DATABASE_ID);
async function run() {
  const users = await db.collection("users").limit(1).get();
  console.log("Users:", users.docs.length);
}
run().catch(console.error);

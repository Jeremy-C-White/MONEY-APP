import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const app = initializeApp({
  credential: applicationDefault(),
  projectId: "ai-studio-3aabea25-37f3-4131-89c3-c2aaa9384046"
});
const db = getFirestore(app);
async function run() {
  const snapshot = await db.collection("users").limit(1).get();
  console.log("Users:", snapshot.docs.map(d => d.id));
}
run().catch(console.error);

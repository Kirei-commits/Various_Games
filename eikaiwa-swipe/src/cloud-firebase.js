/*
 * Firebase（Google ログイン + Firestore）でのクラウド保存。
 * データは users/{uid} の1ドキュメントに、進捗全体を JSON 文字列で保存する。
 * 他人のデータを読み書きできないことは Firestore のセキュリティルールで保証する（README 参照）。
 */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore/lite";

export function createFirebaseCloud(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const toUser = (u) => u && { uid: u.uid, name: u.displayName || "", email: u.email || "", photo: u.photoURL || "" };

  return {
    available: true,
    onAuthChange: (cb) => onAuthStateChanged(auth, (u) => cb(toUser(u))),
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // ポップアップが使えない環境だけ、ページ遷移でのログインに切り替える
        if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, provider);
        } else {
          throw e;
        }
      }
    },
    signOut: () => signOut(auth),
    async load(uid) {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      return { state: JSON.parse(data.state), updatedAt: data.updatedAt || 0 };
    },
    async save(uid, state, updatedAt) {
      await setDoc(doc(db, "users", uid), { state: JSON.stringify(state), updatedAt, version: state.version });
    },
  };
}

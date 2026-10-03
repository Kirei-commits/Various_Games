/*
 * Firebase（Google ログイン + Firestore）でのクラウド保存。
 * データは users/{uid} の1ドキュメントに、進捗全体を JSON 文字列で保存する。
 * 他人のデータを読み書きできないことは Firestore のセキュリティルールで保証する（README 参照）。
 * 対戦（早押しクイズ）の部屋は rooms/{番号} の1ドキュメント。変更はリアルタイムに届く（onSnapshot）。
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
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction } from "firebase/firestore";

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
    rooms: {
      /** 部屋の変化を見張る。cb(部屋 | null)。戻り値で見張りをやめる */
      watch(code, cb, onError) {
        return onSnapshot(
          doc(db, "rooms", code),
          (snap) => cb(snap.exists() ? snap.data() : null),
          (e) => onError?.(e)
        );
      },
      /** 部屋の一部だけを書き換える（読み込みなし。答えの書き込みに使う）。patch は { "answers.3.uid": 値 } の形 */
      update: (code, patch) => updateDoc(doc(db, "rooms", code), patch),
      /** 部屋をトランザクションで書き換える。fn(今の部屋 | null) → { room?, error? }。room があれば保存する */
      async transact(code, fn) {
        return runTransaction(db, async (tx) => {
          const ref = doc(db, "rooms", code);
          const snap = await tx.get(ref);
          const out = fn(snap.exists() ? snap.data() : null) || {};
          if (out.room && !out.error) tx.set(ref, out.room);
          return out;
        });
      },
    },
  };
}

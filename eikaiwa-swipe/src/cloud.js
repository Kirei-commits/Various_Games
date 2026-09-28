/*
 * クラウド保存の窓口。画面側はこのインターフェースだけを使う:
 *   available, onAuthChange(cb) → 解除関数, signIn(), signOut(), load(uid), save(uid, state, updatedAt)
 * E2E テストでは window.__swipetalkCloud に同じ形の偽物を入れて差し替える。
 */
import config from "./cloud-config.js";
import { createFirebaseCloud } from "./cloud-firebase.js";

const injected = typeof window !== "undefined" ? window.__swipetalkCloud : null;

export const cloud = injected || (config && createFirebaseCloud ? createFirebaseCloud(config) : { available: false });

/** Firebase のエラーを、利用者が次に何をすればいいか分かる文に直す（空文字は表示しない） */
export function authErrorMessage(e) {
  const code = e?.code || "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
  if (code === "auth/unauthorized-domain") {
    return "このサイトのドメインが Firebase で許可されていません（Authentication → 設定 → 承認済みドメインに追加してください）。";
  }
  if (code === "auth/network-request-failed") return "通信できませんでした。インターネット接続を確認してください。";
  return `ログインできませんでした（${code || e?.message || "不明なエラー"}）。`;
}

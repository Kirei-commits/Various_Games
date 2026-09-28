/**
 * 公開済みの問題IDの一覧（src/data/ids.lock.json）を扱う。Node 標準の機能だけで動く。
 *
 * 学習記録は問題IDに結びついているので、一度公開したIDが黙って消えると、その問題の記録が
 * 引き継がれなくなる。ビルドのたびに新しいIDを一覧へ追記し（消さない）、lint は
 * 「一覧にあるのに今の教材にないID」が src/data/id-changes.js に書かれているかを検査する。
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./source-hash.mjs";
import { currentId } from "../src/logic.js";

export const LOCK_PATH = path.join(ROOT, "src/data/ids.lock.json");

export function readLock() {
  if (!fs.existsSync(LOCK_PATH)) return [];
  return JSON.parse(fs.readFileSync(LOCK_PATH, "utf8"));
}

/** 今の教材のIDを一覧に追記する（一覧から消すことはしない）。変わったら true */
export function updateLock(library) {
  const before = readLock();
  const next = [...new Set([...before, ...Object.keys(library.byId)])].sort();
  if (next.length === before.length) return false;
  fs.writeFileSync(LOCK_PATH, `${JSON.stringify(next, null, 0).replace(/","/g, '",\n"').replace(/^\[/, "[\n").replace(/\]$/, "\n]")}\n`);
  return true;
}

/** 一覧と教材・変更履歴の食い違いを探す */
export function checkLock(library, lock, { renamed = {}, retired = [] } = {}) {
  const problems = [];
  const valid = (id) => Object.prototype.hasOwnProperty.call(library.byId, id);
  const retiredSet = new Set(retired);

  for (const id of lock) {
    if (valid(id) || retiredSet.has(id)) continue;
    if (Object.prototype.hasOwnProperty.call(renamed, id)) {
      if (!valid(currentId(id, renamed))) {
        problems.push(`変更履歴 "${id}" の行き先 "${currentId(id, renamed)}" が教材にありません`);
      }
      continue;
    }
    problems.push(
      `公開済みの問題ID "${id}" が教材から消えています。英語を書き換えたなら src/data/id-changes.js の RENAMED に` +
        ` "${id}": "新しいID" を、削除したなら RETIRED に "${id}" を書いてください（学習記録を引き継ぐため）`
    );
  }
  for (const id of Object.keys(renamed)) {
    if (valid(id)) problems.push(`変更履歴の古いID "${id}" が、今の教材でも使われています（同じIDを付け替えると記録が混ざります）`);
  }
  const locked = new Set(lock);
  const unlocked = Object.keys(library.byId).filter((id) => !locked.has(id));
  if (unlocked.length) {
    problems.push(`新しい問題ID ${unlocked.length} 件が ids.lock.json にありません。npm run build を実行してください`);
  }
  return problems;
}

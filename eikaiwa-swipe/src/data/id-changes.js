/*
 * 問題IDの変更履歴。学習記録（覚えた・苦手・並び順）は問題IDに結びついている。
 *
 * ID は英語から自動で作る（"make sense" → "make-sense"）ので、英語を書き換えると ID が変わる。
 * そのままだと、その問題の記録が引き継がれない。そこで:
 *
 * - 英語を書き換えた（または別の問題に統合した）→ RENAMED に「古いID: 新しいID」を書く
 * - 問題を削除した → RETIRED に古いIDを書く（記録は保存データに残るので、戻せば復活する）
 *
 * 一度公開した ID は src/data/ids.lock.json に記録されていて、ここへの書き忘れは lint が止める。
 * 追記するだけで、既存の行は消さないこと。
 */

/** @type {Record<string, string>} 古いID → 新しいID */
export const RENAMED = {};

/** @type {string[]} 削除した問題のID */
export const RETIRED = [];

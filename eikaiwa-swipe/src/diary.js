/*
 * 日記: 集めた単語を使って英語の日記を書き、日付ごとに保存する（純粋関数。Node でテストできる）。
 * 採点はしない。
 */

/** 日記に使った、集めた単語（ガチャ）の ID。cards は英語（小文字）→ { id } */
export function usedWords(text, cards = {}) {
  const ids = [];
  for (const w of String(text || "").toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []) {
    const c = cards[w];
    if (c && !ids.includes(c.id)) ids.push(c.id);
  }
  return ids;
}

/** 日記を保存する（同じ日は上書き） */
export function saveDiary(state, date, text, words, now) {
  const prev = (state.diary || {})[date] || {};
  return { ...state, diary: { ...(state.diary || {}), [date]: { ...prev, text, at: now, words } } };
}

/** 日記の保存データを整える（以前の採点の値 score / points があっても消さずに残す） */
export function restoreDiary(saved) {
  const out = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [date, e] of Object.entries(saved)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !e || typeof e.text !== "string") continue;
    out[date] = {
      ...e,
      text: e.text,
      at: Number.isFinite(e.at) ? e.at : 0,
      words: Array.isArray(e.words) ? e.words : [],
    };
  }
  return out;
}

/** 2台の端末の日記を統合する（日ごとに、あとで書いた方） */
export function mergeDiary(a, b) {
  const x = restoreDiary(a);
  const y = restoreDiary(b);
  const out = { ...x };
  for (const [date, e] of Object.entries(y)) if (!out[date] || e.at >= out[date].at) out[date] = e;
  return out;
}

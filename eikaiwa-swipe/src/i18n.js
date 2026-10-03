/*
 * 表示の言語（日本語 / English）。設定の「表示の言語」で切り替える。
 * 画面の文字は tr("日本語", "English") で書く。学習する中身（英文・日本語訳）はどちらの言語でもそのまま。
 */
let lang = "ja";

export const LANGS = ["ja", "en"];
export const setLang = (next) => {
  lang = next === "en" ? "en" : "ja";
  if (typeof document !== "undefined") document.documentElement.lang = lang;
};
export const getLang = () => lang;
/** 今の言語の文字を選ぶ */
export const tr = (ja, en) => (lang === "en" ? en : ja);

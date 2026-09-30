/*
 * 英文のカタカナの読み方（ルビ）。
 * - 発音は src/data/pron.js（CMU Pronouncing Dictionary から、教材に出てくる単語だけを抜き出したもの。tools/readings.mjs が作る）
 * - ふつうの読み: 1語ずつ、発音記号（ARPAbet）をカタカナにする（アメリカ英語寄り: hot → ハット、water → ウォーター）
 * - リンキングの読み: src/linking.js で「つながる」と判定された語をひとまとめにして、
 *   音の変化（t がラ行・h が消える・d＋you がジャ など）を入れてから読む（get it → ゲリッ、tell him → テリム、want to → ワナ）
 * カタカナはおおよその読み。DOM に触らない純粋関数（テストあり）。
 */
import PRON_TEXT from "./data/pron.js";
import { analyzeLinking } from "./linking.js";

let PRON = null;
/** 単語 → 発音記号の配列（辞書にない単語は null） */
export function phonesOf(word) {
  if (!PRON) {
    PRON = new Map();
    for (const line of PRON_TEXT.split("\n")) {
      const i = line.indexOf(" ");
      if (i > 0) PRON.set(line.slice(0, i), line.slice(i + 1).split(" "));
    }
  }
  const key = keyOf(word);
  if (!key) return null;
  if (PRON.has(key)) return PRON.get(key);
  // つなぎ語（well-known など）は部分ごとに
  if (key.includes("-")) {
    const parts = key.split("-").filter(Boolean).map((k) => PRON.get(k));
    return parts.length && parts.every(Boolean) ? parts.flat() : null;
  }
  return null;
}

/** 表示の語（句読点つき）→ 辞書を引くときの形 */
export function keyOf(token) {
  return String(token || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/[^a-z0-9'-]/g, "");
}

/** 英文に出てくる単語（辞書を引く形）。つなぎ語は部分も入れる */
export function wordsOf(text) {
  const out = [];
  for (const t of String(text || "").split(/\s+/)) {
    const k = keyOf(t);
    if (!k) continue;
    out.push(k);
    if (k.includes("-")) out.push(...k.split("-").filter(Boolean));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 発音記号 → カタカナ
// ---------------------------------------------------------------------------

const COL = { a: 0, i: 1, u: 2, e: 3, o: 4 };
/** 母音 → 段と、あとに付ける音 */
const VOWEL = {
  AA: ["a", ""], // アメリカ英語の hot・stop は「ア」に近い
  AE: ["a", ""],
  AH: ["a", ""],
  AO: ["o", "ー"],
  AW: ["a", "ウ"],
  AY: ["a", "イ"],
  EH: ["e", ""],
  ER: ["a", "ー"],
  EY: ["e", "イ"],
  IH: ["i", ""],
  IY: ["i", "ー"],
  OW: ["o", "ー"],
  OY: ["o", "イ"],
  UH: ["u", ""],
  UW: ["u", "ー"],
};
const SHORT = new Set(["AA", "AE", "AH", "EH", "IH", "UH", "AO-"]); // AO- は伸ばさない AO（dog）
const ROW = {
  "": ["ア", "イ", "ウ", "エ", "オ"],
  K: ["カ", "キ", "ク", "ケ", "コ"],
  G: ["ガ", "ギ", "グ", "ゲ", "ゴ"],
  S: ["サ", "スィ", "ス", "セ", "ソ"],
  Z: ["ザ", "ズィ", "ズ", "ゼ", "ゾ"],
  SH: ["シャ", "シ", "シュ", "シェ", "ショ"],
  ZH: ["ジャ", "ジ", "ジュ", "ジェ", "ジョ"],
  JH: ["ジャ", "ジ", "ジュ", "ジェ", "ジョ"],
  CH: ["チャ", "チ", "チュ", "チェ", "チョ"],
  T: ["タ", "ティ", "トゥ", "テ", "ト"],
  D: ["ダ", "ディ", "ドゥ", "デ", "ド"],
  TH: ["サ", "スィ", "ス", "セ", "ソ"],
  DH: ["ザ", "ズィ", "ズ", "ゼ", "ゾ"],
  N: ["ナ", "ニ", "ヌ", "ネ", "ノ"],
  M: ["マ", "ミ", "ム", "メ", "モ"],
  HH: ["ハ", "ヒ", "フ", "ヘ", "ホ"],
  F: ["ファ", "フィ", "フ", "フェ", "フォ"],
  V: ["ヴァ", "ヴィ", "ヴ", "ヴェ", "ヴォ"],
  B: ["バ", "ビ", "ブ", "ベ", "ボ"],
  P: ["パ", "ピ", "プ", "ペ", "ポ"],
  L: ["ラ", "リ", "ル", "レ", "ロ"],
  R: ["ラ", "リ", "ル", "レ", "ロ"],
  DX: ["ラ", "リ", "ル", "レ", "ロ"], // やわらかい t（water の t）
  W: ["ワ", "ウィ", "ウ", "ウェ", "ウォ"],
  Y: ["ヤ", "イ", "ユ", "イェ", "ヨ"],
  NG: ["ンガ", "ンギ", "ング", "ンゲ", "ンゴ"],
};
/** 母音がつかない子音 */
const ALONE = { K: "ク", G: "グ", S: "ス", Z: "ズ", SH: "シュ", ZH: "ジュ", JH: "ジ", CH: "チ", T: "ト", D: "ド", TH: "ス", DH: "ズ", N: "ン", M: "ム", HH: "", F: "フ", V: "ヴ", B: "ブ", P: "プ", L: "ル", R: "ル", DX: "ル", W: "ウ", Y: "イ", NG: "ング", Q: "ッ" };
/** 「ッ」を入れる子音（短い母音のあと、母音がつかないとき: get → ゲット） */
const GEMINATE = new Set(["P", "T", "K", "CH", "G", "D", "JH", "SH"]);
/** 後ろに ャュョ がつけられる子音（cute → キュート） */
const SMALL_Y = { a: "ャ", u: "ュ", o: "ョ" };
/** r のあとで「ア」になる母音（here → ヒア、care → ケア） */
const R_AS_A = new Set(["IY", "IH", "EH", "UH", "AY", "AW"]);

const vowelOf = (p) => (p ? p.replace(/\d/g, "") : "");
const isVowel = (p) => !!VOWEL[vowelOf(p)];

/**
 * 発音記号の並び → カタカナ。
 * 要素は "T" "EY1" のような発音記号か、{ kana } （そのまま入れるカタカナ）
 */
export function toKana(phones) {
  let out = "";
  let prevVowel = null; // 直前に読んだ母音（r のあとの伸ばし・「ッ」の判断に使う）
  for (let i = 0; i < phones.length; i++) {
    const p = phones[i];
    if (typeof p === "object") {
      out += p.kana;
      prevVowel = null;
      continue;
    }
    const v = vowelOf(p);
    const next = phones[i + 1];
    if (VOWEL[v]) {
      const t = tail(v, next, phones[i + 2]);
      out += ROW[""][COL[VOWEL[v][0]]] + t;
      prevVowel = v === "AO" && !t ? "AO-" : v;
      continue;
    }
    const nv = typeof next === "string" ? vowelOf(next) : "";
    // 子音 ＋ y ＋ 母音（cute・human・music）
    if (nv === "Y" && isVowel(phones[i + 2]) && ROW[p] && p !== "Y" && p !== "W") {
      const v2 = vowelOf(phones[i + 2]);
      const col = VOWEL[v2][0];
      if (SMALL_Y[col]) {
        out += ROW[p][1].slice(0, 1) + SMALL_Y[col] + tail(v2, phones[i + 3], phones[i + 4]);
        prevVowel = v2;
        i += 2;
        continue;
      }
    }
    // あいまいな母音 ＋ l（table → テイブル、little → リトル）: 母音を読まない
    if (nv === "AH" && next === "AH0" && phones[i + 2] === "L" && !isVowel(phones[i + 3]) && p !== "DX" && ALONE[p]) {
      if (GEMINATE.has(p) && prevVowel && SHORT.has(prevVowel) && !out.endsWith("ッ")) out += "ッ";
      out += ALONE[p];
      prevVowel = null;
      i += 1;
      continue;
    }
    if (VOWEL[nv] && ROW[p]) {
      const t = tail(nv, phones[i + 2], phones[i + 3]);
      out += ROW[p][COL[VOWEL[nv][0]]] + t;
      prevVowel = nv === "AO" && !t ? "AO-" : nv;
      i += 1;
      continue;
    }
    // 子音 ＋ w ＋ 母音（twenty → トゥエンティー、quick → クイック、sweet → スイート）
    if (nv === "W" && isVowel(phones[i + 2]) && ALONE[p]) {
      const v2 = vowelOf(phones[i + 2]);
      const t = tail(v2, phones[i + 3], phones[i + 4]);
      out += (p === "T" ? "トゥ" : p === "D" ? "ドゥ" : ALONE[p]) + ROW[""][COL[VOWEL[v2][0]]] + t;
      prevVowel = v2;
      i += 2;
      continue;
    }
    // 母音のつかない子音
    if (p === "R" && prevVowel) {
      // 母音のあとの r: 伸ばす（car → カー）か「ア」（here → ヒア）
      if (R_AS_A.has(prevVowel)) out += "ア";
      else if (!out.endsWith("ー")) out += "ー";
      prevVowel = null;
      continue;
    }
    if (GEMINATE.has(p) && prevVowel && SHORT.has(prevVowel) && !out.endsWith("ッ")) out += "ッ";
    if ((p === "M" || p === "N") && ["P", "B", "M"].includes(nv)) out += "ン";
    else if (p === "NG" && (nv === "K" || nv === "G")) out += "ン"; // thank → サンク、English → イングリッシュ
    else out += ALONE[p] ?? "";
    prevVowel = null;
  }
  return out;
}

/**
 * 母音のあとに付ける音（ー・イ・ウ）。
 * AO は短い音が続くときは伸ばさない（dog → ドッグ、long → ロング）。IY のあとの r は「ア」だけ（here → ヒア）
 */
function tail(v, next, after) {
  const n = typeof next === "string" ? vowelOf(next) : "";
  if (v === "AO") return ["NG", "G", "P", "S", "F", "SH"].includes(n) ? "" : "ー";
  if (v === "IY" && n === "R" && !isVowel(after)) return "";
  return VOWEL[v][1];
}

/** 1語のカタカナ（辞書にない単語は null） */
export function kanaOf(word) {
  const ph = phonesOf(word);
  return ph ? toKana(ph) : null;
}

// ---------------------------------------------------------------------------
// リンキングの読み方
// ---------------------------------------------------------------------------

const lastPhone = (arr) => arr[arr.length - 1];
const isStressless = (p) => typeof p === "string" && /0$/.test(p);

/** 1語の中の変化（water の t がラ行、twenty の t が消える）を入れる */
function innerChanged(phones, inner) {
  if (!inner?.length) return phones;
  const out = [...phones];
  for (let i = 1; i < out.length - 1; i++) {
    const before = out[i - 1];
    const after = out[i + 1];
    const afterWeak = isStressless(after) || after === "L" || after === "ER0";
    if (inner.includes("flap") && out[i] === "T" && (isVowel(before) || (before === "R" && isVowel(out[i - 2]))) && afterWeak) out[i] = "DX";
    if (inner.includes("nt") && out[i] === "T" && before === "N" && afterWeak) out.splice(i, 1);
  }
  return out;
}

/**
 * 英文を、ルビを付けるまとまりに分ける。
 * @param linking true ならリンキングの読み方（つながる語をひとまとめにして、音の変化を入れる）
 * @returns {{ from: number, to: number, kana: string|null, linked: boolean }[]}
 *   from〜to は analyzeLinking(text).tokens の番号。linked はリンキングでまとめた（または音が変わった）まとまり
 */
export function readingGroups(text, linking = false) {
  const { tokens } = analyzeLinking(text);
  const phones = tokens.map((t) => phonesOf(t.text));
  const groups = [];
  if (!linking) {
    tokens.forEach((t, i) => groups.push({ from: i, to: i, kana: phones[i] ? toKana(phones[i]) : null, linked: false }));
    return groups;
  }
  let i = 0;
  while (i < tokens.length) {
    // つながる語をまとめる（辞書にない語があればそこで切る）
    let j = i;
    while (j < tokens.length - 1 && tokens[j].link && phones[j] && phones[j + 1]) j++;
    if (!phones[i]) {
      groups.push({ from: i, to: i, kana: null, linked: false });
      i += 1;
      continue;
    }
    const seq = [];
    let changed = j > i;
    for (let k = i; k <= j; k++) {
      const t = tokens[k];
      // 決まった言い方（want to → ワナ）は、その読みをそのまま使う
      if (t.reduce && k + t.reduce.n - 1 <= j && t.reduce.kana) {
        let kana = t.reduce.kana;
        const prev = tokens[k - 1];
        const last = lastPhone(seq);
        const col = "アイウエオ".indexOf(kana[0]);
        // 子音で終わる語のあとに母音で始まる決まった言い方が続く（got a lot of → ガラーラ）: 子音と頭の母音をくっつける
        if (k > i && prev?.link && col >= 0 && typeof last === "string" && !isVowel(last) && ROW[last]) {
          const c = prev.link === "flap" && (last === "T" || last === "D") ? "DX" : last;
          seq[seq.length - 1] = { kana: ROW[c][col] };
          kana = kana.slice(1);
        }
        seq.push({ kana });
        k += t.reduce.n - 1;
        continue;
      }
      let ph = innerChanged(phones[k], t.inner);
      if (ph !== phones[k]) changed = true;
      const prev = tokens[k - 1];
      if (k > i && prev?.link && seq.length) {
        const last = lastPhone(seq);
        const first = ph[0];
        switch (prev.link) {
          case "hdrop": // tell him → テリム
            if (first === "HH") ph = ph.slice(1);
            break;
          case "flap": // get it → ゲリッ
            if (last === "T" || last === "D") seq[seq.length - 1] = "DX";
            break;
          case "blend": // did you → ディジュー、got you → ガッチュー
            if (first === "Y" && (last === "D" || last === "T")) {
              seq[seq.length - 1] = last === "D" ? "JH" : "CH";
              ph = ph.slice(1);
            }
            break;
          case "same": // big game → ビッゲイム
            if (typeof last === "string" && vowelOf(last) === vowelOf(first)) seq.pop();
            break;
          case "glide": // go on → ゴーウォン、see it → スィーイッ
            if (typeof last === "string" && isVowel(first)) {
              const v = vowelOf(last);
              if (["UW", "OW", "AW"].includes(v)) seq.push("W");
              else if (["IY", "EY", "AY", "OY"].includes(v)) seq.push("Y");
            }
            break;
          default:
            break;
        }
      }
      seq.push(...ph);
      // 止める t（that man → ザッ マン）: まとまりの最後で、次の語が子音で始まる
      if (k === j && t.stop && lastPhone(seq) === "T") {
        seq[seq.length - 1] = "Q";
        changed = true;
      }
    }
    // まとまりの最後の t（母音のあと）は、つながった先では弱くなる（get it → ゲリッ）
    if (j > i && lastPhone(seq) === "T" && isVowel(seq[seq.length - 2])) seq[seq.length - 1] = "Q";
    groups.push({ from: i, to: j, kana: toKana(seq), linked: changed });
    i = j + 1;
  }
  return groups;
}

/*
 * リンキング（音のつながり）の分析（純粋関数。Node でテストできる）。
 *
 * ネイティブは単語を1つずつ区切らず、つなげたり、消したり、変えたりして話す。
 * 英文を受け取り、どの単語どうしがつながるか（‿ で表示）と、その理由・発音のヒントを返す。
 *   - 決まった音の変化: want to → wanna、going to → gonna、did you → didja など
 *   - 子音＋母音のつながり: check it out → チェキラウ
 *   - 母音＋母音: go on → go(w)on（軽い w / y をはさむ）
 *   - 同じ子音が続く: bad day → 1回だけ
 *   - t / d ＋ you: meet you → ミーチュー
 *   - アメリカ英語のやわらかい t（フラップ）: water → ワラー、get it → ゲリッ
 *   - n のあとの t が消える: twenty → トゥエニー
 *   - 文中の him / her の h が消える: tell him → テリム
 *   - 語末の t が止まるだけ: don't know、right now
 * 綴りからの推定なので、例外はある（学習の目安）。
 */

/** 決まった音の変化（左から順に長いものを優先して探す） */
const REDUCTIONS = [
  { words: ["what", "are", "you"], sound: "whatcha（ワッチャ）", tip: "What are you は「ワッチャ」とひとかたまりで言う。" },
  { words: ["what", "do", "you"], sound: "whaddaya（ワダヤ）", tip: "What do you は「ワダヤ」と短くつぶれる。" },
  { words: ["a", "lot", "of"], sound: "a lotta（アラーラ）", tip: "lot of の t がやわらかくなり、of は「ア」だけになる。" },
  { words: ["going", "to"], sound: "gonna（ガナ）", tip: "「〜するつもり」の going to は会話では gonna になる。", needsVerb: true },
  { words: ["want", "to"], sound: "wanna（ワナ）", tip: "want to は t が消えて wanna になる。" },
  { words: ["got", "to"], sound: "gotta（ガラ）", tip: "「〜しなきゃ」の got to は gotta になる。", needsVerb: true },
  { words: ["have", "to"], sound: "hafta（ハフタ）", tip: "「〜しなければならない」の have to は v が f になって「ハフタ」。", needsVerb: true },
  { words: ["has", "to"], sound: "hasta（ハスタ）", tip: "has to は s の音のまま「ハスタ」。", needsVerb: true },
  { words: ["kind", "of"], sound: "kinda（カインダ）", tip: "kind of は of が「ア」になって kinda。" },
  { words: ["sort", "of"], sound: "sorta（ソーラ）", tip: "sort of は t がやわらかくなって sorta。" },
  { words: ["out", "of"], sound: "outta（アウラ）", tip: "out of は t がやわらかくなって outta。" },
  { words: ["lots", "of"], sound: "lotsa（ラッツァ）", tip: "lots of は of が「ア」だけになる。" },
  { words: ["let", "me"], sound: "lemme（レミ）", tip: "let me は t が消えて lemme。" },
  { words: ["give", "me"], sound: "gimme（ギミ）", tip: "give me は v が消えて gimme。" },
  { words: ["don't", "know"], sound: "dunno（ダノウ）", tip: "I don't know はくだけると「アイダノウ」。" },
  { words: ["did", "you"], sound: "didja（ディジャ）", tip: "d ＋ you が混ざって「ジャ」になる。" },
  { words: ["would", "you"], sound: "wouldja（ウッジャ）", tip: "d ＋ you が混ざって「ジャ」になる。" },
  { words: ["could", "you"], sound: "couldja（クッジャ）", tip: "d ＋ you が混ざって「ジャ」になる。" },
  { words: ["don't", "you"], sound: "doncha（ドンチャ）", tip: "t ＋ you が混ざって「チャ」になる。" },
  { words: ["got", "you"], sound: "gotcha（ガッチャ）", tip: "t ＋ you が混ざって「チャ」になる。" },
  { words: ["bet", "you"], sound: "betcha（ベッチャ）", tip: "t ＋ you が混ざって「チャ」になる。" },
];

/** going to の次がこれなら「場所へ行く」の意味なので gonna にしない */
const NOT_VERB = new Set([
  "the", "a", "an", "my", "your", "his", "her", "our", "their", "this", "that", "these", "those",
  "school", "work", "bed", "church", "class", "sleep", "town", "college", "jail", "court", "lunch", "dinner",
  "breakfast", "it", "him", "them", "me", "us", "you", "some", "any", "every", "each", "all",
]);

/** 語末の t を止めるだけで発音しやすい、よく使う語 */
const STOP_T = new Set([
  "dont", "cant", "wont", "didnt", "doesnt", "isnt", "wasnt", "arent", "werent", "havent", "hasnt", "couldnt",
  "wouldnt", "shouldnt", "aint", "that", "what", "not", "right", "get", "got", "but", "out", "about", "might",
  "let", "put", "great", "night", "light", "tonight", "wait", "bought", "thought", "at", "it",
]);

/** 文中で h が弱くなって消えやすい語 */
const H_DROP = new Set(["him", "her", "his", "have", "has", "had"]);
/** 綴りは母音字で始まるが、音は子音（y / w）で始まる語 */
const CONSONANT_SOUND_START = /^(one|once|uni|use|usu|uti|eu|ewe|you|yea)/;
/** 綴りは h で始まるが、h を発音しない語 */
const SILENT_H = /^(hour|honest|honor|heir)/;

export const LINK_TIPS = {
  link: "子音で終わる語と母音で始まる語は、1語のようにつなげて読む（check it out → チェキラウ）。",
  glide: "母音と母音が続くときは、間に軽い「w」や「y」の音をはさんでなめらかにつなぐ（go on → ゴウウォン）。",
  same: "同じ（似た）子音が続くときは、前の音はためるだけで、1回だけ発音する（bad day → バッデイ）。",
  blend: "t / d ＋ you は音が混ざって「チュ」「ジュ」になる（meet you → ミーチュー）。",
  flap: "母音にはさまれた t は、アメリカ英語ではラ行に近いやわらかい音になる（water → ワラー、get it → ゲリッ）。",
  nt: "n のあとの t が消えて、n だけになりやすい（twenty → トゥエニー、internet → イナネット）。",
  hdrop: "文の中の him / her / his / have の h は弱くなって消え、前の語とつながる（tell him → テリム）。",
  stop: "語末の t は息を止めるだけで、はっきり発音しない（right now → ライッナウ）。",
  reduction: "決まった言い方は、つぶれて短くなる。",
};

export const LINK_LABELS = {
  link: "つながる音",
  glide: "母音のつなぎ",
  same: "同じ子音",
  blend: "混ざる音",
  flap: "やわらかい t",
  nt: "消える t",
  hdrop: "消える h",
  stop: "止める t",
  reduction: "短くなる言い方",
};

const clean = (w) =>
  w
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");

const bare = (w) => (w || "").replace(/'/g, "");

/** この語のうしろで区切り（読点・句点など）が入るか */
const pausesAfter = (raw) => /[.,!?;:…—"”)]$/.test(raw);

const VOWEL = /[aeiou]/;

/** 綴りから、語末が子音の音か母音の音かを推定する */
function endsWithConsonantSound(w) {
  if (!w) return false;
  if (/(ee|ie|oe|ue|ye)$/.test(w)) return false;
  if (/e$/.test(w)) return w.length > 2 && !/^(the|be|he|me|she|we)$/.test(w); // make, like の e は読まない
  if (/(ay|ey|oy|uy|ow|aw|ew)$/.test(w)) return false;
  if (/[aeiouy]$/.test(w)) return false;
  return /[a-z]$/.test(w);
}

/** 語頭が母音の音か */
function startsWithVowelSound(w) {
  if (!w) return false;
  if (CONSONANT_SOUND_START.test(w)) return false;
  if (SILENT_H.test(w)) return true;
  return VOWEL.test(w[0]);
}

/** 語末の子音字（読まない e を除く） */
function finalConsonant(w) {
  const base = w.replace(/e$/, "");
  const c = base.slice(-1);
  return /[bcdfghjklmnpqrstvwxz]/.test(c) ? c : "";
}
const SOUND_GROUP = { c: "k", k: "k", q: "k", t: "t", d: "t", s: "s", z: "s", m: "m", n: "n", p: "p", b: "p", g: "g", l: "l", f: "f", v: "f", r: "r" };

/** 1語の中のやわらかい t（フラップ）と消える t */
export function innerChanges(w) {
  const changes = [];
  // 母音（または母音＋r）と、弱い語尾にはさまれた t: water, city, better, party, getting, little, photo
  if (/[aeiou]r?tt?(er|ers|y|ies|ing|ed|le|les|ity|o|a|ow)$/.test(w)) changes.push("flap");
  // n のあとの t: twenty, center, wanted, internet
  if (/[aeiou]nt(er|ers|y|ies|ed|ing|ernet|ernational|a)$/.test(w)) changes.push("nt");
  return changes;
}

/**
 * 英文のリンキングを分析する。
 * @returns {{
 *   tokens: { text: string, link: string|null, inner: string[] }[],
 *   notes: { kind: string, label: string, words: string, sound: string, tip: string }[]
 * }}
 * tokens[i].link は、その語と次の語がつながる理由（つながらなければ null）。
 */
export function analyzeLinking(text) {
  const raw = (text || "").split(/\s+/).filter(Boolean);
  const words = raw.map(clean);
  const tokens = raw.map((t, i) => ({ text: t, link: null, inner: innerChanges(words[i]) }));
  const notes = [];
  const seen = new Set();
  const note = (kind, from, to, sound = "", tip = LINK_TIPS[kind]) => {
    const phrase = raw.slice(from, to + 1).join(" ").replace(/[.,!?;:…"”]+$/, "");
    const key = `${kind}:${phrase.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    notes.push({ kind, label: LINK_LABELS[kind], words: phrase, sound, tip });
  };
  const joinable = (i) => i + 1 < raw.length && !pausesAfter(raw[i]) && words[i] && words[i + 1];

  // 1. 決まった音の変化
  const covered = new Set(); // つながりを決めた語の組（i と i+1）
  for (let i = 0; i < words.length; i++) {
    for (const r of REDUCTIONS) {
      const n = r.words.length;
      if (!r.words.every((w, k) => bare(words[i + k]) === bare(w))) continue;
      let ok = true;
      for (let k = 0; k < n - 1; k++) if (pausesAfter(raw[i + k])) ok = false;
      if (!ok) continue;
      if (r.needsVerb) {
        const next = words[i + n];
        if (!next || NOT_VERB.has(next) || pausesAfter(raw[i + n - 1])) continue;
      }
      for (let k = 0; k < n - 1; k++) {
        tokens[i + k].link = "reduction";
        covered.add(i + k);
      }
      // リンキングの読み方（ルビ）用: この語から n 語ぶんの読み（「wanna（ワナ）」のカッコの中）
      tokens[i].reduce = { n, kana: (r.sound.match(/（(.+?)）/) || [])[1] || "" };
      note("reduction", i, i + n - 1, r.sound, r.tip);
      break;
    }
  }

  // 2. 語と語のつながり
  for (let i = 0; i + 1 < words.length; i++) {
    if (covered.has(i) || !joinable(i)) continue;
    const a = words[i];
    const b = words[i + 1];
    const aCons = endsWithConsonantSound(a);
    const fa = finalConsonant(a);

    if (/^(you|your|yourself)$/.test(b) && /[td]$/.test(a)) {
      tokens[i].link = "blend";
      note("blend", i, i + 1);
      continue;
    }
    if (H_DROP.has(b) && aCons) {
      tokens[i].link = "hdrop";
      note("hdrop", i, i + 1);
      continue;
    }
    if (startsWithVowelSound(b)) {
      if (aCons) {
        // 母音＋t の語（get, what, it, lot…）が母音の前に来ると、t がやわらかくなる
        const flap = /[aeiou]r?t$/.test(a) || /^(it|at|what|that|get|got|let|put|but|not|lot|bit|out|about|eat|meet|sit)$/.test(a);
        tokens[i].link = flap ? "flap" : "link";
        note(flap ? "flap" : "link", i, i + 1);
      } else if (/[aeiouyw]$/.test(a) || /(ee|ie|oe|ue|ye)$/.test(a) || /^(the|be|he|me|she|we)$/.test(a)) {
        tokens[i].link = "glide";
        note("glide", i, i + 1);
      }
      continue;
    }
    const fb = b[0];
    // th / sh / ch で始まる語は別の音なので「同じ子音」にしない（got this など）
    if (fa && SOUND_GROUP[fa] && SOUND_GROUP[fa] === SOUND_GROUP[fb] && !/^[tsc]h/.test(b)) {
      tokens[i].link = "same";
      note("same", i, i + 1);
      continue;
    }
    if (STOP_T.has(bare(a)) && /^[b-df-hj-np-tv-z]/.test(b)) {
      tokens[i].stop = true; // リンキングの読み方（ルビ）で、語尾の t を「ッ」にする
      note("stop", i, i + 1);
    }
  }

  // 3. 1語の中の変化
  tokens.forEach((t, i) => {
    for (const kind of t.inner) note(kind, i, i);
  });

  return { tokens, notes };
}

/** 英文にリンキングの印（‿）を付けた文字列（テストや読み上げ用の表示） */
export function linkedString(text) {
  const { tokens } = analyzeLinking(text);
  return tokens.map((t) => t.text + (t.link ? "‿" : " ")).join("").trim();
}

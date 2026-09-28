/*
 * 読み上げに使う声の選び方（純粋関数。ブラウザの SpeechSynthesisVoice と同じ形の
 * { name, lang, voiceURI, localService } を受け取るので Node でテストできる）。
 *
 * iPhone / Mac の英語の声には、効果音のような「おもしろ音声」（Bubbles, Zarvox など）や
 * 古い合成音声（Fred など）がたくさん含まれている。名前順で選ぶとそれが会話の相手役に
 * 当たってしまうので、除外したうえで、A 役と性別が違うまともな声を B 役に選ぶ。
 */

/** 会話の読み上げに向かない声（Apple のおもしろ音声・旧式の合成音声） */
const EXCLUDED = new Set([
  "Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Deranged", "Good News",
  "Hysterical", "Jester", "Organ", "Pipe Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox",
  "Fred", "Junior", "Kathy", "Ralph", "Princess", "Agnes", "Bruce", "Vicki", "Victoria",
  "Eddy", "Flo", "Grandma", "Grandpa", "Reed", "Rocko", "Sandy", "Shelley",
]);

const FEMALE = new Set([
  "Samantha", "Karen", "Moira", "Tessa", "Allison", "Ava", "Susan", "Zoe", "Nicky", "Serena", "Kate",
  "Fiona", "Veena", "Catherine", "Isha", "Martha", "Siri Female", "Joelle", "Noelle", "Stephanie", "Matilda",
  "Amelie",
  "Google US English", "Google UK English Female",
  "Aria", "Jenny", "Emma", "Michelle", "Ana", "Libby", "Sonia", "Zira", "Hazel", "Natasha", "Clara", "Neerja",
]);

const MALE = new Set([
  "Alex", "Daniel", "Tom", "Aaron", "Arthur", "Evan", "Nathan", "Oliver", "Gordon", "Lee", "Rishi", "Siri Male",
  "Jamie", "Malcolm", "Russell", "James",
  "Google UK English Male",
  "Guy", "Andrew", "Brian", "Christopher", "Eric", "Roger", "Steffan", "Ryan", "David", "Mark", "George", "William",
]);

/** 自然に聞こえやすい順（見つかったものを優先） */
const PREFERRED = [
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Microsoft Guy Online (Natural) - English (United States)",
  "Microsoft Andrew Online (Natural) - English (United States)",
  "Google US English",
  "Samantha",
  "Alex",
  "Aaron",
  "Ava",
  "Evan",
  "Nathan",
  "Allison",
  "Tom",
  "Karen",
  "Daniel",
  "Google UK English Female",
  "Google UK English Male",
];

/**
 * 声の名前から、性別判定などに使う基本の名前を取り出す。
 * "Samantha (Enhanced)" → "Samantha"、"Eddy (English (US))" → "Eddy"、
 * "Microsoft Aria Online (Natural) - English (United States)" → "Aria"
 */
export function baseName(name) {
  const ms = /^Microsoft (\w+)/.exec(name || "");
  if (ms) return ms[1];
  return (name || "").replace(/\s*\(.*$/, "").trim();
}

/** "female" | "male" | null（分からない） */
export function voiceGender(voice) {
  if (!voice) return null;
  if (FEMALE.has(voice.name)) return "female";
  if (MALE.has(voice.name)) return "male";
  const base = baseName(voice.name);
  if (FEMALE.has(base)) return "female";
  if (MALE.has(base)) return "male";
  return null;
}

export const isExcludedVoice = (voice) => EXCLUDED.has(baseName(voice.name));

function rank(v) {
  const i = PREFERRED.indexOf(v.name);
  if (i >= 0) return i;
  const j = PREFERRED.indexOf(baseName(v.name));
  if (j >= 0) return j + 0.5;
  let r = 100;
  if (/premium|enhanced|natural|neural/i.test(v.name)) r -= 40;
  if (v.lang === "en-US") r -= 10;
  else if (v.lang?.startsWith("en-GB")) r -= 5;
  else r -= 2;
  if (voiceGender(v)) r -= 5;
  return r;
}

const langOf = (v) => (v.lang || "").toLowerCase().replace("_", "-");
// 聞き取りやすいと言われる地域の英語（アメリカ・イギリス・オーストラリア・カナダ）。
// インド・南アフリカ・スコットランド・アイルランドなど訛りの強い声は入れない
const CLEAR_LANGS = ["en-us", "en-gb", "en-au", "en-ca"];
const isQualityName = (v) => /premium|enhanced|natural|neural|google/i.test(v.name);

/**
 * 学習に使う英語の声だけを、おすすめ順に並べる。
 * 聞き取りやすさを優先し、アメリカ・イギリス・オーストラリア・カナダ英語の、名前の分かる声（または高品質な声）に絞る。
 * 訛りの強い地域の声や、効果音のような声は出さない。
 * 絞った結果が空になる端末（Android の「English United States」だけ等）では、英語の声をそのまま使う。
 */
export function usableVoices(all) {
  const english = (all || []).filter((v) => langOf(v).startsWith("en") && !isExcludedVoice(v));
  const clear = english.filter((v) => CLEAR_LANGS.includes(langOf(v)) && (voiceGender(v) || isQualityName(v)));
  const fallback = english.filter((v) => CLEAR_LANGS.includes(langOf(v)));
  const list = clear.length ? clear : fallback.length ? fallback : english;
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/**
 * A 役と B 役の声を決める。
 * @param voices usableVoices() の結果
 * @param opts { aURI, bURI, twoVoices } aURI / bURI は利用者が選んだ声（空なら自動）
 * @returns { a, b, sameVoice } sameVoice のときは B 役を声の高さで区別する
 */
export function pickVoices(voices, { aURI = "", bURI = "", twoVoices = true } = {}) {
  const a = voices.find((v) => v.voiceURI === aURI) || voices[0] || null;
  if (!a || !twoVoices) return { a, b: a, sameVoice: true };

  const chosen = voices.find((v) => v.voiceURI === bURI && v !== a);
  if (chosen) return { a, b: chosen, sameVoice: false };

  // 自動: A と性別が違う声を、同じ地域（en-US など）から優先して選ぶ
  const gA = voiceGender(a);
  const others = voices.filter((v) => v !== a && voiceGender(v) && voiceGender(v) !== gA);
  const b = others.find((v) => v.lang === a.lang) || others[0];
  return b ? { a, b, sameVoice: false } : { a, b: a, sameVoice: true };
}

export const genderLabel = (voice) => ({ female: "女性", male: "男性" })[voiceGender(voice)] || "";

/** 文字列から決まる小さな整数（同じ会話にはいつも同じ声を割り当てるため） */
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 「会話ごとにいろいろな人の声」: seed（問題IDなど）から A 役と B 役の声を選ぶ。
 * 同じ seed ならいつも同じ組み合わせ。B 役は A 役と性別の違う声（なければ同じ声で高さを変える）。
 */
export function pickVoicesFor(voices, seed, { twoVoices = true } = {}) {
  if (!voices.length) return { a: null, b: null, sameVoice: true };
  const h = seedOf(String(seed));
  const a = voices[h % voices.length];
  if (!twoVoices) return { a, b: a, sameVoice: true };
  const gA = voiceGender(a);
  const others = voices.filter((v) => v !== a && voiceGender(v) && voiceGender(v) !== gA);
  if (!others.length) return { a, b: a, sameVoice: true };
  return { a, b: others[Math.floor(h / voices.length) % others.length], sameVoice: false };
}

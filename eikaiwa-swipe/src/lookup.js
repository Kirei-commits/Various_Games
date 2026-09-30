/*
 * 例文の単語をタップしたときの「意味」を引く（DOM に触らない純粋関数。テストあり）。
 * - 教材の見出し（単語の章 3000語・フレーズの章の1語の見出し）を辞書にする
 * - 変化した形（went・tables・getting・happier）は元の形に戻して引く
 * - 教材にない基本の語（the・is・of など）と短縮形（don't・I'm）は BASIC から
 */
import { keyOf } from "./reading.js";

/** 教材にない基本の語・短縮形 */
export const BASIC = {
  the: "その（名詞の前につける）",
  a: "ひとつの（名詞の前につける）",
  an: "ひとつの（母音の前の a）",
  is: "〜です・〜がある（be の形）",
  am: "〜です（I のときの be）",
  are: "〜です・〜がある（be の形）",
  was: "〜だった（be の過去）",
  were: "〜だった（be の過去）",
  be: "〜である・いる",
  been: "（be の過去分詞）",
  being: "〜であること（be の ing 形）",
  i: "私は",
  me: "私を・私に",
  my: "私の",
  mine: "私のもの",
  myself: "私自身",
  you: "あなた（たち）",
  your: "あなたの",
  yours: "あなたのもの",
  yourself: "あなた自身",
  he: "彼は",
  him: "彼を・彼に",
  his: "彼の・彼のもの",
  she: "彼女は",
  her: "彼女を・彼女の",
  hers: "彼女のもの",
  it: "それ",
  its: "その（それの）",
  we: "私たちは",
  us: "私たちを・私たちに",
  our: "私たちの",
  they: "彼らは・それらは",
  them: "彼らを・それらを",
  their: "彼らの",
  this: "これ・この",
  that: "あれ・あの・〜ということ",
  these: "これら（の）",
  those: "あれら（の）",
  what: "何",
  who: "誰",
  where: "どこ",
  when: "いつ・〜するとき",
  why: "なぜ",
  how: "どうやって・どのくらい",
  which: "どちら・どの",
  of: "〜の",
  to: "〜へ・〜すること",
  in: "〜の中に・〜で",
  on: "〜の上に・〜に",
  at: "〜で・〜に（場所・時刻）",
  for: "〜のために・〜の間",
  with: "〜と一緒に・〜で",
  from: "〜から",
  by: "〜によって・〜のそばに",
  about: "〜について・約",
  as: "〜として・〜のように",
  into: "〜の中へ",
  up: "上へ",
  down: "下へ",
  out: "外へ",
  off: "離れて・外れて",
  over: "〜の上に・終わって",
  and: "そして・〜と",
  or: "または",
  but: "しかし",
  so: "だから・とても",
  if: "もし〜なら",
  because: "〜だから",
  not: "〜ない",
  no: "いいえ・ひとつもない",
  yes: "はい",
  do: "する・（疑問文・否定文をつくる）",
  does: "する（do の形）",
  did: "した（do の過去）",
  have: "持っている・〜したことがある",
  has: "持っている（have の形）",
  had: "持っていた（have の過去）",
  will: "〜するつもり・〜だろう",
  would: "〜だろう・〜したい（丁寧）",
  can: "〜できる",
  could: "〜できた・〜してもらえますか",
  should: "〜すべき",
  may: "〜かもしれない・〜してもよい",
  might: "〜かもしれない",
  must: "〜しなければならない",
  shall: "〜しましょうか",
  there: "そこに・（there is で）〜がある",
  here: "ここに",
  very: "とても",
  too: "〜も・〜すぎる",
  just: "ちょうど・ただ",
  all: "すべて",
  some: "いくつか・いくらか",
  any: "いくつか・どれでも",
  every: "すべての・毎〜",
  much: "たくさんの（数えられないもの）",
  many: "たくさんの（数えられるもの）",
  more: "もっと",
  most: "最も",
  than: "〜よりも",
  then: "それから・その時",
  now: "今",
  also: "〜も",
  again: "もう一度",
  really: "本当に",
  oh: "おお・ああ",
  okay: "わかった・大丈夫",
  ok: "わかった・大丈夫",
  hey: "ねえ・やあ",
  please: "どうぞ・お願いします",
  "i'm": "I am（私は〜です）",
  "i'll": "I will（私は〜するつもり）",
  "i've": "I have（私は〜した）",
  "i'd": "I would / I had",
  "you're": "you are（あなたは〜です）",
  "you'll": "you will",
  "you've": "you have",
  "he's": "he is / he has",
  "she's": "she is / she has",
  "it's": "it is（それは〜です）",
  "that's": "that is（それは〜です）",
  "what's": "what is（何が〜ですか）",
  "there's": "there is（〜がある）",
  "let's": "let us（〜しよう）",
  "we're": "we are",
  "they're": "they are",
  "don't": "do not（〜しない）",
  "doesn't": "does not（〜しない）",
  "didn't": "did not（〜しなかった）",
  "can't": "cannot（〜できない）",
  "couldn't": "could not（〜できなかった）",
  "won't": "will not（〜しないだろう）",
  "wouldn't": "would not",
  "shouldn't": "should not（〜すべきでない）",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "haven't": "have not",
  "hasn't": "has not",
  // よく出るのに教材の単語の章にない語
  one: "1・ひとつ", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100・百", thousand: "1000・千", million: "100万", billion: "10億",
  first: "最初の・1番目の", second: "2番目の・秒", third: "3番目の", last: "最後の・この前の", next: "次の",
  lot: "たくさん（a lot of で「たくさんの」）", little: "小さい・少し", other: "ほかの", another: "もうひとつの・別の", own: "自分自身の",
  anything: "何か・何でも", something: "何か", everything: "すべて", nothing: "何もない",
  anyone: "誰か・誰でも", someone: "誰か", everyone: "みんな", nobody: "誰も〜ない", once: "一度・かつて",
  away: "離れて・遠くへ", ahead: "前に・先に", well: "上手に・ええと", yeah: "うん（yes のくだけた形）", hi: "やあ・こんにちは",
  wow: "わあ・すごい", welcome: "ようこそ・どういたしまして", excuse: "許す（excuse me で「すみません」）", mind: "気にする・心",
  phone: "電話", party: "パーティー", food: "食べ物", book: "本・予約する", favorite: "お気に入りの", set: "置く・セット",
  english: "英語・イギリスの", tv: "テレビ", video: "動画", main: "主な", gas: "ガス・ガソリン", real: "本当の",
  clear: "はっきりした・晴れた", code: "コード・暗号", song: "歌", ball: "ボール", exercise: "運動・練習", proof: "証拠",
  speech: "スピーチ・話すこと", part: "部分", split: "分ける", moment: "瞬間・ちょっと", group: "グループ", final: "最後の",
  nearby: "近くの", tight: "きつい", "we'll": "we will", "it'll": "it will", "they'll": "they will", "she'll": "she will",
  "he'll": "he will", "that'll": "that will", "we've": "we have", "they've": "they have", "you'd": "you would / you had",
  "we'd": "we would", "there're": "there are", "who's": "who is", "where's": "where is", "how's": "how is", "here's": "here is",
};

/** 不規則に変化する語 → 元の形 */
const IRREGULAR = {
  went: "go", gone: "go", got: "get", gotten: "get", made: "make", took: "take", taken: "take", came: "come", saw: "see", seen: "see",
  said: "say", knew: "know", known: "know", thought: "think", bought: "buy", brought: "bring", told: "tell", found: "find", gave: "give",
  given: "give", left: "leave", felt: "feel", kept: "keep", ate: "eat", eaten: "eat", ran: "run", wrote: "write", written: "write",
  spoke: "speak", spoken: "speak", met: "meet", sat: "sit", stood: "stand", lost: "lose", paid: "pay", sent: "send", spent: "spend",
  built: "build", began: "begin", begun: "begin", drank: "drink", drunk: "drink", drove: "drive", driven: "drive", forgot: "forget",
  forgotten: "forget", heard: "hear", held: "hold", meant: "mean", slept: "sleep", taught: "teach", understood: "understand",
  woke: "wake", wore: "wear", worn: "wear", won: "win", fell: "fall", fallen: "fall", grew: "grow", grown: "grow", flew: "fly",
  flown: "fly", sang: "sing", sung: "sing", swam: "swim", broke: "break", broken: "break", chose: "choose", chosen: "choose",
  caught: "catch", did: "do", done: "do", had: "have", better: "good", best: "good", worse: "bad", worst: "bad", children: "child",
  men: "man", women: "woman", feet: "foot", teeth: "tooth", mice: "mouse", people: "person", lay: "lie", led: "lead", hid: "hide",
  hidden: "hide", rode: "ride", ridden: "ride", shook: "shake", threw: "throw", thrown: "throw", fed: "feed", fought: "fight",
  sold: "sell", stole: "steal", stolen: "steal", struck: "strike", swore: "swear", tore: "tear", torn: "tear", froze: "freeze",
  frozen: "freeze", bit: "bite", bitten: "bite", blew: "blow", blown: "blow", drew: "draw", drawn: "draw", dug: "dig", hung: "hang",
  lent: "lend", rose: "rise", risen: "rise", shot: "shoot", shut: "shut", slid: "slide", spun: "spin", stuck: "stick", swung: "swing",
  understand: "understand", wept: "weep", wound: "wind", ill: "sick",
};

/** 見出し（小文字）→ 項目 の索引を作る。items は { id, english, japanese } の配列（先に来たものが優先） */
export function buildLookup(items) {
  const index = new Map();
  for (const it of items) {
    const k = keyOf(it.english);
    if (k && !k.includes(" ") && !index.has(k)) index.set(k, it);
  }
  return index;
}

/** 変化した形から、元の形の候補を作る */
function baseForms(w) {
  const out = [];
  const add = (x) => x && x !== w && out.push(x);
  if (IRREGULAR[w]) add(IRREGULAR[w]);
  add(w.replace(/'s$/, ""));
  if (/ies$/.test(w)) add(w.replace(/ies$/, "y"));
  if (/(s|x|z|ch|sh|o)es$/.test(w)) add(w.replace(/es$/, ""));
  if (/s$/.test(w)) add(w.replace(/s$/, ""));
  if (/ied$/.test(w)) add(w.replace(/ied$/, "y"));
  if (/ed$/.test(w)) {
    add(w.replace(/ed$/, ""));
    add(w.replace(/d$/, ""));
    if (/([b-df-hj-np-tv-z])\1ed$/.test(w)) add(w.replace(/([b-df-hj-np-tv-z])\1ed$/, "$1"));
  }
  if (/ing$/.test(w)) {
    add(w.replace(/ing$/, ""));
    add(w.replace(/ing$/, "e"));
    if (/([b-df-hj-np-tv-z])\1ing$/.test(w)) add(w.replace(/([b-df-hj-np-tv-z])\1ing$/, "$1"));
    if (/ying$/.test(w)) add(w.replace(/ying$/, "ie"));
  }
  if (/ier$/.test(w)) add(w.replace(/ier$/, "y"));
  if (/iest$/.test(w)) add(w.replace(/iest$/, "y"));
  if (/er$/.test(w)) {
    add(w.replace(/er$/, ""));
    add(w.replace(/r$/, ""));
    if (/([b-df-hj-np-tv-z])\1er$/.test(w)) add(w.replace(/([b-df-hj-np-tv-z])\1er$/, "$1"));
  }
  if (/est$/.test(w)) {
    add(w.replace(/est$/, ""));
    add(w.replace(/st$/, ""));
    if (/([b-df-hj-np-tv-z])\1est$/.test(w)) add(w.replace(/([b-df-hj-np-tv-z])\1est$/, "$1"));
  }
  if (/ily$/.test(w)) add(w.replace(/ily$/, "y"));
  if (/ly$/.test(w)) add(w.replace(/ly$/, ""));
  return out;
}

/**
 * 例文の語（句読点つきでもよい）の意味を引く。
 * @returns {{ word: string, base: string, japanese: string, id: string|null } | null}
 *   word は例文の形、base は辞書の見出し（変化していなければ word と同じ）、id は教材の問題ID（基本の語は null）
 */
export function lookupWord(token, index) {
  const w = keyOf(token);
  if (!w) return null;
  const hit = (base) => {
    const it = index.get(base);
    if (it) return { word: w, base, japanese: it.japanese, id: it.id };
    if (BASIC[base]) return { word: w, base, japanese: BASIC[base], id: null };
    return null;
  };
  // 基本の語（it・is）は教材の同じ綴り（IT など）より先に
  if (BASIC[w]) return { word: w, base: w, japanese: BASIC[w], id: index.get(w)?.id || null };
  return hit(w) || baseForms(w).reduce((found, b) => found || hit(b), null) || null;
}

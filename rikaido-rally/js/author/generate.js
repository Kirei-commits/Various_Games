/**
 * 資料テキスト → 問題集（この端末の中だけで作る版）。
 *
 * 鍵を要らずに、資料だけで問題が作れる経路。Claude を使う経路（llm.js）と同じ形の
 * 問題集を返すので、どちらで作っても、そのあとの検査・出題・採点はまったく同じ道を通る。
 *
 * 作り方の芯は「資料の一文を根拠として固定する」こと。
 *   模範解答 = 資料のその一文そのもの
 *   必須観点 = その一文が成り立つために欠かせない語（設問文に出てこないものだけ）
 *   出典     = ファイル名 / 単元名
 * こうすると、採点の根拠が必ず資料の中に実在する。作文した正解が混ざらない。
 *
 * 達成基準（rubric）と生成プロンプト（prompt）は、次の2つを通じて生成を制御する。
 *   1. 語の重み付け … 達成基準と生成プロンプトに出てくる語を含む文を優先して問題にする
 *   2. 総合問題     … 達成基準そのものを最後の1問（レベル5）にする
 */
import { validateQuestion } from './validate.js';
import { ALL_LEVELS } from '../core/banks.js';

/* ── 文字列を刻む ─────────────────────────── */

/** 資料を単元に割る。見出しがあればそれで、無ければ空行のかたまりで。 */
export function splitSections(text, { maxUnits = 6, minChars = 120 } = {}) {
  const lines = text.split('\n');
  const heading = (line) =>
    /^#{1,6}\s+\S/.test(line) ||                        // Markdown
    /^(第\s*[0-9０-９一二三四五六七八九十]+\s*[章節部話]|[0-9０-９]+\s*[.．、]\s*\S)/.test(line) ||
    (/[:：]$/.test(line) && line.length <= 40) ||
    (/^[■□◆◇●○▼▽【\[]/.test(line) && line.length <= 40);

  const sections = [];
  let cur = { title: '', body: [] };
  for (const line of lines) {
    if (heading(line.trim()) && line.trim()) {
      if (cur.title || cur.body.join('').trim()) sections.push(cur);
      cur = { title: line.replace(/^#{1,6}\s*|^[■□◆◇●○▼▽【\[]\s*|[:：\]】]\s*$/g, '').trim(), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  sections.push(cur);

  let out = sections
    .map((s) => ({ title: s.title, body: s.body.join('\n').trim() }))
    .filter((s) => s.body || s.title);

  // 見出しが1つも無ければ、空行のかたまりで割る
  if (out.length <= 1 && text.length > minChars * 2) {
    const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    const per = Math.max(1, Math.ceil(blocks.length / Math.min(maxUnits, Math.ceil(text.length / minChars))));
    out = [];
    for (let i = 0; i < blocks.length; i += per) {
      out.push({ title: '', body: blocks.slice(i, i + per).join('\n\n') });
    }
  }

  // 見出しだけで中身の無い節（文書のタイトル行など）は単元にしない。
  // 残すと「タイトルの単元」が次の節の中身を食べてしまい、単元名と中身がずれる。
  out = out.filter((s) => s.body.trim() || !s.title);

  // 短すぎる断片は手前にくっつける
  const merged = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev && (s.body.length < minChars / 2 || prev.body.length < minChars / 2)) {
      prev.body = `${prev.body}\n${s.title ? s.title + '\n' : ''}${s.body}`.trim();
    } else {
      merged.push({ ...s });
    }
  }

  // 多すぎたら、後ろから畳んで maxUnits に収める
  while (merged.length > maxUnits) {
    const last = merged.pop();
    merged[merged.length - 1].body += '\n' + last.body;
  }

  return merged
    .filter((s) => s.body.trim())
    .map((s, i) => ({ title: s.title || `第${i + 1}部`, body: s.body.trim(), index: i }));
}

/** 文に割る。日本語の句点と、英文のピリオドの両方を見る。 */
export function splitSentences(text) {
  return text
    .replace(/\n+/g, '\n')
    .split(/(?<=[。．！？!?])\s*|\n/)
    .map((s) => s.replace(/^[・\-*\s]+/, '').trim())
    .filter((s) => s.length >= 8);
}

/* ── 語を拾う ─────────────────────────────── */

/** それ自体では意味を持たない語。問題の答えにしてはいけない。 */
const FUNCTION_WORDS = new Set([
  'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'ここ', 'そこ', 'どこ', 'もの', 'こと',
  'ため', 'など', 'よう', 'とき', 'ほか', 'うち', 'さい', 'ところ', 'あと', 'まえ',
  'それぞれ', 'すべて', 'つまり', 'ただし', 'しかし', 'または', 'および', 'さらに',
  'また', 'なお', 'つぎ', '以下', '以上', '上記', '下記', '本書', '本章', '資料',
  '場合', '内容', '説明', '一般', '通常', '必要', '可能', '重要'
]);

// 漢字とカタカナが続くひとかたまりを1語として拾う。分けてしまうと「情報システム部」が
// 「情報」と「システム」に割れ、どちらも答えとしては薄い語になってしまう。
const TERM_RE = /[\u4e00-\u9fff\u3005\u30a1-\u30f6\u30fc]{2,}|[A-Za-z][A-Za-z0-9_.+#-]{2,}|[0-9０-９]+(?:年|月|日|%|％|円|人|件|個|回|秒|分|時間|倍|割)/g;

/** 文字列から語の候補を取り出す（重複あり・出てきた順） */
export function termsOf(text) {
  return (String(text).match(TERM_RE) || []).filter((t) => !FUNCTION_WORDS.has(t));
}

/**
 * 資料全体での語の重み。
 * 長い語ほど重く、出てきすぎる語は軽くする（どの文にも出る語は答えにならない）。
 * 達成基準と生成プロンプトに出てくる語は、ここで重みを上げる＝出題が寄っていく。
 */
export function weighTerms(text, boostText = '') {
  const sentences = splitSentences(text);
  const docFreq = new Map();
  for (const s of sentences) {
    for (const t of new Set(termsOf(s))) docFreq.set(t, (docFreq.get(t) || 0) + 1);
  }
  const boost = new Set(termsOf(boostText));
  const weights = new Map();
  for (const [term, df] of docFreq) {
    const spread = df / Math.max(1, sentences.length);
    let w = Math.min(term.length, 8) * (1 + Math.log1p(df));
    if (spread > 0.5) w *= 0.25;                 // ほぼ全文に出る語は答えにならない
    if (boost.has(term)) w *= 2.5;               // 達成基準・生成プロンプトで指名された語
    weights.set(term, w);
  }
  return { weights, docFreq, sentences: sentences.length, boosted: [...boost] };
}

/**
 * 節から、答えに使える語を選ぶ。
 * 設問文に出てくる語は必ず外す（それを使うと、問題文を写すだけで正解になってしまう）。
 */
function answerTerms(clause, weights, forbidden, limit = 2) {
  const seen = new Set();
  const cand = [];
  for (const t of termsOf(clause)) {
    if (seen.has(t) || forbidden.has(t)) continue;
    seen.add(t);
    cand.push({ term: t, w: weights.get(t) || t.length });
  }
  // 別の語の一部でしかないものは落とす（「参照」と「参照型」が両方立つのを防ぐ）
  const kept = cand.filter((a) => !cand.some((b) => b !== a && b.term.includes(a.term) && b.w >= a.w));
  return kept.sort((a, b) => b.w - a.w).slice(0, limit);
}

const forbiddenSet = (...texts) => new Set(texts.flatMap((t) => termsOf(t || '')));

/* ── 問題の型 ─────────────────────────────── */

const MARK = '◻︎';

/** 答えの語を伏せた文脈。ヒントで早出しにならないようにする。 */
const maskTerms = (s, terms) => terms.reduce((acc, t) => acc.split(t).join(MARK), s);

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

/**
 * 1文から問題の候補を作る。型ごとに、どこを問い、どこを答えにするかが違う。
 * @returns {object[]} 候補（まだ検査していない）
 */
export function candidatesFrom(sentence, ctx) {
  const { weights, section, sourceName } = ctx;
  const out = [];
  const body = sentence.replace(/[。．]$/, '');

  const make = (kind, level, prompt, clauses, extra = {}) => {
    const forbidden = forbiddenSet(prompt, section.title);
    const groups = [];
    for (const { key, clause, limit } of clauses) {
      const picked = answerTerms(clause, weights, forbidden, limit || 1);
      if (!picked.length) return;
      groups.push({
        key,
        any: picked.map((p) => p.term),
        why: `資料のこの一文に出てくる「${picked[0].term}」を、答えに欠かせない語として必須にしています。`,
        weight: picked.reduce((a, p) => a + p.w, 0)
      });
    }
    // 必須観点どうしで語を重複させない。
    // 完全一致だけでなく、片方が片方の一部になっている場合も落とす
    // （「情報」と「情報システム部」を別々の観点にすると、片方は事実上ただの足かせになる）。
    const flat = [];
    const required = [];
    for (const g of groups) {
      const any = g.any.filter((w) => !flat.some((f) => f.includes(w) || w.includes(f)));
      if (!any.length) continue;
      flat.push(...any);
      required.push({ key: g.key, any, why: g.why });
    }
    if (!required.length) return;

    const answers = required.flatMap((g) => g.any);
    const masked = maskTerms(body, answers);
    out.push({
      kind, level,
      prompt,
      criteria: {
        required: required.slice(0, 3),
        optional: extra.optional || [],
        traps: extra.traps || []
      },
      hints: [
        // 単元名にも答えの語が混じることがある（「1. 機密区分」と答え「区分」）。
        // ヒントは必ず伏せてから出す。ここを素で出すと2段目で答えが割れる。
        `資料の「${maskTerms(section.title, answers)}」に書かれています。`,
        `その一文はこう始まります：「${clip(masked, 60)}」`
      ],
      model: body + '。',
      why: `資料の「${section.title}」にある一文をそのまま根拠にしています。`
        + `必須にしたのは、その文が成り立つために欠かせない語です。`,
      source: `${sourceName} / ${section.title}`,
      weight: groups.reduce((a, g) => a + g.weight, 0)
    });
  };

  let m;

  // 定義：「X とは …」「X は … である」
  if ((m = body.match(/^(.{2,30}?)(?:とは|というのは)、?(.{6,})$/))) {
    make('定義', m[2].length > 28 ? 2 : 1,
      `「${m[1].trim()}」とは何ですか。資料の言葉を使って説明してください。`,
      [{ key: '意味', clause: m[2], limit: 2 }]);
  } else if ((m = body.match(/^(.{2,24}?)は、(.{8,})(?:です|である|だ|となる|になる|を指す|を意味する)$/))) {
    make('定義', 2,
      `「${m[1].trim()}」について、資料はどう説明していますか。`,
      [{ key: '説明の中身', clause: m[2], limit: 2 }]);
  }

  // 説明：長めの一文に、重い語が2つ以上あるとき。仕組みを言わせる段（L2）。
  if (!out.length && body.length >= 34) {
    const lead = answerTerms(body, weights, forbiddenSet(section.title), 1)[0];
    if (lead && lead.term.length >= 3) {
      make('説明', 2,
        `資料は「${lead.term}」について何と言っていますか。要点を自分の言葉で説明してください。`,
        [{ key: '要点', clause: body, limit: 2 }]);
    }
  }

  // 理由：「… ため …」「なぜなら …」
  if ((m = body.match(/^(.{8,}?)(?:ため|ので|から)、(.{8,})$/))) {
    make('理由', 3,
      `資料では「${clip(maskTerms(m[2], termsOf(m[1])), 40)}」と書かれています。それはなぜですか。`,
      [{ key: '理由', clause: m[1], limit: 2 }]);
  } else if ((m = body.match(/^(.{10,})(?:のは|のが)、?(.{6,}?)(?:ため|から)(?:です|である)?$/))) {
    make('理由', 3,
      `「${clip(maskTerms(m[1], termsOf(m[2])), 40)}」のはなぜですか。`,
      [{ key: '理由', clause: m[2], limit: 2 }]);
  }

  // 条件：「… 場合／とき、…」
  if ((m = body.match(/^(.{6,}?)(?:場合|とき|際)(?:に|は|には)?、(.{8,})$/))) {
    make('条件', 3,
      `どんなときに「${clip(maskTerms(m[2], termsOf(m[1])), 36)}」となりますか。`,
      [{ key: '条件', clause: m[1], limit: 2 }]);
  }

  // 対比：「一方」「に対して」「と異なり」
  if ((m = body.match(/^(.{8,}?)(?:一方で?|に対して|と異なり|とは違い)、?(.{8,})$/))) {
    make('対比', 4,
      `資料では2つのやり方が比べられています。それぞれ何がどう違いますか。`
        + `（手がかり：「${clip(maskTerms(body, []).slice(0, 18), 20)}」のくだり）`,
      [{ key: '一方の側', clause: m[1], limit: 1 }, { key: 'もう一方の側', clause: m[2], limit: 1 }]);
  }

  // 手順・列挙：「まず／次に／最後に」
  if (/(?:まず|はじめに)/.test(body) && /(?:次に|そのあと|最後に|それから)/.test(body)) {
    make('手順', 4, `この場面での手順を、順番が分かるように説明してください。`,
      [{ key: '最初の手順', clause: body.split(/次に|そのあと|それから/)[0], limit: 1 },
       { key: 'あとの手順', clause: body.split(/次に|そのあと|それから/).slice(1).join(' '), limit: 1 }]);
  }

  // どの型にも当てはまらない文は、穴埋めにする（どんな資料でも最低限の問題は作れる）。
  // ただし「これは〜です」のような、前の文を指すだけの文からは作らない（単体で問いにならない）。
  if (!out.length && !/^(これ|それ|この|その|なお|また|ただし)/.test(body)) {
    const picked = answerTerms(body, weights, forbiddenSet(section.title), 1);
    if (picked.length && picked[0].term.length >= 3 && body.length >= 16) {
      const term = picked[0].term;
      const holed = body.split(term).join(MARK);
      make('穴埋め', picked[0].w >= 12 ? 2 : 1,
        `次の文の ${MARK} に入る言葉は何ですか。あわせて、それが何を指すのかも一言で説明してください。\n「${holed}。」`,
        [{ key: '入る言葉', clause: term, limit: 1 }]);
    }
  }

  return out;
}

/* ── 組み立て ─────────────────────────────── */

/**
 * 問題集の id に使う短い名前。
 * 日本語だけの名前は英数字が1文字も残らないので、名前から短いハッシュを作る
 * （そうしないと、どのテストも同じ `bank-…` という id になって見分けがつかない）。
 */
function slug(s) {
  const name = String(s || '');
  const ascii = name.toLowerCase().normalize('NFKC')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  if (ascii) return ascii;
  let h = 0;
  for (const ch of name) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0;
  return name ? 'jp' + h.toString(36) : 'bank';
}

/**
 * 資料から問題集を作る。
 *
 * @param {object} o
 * @param {string} o.text    資料のテキスト
 * @param {string} o.rubric  達成基準（何ができていてほしいか）
 * @param {string} o.prompt  生成プロンプト（どう問うてほしいか）
 * @param {string} o.source  出典に出すファイル名
 * @param {string} o.name    問題集の名前
 * @param {number} o.perUnit 単元あたりの上限
 * @returns {{bank:object, report:object}}
 */
export function generateBank({
  text, rubric = '', prompt = '', source = '資料', name = '',
  perUnit = 5, id = '', now = Date.now()
}) {
  if (!text || !text.trim()) throw new Error('資料のテキストが空です。');

  const { weights, boosted } = weighTerms(text, `${rubric}\n${prompt}`);
  const sections = splitSections(text);
  const units = [];
  const questions = [];
  const rejected = [];
  let n = 0;

  for (const section of sections) {
    const unitId = `u${section.index + 1}`;
    const ctx = { weights, section, sourceName: source };
    const pool = [];

    for (const sentence of splitSentences(section.body)) {
      for (const cand of candidatesFrom(sentence, ctx)) pool.push(cand);
    }

    // 達成基準に近い問題から採る。同じレベルばかりにならないよう、段を散らす。
    pool.sort((a, b) => b.weight - a.weight);
    const taken = [];
    const perLevel = new Map();
    const perKind = new Map();
    // 穴埋めはどんな文からでも作れてしまうので、単元あたり2問までに抑える。
    // 抑えないと、型の当たった良い問題より先に穴埋めが枠を埋めてしまう。
    const KIND_CAP = { 穴埋め: 2 };
    for (const cand of pool) {
      if (taken.length >= perUnit) break;
      const used = perLevel.get(cand.level) || 0;
      if (used >= Math.max(1, Math.ceil(perUnit / 2))) continue;   // 1つの段に寄せない
      const kindUsed = perKind.get(cand.kind) || 0;
      if (kindUsed >= (KIND_CAP[cand.kind] ?? perUnit)) continue;

      const q = { ...cand, id: `${unitId}-q${++n}`, unit: unitId };
      delete q.weight;
      const check = validateQuestion(q);
      if (!check.ok) { rejected.push({ id: q.id, kind: cand.kind, problems: check.problems }); continue; }
      // 同じ答えの語を何度も問わない
      const answers = q.criteria.required.flatMap((g) => g.any).join('|');
      if (taken.some((t) => t.criteria.required.flatMap((g) => g.any).join('|') === answers)) continue;

      perLevel.set(cand.level, used + 1);
      perKind.set(cand.kind, kindUsed + 1);
      taken.push(q);
    }

    if (!taken.length) continue;
    units.push({
      id: unitId,
      label: clip(section.title, 24),
      summary: clip(section.body.replace(/\n/g, ' '), 60),
      levelNote: `資料のこの部分から自動で作りました（${taken.map((q) => 'L' + q.level).join('・')}）。`
    });
    questions.push(...taken);
  }

  // 達成基準そのものを、最後の総合問題（レベル5）にする
  const wrap = rubricQuestion({ rubric, text, weights, source, sections,
    unitId: units.length ? units[units.length - 1].id : 'u1' });
  if (wrap && units.length) questions.push(wrap);

  const bank = {
    id: id || `authored-${slug(name || source)}-${now.toString(36)}`,
    name: name || `${source} の理解度テスト`,
    subtitle: units.map((u) => u.label).join(' / '),
    blurb: rubric ? `達成基準：${rubric}` : '資料から自動で作った問題集です。',
    origin: 'authored',
    createdAt: now,
    generator: { engine: 'local', source, rubric, prompt, boosted: boosted.slice(0, 12) },
    units,
    questions
  };

  const report = {
    sections: sections.length,
    sentences: splitSentences(text).length,
    accepted: questions.length,
    rejected,
    byLevel: Object.fromEntries(ALL_LEVELS.map((L) => [L, questions.filter((q) => q.level === L).length])),
    byKind: questions.reduce((acc, q) => ({ ...acc, [q.kind]: (acc[q.kind] || 0) + 1 }), {}),
    boosted: boosted.slice(0, 12)
  };
  return { bank, report };
}

/** 達成基準を直接ぶつける総合問題。資料の中に根拠がある語だけを必須にする。 */
function rubricQuestion({ rubric, text, weights, source, unitId, sections }) {
  if (!rubric || !rubric.trim()) return null;
  // 達成基準の文そのものを設問に載せるので、必須の語は「達成基準には出てこないが
  // 資料では重い語」から採る。達成基準に出てくる語を必須にすると、設問を写すだけで通ってしまう。
  const inRubric = new Set(termsOf(rubric));
  const seen = new Set();
  // まとめの問題なので、1か所にしか出てこない語ではなく、単元をまたいで出てくる語を選ぶ。
  // 資料全体を説明しようとすれば自然に使う語、という狙い。
  const spread = new Map();
  for (const sec of sections) {
    for (const t of new Set(termsOf(sec.body))) spread.set(t, (spread.get(t) || 0) + 1);
  }
  const ranked = termsOf(text)
    .filter((t) => !inRubric.has(t) && !seen.has(t) && seen.add(t))
    .map((t) => ({ term: t, w: (weights.get(t) || t.length) * (spread.get(t) || 1) }))
    .sort((a, b) => b.w - a.w);

  // 一方が他方の一部になっている語は選ばない（「情報」と「情報システム部」で2枠使わない）
  const picked = [];
  for (const cand of ranked) {
    if (picked.some((p) => p.term.includes(cand.term) || cand.term.includes(p.term))) continue;
    picked.push(cand);
    if (picked.length === 2) break;
  }
  if (picked.length < 2) return null;

  const q = {
    id: 'rubric-q',
    unit: unitId,
    level: 5,
    kind: '総合',
    prompt: '最後に、全体をまとめて答えてください。\n'
      + 'この資料を読んだ人ができているべきことは次の通りです。\n'
      + `「${rubric.trim()}」\n`
      + 'これができていると分かるように、資料の要点を自分の言葉で説明してください。',
    criteria: {
      required: picked.map((p, i) => ({
        key: i === 0 ? '中心になる語' : '結びつける語',
        any: [p.term],
        why: `達成基準にも資料にも出てくる「${p.term}」を、要点の中心として必須にしています。`
      })),
      optional: [], traps: []
    },
    hints: [
      '細かい部分ではなく、資料全体で何を言っていたかを思い出してください。',
      '資料の中で繰り返し出てきた言葉を2つ挙げ、それらを繋げて説明してみてください。'
    ],
    model: `${rubric.trim()} 資料の言葉でいえば、${picked.map((p) => `「${p.term}」`).join('と')}が要点です。`,
    why: '達成基準そのものを最後の1問にしています。必須にしたのは、資料の中で重い語のうち'
      + '達成基準の文には出てこないものだけです（設問を写すだけでは通らないようにするため）。',
    source: `${source} / 達成基準`
  };
  return validateQuestion(q).ok ? q : null;
}

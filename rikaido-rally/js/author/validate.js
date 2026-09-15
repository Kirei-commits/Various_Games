/**
 * 問題データの検査。
 *
 * ここが「達成基準を機械的に守らせる」場所。同梱の問題集も、講師が資料から作った問題集も、
 * まったく同じ規則を通る。静的検査（tests/lint.mjs）も講師画面もこのファイルを呼んでいるので、
 * 「lint は通るのにアプリでは弾かれる」が起きない。
 *
 * いちばん効く検査は3つ。
 *   1. 模範解答は、自分の採点基準で必ず正解になること（＝ヒントの終点が行き止まりにならない）
 *   2. 中身の無い回答では、どの問題も正解にならないこと（＝何にでも一致する語が無い）
 *   3. 設問文をそのまま貼り付けても正解にならないこと（＝問題が答えを漏らしていない）
 */
import * as Judge from '../core/judge.js';
import * as Hint from '../core/hint.js';
import { ALL_LEVELS, MIN_LEVEL, MAX_LEVEL, coverage } from '../core/banks.js';
import * as Choice from '../core/choice.js';

/** 「中身の無い回答」の見本。これで通る問題は採点基準が壊れている。 */
export const JUNK_ANSWERS = ['', '   ', 'わかりません', 'わからない', 'あ', 'てすと', '？？？'];

export const MAX_REQUIRED = 3;

/** 1問を検査する。 */
export function validateQuestion(q, { where = q && q.id } = {}) {
  const problems = [];
  const at = (msg) => problems.push(`${where}: ${msg}`);

  if (!q || typeof q !== 'object') return { ok: false, problems: [`${where}: 問題が空`] };
  if (!q.id) at('id が無い');
  if (!q.unit) at('unit が無い');
  if (!Number.isInteger(q.level) || q.level < MIN_LEVEL || q.level > MAX_LEVEL) {
    at(`level が ${MIN_LEVEL}〜${MAX_LEVEL} でない (${q.level})`);
  }
  if (!q.prompt) at('設問文が空');
  if (!q.model) at('模範解答が無い');
  if (!q.why) at('採点基準の理由(why)が無い');
  if (!q.source) at('出典(source)が無い');
  if (!Array.isArray(q.hints) || q.hints.length < 2) at('ヒントは2件以上必要');
  else if (q.hints.some((h) => !h || !String(h).trim())) at('空のヒントがある');

  // 選択肢（あれば）。規約は「先頭が正解」。
  if (q.choices !== undefined) {
    if (!Array.isArray(q.choices) || q.choices.length < Choice.MIN_CHOICES || q.choices.length > Choice.MAX_CHOICES) {
      at(`選択肢は ${Choice.MIN_CHOICES}〜${Choice.MAX_CHOICES} 個にする（いまは ${Array.isArray(q.choices) ? q.choices.length : '配列でない'}）`);
    } else {
      if (q.choices.some((c) => typeof c !== 'string' || !c.trim())) at('空の選択肢がある');
      const norm = q.choices.map((c) => Judge.normalize(c));
      if (new Set(norm).size !== norm.length) at('同じ選択肢が2つ以上ある（正解が2つになってしまう）');
      if (norm.some((c) => !c)) at('正規化すると空になる選択肢がある');
    }
  }

  const c = q.criteria || {};
  const required = c.required || [];
  if (!required.length) at('必須観点が無い');
  if (required.length > MAX_REQUIRED) at(`必須観点が多すぎる（${required.length}件。${MAX_REQUIRED}件までにする）`);

  const groups = [...required, ...(c.optional || []), ...(c.traps || [])];
  for (const g of groups) {
    if (!g || !g.key) { at('観点に key が無い'); continue; }
    if (!Array.isArray(g.any) || !g.any.length) { at(`観点「${g.key}」に候補語が無い`); continue; }
    for (const w of g.any) {
      if (!Judge.normalize(w)) at(`観点「${g.key}」の候補語 "${w}" は正規化すると空になる（何にでも一致してしまう）`);
    }
  }
  const requiredWords = new Set(required.flatMap((g) => (g.any || []).map(Judge.normalize)));
  for (const t of c.traps || []) {
    if (!t.hint) at(`誤解検出「${t.key}」に hint が無い`);
    for (const w of t.any || []) {
      if (requiredWords.has(Judge.normalize(w))) at(`誤解検出「${t.key}」の "${w}" が必須観点と同じ語`);
    }
  }
  if (problems.length) return { ok: false, problems };

  // 1. 模範解答は自分の基準を通ること
  const self = Judge.evaluate(q, q.model);
  if (!self.correct) at(`模範解答が自分の採点基準を通らない（不足: ${self.missing.map((m) => m.key).join('、')}）`);

  // 2. 中身の無い回答では通らないこと
  for (const junk of JUNK_ANSWERS) {
    if (Judge.evaluate(q, junk).correct) at(`"${junk}" で正解になってしまう`);
  }

  // 3. 設問文が答えを漏らしていないこと
  if (Judge.evaluate(q, q.prompt).correct) at('設問文をそのまま貼り付けると正解になる（答えを漏らしている）');

  // 4. ヒントは空にならず、最終段で必ず答えを開示すること（記述式でも選択式でも）
  const blank = Judge.evaluate(q, '');
  for (const choiceMode of [false, true]) {
    if (choiceMode && !Choice.hasChoices(q)) continue;
    for (let s = 1; s <= Hint.REVEAL_STAGE; s++) {
      const h = Hint.next(q, { attempt: s, result: blank, choiceMode, eliminated: '' });
      if (!h.text) at(`${choiceMode ? '選択式' : '記述式'}の ${s}段目のヒントが空`);
      // 1段目で答えを出してしまわない（段が進む意味が無くなる）
      if (s === 1 && choiceMode && h.text.includes(Choice.correctText(q))) at('選択式の1段目が答えを出している');
    }
    if (!Hint.next(q, { attempt: Hint.REVEAL_STAGE, result: blank, choiceMode }).reveal) {
      at('最終段のヒントが答えを開示していない');
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * 問題集を検査する。
 * @param {object} bank
 * @param {{requireFullLevels?:boolean, minQuestions?:number}} opts
 *   requireFullLevels … 単元ごとに L1〜L5 が揃っていることを必須にする（同梱の問題集はこちら）。
 *   講師が資料から作った問題集では、揃わないことが普通にあるので警告に落とす。
 */
export function validateBank(bank, { requireFullLevels = false, minQuestions = 5, requireChoices = false } = {}) {
  const problems = [];
  const warnings = [];
  if (!bank || !bank.id) return { ok: false, problems: ['問題集に id が無い'], warnings, stats: null };

  if (!bank.name) problems.push(`${bank.id}: name が無い`);
  if (!Array.isArray(bank.units) || !bank.units.length) problems.push(`${bank.id}: 単元が無い`);
  if (bank.units && bank.units.length < 2) warnings.push('単元が1つしかありません（補単元が取れないので、同じ単元から5問出ます）');

  const unitIds = new Set((bank.units || []).map((u) => u.id));
  for (const u of bank.units || []) {
    if (!u.label) problems.push(`${bank.id}/${u.id}: 単元名が無い`);
    if (!u.summary) warnings.push(`単元「${u.label || u.id}」に要約がありません`);
  }

  const seen = new Set();
  for (const q of bank.questions || []) {
    if (seen.has(q.id)) problems.push(`問題idの重複: ${q.id}`);
    seen.add(q.id);
    if (!unitIds.has(q.unit)) problems.push(`${q.id}: 単元 ${q.unit} が定義されていない`);
    if (requireChoices && !Choice.hasChoices(q)) problems.push(`${q.id}: 選択肢がない（選択式で出せない）`);
    problems.push(...validateQuestion(q).problems);
  }

  if ((bank.questions || []).length < minQuestions) {
    problems.push(`${bank.id}: 問題が ${(bank.questions || []).length} 件しかありません（1ラリーに ${minQuestions} 問必要）`);
  }

  const cov = bank.units && bank.questions ? coverage(bank) : [];
  for (const c of cov) {
    if (!c.total) problems.push(`${bank.id}/${c.unit.id}: 問題が1件もありません`);
    else if (c.missing.length) {
      const msg = `単元「${c.unit.label}」にレベル ${c.missing.join(',')} の問題がありません`;
      if (requireFullLevels) problems.push(`${bank.id}: ${msg}`);
      else warnings.push(`${msg}（その段が来たら、いちばん近いレベルの問題が出ます）`);
    }
  }

  const withChoices = (bank.questions || []).filter(Choice.hasChoices).length;
  if (!requireChoices && withChoices && withChoices < (bank.questions || []).length) {
    warnings.push(`選択肢のある問題が ${withChoices} / ${(bank.questions || []).length} 問です`
      + '（選択肢の無い問題は記述式で出ます）');
  }

  const stats = {
    choices: withChoices,
    questions: (bank.questions || []).length,
    units: (bank.units || []).length,
    byLevel: Object.fromEntries(ALL_LEVELS.map((L) => [L, (bank.questions || []).filter((q) => q.level === L).length])),
    coverage: cov
  };
  return { ok: problems.length === 0, problems, warnings, stats };
}

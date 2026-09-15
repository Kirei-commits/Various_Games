/**
 * ビルドを持たないプロジェクトのための静的検査。
 *  1. 全JSの構文チェック
 *  2. index.html の参照と読み込み順
 *  3. 問題データの整合（id・レベル・観点・ヒント・出典）
 *  4. 採点基準の健全性
 *     - 模範解答は、自分の採点基準で必ず正解になること（＝ヒントの終点が行き止まりでない）
 *     - 空文字や「わかりません」では、どの問題も正解にならないこと（＝何にでも一致する語が無い）
 *  5. 単元 × レベルの品揃え（階段が組めること）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* 1. 構文チェック */
const jsDir = path.join(ROOT, 'js');
const jsFiles = fs.readdirSync(jsDir).filter((n) => n.endsWith('.js'));
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', path.join(jsDir, f)], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`構文エラー js/${f}: ${e.stderr?.toString().split('\n')[0]}`);
  }
}

/* 2. 参照と読み込み順 */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|data:)([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`参照先が存在しない: ${ref}`);
}
if (!refs.includes('css/style.css')) problems.push('index.html が css/style.css を読み込んでいない');

const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const f of jsFiles) if (!order.includes(f)) problems.push(`js/${f} が index.html から読み込まれていない`);

// 依存より先に依存元が来ていないか。ここが崩れると file:// で開いたときだけ落ちる。
const need = [
  ['banks.js', 'bank-java.js'], ['banks.js', 'bank-kuwata.js'],
  ['judge.js', 'hint.js'], ['judge.js', 'rally.js'], ['hint.js', 'rally.js'],
  ['grade.js', 'rally.js'], ['banks.js', 'rally.js'],
  ['grade.js', 'storage.js'], ['rally.js', 'render.js'], ['banks.js', 'render.js'],
  ['render.js', 'main.js'], ['storage.js', 'main.js'], ['rally.js', 'main.js']
];
for (const [before, after] of need) {
  const i = order.indexOf(before), j = order.indexOf(after);
  if (i === -1 || j === -1 || i > j) problems.push(`読み込み順が不正: ${before} は ${after} より前に必要`);
}

/* 3〜5. データの検査は、実際にクラシックスクリプトを読み込んで行う */
function loadRR() {
  const sandbox = {
    window: {}, console, JSON, Math, Date, String, Number, Array, Object, Map, Set, Error
  };
  vm.createContext(sandbox);
  for (const f of order) {
    if (f === 'render.js' || f === 'main.js') continue;   // DOM を触るものは読まない
    vm.runInContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.window.RR;
}

let RR = null;
try { RR = loadRR(); } catch (e) { problems.push(`スクリプトの読み込みに失敗: ${e.message}`); }

let questionCount = 0;
if (RR) {
  const { Banks, Judge, Hint } = RR;
  const NONSENSE = ['', '   ', 'わかりません', 'あ', 'てすと', '？？？'];
  const seenIds = new Set();

  for (const bank of Banks.all()) {
    const unitIds = new Set(bank.units.map((u) => u.id));
    if (!bank.units.length) problems.push(`${bank.id}: 単元が無い`);
    for (const u of bank.units) {
      if (!u.label || !u.summary || !u.levelNote) problems.push(`${bank.id}/${u.id}: 単元の説明が欠けている`);
    }

    for (const q of bank.questions) {
      questionCount++;
      const at = `${bank.id}/${q.id}`;
      if (seenIds.has(q.id)) problems.push(`問題idの重複: ${q.id}`);
      seenIds.add(q.id);

      if (!unitIds.has(q.unit)) problems.push(`${at}: 単元 ${q.unit} が定義されていない`);
      if (!Number.isInteger(q.level) || q.level < Banks.MIN_LEVEL || q.level > Banks.MAX_LEVEL) {
        problems.push(`${at}: level が 1〜5 でない (${q.level})`);
      }
      if (!q.prompt) problems.push(`${at}: prompt が空`);
      if (!q.model) problems.push(`${at}: 模範解答(model)が無い`);
      if (!q.why) problems.push(`${at}: 採点基準の理由(why)が無い`);
      if (!q.source) problems.push(`${at}: 出典(source)が無い`);
      if (!Array.isArray(q.hints) || q.hints.length < 2) problems.push(`${at}: hints は2件以上必要`);
      if (Array.isArray(q.hints) && q.hints.some((h) => !h)) problems.push(`${at}: 空のヒントがある`);

      const req = q.criteria?.required || [];
      if (!req.length) problems.push(`${at}: 必須観点が無い`);
      if (req.length > 3) problems.push(`${at}: 必須観点が多すぎる（${req.length}件。3件までにする）`);

      const groups = [...req, ...(q.criteria?.optional || []), ...(q.criteria?.traps || [])];
      for (const g of groups) {
        if (!g.key) problems.push(`${at}: 観点に key が無い`);
        if (!Array.isArray(g.any) || !g.any.length) problems.push(`${at}: 観点「${g.key}」に候補語が無い`);
        for (const w of g.any || []) {
          if (!Judge.normalize(w)) problems.push(`${at}: 観点「${g.key}」の候補語 "${w}" は正規化すると空になる（何にでも一致してしまう）`);
        }
      }
      for (const g of req) {
        if (!g.why) problems.push(`${at}: 必須観点「${g.key}」に why が無い`);
      }
      // 誤解検出が必須観点と同じ語を拾っていたら、正解した人にも誤解ヒントが出てしまう
      const reqWords = new Set(req.flatMap((g) => g.any.map(Judge.normalize)));
      for (const t of q.criteria?.traps || []) {
        for (const w of t.any) {
          if (reqWords.has(Judge.normalize(w))) problems.push(`${at}: 誤解検出「${t.key}」の "${w}" が必須観点と同じ語`);
        }
        if (!t.hint) problems.push(`${at}: 誤解検出「${t.key}」に hint が無い`);
      }

      // 4-a. 模範解答は自分の基準で必ず正解になること
      const self = Judge.evaluate(q, q.model);
      if (!self.correct) {
        problems.push(`${at}: 模範解答が自分の採点基準を通らない（不足: ${self.missing.map((m) => m.key).join('、')}）`);
      }
      // 4-b. 中身の無い回答は通らないこと
      for (const junk of NONSENSE) {
        if (Judge.evaluate(q, junk).correct) problems.push(`${at}: "${junk}" で正解になってしまう`);
      }
      // 4-c. ヒントは最終段で必ず模範解答を開示すること
      const blank = Judge.evaluate(q, '');
      const lastHint = Hint.next(q, blank, Hint.REVEAL_STAGE);
      if (!lastHint.reveal) problems.push(`${at}: 最終段のヒントが模範解答を開示していない`);
      for (let s = 1; s <= Hint.REVEAL_STAGE; s++) {
        const h = Hint.next(q, blank, s);
        if (!h.text) problems.push(`${at}: ${s}段目のヒントが空`);
      }
    }

    // 5. 単元 × レベルの品揃え。階段（既定 2→3→4→5→5）が組めることを確かめる
    for (const c of Banks.coverage(bank)) {
      const missing = [1, 2, 3, 4, 5].filter((L) => !c.levels[L]);
      if (missing.length) problems.push(`${bank.id}/${c.unit.id}: レベル ${missing.join(',')} の問題が無い`);
    }
    if (bank.units.length < 2) problems.push(`${bank.id}: 補単元が取れない（単元は2つ以上必要）`);
  }

  if (Banks.all().length < 2) problems.push('問題集が2つ未満');
  if (questionCount < 20) problems.push(`問題が少なすぎる（${questionCount}件）`);
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — JS ${jsFiles.length}件 / 参照 ${refs.length}件 / 読み込み順 ${order.length}件 / 問題 ${questionCount}件`);

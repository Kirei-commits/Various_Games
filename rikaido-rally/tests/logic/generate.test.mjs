import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBank, splitSections, splitSentences, termsOf, weighTerms } from '../../js/author/generate.js';
import { validateBank, validateQuestion, JUNK_ANSWERS } from '../../js/author/validate.js';
import * as Judge from '../../js/core/judge.js';
import * as Rally from '../../js/core/rally.js';

const MATERIAL = `# 社内の情報取扱いルール

## 1. 機密区分

機密区分とは、情報の重要度に応じて取扱いの厳しさを決めるための分類です。当社では極秘・秘・社外秘・公開の4段階を用いています。
極秘は、漏えいすると会社の存続に関わる情報を指します。役員会の議事録や、未公表の買収案件がこれにあたります。
社外秘は、社内では自由に閲覧してよいが社外に出してはいけない情報です。
区分は作成した本人が付けるため、迷った場合は上位の区分を選びます。

## 2. 持ち出しの手続き

秘以上の情報を社外に持ち出す場合、事前に所属長の承認が必要です。
承認を得ずに持ち出すと、情報の行き先が記録に残らないため、漏えいが起きたときに範囲を特定できません。
持ち出しの申請では、まず申請書に対象の情報と持ち出し先を書き、次に所属長の承認を受け、最後に情報システム部に届け出ます。
社外秘は所属長の承認だけでよい一方、極秘は役員の承認も必要になります。

## 3. 事故が起きたとき

情報の紛失や誤送信に気づいたときは、直ちに情報システム部へ連絡します。
連絡が遅れるほど被害は広がるため、自分で解決しようとしてはいけません。
誤送信の場合は、送信先に削除を依頼したうえで、送信内容と宛先の記録を残します。`;

const RUBRIC = '機密区分の考え方と、持ち出し・事故時の手続きを、理由まで含めて説明できる。';
const PROMPT = '暗記ではなく、なぜその手続きが必要なのかを答えさせてください。';

const build = (over = {}) => generateBank({
  text: MATERIAL, rubric: RUBRIC, prompt: PROMPT, source: 'ルール.md', name: '情報取扱い', now: 1700000000000, ...over
});

test('見出しで単元に割れる。中身の無い見出し（文書タイトル）は単元にしない', () => {
  const sections = splitSections(MATERIAL);
  assert.ok(sections.length >= 3, `単元が少ない: ${sections.length}`);
  assert.ok(!sections.some((s) => s.title === '社内の情報取扱いルール'),
    'タイトル行がそのまま単元になっている（次の節の中身を食べてしまう）');
  assert.ok(sections.every((s) => s.body.trim()));
});

test('見出しが無い資料でも、空行のかたまりで単元に割れる', () => {
  const flat = Array.from({ length: 8 }, (_, i) =>
    `${i + 1}つ目の話です。これはとても大切な内容であり、理解が必要になります。`).join('\n\n');
  const sections = splitSections(flat);
  assert.ok(sections.length >= 2, `割れていない: ${sections.length}`);
});

test('文と語の切り出し', () => {
  assert.deepEqual(splitSentences('一つ目の文です。二つ目の文です。'), ['一つ目の文です。', '二つ目の文です。']);
  // 漢字とカタカナが続くひとかたまりは1語にする（「情報」と「システム」に割らない）
  assert.ok(termsOf('情報システム部へ連絡します').includes('情報システム部'));
  // それ自体では意味を持たない語は拾わない
  assert.ok(!termsOf('この場合はこれを使います').includes('場合'));
});

test('達成基準と出題方針に出てくる語は、重みが上がる', () => {
  const plain = weighTerms(MATERIAL, '');
  const boosted = weighTerms(MATERIAL, RUBRIC + PROMPT);
  assert.ok(boosted.weights.get('機密区分') > plain.weights.get('機密区分'));
  assert.ok(boosted.boosted.includes('機密区分'));
});

test('作った問題は、同梱の問題集と同じ検査をすべて通る', () => {
  const { bank } = build();
  const verdict = validateBank(bank);
  assert.equal(verdict.ok, true, verdict.problems.join(' / '));
  assert.ok(bank.questions.length >= 5, `問題が足りない: ${bank.questions.length}`);
  assert.ok(bank.units.length >= 2);
  assert.equal(bank.origin, 'authored');
});

test('模範解答は必ず正解になり、中身の無い回答では決して正解にならない', () => {
  const { bank } = build();
  for (const q of bank.questions) {
    assert.equal(Judge.evaluate(q, q.model).correct, true, `${q.id} の模範解答が通らない`);
    for (const junk of JUNK_ANSWERS) {
      assert.equal(Judge.evaluate(q, junk).correct, false, `${q.id} が "${junk}" で正解になる`);
    }
  }
});

test('設問文をそのまま貼り付けても正解にならない（答えを漏らしていない）', () => {
  const { bank } = build();
  for (const q of bank.questions) {
    assert.equal(Judge.evaluate(q, q.prompt).correct, false, `${q.id} は設問文だけで正解になる`);
  }
});

test('模範解答は資料の中に実在する（作文した正解を混ぜない）', () => {
  const { bank } = build();
  const material = Judge.normalize(MATERIAL);
  for (const q of bank.questions) {
    if (q.kind === '総合') continue;        // 総合問題だけは達成基準そのものが模範解答
    const model = Judge.normalize(q.model).replace(/。$/, '');
    assert.ok(material.includes(model), `${q.id} の模範解答が資料にない: ${q.model}`);
  }
});

test('ヒントに答えの語をそのまま書かない', () => {
  const { bank } = build();
  for (const q of bank.questions) {
    const answers = q.criteria.required.flatMap((g) => g.any);
    for (const [i, hint] of q.hints.entries()) {
      for (const a of answers) {
        assert.ok(!Judge.prepare(hint).norm.includes(Judge.normalize(a)),
          `${q.id} の ${i + 1}つ目のヒントに答えの語「${a}」が入っている`);
      }
    }
  }
});

test('達成基準が最後の総合問題（レベル5）になる', () => {
  const { bank } = build();
  const wrap = bank.questions.find((q) => q.kind === '総合');
  assert.ok(wrap, '総合問題が作られていない');
  assert.equal(wrap.level, 5);
  assert.ok(wrap.prompt.includes(RUBRIC));
  // 設問に達成基準の文を載せる以上、必須の語は達成基準に出てこないものから採る
  for (const g of wrap.criteria.required) {
    for (const w of g.any) assert.ok(!RUBRIC.includes(w), `達成基準にある語「${w}」を必須にしている`);
  }
});

test('達成基準が空でも作れる（総合問題が無いだけ）', () => {
  const { bank } = build({ rubric: '' });
  assert.ok(bank.questions.length >= 5);
  assert.equal(bank.questions.some((q) => q.kind === '総合'), false);
  assert.equal(validateBank(bank).ok, true);
});

test('穴埋めばかりにならない（型の上限が効いている）', () => {
  const { bank, report } = build();
  const kinds = Object.keys(report.byKind);
  assert.ok(kinds.length >= 3, `問い方が偏っている: ${kinds.join(',')}`);
  for (const unit of bank.units) {
    const cloze = bank.questions.filter((q) => q.unit === unit.id && q.kind === '穴埋め').length;
    assert.ok(cloze <= 2, `${unit.id} の穴埋めが ${cloze} 問ある`);
  }
});

test('捨てた問題は理由つきで報告される（黙って減らさない）', () => {
  const { report } = build();
  assert.ok(Array.isArray(report.rejected));
  for (const r of report.rejected) {
    assert.ok(r.problems && r.problems.length, `${r.id} に理由が無い`);
  }
  assert.equal(report.accepted, build().bank.questions.length);
});

test('同じ資料・同じ設定なら、同じ問題集になる', () => {
  const a = build().bank;
  const b = build().bank;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('作った問題集で、実際に5問のラリーが最後まで回る', () => {
  const { bank } = build();
  const session = Rally.create(bank, {}, 42);
  for (let i = 0; i < session.size; i++) {
    Rally.submit(session, Rally.current(session).model);
    Rally.advance(session);
  }
  assert.equal(session.phase, 'result');
  assert.equal(session.summary.grade.grade, 'A');
  assert.equal(new Set(session.records.map((r) => r.qid)).size, session.size, '同じ問題が2度出た');
});

test('作った問題集でも、詰まればヒントが5段まで出て必ず通れる', () => {
  const { bank } = build();
  const session = Rally.create(bank, {}, 7);
  for (let i = 1; i <= 5; i++) {
    const out = Rally.submit(session, 'まったく的外れな回答');
    assert.equal(out.hint.stage, i);
    assert.ok(out.hint.text);
  }
  assert.equal(Rally.currentRecord(session).revealed, true);
  assert.equal(Rally.submit(session, Rally.current(session).model).result.correct, true);
});

test('資料が空なら作らない（空の問題集を返さない）', () => {
  assert.throws(() => generateBank({ text: '   ' }), /空です/);
});

test('短すぎる資料からは、無理に問題を作らない', () => {
  const { bank } = generateBank({ text: 'みじかい。', rubric: '', prompt: '', source: 'x' });
  // 検査を通らない問題を無理に通すくらいなら、問題数が足りない方がよい
  assert.equal(validateBank(bank).ok, false);
});

test('検査は、壊れた問題を型ごとに捕まえる', () => {
  const base = {
    id: 'x', unit: 'u1', level: 2, prompt: 'これは何ですか。',
    criteria: { required: [{ key: 'A', any: ['りんご'], why: '要点だから' }], optional: [], traps: [] },
    hints: ['ひとつ', 'ふたつ'], model: 'りんごです。', why: '理由', source: '資料'
  };
  assert.equal(validateQuestion(base).ok, true);

  const bad = (over, expected) => {
    const v = validateQuestion({ ...base, ...over });
    assert.equal(v.ok, false, `${expected} を素通りさせた`);
    assert.ok(v.problems.join(' ').includes(expected), `理由が違う: ${v.problems.join(' / ')}`);
  };
  bad({ model: 'みかんです。' }, '模範解答が自分の採点基準を通らない');
  bad({ prompt: 'りんごとは何ですか。' }, '設問文をそのまま貼り付けると正解になる');
  bad({ criteria: { required: [{ key: 'A', any: ['。'], why: 'x' }] } }, '正規化すると空になる');
  bad({ level: 9 }, 'level が 1〜5 でない');
  bad({ hints: ['ひとつだけ'] }, 'ヒントは2件以上必要');
  bad({ source: '' }, '出典');
  bad({
    criteria: {
      required: [{ key: 'A', any: ['りんご'], why: 'x' }, { key: 'B', any: ['ぶどう'], why: 'x' },
        { key: 'C', any: ['もも'], why: 'x' }, { key: 'D', any: ['かき'], why: 'x' }]
    }
  }, '必須観点が多すぎる');
});

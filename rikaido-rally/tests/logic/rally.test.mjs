import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Rally from '../../js/core/rally.js';
import * as Hint from '../../js/core/hint.js';
import * as Choice from '../../js/core/choice.js';
import { BANKS, bankById, runRally, answerCorrectly, answerWrong } from './helpers.mjs';

const java = bankById('java');
const start = (opts = {}) => Rally.create(java, {}, { seed: 1, ...opts });

test('1ラリーは10問。1問目は既定の開始レベルから始まる', () => {
  const s = start();
  assert.equal(Rally.SIZE, 10);
  assert.equal(s.size, 10);
  assert.equal(s.records[0].level, Rally.START_LEVEL);
  assert.equal(s.phase, 'asking');
});

test('問題が10問に足りない問題集では、あるだけで終える', () => {
  const small = { ...java, questions: java.questions.slice(0, 6) };
  assert.equal(Rally.create(small, {}, { seed: 1 }).size, 6);
});

/* ── 選択式 ─────────────────────────────── */

test('既定は選択式。選択肢は毎回ちがう順で並ぶ', () => {
  const s = start();
  const rec = Rally.currentRecord(s);
  assert.equal(rec.choiceMode, true);
  assert.equal(rec.choiceOrder.length, Rally.current(s).choices.length);
  assert.deepEqual([...rec.choiceOrder].sort(), [...Rally.current(s).choices].sort());

  const orders = [1, 2, 3, 4, 5, 6].map((seed) =>
    Rally.currentRecord(Rally.create(java, {}, { seed })).choiceOrder.join('|'));
  assert.ok(new Set(orders).size > 1, '並びがいつも同じ（位置で当てられてしまう）');
});

test('選択式は「先頭が正解」の規約で判定する。位置では当たらない', () => {
  const s = start();
  const q = Rally.current(s);
  const wrong = q.choices[1];
  assert.equal(Rally.choose(s, wrong).result.correct, false);
  assert.equal(s.index, 0);
  assert.equal(Rally.choose(s, Choice.correctText(q)).result.correct, true);
  assert.equal(s.phase, 'cleared');
});

test('書いて答えるモードにすると、選択肢を使わず記述式になる', () => {
  const s = Rally.create(java, {}, { seed: 1, choiceMode: false });
  assert.equal(Rally.currentRecord(s).choiceMode, false);
  assert.equal(Rally.submit(s, Rally.current(s).model).result.correct, true);
});

/* ── ヒント ─────────────────────────────── */

test('不正解では進まず、ヒントは3段で打ち止め', () => {
  const s = start();
  const firstId = Rally.current(s).id;
  for (let i = 1; i <= Hint.REVEAL_STAGE; i++) {
    const out = answerWrong(s);
    assert.equal(out.hint.stage, i);
    assert.equal(s.index, 0, '不正解で番号が進んでいる');
    assert.equal(Rally.current(s).id, firstId);
  }
  assert.equal(Rally.currentRecord(s).hintsUsed, 3);
  assert.equal(Rally.currentRecord(s).revealed, true);
  assert.equal(Rally.advance(s), false, 'ヒント中に advance が通ってしまう');
  assert.equal(answerCorrectly(s).result.correct, true);
});

test('選択式の2段目で、誤答が1つ実際に消える', () => {
  const s = start();
  answerWrong(s);
  assert.equal(Rally.currentRecord(s).eliminated.length, 0);
  answerWrong(s);
  const rec = Rally.currentRecord(s);
  assert.equal(rec.eliminated.length, 1);
  assert.ok(!Choice.isCorrect(Rally.current(s), rec.eliminated[0]), '正解を消してしまっている');
});

/* ── 飛ばす ─────────────────────────────── */

test('わからない問題は飛ばせる。0点で、答えは見せる', () => {
  const s = start();
  const out = Rally.skip(s);
  assert.equal(out.skipped, true);
  assert.ok(out.hint.text.includes(Choice.correctText(Rally.current(s))));
  const rec = Rally.currentRecord(s);
  assert.equal(rec.skipped, true);
  assert.equal(rec.score, 0);
  assert.equal(s.phase, 'skipped');
  assert.equal(Rally.advance(s), true);
  assert.equal(s.index, 1);
});

test('正解したあと・飛ばしたあとは、もう答えられない', () => {
  const s = start();
  Rally.skip(s);
  assert.equal(Rally.choose(s, 'なんでも'), null);
  assert.equal(Rally.submit(s, 'なんでも'), null);
});

test('全問飛ばすと E。飛ばした数が結果に出る', () => {
  const s = start();
  for (let i = 0; i < s.size; i++) { Rally.skip(s); Rally.advance(s); }
  assert.equal(s.phase, 'result');
  assert.equal(s.summary.grade.grade, 'E');
  assert.equal(s.summary.skipped, s.size);
  assert.equal(s.summary.score, 0);
});

/* ── レベルの階段（おまかせ） ───────────── */

test('レベルの階段：一発正解で+1、ヒント1回で据え置き、2回以上・飛ばしで−1', () => {
  assert.equal(Rally.nextLevel(3, { hintsUsed: 0, revealed: false }).level, 4);
  assert.equal(Rally.nextLevel(3, { hintsUsed: 1, revealed: false }).level, 3);
  assert.equal(Rally.nextLevel(3, { hintsUsed: 2, revealed: false }).level, 2);
  assert.equal(Rally.nextLevel(3, { hintsUsed: 0, skipped: true }).level, 2, '飛ばしても下げる');
  assert.equal(Rally.nextLevel(5, { hintsUsed: 0, revealed: false }).level, 5);
  assert.equal(Rally.nextLevel(1, { hintsUsed: 3, revealed: false }).level, 1);
});

test('全問一発正解なら、狙いのレベルが予定の階段どおりに上がる', () => {
  const s = runRally(java, 0, 777);
  assert.equal(s.records.map((r) => r.targetLevel).join(','), s.plan.plannedLadder.join(','));
  assert.equal(s.plan.plannedLadder.join(','), '2,3,4,5,5,5,5,5,5,5');
  // 実際に出る問題は、その段を出し切ると近い段から借りるので予定とは限らない
  assert.ok(s.records.every((r) => Math.abs(r.level - r.targetLevel) <= 2));
});

test('詰まり続けると狙いの段が下がっていく', () => {
  const s = runRally(java, 2, 777);
  const aim = s.records.map((r) => r.targetLevel);
  assert.equal(aim[aim.length - 1], 1, `下がりきっていない: ${aim.join(',')}`);
  assert.ok(Math.min(...aim) >= 1);
  assert.ok(s.records.every((r) => r.hintsUsed === 2), 'ヒント回数が揃っていない');
});

/* ── 出題の決め方 ───────────────────────── */

test('レベル別：選んだ段の問題だけが出る（難易度が選択どおりになる）', () => {
  for (const bank of BANKS) {
    for (const level of [1, 2, 3, 4, 5]) {
      const s = runRally(bank, 0, 42, { mode: 'level', level });
      const off = s.records.filter((r) => r.level !== level);
      assert.equal(off.length, 0,
        `${bank.id}/L${level} に別の段が混ざった: ${off.map((r) => `${r.qid}(L${r.level})`).join(',')}`);
      assert.equal(s.records.length, 10);
      assert.ok(s.plan.title.includes(`レベル${level}`));
      assert.equal(s.plan.plannedLadder.every((L) => L === level), true);
    }
  }
});

test('レベル別は、その段を出し切ったときだけ近い段から借りる', () => {
  // 1段ぶんに満たない小さな問題集を作って、借りるところまで確かめる
  const small = Object.assign({}, java, {
    questions: java.questions.filter((q) => q.level !== 2 || q.unit === 'equality')
  });
  const s = runRally(small, 0, 42, { mode: 'level', level: 2 });
  assert.equal(s.records.length, 10);
  assert.equal(new Set(s.records.map((r) => r.qid)).size, 10);
  const borrowed = s.records.filter((r) => r.level !== 2);
  assert.ok(borrowed.length > 0, '足りないのに借りていない');
  assert.ok(borrowed.every((r) => Math.abs(r.level - 2) <= 2), '遠い段から借りている');
});

test('同じ条件でも、ラリーごとに出る問題が変わる（毎回おなじ問題にならない）', () => {
  for (const bank of BANKS) {
    const seen = new Set();
    for (let seed = 1; seed <= 6; seed++) {
      seen.add(runRally(bank, 0, seed).records.map((r) => r.qid).join(','));
    }
    assert.ok(seen.size >= 5, `${bank.id}: 6回中 ${seen.size} 通りしか出題が変わらない`);
  }
});

test('最近解いた問題は後回しになる', () => {
  // 直近に解いた「レベル1」の問題は、同じ段の未出題より後ろに回る
  const target = java.questions.filter((q) => q.level === 1);
  const recent = target.slice(0, 5);
  const attempts = {};
  for (const q of recent) attempts[q.id] = { times: 1, lastAt: Date.now() };

  let firstIsRecent = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = Rally.create(java, {}, { seed, mode: 'level', level: 1, attempts });
    if (recent.some((q) => q.id === s.records[0].qid)) firstIsRecent += 1;
  }
  assert.ok(firstIsRecent <= 4, `最近解いた問題が20回中 ${firstIsRecent} 回も先頭に来ている`);
});

test('復習：過去に出た問題だけを、飛ばした順・詰まった順に出す', () => {
  const attempts = {
    'java-eq-1': { times: 1, lastHints: 0, lastRevealed: false, lastSkipped: false, lastAt: 30 },
    'java-str-2': { times: 1, lastHints: 3, lastRevealed: true, lastSkipped: false, lastAt: 20 },
    'java-col-3': { times: 1, lastHints: 1, lastRevealed: false, lastSkipped: true, lastAt: 10 }
  };
  const s = Rally.create(java, {}, { seed: 5, mode: 'review', attempts });
  assert.equal(s.mode, 'review');
  assert.equal(s.size, 3, '過去に出た問題の数だけ出す');
  assert.equal(s.plan.queue.join(','), 'java-col-3,java-str-2,java-eq-1');
  assert.ok(s.plan.title.includes('復習'));
  assert.ok(Rally.currentRecord(s).pickReason.includes('飛ばした'));
});

test('復習できる問題が無ければ、おまかせに落ちて理由を残す', () => {
  const s = Rally.create(java, {}, { seed: 5, mode: 'review', attempts: {} });
  assert.equal(s.mode, 'auto');
  assert.ok(s.plan.fellBack.includes('まだ解いた問題がない'));
  assert.equal(s.size, 10);
});

/* ── 全体 ───────────────────────────────── */

test('同じ問題は1ラリーに2度出ない', () => {
  for (const bank of BANKS) {
    for (const seed of [1, 2, 3, 99, 20260915]) {
      for (const mode of ['auto', 'level']) {
        const s = runRally(bank, 0, seed, { mode, level: 3 });
        const ids = s.records.map((r) => r.qid);
        assert.equal(new Set(ids).size, ids.length, `${bank.id}/${mode}/seed=${seed} で重複`);
      }
    }
  }
});

test('単元の自動生成：未受験の単元が最優先で選ばれる', () => {
  const history = { java: {} };
  for (const u of java.units) history.java[u.id] = { plays: 3, lastScore: 95, lastAt: 1 };
  const target = java.units[3];
  delete history.java[target.id];

  const s = Rally.create(java, history, { seed: 42 });
  assert.equal(s.plan.main.id, target.id);
  assert.ok(s.plan.reason.includes('まだ出題していない'));
});

test('単元の自動生成：全部受験済みなら、直近スコアが最も低い単元が選ばれる', () => {
  const history = { java: {} };
  java.units.forEach((u, i) => { history.java[u.id] = { plays: 1, lastScore: 90 - i * 3, lastAt: 100 + i }; });
  const s = Rally.create(java, history, { seed: 42 });
  assert.equal(s.plan.main.id, java.units[java.units.length - 1].id);
  assert.ok(s.plan.reason.includes('いちばん低い'));
});

test('選定理由は必ず記録される（画面の説明はこれを表示している）', () => {
  for (const mode of ['auto', 'level']) {
    const s = runRally('kuwata', 1, 5, { mode, level: 2 });
    for (const r of s.records) {
      assert.ok(r.pickReason, `${r.qid} に選定理由が無い`);
      assert.ok(r.levelRule, `${r.qid} にレベル決定の根拠が無い`);
    }
  }
});

test('同じシードなら同じ並びになる', () => {
  const ids = (n) => runRally('kuwata', 0, n).records.map((r) => r.qid).join(',');
  assert.equal(ids(31337), ids(31337));
});

test('全問一発正解なら A、全問で答えを見たら E', () => {
  const best = runRally(java, 0, 2024);
  assert.equal(best.summary.grade.grade, 'A');
  assert.equal(best.summary.perfect, 10);
  assert.equal(best.summary.hintTotal, 0);

  const worst = runRally(java, Hint.REVEAL_STAGE, 2024);
  assert.equal(worst.summary.grade.grade, 'E');
  assert.ok(worst.records.every((r) => r.revealed));
});

test('ヒント1回で通すと A には届かないが E でもない', () => {
  const grade = runRally('kuwata', 1, 808).summary.grade.grade;
  assert.ok(['B', 'C'].includes(grade), `想定外の評価: ${grade}`);
});

test('結果には、単元ごとの到達点と「次に上げる場所」が入る', () => {
  const s = runRally(java, 2, 55);
  assert.ok(s.summary.units.length >= 1);
  assert.ok(s.summary.weak.length >= 1, '取りこぼしがあるのに弱点が空');
  assert.ok(s.summary.next, 'A未満なのに次の評価が出ていない');
  assert.equal(s.summary.levelPath.length, 10);
  for (const w of s.summary.weak) {
    assert.ok(w.unitLabel && w.unitLabel !== w.unit, `${w.qid} の単元ラベルが id のまま`);
  }
});

test('両方の問題集で、正解を選ぶだけで最後まで走り切れる', () => {
  for (const bank of BANKS) {
    for (const seed of [1, 7, 123, 4096]) {
      const s = runRally(bank, 0, seed);
      assert.equal(s.phase, 'result', `${bank.id}/seed=${seed} が終わらない`);
      assert.equal(s.records.length, 10);
      assert.ok(s.records.every((r) => r.cleared));
    }
  }
});

test('結果が出たあとの回答は受け付けない', () => {
  const s = runRally(java, 0, 9);
  assert.equal(Rally.submit(s, 'まだ書けますか'), null);
  assert.equal(Rally.choose(s, 'まだ選べますか'), null);
});

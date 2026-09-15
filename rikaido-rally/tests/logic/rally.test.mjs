import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRR, runRally, answerWith } from './helpers.mjs';

const RR = loadRR();
const { Rally, Banks, Grade, Hint } = RR;

test('ラリーは5問。1問目は既定の開始レベルから始まる', () => {
  const s = Rally.create('java', {}, 1);
  assert.equal(s.size, 5);
  assert.equal(s.records[0].level, Rally.START_LEVEL);
  assert.equal(s.phase, 'asking');
});

test('不正解では問題が進まない。正解して初めて次へ行く', () => {
  const s = Rally.create('java', {}, 1);
  const firstId = Rally.current(s).id;
  for (let i = 0; i < 3; i++) {
    Rally.submit(s, 'まったく的外れな回答');
    assert.equal(s.index, 0, '不正解で番号が進んでいる');
    assert.equal(Rally.current(s).id, firstId, '不正解で問題が差し替わっている');
    assert.equal(s.phase, 'hinting');
  }
  assert.equal(Rally.advance(s), false, 'ヒント中に advance が通ってしまう');

  Rally.submit(s, Rally.current(s).model);
  assert.equal(s.phase, 'cleared');
  Rally.advance(s);
  assert.equal(s.index, 1);
});

test('ヒントは段階的に進み、最終段で模範解答を開示する', () => {
  const s = Rally.create('java', {}, 1);
  for (let i = 1; i <= Hint.REVEAL_STAGE; i++) {
    const out = Rally.submit(s, 'ぜんぜん違います');
    assert.equal(out.hint.stage, i);
    assert.equal(Rally.currentRecord(s).hintsUsed, i);
  }
  assert.equal(Rally.currentRecord(s).revealed, true);
  // 開示のあと、その模範解答を書けば必ず通る
  assert.equal(Rally.submit(s, Rally.current(s).model).result.correct, true);
});

test('レベルの階段：一発正解で+1、ヒント1回で据え置き、2回以上で−1', () => {
  const up = Rally.nextLevel(3, { hintsUsed: 0, revealed: false });
  const stay = Rally.nextLevel(3, { hintsUsed: 1, revealed: false });
  const down = Rally.nextLevel(3, { hintsUsed: 2, revealed: false });
  const shown = Rally.nextLevel(3, { hintsUsed: 0, revealed: true });
  assert.equal(up.level, 4);
  assert.equal(stay.level, 3);
  assert.equal(down.level, 2);
  assert.equal(shown.level, 2, '模範解答を見たら下げる');
});

test('レベルは1〜5からはみ出さない', () => {
  assert.equal(Rally.nextLevel(5, { hintsUsed: 0, revealed: false }).level, 5);
  assert.equal(Rally.nextLevel(1, { hintsUsed: 3, revealed: false }).level, 1);
});

test('全問一発正解なら、実際のレベルが予定の階段と一致する', () => {
  const s = runRally(RR, 'java', 0, 777);
  const actual = s.records.map((r) => r.level).join(',');
  assert.equal(actual, s.plan.plannedLadder.join(','));
  assert.equal(actual, '2,3,4,5,5');
});

test('詰まり続けると段が下がっていく', () => {
  const s = runRally(RR, 'java', 2, 777);
  const path = s.records.map((r) => r.level);
  assert.ok(path[path.length - 1] < path[0], `下がっていない: ${path.join(',')}`);
  assert.ok(Math.min(...path) >= 1);
});

test('同じ問題は1ラリーに2度出ない', () => {
  for (const bank of ['java', 'kuwata']) {
    for (const seed of [1, 2, 3, 99, 20260915]) {
      const s = runRally(RR, bank, 0, seed);
      const ids = s.records.map((r) => r.qid);
      assert.equal(new Set(ids).size, ids.length, `${bank}/seed=${seed} で重複: ${ids.join(',')}`);
    }
  }
});

test('単元の自動生成：未受験の単元が最優先で選ばれる', () => {
  const bank = Banks.get('java');
  const history = { java: {} };
  // 1つを除いて全部「やった・高得点」にしておく
  for (const u of bank.units) history.java[u.id] = { plays: 3, lastScore: 95, lastAt: 1 };
  const target = bank.units[3];
  delete history.java[target.id];

  const s = Rally.create('java', history, 42);
  assert.equal(s.plan.main.id, target.id);
  assert.ok(s.plan.reason.includes('まだ出題していない'));
});

test('単元の自動生成：全部受験済みなら、直近スコアが最も低い単元が選ばれる', () => {
  const bank = Banks.get('java');
  const history = { java: {} };
  bank.units.forEach((u, i) => { history.java[u.id] = { plays: 1, lastScore: 90 - i * 3, lastAt: 100 + i }; });
  const weakest = bank.units[bank.units.length - 1];

  const s = Rally.create('java', history, 42);
  assert.equal(s.plan.main.id, weakest.id);
  assert.ok(s.plan.reason.includes('いちばん低い'));
});

test('主単元で同じ段を出し切ったら補単元から借りる', () => {
  const s = runRally(RR, 'java', 0, 777);
  const units = new Set(s.records.map((r) => r.unit));
  assert.ok(units.size > 1, '5問目(L5の2問目)が補単元から来ていない');
  assert.ok(s.plan.support, '補単元が決まっていない');
  const borrowed = s.records.filter((r) => r.unit !== s.plan.main.id);
  for (const b of borrowed) assert.equal(b.unit, s.plan.support.id, '補単元以外から借りている');
});

test('選定理由は必ず記録される（画面の説明はこれを表示している）', () => {
  const s = runRally(RR, 'kuwata', 1, 5);
  for (const r of s.records) {
    assert.ok(r.pickReason, `${r.qid} に選定理由が無い`);
    assert.ok(r.levelRule, `${r.qid} にレベル決定の根拠が無い`);
  }
});

test('同じシードなら同じ並びになる', () => {
  const a = runRally(RR, 'kuwata', 0, 31337).records.map((r) => r.qid).join(',');
  const b = runRally(RR, 'kuwata', 0, 31337).records.map((r) => r.qid).join(',');
  assert.equal(a, b);
});

test('全問一発正解なら A、全問で模範解答を見たら E', () => {
  const best = runRally(RR, 'java', 0, 2024);
  assert.equal(best.summary.grade.grade, 'A');
  assert.equal(best.summary.perfect, 5);
  assert.equal(best.summary.hintTotal, 0);

  const worst = runRally(RR, 'java', Hint.REVEAL_STAGE, 2024);
  assert.equal(worst.summary.grade.grade, 'E');
  assert.ok(worst.records.every((r) => r.revealed));
});

test('ヒント1回で通すと A には届かないが E でもない', () => {
  const s = runRally(RR, 'kuwata', 1, 808);
  const grade = s.summary.grade.grade;
  assert.ok(['B', 'C'].includes(grade), `想定外の評価: ${grade}（${s.summary.score}点）`);
});

test('結果には、単元ごとの到達点と「次に上げる場所」が入る', () => {
  const s = runRally(RR, 'java', 2, 55);
  assert.ok(s.summary.units.length >= 1);
  assert.ok(s.summary.weak.length >= 1, '取りこぼしがあるのに弱点が空');
  assert.ok(s.summary.next, 'A未満なのに次の評価が出ていない');
  assert.equal(s.summary.levelPath.length, 5);

  for (const w of s.summary.weak) {
    // 単元は id ではなく画面に出せるラベルで持つ
    assert.ok(w.unitLabel && w.unitLabel !== w.unit, `${w.qid} の単元ラベルが id のまま: ${w.unitLabel}`);
    // 詰まった観点は、正解した後も残っている（正解時に消すと「何で詰まったか」が出せない）
    assert.ok(w.missedKeys.length > 0, `${w.qid} の詰まった観点が空`);
  }
});

test('一発正解した問題は、詰まった観点が空のまま', () => {
  const s = runRally(RR, 'java', 0, 55);
  for (const r of s.records) assert.equal(r.missedKeys.length, 0);
});

test('両方の問題集で、模範解答だけで最後まで走り切れる', () => {
  for (const bank of Banks.all()) {
    for (const seed of [1, 7, 123, 4096]) {
      const s = runRally(RR, bank.id, 0, seed);
      assert.equal(s.phase, 'result', `${bank.id}/seed=${seed} が終わらない`);
      assert.equal(s.records.length, 5);
      assert.ok(s.records.every((r) => r.cleared));
    }
  }
});

test('結果が出たあとの回答は受け付けない', () => {
  const s = runRally(RR, 'java', 0, 9);
  assert.equal(Rally.submit(s, 'まだ書けますか'), null);
});

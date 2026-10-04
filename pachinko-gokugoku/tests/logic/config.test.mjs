// 調整値（src/pure/config.js）の形と前後関係。数値を変えたときの書き間違いを拾う
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const { cfg } = load();

function tables(o, pathName = 'CONFIG', out = []) {
  for (const [k, v] of Object.entries(o)) {
    const p = `${pathName}.${k}`;
    if (Array.isArray(v) && v.length && Array.isArray(v[0]) && v[0].length === 2 && typeof v[0][1] === 'number') out.push([p, v]);
    else if (v && typeof v === 'object' && !Array.isArray(v)) tables(v, p, out);
  }
  return out;
}

test('重みの表はすべて重みが0以上で、合計が正', () => {
  const ts = tables(cfg);
  assert.ok(ts.length >= 15, `表が少なすぎる (${ts.length})`);
  for (const [p, t] of ts) {
    for (const [, w] of t) assert.ok(w >= 0, `${p} に負の重み`);
    assert.ok(t.reduce((a, b) => a + b[1], 0) > 0, `${p} の合計が0`);
  }
});

test('割合は 0〜1', () => {
  const S = cfg.scenario, R = cfg.spec.rush;
  for (const v of [cfg.spec.feverRate, R.targetContinuation, R.sevenRate, R.iwakanRate, R.battleFakeRate, S.spTypeBattle, S.judgeButton,
    S.goldTitleHit, S.goldTitleMiss, S.logoDropHit, S.logoDropMiss, S.stepupHitRate, S.stepupMissRate, cfg.holdColor.changeAtEntry, ...cfg.holdColor.sakibareOptions]) {
    assert.ok(v >= 0 && v <= 1, `割合が範囲外: ${v}`);
  }
});

test('ハズレのリーチ表は全部の保留色（虹以外）にある', () => {
  for (const [c] of cfg.holdColor.miss) assert.ok(cfg.scenario.missReachByColor[c], `missReachByColor.${c} が無い`);
  for (const [c] of cfg.holdColor.missPreread) assert.ok(cfg.scenario.missReachByColor[c], `missReachByColor.${c} が無い`);
  assert.ok(!cfg.holdColor.miss.some(([c, w]) => c === 'rainbow' && w > 0), '虹保留はハズレで出してはいけない（確定演出）');
});

test('演出の時刻は順番どおり', () => {
  const T = cfg.timing, sp = T.sp;
  assert.ok(0 < T.stopL && T.stopL < T.stopR && T.stopR < 1, '左→右→中の順で止まる');
  assert.ok(T.normalSpin[0] >= 2 && T.normalSpin[1] <= 3, '通常変動は2〜3秒');
  assert.ok(T.fullSpin[1] < T.normalSpin[0], '保留満タンは通常より速い');
  assert.equal(T.rushSpin, 0.5, 'RUSH は0.5秒変動');
  assert.ok(sp.title < sp.cutin && sp.cutin < sp.telop && sp.telop <= sp.logoDrop && sp.logoDrop < sp.judge, 'SP: タイトル→カットイン→テロップ→役物→判定');
  for (let i = 1; i < sp.battleActs.length; i++) assert.ok(sp.battleActs[i - 1] < sp.battleActs[i]);
  assert.ok(sp.battleActs.at(-1) < sp.judge);
  const rb = T.rushBattle; assert.ok(rb.acts.at(-1) < rb.final && rb.final < rb.result && rb.result < rb.loseEnd && rb.loseEnd <= rb.winEnd);
  const z = T.zenkaiten; assert.ok(z.freeze < z.stop && z.stop < z.align);
  assert.ok(T.bonus.leverAfterRound < cfg.spec.rounds.fever && T.bonus.leverAfterRound >= cfg.spec.rounds.regular, '一撃レバーは3Rより後・10Rより前');
});

test('称号は出玉の多い順で、最後は0から', () => {
  const r = cfg.result.ranks;
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1][0] > r[i][0]);
  assert.equal(r.at(-1)[0], 0);
  assert.equal(r.map(x => x[1]).join(), '神,一騎当千,凡人');
});

test('既定の確率は選択肢に含まれる', () => {
  assert.ok(cfg.spec.probDenoms.includes(cfg.spec.defaultProbDenom));
  assert.equal(cfg.spec.defaultProbDenom, 319.6);
  assert.equal(cfg.spec.feverRate, 0.6);
  assert.equal(cfg.spec.rounds.fever * cfg.spec.countPerRound * cfg.payout.attacker, 1500, 'FEVER は1500個');
  assert.equal(cfg.spec.rounds.regular * cfg.spec.countPerRound * cfg.payout.attacker, 450, '3R は450個');
});

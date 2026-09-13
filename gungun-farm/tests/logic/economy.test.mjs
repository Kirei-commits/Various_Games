/**
 * 経済のテスト。1局を最後まで回して「詰まないか」「育ちの速さが狙い通りか」を見る。
 *
 * 数値は当て推量ではなく `npm run simulate` の実測から置いている。
 * 閾値は実測より下に置く（実測 Lv14 → 閾値 Lv11）。フレーキーなテストは無いテストより悪い。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom } from './helpers.mjs';
import { simulate } from '../bot.mjs';

const GF = loadGF(['data.js', 'engine.js']);
const runs = (minutes, n) => Array.from({ length: n }, (_, i) => {
  const seed = mixSeed(i);
  return simulate(GF, { minutes, seed, random: seededRandom(seed) });
});
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('10分まわしても、何もできない時間ができない', () => {
  for (const r of runs(10, 6)) {
    assert.ok(r.worstStuckMs <= 2000, `何もできない時間が ${r.worstStuckMs}ms あった（seed ${r.seed}）`);
  }
});

test('ふつうに回していれば救済は出番が無い', () => {
  const total = runs(10, 6).reduce((a, r) => a + r.rescues, 0);
  assert.equal(total, 0, '救済が出るなら、経済のどこかが破綻している');
});

test('3分では終わらないが、ちゃんと育つ', () => {
  const rs = runs(3, 8);
  const levels = rs.map((r) => r.level);
  assert.ok(med(levels) >= 5, `3分でレベル${med(levels)}は遅すぎる`);
  assert.ok(Math.max(...levels) < GF.Data.MAX_LEVEL, '3分で上限に着いてしまうと、育つ楽しみが無くなる');
  assert.ok(med(rs.map((r) => r.delivered)) >= 10, '3分で10件は届けられること');
});

test('10分でレベル11以上まで育つ（実測は中央14）', () => {
  const levels = runs(10, 6).map((r) => r.level);
  assert.ok(med(levels) >= 11, `10分でレベル${med(levels)}は遅すぎる`);
});

test('上限レベルには手が届く（20分）', () => {
  const rs = runs(20, 4);
  assert.ok(rs.some((r) => r.level >= GF.Data.MAX_LEVEL - 1),
    `20分回しても Lv${Math.max(...rs.map((r) => r.level))} 止まり`);
});

test('10分あれば、機械も畑もひととおり揃う', () => {
  const rs = runs(10, 6);
  assert.ok(med(rs.map((r) => r.machines)) >= 7, '機械が買えない＝コインが足りていない');
  assert.ok(med(rs.map((r) => r.fields)) >= 9, '畑が広げられていない');
});

test('コインもタネも尽きた行き止まりからは、救済で抜けられる', () => {
  const GF2 = loadGF(['data.js', 'engine.js']);
  GF2.Engine.setRandom(seededRandom(9));
  const s = GF2.Engine.create({ coins: 0 });
  s.barn = {};
  assert.equal(GF2.Engine.plantAll(s, 'wheat'), 0, '前提: 何も植えられない');

  GF2.Engine.tick(s, 100);
  assert.equal(s.stats.rescues, 1);
  assert.ok(s.coins >= GF2.Data.crop('wheat').cost, '救済のあとはタネが買える');
  assert.ok(GF2.Engine.plantAll(s, 'wheat') > 0);
});

test('倉庫に売れるものが残っているうちは救済しない（自力で抜けられる）', () => {
  const GF2 = loadGF(['data.js', 'engine.js']);
  GF2.Engine.setRandom(seededRandom(10));
  const s = GF2.Engine.create({ coins: 0 });
  GF2.Engine.store(s, 'wheat', 1);
  GF2.Engine.tick(s, 100);
  assert.equal(s.stats.rescues, 0);
  assert.equal(s.coins, 0);
});

test('3分チャレンジは3分ちょうどで終わる', () => {
  const GF2 = loadGF(['data.js', 'engine.js']);
  GF2.Engine.setRandom(seededRandom(11));
  const s = GF2.Engine.create({ mode: 'rush', limit: 180_000 });
  GF2.Engine.tick(s, 179_999);
  assert.equal(s.over, false);
  GF2.Engine.tick(s, 180_000);
  assert.equal(s.over, true);

  const coins = s.coins;
  GF2.Engine.tick(s, 300_000);
  assert.equal(s.coins, coins, '終わったあとは時間が進まない');
});

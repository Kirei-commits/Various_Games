import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, seededRandom } from './helpers.mjs';

const { World } = loadFQ(['world.js']);

test('1日のどの分でも必ずどれか1つの時間帯に入る（隙間も重複もない）', () => {
  const counts = {};
  for (let m = 0; m < World.MINUTES_PER_DAY; m++) {
    const p = World.phaseAt(m);
    assert.ok(p, `${m}分 の時間帯が求まらない`);
    counts[p.id] = (counts[p.id] || 0) + 1;
  }
  assert.deepEqual(Object.keys(counts).sort(), ['dawn', 'day', 'dusk', 'night']);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  assert.equal(total, World.MINUTES_PER_DAY);
});

test('境界の分がどちらの時間帯に入るかが定義どおり', () => {
  assert.equal(World.phaseAt(239).id, 'night');
  assert.equal(World.phaseAt(240).id, 'dawn');
  assert.equal(World.phaseAt(419).id, 'dawn');
  assert.equal(World.phaseAt(420).id, 'day');
  assert.equal(World.phaseAt(1139).id, 'dusk');
  assert.equal(World.phaseAt(1140).id, 'night');
  assert.equal(World.phaseAt(0).id, 'night', '日をまたぐ時間帯が扱えている');
});

test('時計はキャストごとに進み、24時間で一周する', () => {
  let m = 0;
  const perDay = World.MINUTES_PER_DAY / World.MINUTES_PER_CAST;
  for (let i = 0; i < perDay; i++) m = World.advance(m);
  assert.equal(m, 0, '一周して戻らない');
  assert.equal(World.advance(1430, 30), 20, '日をまたぐ加算が壊れている');
  assert.equal(World.normalizeMinutes(-30), 1410, '負の値も正規化される');
  assert.equal(World.formatClock(305), '05:05');
  assert.equal(World.formatClock(0), '00:00');
});

test('天候の遷移確率は各行の合計が1になっている', () => {
  for (const from of World.WEATHER_IDS) {
    const row = World.TRANSITION[from];
    const sum = World.WEATHER_IDS.reduce((a, id) => a + (row[id] || 0), 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${from} の合計が ${sum}`);
  }
});

test('天候は必ず既知の値へ遷移し、分布が定義どおりになる', () => {
  const rng = seededRandom(31);
  const counts = { sunny: 0, cloudy: 0, rain: 0, storm: 0 };
  let w = 'cloudy';
  const N = 60000;
  for (let i = 0; i < N; i++) {
    w = World.nextWeather('cloudy', rng);
    assert.ok(World.WEATHER_IDS.includes(w), `未知の天候: ${w}`);
    counts[w]++;
  }
  for (const id of World.WEATHER_IDS) {
    const expected = World.TRANSITION.cloudy[id];
    assert.ok(Math.abs(counts[id] / N - expected) < 0.01,
      `${id} の出現率が想定外: ${(counts[id] / N).toFixed(3)} vs ${expected}`);
  }
});

test('天候ごとの補正は定義されており、嵐が最もポイントが高い', () => {
  for (const id of World.WEATHER_IDS) {
    const w = World.weatherOf(id);
    assert.ok(w.pointMul > 0 && w.waitMul > 0 && w.ampMul > 0, `${id}: 補正が不正`);
  }
  assert.ok(World.weatherOf('storm').pointMul > World.weatherOf('sunny').pointMul);
  assert.ok(World.weatherOf('storm').ampMul > World.weatherOf('sunny').ampMul, '嵐のほうが荒れるべき');
  assert.equal(World.weatherOf('nonexistent').id, 'sunny', '未知の天候は晴れにフォールバック');
});

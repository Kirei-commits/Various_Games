import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, seededRandom, scriptedRandom } from './helpers.mjs';

const { Fish } = loadFQ(['fish.js']);

test('魚は7種類あり、必要な属性がすべて揃っている', () => {
  const all = Fish.all();
  assert.equal(all.length, 7);
  for (const f of all) {
    assert.ok(f.id && f.name, `id/name が無い: ${JSON.stringify(f)}`);
    assert.ok(f.min > 0 && f.max > f.min, `${f.id}: サイズ範囲が不正`);
    assert.ok(f.base > 0, `${f.id}: 基礎点が不正`);
    assert.ok(f.stars >= 1 && f.stars <= 5, `${f.id}: レア度が範囲外`);
    assert.ok(f.reactionMs > 0 && f.fightMs > 0, `${f.id}: 時間が不正`);
    for (const p of ['dawn', 'day', 'dusk', 'night']) {
      assert.ok(f.timeBias[p] > 0, `${f.id}: timeBias.${p} が無い`);
    }
    for (const w of ['sunny', 'cloudy', 'rain', 'storm']) {
      assert.ok(f.weatherBias[w] > 0, `${f.id}: weatherBias.${w} が無い`);
    }
  }
});

test('レア度が高いほど基礎点・サイズが大きい（順序が崩れていない）', () => {
  const all = Fish.all();
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i].stars >= all[i - 1].stars, 'stars が昇順に並んでいない');
    assert.ok(all[i].base > all[i - 1].base, `${all[i].id}: 基礎点が前の魚以下`);
  }
});

test('出現重みは Lv1 と Lv30 の値をきっちり返し、範囲外はクランプされる', () => {
  for (const f of Fish.all()) {
    assert.equal(Fish.weightAt(f, 1), f.w1);
    assert.equal(Fish.weightAt(f, 30), f.w30);
    assert.equal(Fish.weightAt(f, 0), f.w1, 'Lv0 は Lv1 として扱う');
    assert.equal(Fish.weightAt(f, 99), f.w30, 'Lv30 超はクランプする');
    const mid = Fish.weightAt(f, 15.5);
    assert.ok(Math.abs(mid - (f.w1 + f.w30) / 2) < 1e-9, '中間は線形補間になる');
  }
});

test('レベルが上がるほどレアな魚の出現確率が上がり、コモンは下がる', () => {
  const share = (level, id) => {
    const ws = Fish.weights({ level });
    const total = ws.reduce((a, w) => a + w.weight, 0);
    return ws.find((w) => w.fish.id === id).weight / total;
  };
  const levels = [1, 5, 10, 15, 20, 25, 30];
  for (const id of ['ryugu', 'kue', 'buri']) {
    for (let i = 1; i < levels.length; i++) {
      assert.ok(share(levels[i], id) > share(levels[i - 1], id),
        `${id}: Lv${levels[i]} の確率が Lv${levels[i - 1]} 以下`);
    }
  }
  for (const id of ['aji', 'saba']) {
    assert.ok(share(30, id) < share(1, id), `${id}: レベルを上げても確率が下がらない`);
  }
});

test('Lv1 でも伝説はゼロではない（初回から夢がある）', () => {
  const ws = Fish.weights({ level: 1 });
  const total = ws.reduce((a, w) => a + w.weight, 0);
  const p = ws.find((w) => w.fish.id === 'ryugu').weight / total;
  assert.ok(p > 0 && p < 0.005, `Lv1 の伝説確率が想定外: ${p}`);
});

test('時間帯・天候・ルアーの補正が重みに掛かる', () => {
  const base = Fish.weights({ level: 10 }).find((w) => w.fish.id === 'ryugu').weight;
  const night = Fish.weights({ level: 10, phase: 'night' }).find((w) => w.fish.id === 'ryugu').weight;
  const storm = Fish.weights({ level: 10, weather: 'storm' }).find((w) => w.fish.id === 'ryugu').weight;
  assert.ok(night > base * 3.5, '夜の補正が効いていない');
  assert.ok(storm > base * 2, '嵐の補正が効いていない');

  const lured = Fish.weights({ level: 10, rareBoost: 2.5 });
  const plain = Fish.weights({ level: 10 });
  const by = (list, id) => list.find((w) => w.fish.id === id).weight;
  assert.equal(by(lured, 'aji'), by(plain, 'aji'), 'ルアーはコモンには効かない');
  assert.ok(by(lured, 'buri') > by(plain, 'buri'), 'ルアーがレアに効いていない');
  assert.ok(by(lured, 'ryugu') / by(plain, 'ryugu') > by(lured, 'buri') / by(plain, 'buri'),
    '希少なほど強く効くようになっていない');
});

test('抽選は乱数だけで決まり、同じ種なら同じ結果になる', () => {
  const ctx = { level: 12, phase: 'dusk', weather: 'rain' };
  const a = [], b = [];
  const r1 = seededRandom(7), r2 = seededRandom(7);
  for (let i = 0; i < 200; i++) {
    a.push(Fish.pick(ctx, r1).id);
    b.push(Fish.pick(ctx, r2).id);
  }
  assert.deepEqual(a, b);
});

test('抽選の境界: 乱数0で先頭、1に限りなく近い値で末尾が出る', () => {
  const ctx = { level: 1 };
  assert.equal(Fish.pick(ctx, scriptedRandom([0])).id, 'aji');
  assert.equal(Fish.pick(ctx, scriptedRandom([0.9999999999])).id, 'ryugu');
});

test('サイズは常に範囲内で、大物寄せを掛けると平均が上がる', () => {
  const rng = seededRandom(99);
  for (const f of Fish.all()) {
    let sum = 0, sumBig = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const s = Fish.rollSize(f, rng);
      const big = Fish.rollSize(f, rng, { bigBias: 0.8 });
      assert.ok(s >= f.min && s <= f.max, `${f.id}: ${s} が範囲外`);
      assert.ok(big >= f.min && big <= f.max, `${f.id}: ${big} が範囲外`);
      sum += s; sumBig += big;
    }
    assert.ok(sumBig / N > sum / N, `${f.id}: bigBias で平均が上がっていない`);
  }
});

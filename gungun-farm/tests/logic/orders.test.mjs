import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom } from './helpers.mjs';

const setup = (seed = 3) => {
  const GF = loadGF(['data.js', 'engine.js']);
  GF.Engine.setRandom(seededRandom(seed));
  return GF;
};

test('注文は、いま自力で用意できるものしか頼まない', () => {
  const GF = setup();
  for (let i = 0; i < 200; i++) {
    const s = GF.Engine.create();
    GF.Engine.setRandom(seededRandom(mixSeed(i)));
    s.level = 1 + (i % GF.Data.MAX_LEVEL);
    const can = new Set(GF.Engine.obtainable(s));
    const o = GF.Engine.makeOrder(s);
    for (const id of Object.keys(o.want)) {
      assert.ok(can.has(id), `Lv${s.level} で作れない ${id} を頼まれた`);
    }
  }
});

test('注文の枠は3つで、減ったら少し間をおいて補充される', () => {
  const GF = setup();
  const s = GF.Engine.create();
  assert.equal(s.orders.length, GF.Engine.orderSlots(s));

  GF.Engine.dismiss(s, s.orders[0].id);
  assert.equal(s.orders.length, 2);
  GF.Engine.tick(s, 100);
  assert.equal(s.orders.length, 2, 'すぐには埋まらない');
  GF.Engine.tick(s, 5000);
  assert.equal(s.orders.length, 3);
});

test('期限が切れると流れて、コンボが0に戻る', () => {
  const GF = setup();
  const s = GF.Engine.create();
  s.combo = 5;
  const o = s.orders[0];
  GF.Engine.tick(s, o.expiresAt - 1);
  assert.equal(s.stats.expired, 0);
  GF.Engine.tick(s, o.expiresAt);
  assert.ok(s.stats.expired >= 1);
  assert.equal(s.combo, 0, '流すとコンボは切れる');
});

test('届けると品物が減り、コインと経験値が入る', () => {
  const GF = setup();
  const s = GF.Engine.create();
  const o = s.orders[0];
  assert.equal(GF.Engine.deliver(s, o.id), null, '足りないうちは届けられない');

  for (const [id, n] of Object.entries(o.want)) GF.Engine.store(s, id, n + 1);
  const coinsBefore = s.coins;
  const res = GF.Engine.deliver(s, o.id);
  assert.ok(res);
  assert.ok(s.coins > coinsBefore);
  for (const [id, n] of Object.entries(o.want)) {
    assert.equal(s.barn[id], 1, `${id} はぴったり ${n} 減る`);
  }
  assert.equal(s.orders.find((x) => x.id === o.id), undefined);
});

test('早く届けるとオマケがつき、続けるほど倍率が上がる', () => {
  const GF = setup();
  const quick = GF.Engine.create();
  const slow = GF.Engine.create();
  // 同じ注文で比べる
  slow.orders[0] = JSON.parse(JSON.stringify(quick.orders[0]));

  const fill = (s) => { for (const [id, n] of Object.entries(s.orders[0].want)) GF.Engine.store(s, id, n); };
  fill(quick); fill(slow);

  const a = GF.Engine.deliver(quick, quick.orders[0].id);
  GF.Engine.tick(slow, slow.orders[0].ttl * 0.9);
  const b = GF.Engine.deliver(slow, slow.orders[0].id);

  assert.equal(a.quick, true);
  assert.equal(b.quick, false);
  assert.ok(a.coins > b.coins, '早い方が多くもらえる');
});

test('コンボの倍率は上限で頭打ちになる', () => {
  const GF = setup();
  const s = GF.Engine.create();
  s.combo = 0;
  const base = GF.Engine.comboMul(s);
  s.combo = GF.Engine.COMBO_MAX;
  const capped = GF.Engine.comboMul(s);
  s.combo = GF.Engine.COMBO_MAX + 50;
  assert.equal(GF.Engine.comboMul(s), capped, '上限より上には行かない');
  assert.ok(capped > base);
});

test('注文の報酬は、材料をそのまま売るより高い', () => {
  const GF = setup();
  for (let i = 0; i < 100; i++) {
    GF.Engine.setRandom(seededRandom(mixSeed(i)));
    const s = GF.Engine.create();
    s.level = 1 + (i % 12);
    const o = GF.Engine.makeOrder(s);
    const raw = Object.entries(o.want).reduce((a, [id, n]) => a + GF.Data.item(id).sell * n, 0);
    assert.ok(o.coins > raw, '届けるより売った方が得だと、注文を見る意味が無くなる');
  }
});

test('レベルが上がるほど、頼める品の種類が増える（増え続けること）', () => {
  const GF = setup();
  let prev = 0;
  const counts = [];
  for (let lv = 1; lv <= GF.Data.MAX_LEVEL; lv++) {
    const s = GF.Engine.create();
    s.level = lv;
    // その時点で買える機械はぜんぶ持っている前提で数える
    for (const def of GF.Data.machinesAt(lv)) if (!GF.Engine.ownsMachine(s, def.id)) s.machines.push({ id: def.id, queue: [], done: 0 });
    const n = new Set(GF.Engine.obtainable(s)).size;
    counts.push(n);
    assert.ok(n >= prev, `Lv${lv} で作れる品が減っている（${prev} → ${n}）`);
    prev = n;
  }
  assert.ok(counts[counts.length - 1] > counts[0] * 3, '最後まで遊ぶと品数が3倍以上になる');
});

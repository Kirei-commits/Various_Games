/**
 * ふなびん（少しずつ積める大きな注文）。
 *
 * 待ち時間の無い農園は、ふつうの注文が吸える量よりずっと多く産む。
 * 実測で 配達44.6% / 売却55.4% と、売るほうが主筋になっていた。
 * ふなびんは「余ったそばから積める」ので、その余剰の行き先になる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom } from './helpers.mjs';

function setup(level = 12) {
  const GF = loadGF(['data.js', 'engine.js']);
  GF.Engine.setRandom(seededRandom(42));
  const s = GF.Engine.create({ coins: 99999 });
  s.level = level;
  s.barnUp = 30;                    // 倉庫の上限でつまずかないように広げておく
  for (const def of GF.Data.machinesAt(level)) {
    if (!GF.Engine.ownsMachine(s, def.id)) s.machines.push({ id: def.id, queue: [], done: 0 });
  }
  return { GF, s };
}

test('ふなびんはレベル7から来る。それ以前は来ない', () => {
  const { GF, s } = setup(6);
  GF.Engine.tick(s, 1000);
  assert.equal(s.boat, null, `Lv6 では来ない（BOAT_LEVEL は ${GF.Engine.BOAT_LEVEL}）`);

  s.level = GF.Engine.BOAT_LEVEL;
  GF.Engine.tick(s, 2000);
  assert.ok(s.boat, 'Lv7 になったら来る');
  assert.ok(Object.keys(s.boat.want).length >= 3, '3種類以上をまとめて頼む');
});

test('少しずつ積める。揃うまで抱えておかなくていい', () => {
  const { GF, s } = setup();
  GF.Engine.tick(s, 1000);
  const boat = s.boat;
  const [id, need] = Object.entries(boat.want)[0];

  GF.Engine.store(s, id, 2);
  assert.equal(GF.Engine.loadBoat(s, id, 99), 2, '倉庫にあるぶんだけ積む');
  assert.equal(s.barn[id], undefined, '積んだぶんは倉庫から減る');
  assert.equal(GF.Engine.boatNeed(boat, id), need - 2);
  assert.equal(GF.Engine.boatReady(boat), false);

  GF.Engine.store(s, id, need + 5);
  assert.equal(GF.Engine.loadBoat(s, id, 99), need - 2, '要る数より多くは積まない');
  assert.equal(s.barn[id], 7, '余りは倉庫に残る（先に2個積んであるので 5 + 2）');
  assert.equal(GF.Engine.boatNeed(boat, id), 0);
});

test('積みきると出港して、報酬が入り、次の船が来る', () => {
  const { GF, s } = setup();
  GF.Engine.tick(s, 1000);
  const boat = s.boat;
  assert.equal(GF.Engine.shipBoat(s), null, '積みきる前は出せない');

  for (const [id, n] of Object.entries(boat.want)) { GF.Engine.store(s, id, n); GF.Engine.loadBoat(s, id, n); }
  assert.equal(GF.Engine.boatReady(boat), true);

  const before = s.coins;
  const res = GF.Engine.shipBoat(s);
  assert.ok(res);
  assert.equal(s.coins, before + boat.coins);
  assert.equal(s.boat, null, '出港したら船は居なくなる');
  assert.equal(s.stats.shipped, 1);

  GF.Engine.tick(s, s.now + 30_000);
  assert.ok(s.boat, '少し経つと次の船が来る');
  assert.notEqual(s.boat.id, boat.id);
});

test('期限が切れても、積んだぶんは売値で戻る（丸損させない）', () => {
  const { GF, s } = setup();
  GF.Engine.tick(s, 1000);
  const boat = s.boat;
  const [id] = Object.keys(boat.want);
  GF.Engine.store(s, id, 3);
  GF.Engine.loadBoat(s, id, 3);

  const before = s.coins;
  GF.Engine.tick(s, boat.expiresAt);
  assert.equal(s.boat, null);
  // 値段はデータから直に読まない。きょうの作物の倍率は engine が持っている
  assert.equal(s.coins, before + GF.Engine.sellPrice(s, id, 3), '積んだぶんは売値で引き取られる');
  assert.equal(s.stats.boatMissed, 1);
});

test('まとめ積みは、ふつうの注文が欲しがっているぶんを残す', () => {
  const { GF, s } = setup();
  GF.Engine.tick(s, 1000);
  const boat = s.boat;
  const [id] = Object.keys(boat.want);
  // その品を3個だけ欲しがる注文を1件だけ置く
  s.orders = [{ id: 9001, want: { [id]: 3 }, coins: 50, xp: 5, createdAt: s.now, expiresAt: s.now + 99999, ttl: 99999 }];
  GF.Engine.store(s, id, 5);

  assert.equal(GF.Engine.loadBoatAll(s), 2, '注文ぶんの3個は残して2個だけ積む');
  assert.equal(s.barn[id], 3);
  // 1個ずつなら遠慮しない（自分で決めた操作なので）
  assert.equal(GF.Engine.loadBoat(s, id, 3), 3);
});

test('船が頼むのは「余るもの」— ふつうの注文より安い品へ寄る', () => {
  const GF = loadGF(['data.js', 'engine.js']);
  let boatValue = 0, orderValue = 0, n = 0;
  for (let i = 0; i < 120; i++) {
    GF.Engine.setRandom(seededRandom(mixSeed(i)));
    const s = GF.Engine.create();
    s.level = 12;
    for (const def of GF.Data.machinesAt(12)) if (!GF.Engine.ownsMachine(s, def.id)) s.machines.push({ id: def.id, queue: [], done: 0 });
    const avg = (want) => {
      const ids = Object.keys(want);
      return ids.reduce((a, id) => a + GF.Data.item(id).sell, 0) / ids.length;
    };
    boatValue += avg(GF.Engine.makeBoat(s).want);
    orderValue += avg(GF.Engine.makeOrder(s).want);
    n++;
  }
  assert.ok(boatValue / n < orderValue / n,
    `船が高い品に寄っている（船 ${Math.round(boatValue / n)} / 注文 ${Math.round(orderValue / n)}）。` +
    '深い加工品を大量に頼むと4分では揃わず、一度も出港しなくなる');
});

test('積みきったほうが、中身を売るよりずっと得', () => {
  const { GF, s } = setup();
  GF.Engine.tick(s, 1000);
  const boat = s.boat;
  const raw = Object.entries(boat.want).reduce((a, [id, n]) => a + GF.Data.item(id).sell * n, 0);
  assert.ok(boat.coins > raw * 2, `船の報酬が安い（${boat.coins} 対 売値${raw}）`);
  assert.ok(boat.coins / raw > 1.35, 'ふつうの注文（1.35倍）より率が良いこと');
});

test('積む量に見合った時間が与えられる', () => {
  const GF = loadGF(['data.js', 'engine.js']);
  for (let i = 0; i < 60; i++) {
    GF.Engine.setRandom(seededRandom(mixSeed(i)));
    const s = GF.Engine.create();
    s.level = 1 + (i % GF.Data.MAX_LEVEL);
    for (const def of GF.Data.machinesAt(s.level)) if (!GF.Engine.ownsMachine(s, def.id)) s.machines.push({ id: def.id, queue: [], done: 0 });
    const boat = GF.Engine.makeBoat(s);
    const units = Object.values(boat.want).reduce((a, b) => a + b, 0);
    assert.ok(boat.ttl >= 180_000, '最低でも3分');
    assert.ok(boat.ttl / 1000 / units >= 2, `1個あたり2秒は要る（${units}個に ${boat.ttl / 1000}秒）`);
  }
});

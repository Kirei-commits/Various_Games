import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, seededRandom } from './helpers.mjs';

const setup = () => {
  const GF = loadGF(['data.js', 'engine.js']);
  GF.Engine.setRandom(seededRandom(1));
  return GF;
};

test('植えた作物は決めた秒数ちょうどで実る', () => {
  const GF = setup();
  const s = GF.Engine.create();
  assert.equal(GF.Engine.plant(s, 0, 'wheat'), true);
  const sec = GF.Data.crop('wheat').sec;

  GF.Engine.tick(s, sec * 1000 - 1);
  assert.equal(GF.Engine.isReady(s.fields[0], s.now), false, '1ミリ秒前はまだ実らない');
  GF.Engine.tick(s, sec * 1000);
  assert.equal(GF.Engine.isReady(s.fields[0], s.now), true);
});

test('どの作物も、どの機械も、10秒を超えて待たせない', () => {
  const GF = setup();
  for (const c of GF.Data.CROPS) assert.ok(c.sec <= GF.Data.MAX_SEC, `${c.id} が ${c.sec}秒`);
  for (const m of GF.Data.MACHINES) assert.ok(m.recipe.sec <= GF.Data.MAX_SEC, `${m.id} が ${m.recipe.sec}秒`);
});

test('タネ代を払えないと植えられない', () => {
  const GF = setup();
  const cost = GF.Data.crop('wheat').cost;            // 値段は調整で動くのでデータから採る
  const s = GF.Engine.create({ coins: cost });
  assert.equal(GF.Engine.plant(s, 0, 'wheat'), true);
  assert.equal(s.coins, 0);
  assert.equal(GF.Engine.plant(s, 1, 'wheat'), false, 'コインが無ければ植わらない');
  assert.equal(s.fields[1].crop, null);
});

test('解放前の作物と、買っていない畑には植えられない', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  assert.equal(GF.Engine.plant(s, 0, 'grape'), false, 'Lv12の作物はLv1では植えられない');
  assert.equal(GF.Engine.plant(s, GF.Data.FIELDS_AT_START, 'wheat'), false, '買っていない畑は使えない');
  assert.equal(s.coins, 999, '失敗したときはコインを取らない');
});

test('ぜんぶ植えるは、持っているコインの範囲で止まる', () => {
  const GF = setup();
  const cost = GF.Data.crop('carrot').cost;
  const s = GF.Engine.create({ coins: cost * 3 });   // ちょうど3マスぶん
  const n = GF.Engine.plantAll(s, 'carrot');
  assert.equal(n, 3);
  assert.equal(s.coins, 0);
  assert.equal(s.fields.filter((f) => f.crop).length, 3);
});

test('倉庫がいっぱいなら収穫できず、作物は畑に残る', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  GF.Engine.plant(s, 0, 'wheat');
  GF.Engine.tick(s, 2000);
  // 倉庫を埋める
  GF.Engine.store(s, 'carrot', GF.Engine.barnCap(s));
  assert.equal(GF.Engine.barnFree(s), 0);

  assert.equal(GF.Engine.harvest(s, 0), false);
  assert.equal(s.fields[0].crop, 'wheat', '収穫できなかった作物は消えない');

  GF.Engine.sell(s, 'carrot', 1);
  assert.equal(GF.Engine.harvest(s, 0), true);
});

test('収穫すると経験値が入り、レベルが上がる', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  const before = s.level;
  for (let round = 0; round < 40 && s.level === before; round++) {
    GF.Engine.plantAll(s, 'wheat');
    GF.Engine.tick(s, s.now + 2000);
    GF.Engine.harvestAll(s);
    if (GF.Engine.barnFree(s) < 6) for (const id of Object.keys(s.barn)) GF.Engine.sell(s, id, 99);
  }
  assert.ok(s.level > before, 'こむぎを繰り返せばレベルは上がる');
  assert.ok(s.stats.xpEarned > 0);
});

test('レベルは上がるほど遠くなる', () => {
  const GF = setup();
  for (let lv = 1; lv < GF.Data.MAX_LEVEL; lv++) {
    assert.ok(GF.Data.xpFor(lv + 1) > GF.Data.xpFor(lv), `Lv${lv} より Lv${lv + 1} が遠いこと`);
  }
});

test('tick は同じ時刻で何度呼んでも結果が変わらない', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  GF.Engine.plantAll(s, 'wheat');
  GF.Engine.tick(s, 5000);
  const snap = JSON.stringify(s);
  GF.Engine.tick(s, 5000);
  GF.Engine.tick(s, 4000);            // 巻き戻そうとしても進んだ時刻は戻らない
  assert.equal(JSON.stringify(s), snap);
});

test('収穫と同時に植え直せる。タネ代が無ければ空いたままにする', () => {
  const GF = setup();
  const c = GF.Data.crop('wheat');
  const s = GF.Engine.create({ coins: c.cost * 2 });   // 植える1回 + 植え直し1回ぶん
  GF.Engine.plant(s, 0, 'wheat');
  GF.Engine.tick(s, c.sec * 1000);

  assert.equal(GF.Engine.harvest(s, 0, 'wheat'), true);
  assert.equal(s.fields[0].crop, 'wheat', '同じ場所に植え直っている');
  assert.equal(s.barn.wheat, 1);
  assert.equal(s.coins, 0, 'タネ代を2回ぶん払いきった');

  GF.Engine.tick(s, c.sec * 2000);
  assert.equal(GF.Engine.harvest(s, 0, 'wheat'), true, '収穫そのものは出来る');
  assert.equal(s.fields[0].crop, null, 'タネ代が無ければ空いたままにする（勝手に借金しない）');
});

test('植え直す先は、いま選んでいるタネ（違う作物にも切り替わる）', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  GF.Engine.plantAll(s, 'wheat');
  GF.Engine.tick(s, 2000);

  const n = GF.Engine.harvestAll(s, 'carrot');
  assert.equal(n, s.fieldsOwned);
  assert.equal(s.fields.filter((f) => f.crop === 'carrot').length, s.fieldsOwned);
  assert.equal(s.barn.wheat, s.fieldsOwned);
});

test('植え直しを頼まなければ、畑は空くまま（古い呼び方を壊さない）', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  GF.Engine.plant(s, 0, 'wheat');
  GF.Engine.tick(s, 2000);
  GF.Engine.harvest(s, 0);
  assert.equal(s.fields[0].crop, null);
});

/**
 * **まとめて植えたら、まとめて実る。**
 *
 * 以前は j 番目が `sec * (j+1)/k` で実るようにずらしていた（時間差まき）。
 * 「いつ見ても収穫できるものがある」という理屈だったが、遊ぶ側から見ると
 * **同時に植えたのに1マスずつ待たされる**だけで、なぜ揃わないのか分からなかった。
 */
test('まとめて植えたら、まとめて実る', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  s.level = GF.Data.MAX_LEVEL;
  const n = GF.Engine.plantAll(s, 'cane');
  assert.ok(n >= 2, '複数マス植わっている');

  const times = s.fields.slice(0, n).map((f) => f.readyAt);
  assert.equal(new Set(times).size, 1, `実る時刻がばらけている（${[...new Set(times)].join(', ')}）`);
});

test('どの作物も1秒で実る（これがこのゲームの速さ）', () => {
  const GF = setup();
  for (const c of GF.Data.CROPS) {
    assert.equal(c.sec, 1, `${c.id} が ${c.sec}秒かかる`);
    const s = GF.Engine.create({ coins: 99999 });
    s.level = GF.Data.MAX_LEVEL;
    const n = GF.Engine.plantAll(s, c.id);
    for (let i = 0; i < n; i++) {
      assert.equal(s.fields[i].readyAt - s.now, 1000, `${c.id}: ${i}マス目が1秒で実っていない`);
    }
  }
});

test('1マスだけ植えたときも、作物どおりの秒数', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  s.level = GF.Data.MAX_LEVEL;
  assert.equal(GF.Engine.plant(s, 0, 'cane'), true);
  assert.equal(s.fields[0].readyAt - s.now, GF.Data.crop('cane').sec * 1000);
});

/**
 * **畑は自分のリズムで実る。**
 *
 * 作物をぜんぶ1秒・同時に実るようにしたら、**押すのが遅れたぶんがそのまま損**になり、
 * 連打した人が落ち着いて押した人の1.7倍稼ぐようになった（実測）。
 * このゲームは我慢比べにしないと決めているので、植え直しの実り時刻は
 * 「押した瞬間」ではなく **さっき実った時刻** から数える。
 */
test('押すのが少し遅れても、畑のリズムはずれない', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 99999 });
  s.level = GF.Data.MAX_LEVEL;
  GF.Engine.plantAll(s, 'wheat');

  // ちょうど1秒で実る。そこから400ms 遅れて収穫する
  GF.Engine.tick(s, 1400);
  assert.equal(GF.Engine.harvestAll(s, 'wheat'), s.fieldsOwned);
  assert.equal(s.fields[0].readyAt, 2000, '押した時刻から1秒になっている（遅れが積み上がる）');

  // さらに遅れても、次の実りは元のリズムのまま
  GF.Engine.tick(s, 2900);
  GF.Engine.harvestAll(s, 'wheat');
  assert.equal(s.fields[0].readyAt, 3000, 'リズムが引き継がれていない');
});

test('ずっと放っておいても、待ちの「つけ」は溜まらない', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 99999 });
  s.level = GF.Data.MAX_LEVEL;
  GF.Engine.plantAll(s, 'wheat');

  // 10秒放置してから収穫。**次が10回ぶん一気に実ることは無い**
  GF.Engine.tick(s, 11_000);
  GF.Engine.harvestAll(s, 'wheat');
  assert.equal(s.fields[0].readyAt, 11_000, '遅れたぶんが先取りされている（連打で1秒より速く穫れる）');

  GF.Engine.tick(s, 11_000);
  GF.Engine.harvestAll(s, 'wheat');
  assert.equal(s.fields[0].readyAt, 12_000, '2回目も即座に実っている');
});

test('待たされるのは、どんなに長くても1秒', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 99999 });
  s.level = GF.Data.MAX_LEVEL;
  s.fieldsOwned = GF.Data.FIELD_SLOTS;
  GF.Engine.plantAll(s, 'melon');                    // いちばん格上の作物で見る

  let idle = 0, worst = 0;
  for (let t = 0; t <= 60_000; t += 50) {
    GF.Engine.tick(s, t);
    if (GF.Engine.barnFree(s) < 4) s.barn = {};      // 倉庫は詰まらせない（見たいのは畑）
    if (GF.Engine.harvestAll(s, 'melon') > 0) { idle = 0; continue; }
    idle += 50;
    worst = Math.max(worst, idle);
  }
  assert.ok(worst <= 1050, `${worst}ms 待たされた。作物は1秒なので、それを超えてはいけない`);
});

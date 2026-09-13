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
  const s = GF.Engine.create({ coins: 1 });
  assert.equal(GF.Engine.plant(s, 0, 'wheat'), true);   // 1コイン
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
  const s = GF.Engine.create({ coins: 9 });          // にんじんは3コイン → 3マスぶん
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
  const s = GF.Engine.create({ coins: 3 });        // こむぎ2回ぶん（1回目は植える、2回目が植え直し）
  GF.Engine.plant(s, 0, 'wheat');
  GF.Engine.tick(s, 2000);

  assert.equal(GF.Engine.harvest(s, 0, 'wheat'), true);
  assert.equal(s.fields[0].crop, 'wheat', '同じ場所に植え直っている');
  assert.equal(s.barn.wheat, 1);
  assert.equal(s.coins, 1);

  GF.Engine.tick(s, 4000);
  GF.Engine.harvest(s, 0, 'wheat');
  assert.equal(s.coins, 0);
  GF.Engine.tick(s, 6000);
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

test('まとめて植えると順番に実る（時間差まき）', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  s.level = GF.Data.MAX_LEVEL;                        // さとうきびは Lv6 から
  const n = GF.Engine.plantAll(s, 'cane');            // 6秒の作物を12マス

  const times = s.fields.slice(0, n).map((f) => f.readyAt).sort((a, b) => a - b);
  assert.equal(new Set(times).size, n, '実る時刻がひとつも重なっていない');
  assert.ok(times[0] < times[n - 1], 'ばらけている');
});

test('時間差まきでも、作物の秒数より長く待たせない（10秒の約束）', () => {
  const GF = setup();
  for (const c of GF.Data.CROPS) {
    const s = GF.Engine.create({ coins: 99999 });
    s.level = GF.Data.MAX_LEVEL;
    const n = GF.Engine.plantAll(s, c.id);
    for (let i = 0; i < n; i++) {
      const wait = (s.fields[i].readyAt - s.now) / 1000;
      assert.ok(wait <= c.sec + 0.001, `${c.id}: ${wait}秒 待たされた（上限 ${c.sec}秒）`);
      assert.ok(wait > 0, `${c.id}: 秒数が0以下`);
    }
    assert.ok(Math.max(...s.fields.slice(0, n).map((f) => f.readyAt)) - s.now <= c.sec * 1000 + 1,
      `${c.id}: いちばん遅いマスがちょうど ${c.sec}秒`);
  }
});

test('1マスだけ植えたときは、作物どおりの秒数', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 999 });
  s.level = GF.Data.MAX_LEVEL;
  assert.equal(GF.Engine.plant(s, 0, 'cane'), true);
  assert.equal(s.fields[0].readyAt - s.now, GF.Data.crop('cane').sec * 1000);
});

test('**いつ見ても何か実っている**（待ち時間が限りなく0であることの回帰テスト）', () => {
  const GF = setup();
  const s = GF.Engine.create({ coins: 99999 });
  s.level = GF.Data.MAX_LEVEL;                       // ぶどうは Lv12 から
  s.fieldsOwned = GF.Data.FIELD_SLOTS;               // ぶどうが解ける頃には畑も広がっている
  GF.Engine.plantAll(s, 'grape');                    // いちばん長い9秒の作物で最悪値を見る

  // 実ったら収穫してまき直す、を繰り返しながら「何も実っていない時間」を測る
  let idle = 0, worst = 0;
  for (let t = 0; t <= 120_000; t += 100) {
    GF.Engine.tick(s, t);
    if (GF.Engine.barnFree(s) < 4) s.barn = {};      // 倉庫は詰まらせない（ここで見たいのは畑）
    const n = GF.Engine.harvestAll(s, 'grape');
    if (n > 0) { idle = 0; continue; }
    const ready = s.fields.slice(0, s.fieldsOwned).some((f) => GF.Engine.isReady(f, s.now));
    if (ready) idle = 0;
    else { idle += 100; worst = Math.max(worst, idle); }
  }
  // 12マスを9秒の作物で回すと、理屈のうえでは 9000/12 = 750ms おきに1マス実る
  const expected = (GF.Data.crop('grape').sec * 1000) / s.fieldsOwned;
  assert.ok(worst <= expected * 1.6,
    `何も実っていない時間が最長 ${worst}ms あった（見込み ${Math.round(expected)}ms・時間差まきが効いていない）`);
});

test('最初のひと回しは、一斉に実るより早く手が動かせる', () => {
  const GF = setup();
  for (const fields of [GF.Data.FIELDS_AT_START, GF.Data.FIELD_SLOTS]) {
    const s = GF.Engine.create({ coins: 99999 });
    s.level = GF.Data.MAX_LEVEL;
    s.fieldsOwned = fields;
    GF.Engine.plantAll(s, 'grape');                  // いちばん長い9秒の作物
    const sec = GF.Data.crop('grape').sec * 1000;
    const first = Math.min(...s.fields.slice(0, fields).map((f) => f.readyAt)) - s.now;
    assert.ok(first < sec, `${fields}マス: 最初の1マスが ${first}ms 待たされている（一斉まきと同じ）`);
    // 畑が多いほど、最初の1マスは早く来る
    assert.ok(Math.abs(first - sec / fields) < 2, `${fields}マス: 9秒 ÷ ${fields} で最初の1マスが実る`);
  }
});

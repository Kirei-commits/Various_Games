/**
 * かざりのテスト。
 *
 * これは**終盤のコインの行き先**であって、能力ではない。
 * 25分まわすと施設も畑も倉庫も買いきって十数万コインあまる——
 * その受け皿として置いてある。だから見るのは2つ。
 *
 *  - **何の能力にも効いていないこと**（効いたら、買わない人が損をする）
 *  - **あまったコインで届く値段であること**（届かないなら受け皿になっていない）
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom } from './helpers.mjs';

const GF = loadGF(['data.js', 'engine.js']);
const { Engine, Data } = GF;

const fresh = (level = 20, coins = 0) => {
  Engine.setRandom(seededRandom(mixSeed(0)));
  const s = Engine.create({ bare: true });
  s.level = level;
  s.coins = coins;
  return s;
};

test('かざりは能力に効かない', () => {
  const bare = fresh(20, 999999);
  const decked = fresh(20, 999999);
  for (const d of Data.DECOR) assert.equal(Engine.buyDecor(decked, d.id), true, d.id);
  assert.equal(decked.decor.length, Data.DECOR.length);

  // 収穫の速さ・倉庫・注文の枠・売値——どれも変わらないこと
  assert.equal(Engine.barnCap(decked), Engine.barnCap(bare), '倉庫が変わった');
  assert.equal(Engine.orderSlots(decked), Engine.orderSlots(bare), '注文の枠が変わった');
  assert.equal(Engine.capacity(decked), Engine.capacity(bare), '注文の大きさが変わった');
  for (const c of Data.CROPS) {
    assert.equal(Engine.sellPrice(decked, c.id), Engine.sellPrice(bare, c.id), `${c.id} の売値が変わった`);
  }
  Engine.plant(decked, 0, 'wheat');
  Engine.plant(bare, 0, 'wheat');
  assert.equal(decked.fields[0].readyAt, bare.fields[0].readyAt, '育ちの速さが変わった');
});

test('お金もレベルも足りなければ買えない', () => {
  const d = Data.DECOR[Data.DECOR.length - 1];
  assert.equal(Engine.buyDecor(fresh(d.level, d.price - 1), d.id), false, 'コインが足りないのに買えた');
  assert.equal(Engine.buyDecor(fresh(d.level - 1, d.price), d.id), false, 'レベルが足りないのに買えた');

  const ok = fresh(d.level, d.price);
  assert.equal(Engine.buyDecor(ok, d.id), true);
  assert.equal(ok.coins, 0, '値段どおりに引かれていない');
  assert.equal(Engine.buyDecor(ok, d.id), false, '同じものを2つ買えた');
  assert.equal(Engine.buyDecor(ok, 'nope'), false, '無いものが買えた');
});

test('見ばえは、買ったぶんだけ増える', () => {
  const s = fresh(20, 999999);
  assert.equal(Engine.charm(s), 0);
  let sum = 0;
  for (const d of Data.DECOR) {
    Engine.buyDecor(s, d.id);
    sum += d.charm;
    assert.equal(Engine.charm(s), sum, `${d.id} まででずれた`);
  }
  // 上ほど高く、上ほど見ばえも大きいこと（値段だけ上がる飾りを作らない）
  for (let i = 1; i < Data.DECOR.length; i++) {
    assert.ok(Data.DECOR[i].price > Data.DECOR[i - 1].price, `${Data.DECOR[i].id} の値段が上がっていない`);
    assert.ok(Data.DECOR[i].charm > Data.DECOR[i - 1].charm, `${Data.DECOR[i].id} の見ばえが上がっていない`);
  }
});

test('解放レベルは、店の並びと同じ順番', () => {
  for (let i = 1; i < Data.DECOR.length; i++) {
    assert.ok(Data.DECOR[i].level > Data.DECOR[i - 1].level, `${Data.DECOR[i].id} の解放レベルが上がっていない`);
  }
  assert.equal(Data.decorAt(1).length, 0, 'Lv1 から買えるかざりがある（先に覚えることが多すぎる）');
  assert.equal(Data.decorAt(20).length, Data.DECOR.length, 'Lv20 でも買えないかざりがある');
  for (const d of Data.DECOR) {
    assert.ok(Data.unlockedAt(d.level).some((u) => u.kind === 'decor' && u.id === d.id),
      `${d.id} がレベルアップの知らせに出ていない`);
  }
});

/**
 * **農園を育てるほうが先。**
 *
 * かざりが施設より安いと、育てるより飾るほうが得な瞬間ができてしまう。
 * その時点で買えるどの施設よりも高くしておけば、
 * かざりは「本当に余ったぶんで買うもの」に収まる。
 */
test('かざりは、その時点で買える施設のどれよりも高い', () => {
  for (const d of Data.DECOR) {
    const top = Math.max(...Data.machinesAt(d.level).map((m) => m.price));
    assert.ok(d.price > top,
      `${d.id}（🪙${d.price}）が Lv${d.level} の施設（最高 🪙${top}）より安い`);
  }
});

/**
 * **行き先として大きすぎず、小さすぎず。**
 * 施設・畑・倉庫をぜんぶ買う額と突き合わせる（稼ぎの総額ではない——
 * あちらはタネ代で出ていくぶんを含むので、手元に残る額とは別もの）。
 */
test('かざり全部の値段が、農園を建てる額と釣り合っている', () => {
  const build = Data.MACHINES.reduce((a, m) => a + m.price, 0)
    + Data.FIELD_UPGRADES.reduce((a, f) => a + f.price, 0)
    + Array.from({ length: 10 }, (_, i) => Data.barnPrice(i)).reduce((a, b) => a + b, 0);
  const all = Data.DECOR.reduce((a, d) => a + d.price, 0);
  const ratio = all / build;
  assert.ok(ratio > 0.25, `かざり全部で 🪙${all}。農園を建てる額 🪙${build} に対して安すぎる`);
  assert.ok(ratio < 0.8, `かざり全部で 🪙${all}。農園を建てる額 🪙${build} に対して高すぎて届かない`);
});

test('古い保存にも、かざりの置き場ができる', () => {
  const s = fresh(12);
  delete s.decor;
  Engine.normalize(s);
  assert.deepEqual([...s.decor], [], '配列として埋まっていない');
  assert.equal(Engine.charm(s), 0);
});

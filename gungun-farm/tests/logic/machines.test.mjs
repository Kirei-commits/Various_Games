import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, seededRandom } from './helpers.mjs';

const setup = (coins = 9999) => {
  const GF = loadGF(['data.js', 'engine.js']);
  GF.Engine.setRandom(seededRandom(2));
  return { GF, s: GF.Engine.create({ coins }) };
};

test('材料がそろって初めて仕込める。仕込んだ時点で材料は減る', () => {
  const { GF, s } = setup();
  assert.equal(GF.Engine.canQueue(s, 0), false, 'こむぎが無ければ仕込めない');
  GF.Engine.store(s, 'wheat', 2);
  assert.equal(GF.Engine.queue(s, 0), true);
  assert.equal(s.barn.wheat, undefined, '材料は仕込んだ瞬間に消費する');
  assert.equal(s.machines[0].queue.length, 1);
});

test('同時に仕込める数は slots まで', () => {
  const { GF, s } = setup();
  const slots = GF.Data.machine('mill').slots;
  GF.Engine.store(s, 'wheat', 2 * (slots + 2));
  for (let i = 0; i < slots; i++) assert.equal(GF.Engine.queue(s, 0), true, `${i + 1}件目`);
  assert.equal(GF.Engine.queue(s, 0), false, 'slots を超えては仕込めない');
});

test('出来上がりは順番どおりで、取り出すまで機械の中にある', () => {
  const { GF, s } = setup();
  GF.Engine.store(s, 'wheat', 4);
  GF.Engine.queue(s, 0);
  GF.Engine.tick(s, 1000);
  GF.Engine.queue(s, 0);

  const sec = GF.Data.machine('mill').recipe.sec * 1000;
  GF.Engine.tick(s, sec);
  assert.equal(s.machines[0].done, 1, '1件目だけ出来上がっている');
  assert.equal(s.machines[0].queue.length, 1);
  assert.equal(s.barn.flour, undefined, '取り出すまで倉庫には入らない');

  assert.equal(GF.Engine.collect(s, 0), 1);
  assert.equal(s.barn.flour, 1);

  GF.Engine.tick(s, sec + 1000);
  assert.equal(GF.Engine.collect(s, 0), 1);
  assert.equal(s.barn.flour, 2);
});

test('倉庫が満杯でも、出来たものは機械の中に残って消えない', () => {
  const { GF, s } = setup();
  GF.Engine.store(s, 'wheat', 2);
  GF.Engine.queue(s, 0);
  GF.Engine.tick(s, 9000);
  GF.Engine.store(s, 'carrot', GF.Engine.barnFree(s));   // 満杯にする

  assert.equal(GF.Engine.collect(s, 0), 0);
  assert.equal(s.machines[0].done, 1, '取り出せなかったぶんは機械に残る');

  GF.Engine.sell(s, 'carrot', 1);
  assert.equal(GF.Engine.collect(s, 0), 1);
});

test('買っていない機械は使えない。買うとレシピが増える', () => {
  const { GF, s } = setup(100000);
  assert.equal(s.machines.length, 1);
  assert.equal(GF.Engine.buyMachine(s, 'coop'), false, 'Lv3 より前には買えない');
  s.level = 3;
  assert.equal(GF.Engine.buyMachine(s, 'coop'), true);
  assert.equal(GF.Engine.buyMachine(s, 'coop'), false, '同じ機械は2台買えない');
  assert.ok(GF.Engine.obtainable(s).includes('egg'));
});

test('加工すると、材料の合計より高いものができる', () => {
  const { GF } = setup();
  for (const m of GF.Data.MACHINES) {
    const inValue = Object.entries(m.recipe.in)
      .reduce((a, [id, n]) => a + GF.Data.item(id).sell * n, 0);
    assert.ok(GF.Data.item(m.recipe.out).sell > inValue, `${m.id} は加工すると損`);
  }
});

test('機械を買ったときに、その材料がもう手に入ること', () => {
  const { GF } = setup();
  for (const m of GF.Data.MACHINES) {
    for (const id of Object.keys(m.recipe.in)) {
      const crop = GF.Data.crop(id);
      if (crop) assert.ok(crop.level <= m.level, `${m.id} の材料 ${id} が後から解放される`);
      const src = GF.Data.MACHINES.find((x) => x.recipe.out === id);
      if (src) assert.ok(src.level <= m.level, `${m.id} の材料 ${id} を作る機械が後から解放される`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom } from './helpers.mjs';

const GA = loadGA(['items.js']);
const { Items } = GA;

test('カタログのidは重複しない', () => {
  const ids = Items.CATALOG.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('全属性(all)の防具以外に all は使われていない', () => {
  for (const d of Items.CATALOG) {
    if (d.element === 'all') assert.equal(d.kind, 'defense', `${d.id} が all属性`);
  }
});

test('武器・防具・食料・魔法がすべて存在し、weightは正', () => {
  for (const kind of ['weapon', 'defense', 'food', 'magic']) {
    assert.ok(Items.CATALOG.some((d) => d.kind === kind), `${kind} が無い`);
  }
  for (const d of Items.CATALOG) {
    assert.ok(d.weight > 0, `${d.id} の weight が0以下`);
    assert.ok(d.power > 0, `${d.id} の power が0以下`);
  }
});

test('攻撃属性それぞれに、対応する防具が存在する', () => {
  for (const el of Items.ATTACK_ELEMENTS) {
    const ok = Items.CATALOG.some((d) => d.kind === 'defense' && (d.element === el || d.element === 'all'));
    assert.ok(ok, `${el} を防げる防具が無い`);
  }
});

test('同じシードなら同じ順で引ける', () => {
  Items.resetUid(0);
  const a = Items.draw(seededRandom(7), 20).map((i) => i.id);
  Items.resetUid(0);
  const b = Items.draw(seededRandom(7), 20).map((i) => i.id);
  assert.deepEqual(a, b);
});

test('uid は引くたびに一意', () => {
  const drawn = Items.draw(seededRandom(3), 50);
  assert.equal(new Set(drawn.map((i) => i.uid)).size, 50);
});

test('抽選は重みに従う（1万回で強い武器より弱い武器の方が多く出る）', () => {
  const rng = seededRandom(99);
  const count = {};
  for (let i = 0; i < 10000; i++) {
    const id = Items.drawOne(rng).id;
    count[id] = (count[id] || 0) + 1;
  }
  assert.ok((count.stone || 0) > (count.cannon || 0), 'いし より たいほう が多く出ている');
});

test('describe は全アイテムで空にならない', () => {
  for (const d of Items.CATALOG) {
    assert.ok(Items.describe(d).length > 0, `${d.id} の説明が空`);
  }
});

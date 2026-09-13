/**
 * 実績。レベル20に着いたあとも目標が残るようにするためのもの。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom, toPlain } from './helpers.mjs';
import { simulate } from '../bot.mjs';

const GF = loadGF(['data.js', 'engine.js']);

function fresh() {
  GF.Engine.setRandom(seededRandom(7));
  return GF.Engine.create();
}

test('条件を満たすと取れる。取ったら消えない', () => {
  const s = fresh();
  // vm の外へ持ち出して比べる（sandbox の Array は別プロトタイプなので deepEqual が通らない）
  assert.deepEqual(toPlain(s.achieved), []);

  s.stats.harvested = 1;
  assert.equal(GF.Engine.checkAchievements(s).length, 1);
  assert.deepEqual(toPlain(s.achieved), ['harvest1']);

  // もう一度見ても増えない（同じものを二度取らない）
  assert.equal(GF.Engine.checkAchievements(s).length, 0);

  // 数が減っても取り消されない
  s.stats.harvested = 0;
  GF.Engine.checkAchievements(s);
  assert.deepEqual(toPlain(s.achieved), ['harvest1']);
});

test('進み具合は数えるところが1か所にまとまっている', () => {
  const s = fresh();
  s.level = 9; s.fieldsOwned = 8; s.bestCombo = 4;
  s.stats.crafted = 33; s.stats.coinsEarned = 1234;
  assert.equal(GF.Engine.achieveCount(s, 'level'), 9);
  assert.equal(GF.Engine.achieveCount(s, 'fields'), 8);
  assert.equal(GF.Engine.achieveCount(s, 'bestCombo'), 4);
  assert.equal(GF.Engine.achieveCount(s, 'machines'), s.machines.length);
  assert.equal(GF.Engine.achieveCount(s, 'crafted'), 33);
  assert.equal(GF.Engine.achieveCount(s, 'coinsEarned'), 1234);
  assert.equal(GF.Engine.achieveCount(s, 'なにそれ'), 0, '知らない項目でも落ちない');
});

test('実績は何を数えるか必ず engine が知っている', () => {
  const s = fresh();
  for (const a of GF.Data.ACHIEVEMENTS) {
    const n = GF.Engine.achieveCount(s, a.on);
    assert.equal(typeof n, 'number', `${a.id} の数え方が無い（on: ${a.on}）`);
    assert.ok(a.goal > 0, `${a.id} の目標が0以下`);
    assert.ok(a.name && a.emoji, `${a.id} の名前か絵文字が空`);
  }
  const ids = GF.Data.ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, '実績idの重複');
});

test('取ると知らせが出る', () => {
  const s = fresh();
  const before = s.events.length;
  s.level = GF.Data.MAX_LEVEL;
  GF.Engine.checkAchievements(s);
  const added = s.events.slice(before);
  assert.ok(added.some((e) => e.kind === 'achieve'), '実績の知らせが積まれていない');
});

test('ふつうに遊んでいれば、半分以上は手が届く（飾りにしない）', () => {
  const results = Array.from({ length: 3 }, (_, i) => {
    const seed = mixSeed(i);
    return simulate(GF, { minutes: 25, seed, random: seededRandom(seed) });
  });
  const got = results.map((r) => r.state.achieved.length);
  const med = got.sort((a, b) => a - b)[1];
  assert.ok(med >= Math.ceil(GF.Data.ACHIEVEMENTS.length / 2),
    `25分回して ${med}/${GF.Data.ACHIEVEMENTS.length} しか取れない。目標が遠すぎる`);
  assert.ok(med < GF.Data.ACHIEVEMENTS.length,
    '25分で全部取れてしまう。長く遊ぶ目標が残らない');
});

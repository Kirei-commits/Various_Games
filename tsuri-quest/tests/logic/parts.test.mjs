import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ } from './helpers.mjs';

const { Parts } = loadFQ(['parts.js']);

test('3つのスロットにそれぞれ複数の選択肢があり、IDが重複しない', () => {
  assert.equal(Parts.SLOTS.length, 3);
  const seen = new Set();
  for (const slot of Parts.SLOTS) {
    assert.ok(slot.list.length >= 5, `${slot.key}: 選択肢が少なすぎる`);
    for (const item of slot.list) {
      assert.equal(seen.has(item.id), false, `IDが重複: ${item.id}`);
      seen.add(item.id);
      assert.ok(item.name && item.desc, `${item.id}: 表示用の文言が欠けている`);
      assert.equal(Parts.slotOf(item.id), slot.key);
    }
    assert.equal(slot.list[0].cost, 0, `${slot.key}: 初期装備が無料でない`);
    for (let i = 1; i < slot.list.length; i++) {
      assert.ok(slot.list[i].cost > slot.list[i - 1].cost, `${slot.key}: 値段が昇順でない`);
    }
  }
});

test('高いパーツほど効果が強い（値段と性能が逆転していない）', () => {
  // リールは「巻き速度」と「緩めやすさ」のどちらに振るかが機種で違うので、
  // 単純な巻き速度ではなく、両方を合わせた価値で順序を見る。
  const reelValue = (r) => (r.reelMul - 1) + (r.drainMul - 1) * 0.5;
  for (let i = 1; i < Parts.REELS.length; i++) {
    assert.ok(reelValue(Parts.REELS[i]) > reelValue(Parts.REELS[i - 1]),
      `${Parts.REELS[i].id}: 値段のわりに性能が上がっていない`);
  }
  assert.ok(Parts.REELS[Parts.REELS.length - 1].reelMul === Math.max(...Parts.REELS.map((r) => r.reelMul)),
    '最上位のリールが最速でない');
  for (let i = 1; i < Parts.FLOATS.length; i++) {
    assert.ok(Parts.FLOATS[i].biteBonusMs > Parts.FLOATS[i - 1].biteBonusMs, 'ウキの効果が逆転');
  }
  // ロッドカラーは完全に見た目だけ。性能値を持たせない。
  for (const s of Parts.SKINS) {
    assert.equal(s.reelMul, undefined);
    assert.equal(s.biteBonusMs, undefined);
    assert.ok(s.color, `${s.id}: 色が無い`);
  }
});

test('未所持や未知のIDを装備しても初期装備に落ちる', () => {
  const eq = Parts.equipped({ reel: 'reel_legend', float: 'nonexistent', skin: 'skin_gold' }, []);
  assert.equal(eq.reel.id, 'reel_basic', '買っていないリールが装備できている');
  assert.equal(eq.float.id, 'float_red');
  assert.equal(eq.skin.id, 'skin_bamboo');

  const owned = Parts.equipped({ reel: 'reel_legend', float: 'float_gold', skin: 'skin_gold' },
    ['reel_legend', 'float_gold', 'skin_gold']);
  assert.equal(owned.reel.id, 'reel_legend');
  assert.equal(owned.float.id, 'float_gold');
  assert.equal(owned.skin.id, 'skin_gold');
});

test('スロット違いのIDを入れても弾かれる', () => {
  const eq = Parts.equipped({ reel: 'float_gold' }, ['float_gold']);
  assert.equal(eq.reel.id, 'reel_basic', 'ウキがリールの枠に入ってしまった');
});

test('効果は装備の合計になる', () => {
  const bare = Parts.effects({}, []);
  assert.equal(bare.reelMul, 1);
  assert.equal(bare.biteBonusMs, 0);
  assert.ok(bare.rodColor && bare.reelColor && bare.float, '描画用の色が欠けている');

  const best = Parts.effects(
    { reel: 'reel_legend', float: 'float_gold', skin: 'skin_gold' },
    ['reel_legend', 'float_gold', 'skin_gold']
  );
  assert.ok(best.reelMul > bare.reelMul);
  assert.ok(best.biteBonusMs > bare.biteBonusMs);
  assert.notEqual(best.rodColor, bare.rodColor, '見た目が変わっていない');
});

test('購入はポイントが足りるときだけ通り、二重購入できない', () => {
  const item = Parts.byId('reel_power');
  assert.equal(Parts.tryBuy('reel_power', item.cost - 1, []).reason, 'poor');
  const r = Parts.tryBuy('reel_power', item.cost, []);
  assert.equal(r.ok, true);
  assert.equal(r.coins, 0);
  assert.equal(r.slot, 'reel');
  assert.equal(Parts.tryBuy('reel_power', 99999, ['reel_power']).reason, 'owned');
  assert.equal(Parts.tryBuy('reel_basic', 99999, []).reason, 'free', '初期装備は購入対象にしない');
  assert.equal(Parts.tryBuy('nonexistent', 99999, []).reason, 'unknown');
});

test('管理者モードでは0円で買える', () => {
  const r = Parts.tryBuy('reel_legend', 0, [], { free: true });
  assert.equal(r.ok, true);
  assert.equal(r.cost, 0);
  assert.equal(r.coins, 0);
});

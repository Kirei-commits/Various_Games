// 調整値の形（足りないもの・食い違いが無いか）
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const { cfg } = load();

test('英雄は8種類以上・4段階で、得意武器はどれも定義されていて重ならない', () => {
  assert.ok(cfg.heroOrder.length >= 8);
  assert.deepEqual([...cfg.heroOrder].sort(), Object.keys(cfg.heroes).sort());
  const ws = cfg.heroOrder.map(h => cfg.heroes[h].weapon);
  assert.equal(new Set(ws).size, ws.length, '同じ武器の英雄が2人いる');
  for (const h of cfg.heroOrder) {
    assert.ok(cfg.weapons[cfg.heroes[h].weapon], `${h} の武器が無い`);
    assert.equal(cfg.heroes[h].names.length, cfg.hero.maxTier, `${h} の段階ごとの名前`);
  }
  assert.deepEqual([...cfg.weaponOrder].sort(), Object.keys(cfg.weapons).sort());
  assert.equal(cfg.hero.tierDmg.length, cfg.hero.maxTier);
  assert.equal(cfg.hero.tierRate.length, cfg.hero.maxTier);
  for (let i = 1; i < cfg.hero.maxTier; i++) assert.ok(cfg.hero.tierDmg[i] > cfg.hero.tierDmg[i - 1], '上の段階ほど強い');
});

test('武器はそれぞれ特徴を持つ（貫通・追尾・範囲・拡散・跳ね返り）', () => {
  const W = cfg.weapons;
  assert.ok(W.sickle.pierce > 0 && W.spear.pierce > W.sickle.pierce);
  assert.ok(W.staff.homing > 0);
  assert.ok(W.sling.aoe > 0 && W.bomb.aoe > W.sling.aoe);
  assert.equal(W.bow.spread.length, 3);
  assert.ok(W.shuriken.bounce > 0);
  assert.ok(W.sword.dmg > W.sickle.dmg && W.axe.r > W.sickle.r);
});

test('敵は10種類以上＋ボス3種類。出始めのステージがある', () => {
  assert.ok(cfg.enemyOrder.length >= 10);
  for (const k of cfg.enemyOrder) assert.ok(cfg.enemies[k] && cfg.enemies[k].from >= 1, k);
  assert.equal(cfg.enemies.goblin.from, 1, '最初はゴブリン');
  assert.equal(cfg.bossOrder.length, 3);
  for (const k of cfg.bossOrder) assert.ok(cfg.bosses[k].hp > 0);
});

test('ゲートは20種類以上で、わな（bad）も混ざる。値は配列', () => {
  const ids = Object.keys(cfg.gates);
  assert.ok(ids.length >= 20, `ゲート ${ids.length} 種類`);
  assert.ok(ids.some(k => cfg.gates[k].kind === 'bad'));
  for (const k of ids) { assert.ok(Array.isArray(cfg.gates[k].v) && cfg.gates[k].v.length, k); assert.ok(['good', 'bad'].includes(cfg.gates[k].kind)); }
});

test('難易度・強化・盤面の大きさ', () => {
  assert.deepEqual(Object.keys(cfg.difficulty), ['easy', 'normal', 'hard']);
  assert.ok(cfg.difficulty.easy.hp < cfg.difficulty.normal.hp && cfg.difficulty.normal.hp < cfg.difficulty.hard.hp);
  assert.ok(cfg.difficulty.hard.coin > cfg.difficulty.normal.coin, 'むずかしいほどコインが多い');
  assert.deepEqual([...cfg.upgradeOrder].sort(), Object.keys(cfg.upgrades).sort());
  assert.equal(cfg.board.cols, 5); assert.equal(cfg.board.rows, 6);
  assert.ok(cfg.stage.count >= 50);
});

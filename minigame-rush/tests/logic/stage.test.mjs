// ステージの自動生成
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const { L, cfg } = load();

test('同じステージは毎回同じ中身になる', () => {
  assert.equal(JSON.stringify(L.Stage.build(cfg, 7, 'normal').events), JSON.stringify(L.Stage.build(cfg, 7, 'normal').events));
});

test('全ステージを作れて、出来事は時刻順。最後はボス', () => {
  for (let n = 1; n <= cfg.stage.count; n++) {
    for (const diff of ['easy', 'normal', 'hard']) {
      const s = L.Stage.build(cfg, n, diff);
      for (let i = 1; i < s.events.length; i++) assert.ok(s.events[i].t >= s.events[i - 1].t, `stage ${n}: 時刻順`);
      const boss = s.events.filter(e => e.kind === 'boss');
      assert.equal(boss.length, 1, `stage ${n}: ボスは1体`);
      assert.equal(s.events[s.events.length - 1].kind, 'boss');
      assert.ok(s.cages.length >= 2 && s.cages.length <= 3, `stage ${n}: 檻の数`);
      for (const e of s.events) if (e.kind === 'wave') {
        assert.ok(cfg.enemies[e.type].from <= n, `stage ${n}: まだ出ない敵 ${e.type}`);
        assert.ok(e.count >= 1 && e.lane < s.layout.lanes.length);
      }
      for (const e of s.events) if (e.kind === 'gate' && cfg.gates[e.gate.id].kind === 'bad') assert.ok(n >= cfg.gate.badFrom, `stage ${n}: わなは ${cfg.gate.badFrom} から`);
    }
  }
});

test('ステージ1は広告どおり: 左の檻・騎士から・ゴブリンだけ・わなゲートなし', () => {
  const s = L.Stage.build(cfg, 1);
  assert.equal(s.layoutId, 'A');
  assert.equal(s.cages[0].hero, 'knight');
  assert.ok(s.events.filter(e => e.kind === 'wave').every(e => e.type === 'goblin'));
  assert.ok(s.events.filter(e => e.kind === 'gate').every(e => cfg.gates[e.gate.id].kind === 'good'));
});

test('地形はステージごとに変わり、新しい地形は出始めのステージで必ず使われる', () => {
  for (const [id, from] of Object.entries(cfg.stage.layoutsFrom)) assert.equal(L.Stage.build(cfg, from).layoutId, id);
  const used = new Set(); for (let n = 1; n <= 40; n++) used.add(L.Stage.build(cfg, n).layoutId);
  assert.equal(used.size, 5);
  for (const id of L.Stage.LAYOUT_IDS) {
    const lay = L.Stage.layout(id);
    for (const sl of lay.slots) for (const ln of lay.lanes) assert.ok(sl.x1 <= ln.x0 || sl.x0 >= ln.x1 || sl.y0 >= lay.mergeY, `${id}: 檻と通路が重ならない`);
  }
});

test('先のステージほど敵が強く・多い。難易度で変わる', () => {
  const hp = (n, d) => L.Stage.build(cfg, n, d).events.find(e => e.kind === 'boss').hpMul;
  assert.ok(hp(30, 'normal') > hp(10, 'normal') && hp(10, 'normal') > hp(1, 'normal'));
  assert.ok(hp(5, 'hard') > hp(5, 'normal') && hp(5, 'normal') > hp(5, 'easy'));
  assert.ok(L.Stage.build(cfg, 30).total > L.Stage.build(cfg, 1).total);
});

test('エンドレスは必要なぶんだけ先を作り、だんだん強くなる', () => {
  const s = L.Stage.endless(cfg, 'normal', 3);
  assert.equal(s.events.length, 0);
  while (s.generatedTo < 300) s.more();
  const waves = s.events.filter(e => e.kind === 'wave');
  assert.ok(waves.length >= 30);
  assert.ok(waves[waves.length - 1].hpMul > waves[0].hpMul * 2);
  assert.ok(s.events.some(e => e.kind === 'boss'));
  assert.ok(s.cages.length >= 3);
});

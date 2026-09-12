import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA, seededRandom, setHand, mixSeed, autoPlay } from './helpers.mjs';

function fresh(seed = 41) {
  const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
  GA.Engine.setRandom(seededRandom(seed));
  GA.AI.setRandom(seededRandom(seed + 1));
  return GA;
}

// ── 神の加護 ─────────────────────────────────────────
test('残りHPが4割以下になると受けるダメージが半分になる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  const max = s.players[1].maxHp;
  assert.equal(Engine.graceScale(s.players[1]), 1, '満タンでは加護は無い');

  s.players[1].hp = Math.ceil(max * 0.4);
  assert.equal(Engine.graceScale(s.players[1]), Engine.GRACE_SCALE);
  assert.equal(Engine.applyGrace(s.players[1], 14), 7);

  s.players[1].hp = Math.ceil(max * 0.4) + 1;
  assert.equal(Engine.graceScale(s.players[1]), 1, 'ぎりぎり上なら加護は無い');
});

test('加護は実際のダメージに効き、プレビューと同じ数字になる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 10;                        // maxHp 48 の4割以下
  setHand(GA, s.players[0], ['cannon']);       // 無14
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);

  const preview = Engine.previewDefense(s, []);
  assert.equal(preview.damage, 7, '14 → 7');
  assert.equal(preview.graced, 7, '軽くなった分');

  const res = Engine.defend(s, []);
  assert.equal(res.damage, preview.damage, 'プレビューと実際がずれている');
  assert.equal(s.players[1].hp, 3);
});

test('加護は撃ち返しにも効く', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[0].hp = 10;                        // 攻撃側が瀕死
  setHand(GA, s.players[0], ['inferno']);      // 火14
  setHand(GA, s.players[1], ['backfire']);     // 火の反射7
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.reflected, 4, '7 → 4');
  assert.equal(s.players[0].hp, 6);
});

test('プレビューの撃ち返しにも加護が効く（実際とずれない）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[0].hp = 10;                        // 攻撃側が瀕死 → 撃ち返しが半減する
  setHand(GA, s.players[0], ['inferno']);
  setHand(GA, s.players[1], ['backfire']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);

  const preview = Engine.previewDefense(s, [s.players[1].hand[0].uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(preview.reflected, res.reflected, 'プレビューと実際の撃ち返しがずれている');
  assert.equal(preview.damage, res.damage);
});

test('AIは加護を織り込んで見積もる（倒せない相手に使い切らない）', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0 });
  // B は瀕死だが加護で半減するので、この火力では倒しきれない
  s.players[1].hp = 12;
  s.players[1].hand = [];
  s.players[2].hp = s.players[2].maxHp;
  setHand(GA, s.players[0], ['sword', 'knife', 'spear', 'axe']);
  const act = JSON.parse(JSON.stringify(AI.chooseAction(s, 'hard')));
  assert.equal(act.type, 'attack');
  if (act.targetId === 1) {
    // Bを狙うなら、加護込みで倒しきれる枚数までは出す。全部は使い切らない。
    assert.ok(act.uids.length < 4, `手札を使い切っている（${act.uids.length}枚）`);
  }
});

test('どくは加護を貫く（加護で粘る相手へのとどめが残る）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 10;
  setHand(GA, s.players[0], ['poisonmist']);   // 毎ターン4
  setHand(GA, s.players[1], ['apple']);
  Engine.useItem(s, s.players[0].hand[0].uid, 1);
  assert.equal(s.players[1].hp, 6, '4がそのまま入る');
});

test('加護がかかっても、属性ごとの内訳の合計が実ダメージと一致する', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 10;                          // 加護がかかる
  setHand(GA, s.players[0], ['inferno', 'judgement', 'cannon']);   // 火14 雷14 無14
  Engine.attack(s, 1, s.players[0].hand.map((i) => i.uid));

  const preview = Engine.previewDefense(s, []);
  const sumThrough = preview.detail.reduce((a, r) => a + r.through, 0);
  assert.equal(sumThrough, preview.damage, '行の合計と実ダメージが食い違っている');

  const res = Engine.defend(s, []);
  assert.equal(res.detail.reduce((a, r) => a + r.through, 0), res.damage);
  assert.equal(res.damage, 21, '42 の半分');
});

test('加護がかかっても、撃ち返しの内訳の合計が一致する', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  s.players[0].hp = 10;                          // 攻撃側に加護
  setHand(GA, s.players[0], ['inferno', 'judgement']);
  setHand(GA, s.players[1], ['backfire', 'earthcoil']);   // 火7 雷7 の反射
  Engine.attack(s, 1, s.players[0].hand.map((i) => i.uid));
  const uids = s.players[1].hand.map((i) => i.uid);
  const preview = Engine.previewDefense(s, uids);
  assert.equal(preview.detail.reduce((a, r) => a + r.reflected, 0), preview.reflected);
  const res = Engine.defend(s, uids);
  assert.equal(res.detail.reduce((a, r) => a + r.reflected, 0), res.reflected);
  assert.equal(res.reflected, 7, '14 の半分');
});

test('防いだ量は撃ち返した分を二重に数えない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['inferno']);        // 火14
  setHand(GA, s.players[1], ['backfire']);       // 火の反射7
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, [s.players[1].hand[0].uid]);
  assert.equal(res.reflected, 7);
  assert.equal(res.blocked, 7, '止めたのは7。撃ち返しと合わせて14にはならない');
  assert.equal(res.damage, 7);
});

test('比例配分は合計をきっちり合わせる', () => {
  const GA = fresh();
  const { Engine } = GA;
  const rows = [{ v: 5 }, { v: 5 }, { v: 5 }];
  Engine.rescaleRows(rows, 'v', 8);
  assert.equal(rows.reduce((a, r) => a + r.v, 0), 8, '端数で合計がずれている');
  const one = [{ v: 3 }];
  Engine.rescaleRows(one, 'v', 1);
  assert.equal(one[0].v, 1);
  const zero = [{ v: 0 }, { v: 0 }];
  assert.doesNotThrow(() => Engine.rescaleRows(zero, 'v', 5));
});

// ── 人数に応じたHP ───────────────────────────────────
test('人数が増えるほど最大HPが増える', () => {
  const GA = fresh();
  const { Engine } = GA;
  const two = Engine.create({ names: ['A', 'B'], humans: 0 });
  const six = Engine.create({ names: ['A', 'B', 'C', 'D', 'E', 'F'], humans: 0 });
  assert.equal(two.players[0].maxHp, Engine.START_HP);
  assert.equal(six.players[0].maxHp, Engine.START_HP + Engine.HP_PER_EXTRA_PLAYER * 4);
  assert.ok(six.players[0].maxHp > two.players[0].maxHp);
});

// ── 集中砲火を避ける ─────────────────────────────────
test('このラウンドで既に殴られた相手は狙いの価値が下がる', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B', 'C'], humans: 0 });
  const fresh1 = s.players[1];
  assert.ok(AI.targetValue(fresh1, 0) > AI.targetValue(fresh1, 20),
    '既に殴られた相手を避けていない');
});

test('このラウンドの被ダメージだけを数える', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ names: ['A', 'B'], humans: 0 });
  setHand(GA, s.players[0], ['cannon']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  Engine.defend(s, []);
  assert.ok(AI.damageThisRound(s, 1) > 0);
  s.round++;                                    // ラウンドが変われば忘れる
  assert.equal(AI.damageThisRound(s, 1), 0);
});

// ── 多人数戦の公平さ ─────────────────────────────────
/**
 * 「一度も行動できずに退場する」が起きないこと。
 * 全員が必ず攻撃するルールのため、人数分の火力が1人に集まりやすい。
 * 対策（加護・人数に応じたHP・集中砲火を避けるAI）が効いているかを見る。
 */
function firstEliminationTurns(players, games = 150) {
  const out = [];
  for (let i = 0; i < games; i++) {
    const seed = mixSeed(i);
    const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
    GA.Engine.setRandom(seededRandom(seed));
    GA.AI.setRandom(seededRandom((seed ^ 0xABCD) >>> 0));
    const { Engine, AI } = GA;
    const names = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].slice(0, players);
    const s = Engine.create({ names, humans: 0, levels: names.map(() => 'normal') });
    const acted = new Array(players).fill(0);
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 3000) {
      if (s.phase === 'defense') {
        const d = Engine.byId(s, s.pending.targetId);
        Engine.defend(s, AI.chooseDefense(s, d.level));
        continue;
      }
      const p = Engine.current(s);
      acted[p.id]++;
      const a = AI.chooseAction(s, p.level);
      if (a.type === 'attack') Engine.attack(s, a.targetId, a.uids);
      else if (a.type === 'use') Engine.useItem(s, a.uid, a.targetId);
      else Engine.pray(s);
    }
    assert.equal(s.phase, 'over', `i=${i} で決着しない`);
    const dead = s.players.filter((p) => !p.alive).map((p) => acted[p.id]);
    if (dead.length) out.push(Math.min(...dead));
  }
  out.sort((a, b) => a - b);
  return {
    median: out[Math.floor(out.length / 2)],
    lowQuartile: out[Math.floor(out.length / 4)],
    neverActed: out.filter((x) => x === 0).length / out.length
  };
}

// 対策前は 4人戦・6人戦とも「最初の脱落者の手番数」が中央1手、
// 6人戦では4人に1人が一度も行動しないまま消えていた。
// 対策後の実測は 4人戦 中央10手 / 6人戦 中央12手・下位25%が9手。
test('4人戦で「何もできずに退場」が起きない', () => {
  const r = firstEliminationTurns(4);
  assert.equal(r.neverActed, 0, `一度も動けず退場が ${(r.neverActed * 100).toFixed(1)}%`);
  assert.ok(r.median >= 6, `最初の脱落が早すぎる（中央 ${r.median}手）`);
  assert.ok(r.lowQuartile >= 3, `下位25%が早すぎる（${r.lowQuartile}手）`);
});

test('6人戦で「何もできずに退場」が起きない', () => {
  const r = firstEliminationTurns(6);
  assert.equal(r.neverActed, 0, `一度も動けず退場が ${(r.neverActed * 100).toFixed(1)}%`);
  assert.ok(r.median >= 6, `最初の脱落が早すぎる（中央 ${r.median}手）`);
  assert.ok(r.lowQuartile >= 4, `下位25%が早すぎる（${r.lowQuartile}手）`);
});

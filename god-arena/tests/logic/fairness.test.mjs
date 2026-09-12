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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 10;
  setHand(GA, s.players[0], ['poisonmist']);   // 毎ターン4
  setHand(GA, s.players[1], ['apple']);
  Engine.useItem(s, s.players[0].hand[0].uid, 1);
  assert.equal(s.players[1].hp, 6, '4がそのまま入る');
});

test('加護がかかっても、属性ごとの内訳の合計が実ダメージと一致する', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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

test('加護で軽くなった分を「防いだ」に数えない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 10;                       // 加護がかかる
  setHand(GA, s.players[0], ['inferno']);     // 火14
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, []);           // 防具は出さない

  assert.equal(res.damage, 7);
  assert.equal(res.graced, 7);
  assert.equal(res.blocked, 0, '防具を出していないのに防いだことになっている');
  assert.equal(res.detail[0].blocked, 0);
  assert.equal(res.detail[0].graced, 7, '行ごとの加護の量が入っていない');
  assert.equal(res.detail[0].through, 7);
});

test('加護がかかっても「その属性を止められない」と読める', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.players[1].hp = 10;                       // 加護がかかる
  setHand(GA, s.players[0], ['inferno']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  Engine.defend(s, []);                       // 火を止められなかった

  const bias = AI.readDefenses(s, 1);
  assert.ok(bias.fire < 1,
    `素通りした属性を薄いと読めていない（${bias.fire}）。加護で through が減ると誤読する`);
});

test('防いだ量は撃ち返した分を二重に数えない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
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

test('ラウンドは生存者が一巡してから進む（先手の席に依存しない）', () => {
  const GA = fresh();
  const { Engine } = GA;
  for (const first of [0, 1, 2, 3]) {
    const s = Engine.create({ firstTurn: first, names: ['A', 'B', 'C', 'D'], humans: 0 });
    assert.equal(s.round, 1);
    for (let i = 0; i < 3; i++) {
      Engine.endTurn(s);
      assert.equal(s.round, 1, `先手=${first} で ${i + 1}手目にラウンドが進んでいる`);
    }
    Engine.endTurn(s);
    assert.equal(s.round, 2, `先手=${first} で一巡してもラウンドが進まない`);
  }
});

test('脱落してもラウンドの数え方が崩れない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
  s.players[1].alive = false;              // 生存2人
  Engine.endTurn(s);
  assert.equal(s.round, 1);
  Engine.endTurn(s);
  assert.equal(s.round, 2, '生存者ぶんで一巡と数えていない');
});

// ── 神の怒り ─────────────────────────────────────────
test('神の怒りはラウンド18を過ぎてから効き、上限で止まる', () => {
  const GA = fresh();
  const { Engine } = GA;
  assert.equal(Engine.wrathScale(1), 1);
  assert.equal(Engine.wrathScale(Engine.WRATH.from), 1, '開始ラウンドまでは効かない');
  assert.ok(Engine.wrathScale(Engine.WRATH.from + 1) > 1);
  assert.ok(Engine.wrathScale(Engine.WRATH.from + 2) > Engine.wrathScale(Engine.WRATH.from + 1));
  assert.equal(Engine.wrathScale(Engine.WRATH.from + 999), Engine.WRATH.max, '上限で止まらない');
});

test('神の怒りは通ったダメージを重くし、内訳の合計と一致する', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.round = Engine.WRATH.from + 5;               // 倍率 2.0
  setHand(GA, s.players[0], ['inferno', 'judgement']);   // 火14 + 雷14
  Engine.attack(s, 1, s.players[0].hand.map((i) => i.uid));

  const preview = Engine.previewDefense(s, []);
  assert.equal(preview.wrath, Engine.wrathScale(s.round));
  assert.equal(preview.damage, 56, '28 の2倍');
  assert.equal(preview.wrathAdded, 28);
  assert.equal(preview.detail.reduce((a, r) => a + r.through, 0), preview.damage,
    '内訳の合計と食い違っている');

  const res = Engine.defend(s, []);
  assert.equal(res.damage, preview.damage, 'プレビューと実際がずれている');
});

test('神の怒りと加護は重なって効く（怒りで重くしてから加護で軽くする）', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.round = Engine.WRATH.from + 5;               // 倍率 2.0
  s.players[1].hp = 10;                          // 加護がかかる
  setHand(GA, s.players[0], ['cannon']);         // 無14
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, []);
  assert.equal(res.wrathAdded, 14, '14 → 28');
  assert.equal(res.damage, 14, '28 の半分');
  assert.equal(res.graced, 14);
  assert.equal(res.detail.reduce((a, r) => a + r.through, 0), res.damage);
});

test('ラウンド18までは怒りが一切かからない', () => {
  const GA = fresh();
  const { Engine } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  s.round = Engine.WRATH.from;
  setHand(GA, s.players[0], ['cannon']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  const res = Engine.defend(s, []);
  assert.equal(res.wrathAdded, 0);
  assert.equal(res.damage, 14);
});

// ── 人数に応じたHP ───────────────────────────────────
test('人数が増えるほど最大HPが増える', () => {
  const GA = fresh();
  const { Engine } = GA;
  const two = Engine.create({ firstTurn: 0, names: ['A', 'B'], humans: 0 });
  const six = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C', 'D', 'E', 'F'], humans: 0 });
  assert.equal(two.players[0].maxHp, Engine.START_HP);
  assert.equal(six.players[0].maxHp, Engine.START_HP + Engine.HP_PER_EXTRA_PLAYER * 4);
  assert.ok(six.players[0].maxHp > two.players[0].maxHp);
});

// ── 集中砲火を避ける ─────────────────────────────────
test('このラウンドで既に殴られた相手は狙いの価値が下がる', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
  const fresh1 = s.players[1];
  assert.ok(AI.targetValue(fresh1, 0) > AI.targetValue(fresh1, 20),
    '既に殴られた相手を避けていない');
});

test('直近ひと回り分より古い被ダメージは忘れる', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });

  /** いまの手番の者が、指定の相手を1発撃つ */
  const shoot = (targetId, id = 'stone') => {
    const shooter = Engine.current(s);
    setHand(GA, shooter, [id]);
    Engine.attack(s, targetId, [shooter.hand[0].uid]);
    Engine.defend(s, []);
  };

  shoot(1, 'cannon');                       // A → B
  assert.ok(AI.damageThisRound(s, 1) > 0, '直後は覚えている');

  // 生存3人なので窓は3件。Bを狙わない解決が3件積まれれば窓から外れる
  shoot(2);                                 // B → C
  shoot(0);                                 // C → A
  shoot(2);                                 // A → C
  assert.equal(AI.damageThisRound(s, 1), 0, '窓から外れた分をまだ数えている');
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
    const s = Engine.create({ firstTurn: 0, names, humans: 0, levels: names.map(() => 'normal') });
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
/**
 * 全員同レベルで回し、手番順ごとの勝率を返す。
 * 手番の位置で有利不利が出ていないかを見る。
 */
function positionWinRates(players, games) {
  const wins = new Array(players).fill(0);
  let decided = 0;
  for (let i = 0; i < games; i++) {
    const seed = mixSeed(i);
    const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
    GA.Engine.setRandom(seededRandom(seed));
    GA.AI.setRandom(seededRandom((seed ^ 0xABCD) >>> 0));
    const { Engine, AI } = GA;
    const names = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].slice(0, players);
    const s = Engine.create({ firstTurn: 0, names, humans: 0, levels: names.map(() => 'normal') });
    let guard = 0;
    while (s.phase !== 'over' && guard++ < 3000) {
      if (s.phase === 'defense') {
        const d = Engine.byId(s, s.pending.targetId);
        Engine.defend(s, AI.chooseDefense(s, d.level));
        continue;
      }
      const p = Engine.current(s);
      const a = AI.chooseAction(s, p.level);
      if (a.type === 'attack') Engine.attack(s, a.targetId, a.uids);
      else if (a.type === 'use') Engine.useItem(s, a.uid, a.targetId);
      else Engine.pray(s);
    }
    assert.equal(s.phase, 'over', `i=${i} で決着しない`);
    if (s.winner === null) continue;
    decided++;
    wins[s.winner]++;
  }
  return { rates: wins.map((w) => w / decided), decided };
}

test('1対1で先手が有利になっていない', () => {
  // 補正前は先手 54.7% ±2.8pt（1200局）だった。後手に神器を1つ渡して 49.7% に戻した。
  const r = positionWinRates(2, 400);
  assert.ok(r.decided >= 380, `決着した局が少なすぎる (${r.decided})`);
  assert.ok(r.rates[0] <= 0.565,
    `先手が有利すぎる: ${(r.rates[0] * 100).toFixed(1)}%`);
  assert.ok(r.rates[0] >= 0.435,
    `後手が有利すぎる: ${(r.rates[0] * 100).toFixed(1)}%`);
});

test('1対1の補正は「後に動く側」に渡る（席ではなく手番順）', () => {
  const GA = fresh();
  const { Engine } = GA;
  for (const first of [0, 1]) {
    const duel = Engine.create({ firstTurn: first, names: ['A', 'B'], humans: 0 });
    assert.equal(duel.turn, first);
    assert.equal(duel.players[first].hand.length, Engine.OPENING_HAND, '先手に補正が入っている');
    assert.equal(duel.players[1 - first].hand.length,
      Engine.OPENING_HAND + Engine.DUEL_SECOND_BONUS, '後手に補正が入っていない');
  }

  // 3人以上では手番順の偏りが別の形になるので、この補正は当てない
  const three = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
  for (const p of three.players) assert.equal(p.hand.length, Engine.OPENING_HAND);
});

test('先手は既定でランダムに決まる', () => {
  // 手番順の有利不利をいつも同じ席が背負わないようにするための規則。
  // 席を固定したまま回すと、3人戦では最後の席が 37.7%（期待33.3%）だった。
  const seen = new Map();
  for (let i = 0; i < 300; i++) {
    const seed = mixSeed(i);
    const GA = loadGA(['items.js', 'engine.js', 'ai.js']);
    GA.Engine.setRandom(seededRandom(seed));
    const s = GA.Engine.create({ names: ['A', 'B', 'C'], humans: 0 });
    seen.set(s.turn, (seen.get(s.turn) || 0) + 1);
    assert.equal(s.first, s.turn);
  }
  assert.equal(seen.size, 3, `先手が偏っている: ${[...seen.entries()]}`);
  for (const [seat, count] of seen) {
    assert.ok(count / 300 > 0.24 && count / 300 < 0.43,
      `席 ${seat} の先手率が偏っている: ${(count / 300 * 100).toFixed(1)}%`);
  }
});

test('先手を指定すればその席から始まる（再現のため）', () => {
  const GA = fresh();
  for (let i = 0; i < 4; i++) {
    const s = GA.Engine.create({ firstTurn: i, names: ['A', 'B', 'C', 'D'], humans: 0 });
    assert.equal(s.turn, i);
  }
  // 範囲外は丸める（URLから来た値を信用しない）
  assert.equal(GA.Engine.create({ firstTurn: 99, names: ['A', 'B'], humans: 0 }).turn, 1);
  assert.equal(GA.Engine.create({ firstTurn: -3, names: ['A', 'B'], humans: 0 }).turn, 0);
});

test('4人戦で手番順による偏りが出ていない', () => {
  // 集中砲火の回避をラウンド単位で数えていたころは、ラウンドの先頭で
  // 全員ぶんが一斉に忘れられるため、最後の手番が 36.2% まで偏っていた。
  // 直近ひと回り分の移動窓に変えて 24〜26% に収まった。
  const r = positionWinRates(4, 400);
  for (const [i, rate] of r.rates.entries()) {
    assert.ok(rate >= 0.19 && rate <= 0.31,
      `手番 ${i} の勝率が偏っている: ${(rate * 100).toFixed(1)}%（期待 25%）`);
  }
});

test('集中砲火の回避はラウンド境界で途切れない', () => {
  const GA = fresh();
  const { Engine, AI } = GA;
  const s = Engine.create({ firstTurn: 0, names: ['A', 'B', 'C'], humans: 0 });
  setHand(GA, s.players[0], ['cannon']);
  Engine.attack(s, 1, [s.players[0].hand[0].uid]);
  Engine.defend(s, []);
  const justHit = AI.damageThisRound(s, 1);
  assert.ok(justHit > 0);

  // ラウンドが変わっても、直近ひと回り分に入っていれば覚えている
  s.round += 1;
  assert.equal(AI.damageThisRound(s, 1), justHit, 'ラウンド境界で忘れている');
});

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

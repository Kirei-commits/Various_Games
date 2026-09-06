/**
 * バランスの検証。数値を直接テストで確かめることで、調整の手戻りを防ぐ。
 *
 * ここが落ちたときは「バグ」ではなく「バランスが想定から外れた」合図。
 * 意図して変えたなら、期待値のほうを更新する（理由をコミットメッセージに残す）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, seededRandom, fakeStorage, autoFight } from './helpers.mjs';

const FILES = ['fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js',
  'boost.js', 'bonus.js', 'achievements.js', 'storage.js', 'tackle.js', 'game.js'];

/** 一人前のプレイヤーが黙々と釣り続けたときの進行をまるごと再現する。 */
function play({ seed = 1, maxCasts = 5000, upgrade = true, lure = 'none',
                rod = null, line = null, fight = {}, stopAtMax = true } = {}) {
  const FQ = loadFQ(FILES, { localStorage: fakeStorage() });
  const { Store, Gear, World, Progress, Game, Tackle } = FQ;
  const rng = seededRandom(seed);
  const st = Store.defaults();
  const game = Game.create({ random: rng });

  if (rod != null) st.rod = rod;
  if (line != null) st.line = line;

  const caught = {};
  let casts = 0, reachedMax = null, fightMs = 0;

  while (casts < maxCasts) {
    if (upgrade) {
      // 余裕があれば強化する（竿と糸を交互に）
      for (const kind of ['rod', 'line']) {
        const lv = kind === 'rod' ? st.rod : st.line;
        const r = Gear.tryUpgrade(kind, lv, st.coins);
        if (r.ok) { st.coins = r.coins; if (kind === 'rod') st.rod = r.level; else st.line = r.level; }
      }
    }
    const weather = World.weatherOf(st.weather);
    st.lure = lure;
    const tackle = Tackle.resolve(st, weather);
    if (!game.cast({
      level: st.level, phase: World.phaseAt(st.clock).id, weather: st.weather, tackle: tackle
    })) break;

    casts++;
    st.casts++;
    st.clock = World.advance(st.clock);
    st.weather = World.nextWeather(st.weather, rng);

    while (game.state.phase !== 'bite' && game.state.phase !== 'result') game.tick(16);
    if (game.state.phase === 'bite') {
      game.strike();
      const ev = autoFight(game, fight);
      fightMs += ev.elapsed;
      if (ev.type === 'landed') {
        Store.applyCatch(st, { fish: ev.fish, size: ev.size, pointMul: tackle.pointMul }, casts);
        caught[ev.fish.id] = (caught[ev.fish.id] || 0) + 1;
      } else {
        Store.applyMiss(st, { guard: 0, random: rng });
      }
    }
    game.reset();
    if (st.level >= Progress.LEVEL_MAX && reachedMax == null) {
      reachedMax = casts;
      if (stopAtMax) break;
    }
  }
  return { state: st, casts, caught, reachedMax, fightMs, FQ };
}

test('一人前のプレイヤーは、ほぼ確実に取り込みまで到達できる', () => {
  const { state, casts } = play({ seed: 4, maxCasts: 400 });
  const rate = state.catches / casts;
  assert.ok(rate > 0.9, `成功率が低すぎる: ${(rate * 100).toFixed(1)}%`);
});

test('Lv30 到達までのキャスト数が想定の範囲に収まる', () => {
  // 複数の種で測り、種による当たり外れに依存しないようにする
  const runs = [1, 2, 3].map((seed) => play({ seed, maxCasts: 4000 }));
  for (const r of runs) {
    assert.ok(r.reachedMax, `Lv30 に到達しなかった（${r.casts}キャスト, Lv${r.state.level}）`);
  }
  const avg = runs.reduce((a, r) => a + r.reachedMax, 0) / runs.length;
  assert.ok(avg > 150, `早すぎる（平均 ${Math.round(avg)} キャストで最大レベル）`);
  assert.ok(avg < 900, `長すぎる（平均 ${Math.round(avg)} キャスト必要）`);
});

test('レベルが上がるほどレアな魚の割合が増える（全時間帯・全天候をならして）', () => {
  const { Fish, World } = loadFQ(['fish.js', 'world.js']);
  const rng = seededRandom(77);
  const share = (level) => {
    let rare = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const phase = World.PHASES[i % World.PHASES.length].id;
      const weather = World.WEATHER_IDS[(i >> 2) % World.WEATHER_IDS.length];
      if (Fish.pick({ level, phase, weather }, rng).stars >= 3) rare++;
    }
    return rare / N;
  };
  const levels = [1, 5, 10, 15, 20, 25, 30];
  const shares = levels.map(share);
  for (let i = 1; i < shares.length; i++) {
    assert.ok(shares[i] > shares[i - 1],
      `Lv${levels[i]} でレア率が下がった (${shares[i - 1].toFixed(3)} → ${shares[i].toFixed(3)})`);
  }
  assert.ok(shares[0] < 0.12, `Lv1 でレアが出すぎ (${shares[0].toFixed(3)})`);
  assert.ok(shares[shares.length - 1] > 0.30, `Lv30 でもレアが出なさすぎ (${shares[shares.length - 1].toFixed(3)})`);
});

test('十分に遊べば30種すべてに出会える（絶対に会えない魚がいない）', () => {
  // レベルが上がるほどレアが出るので、最大レベル到達後もしばらく粘って数える
  const { caught, FQ } = play({ seed: 5, maxCasts: 30000, stopAtMax: false, lure: 'chum' });
  const missing = FQ.Fish.all().filter((f) => !caught[f.id]).map((f) => f.name).join('、');
  assert.equal(missing, '', '一度も出会えなかった魚がいる: ' + missing);
});

test('釣り人レベルも遊んでいるうちに上がりきる', () => {
  const { state, FQ } = play({ seed: 8, maxCasts: 4000, stopAtMax: false });
  assert.equal(state.anglerLevel, FQ.Angler.LEVEL_MAX,
    `釣り人レベルが ${state.anglerLevel} までしか上がらなかった`);
});

test('高いエサほど強く、値段に見合った伸びがある', () => {
  const points = (lure) => {
    const r = play({ seed: 12, maxCasts: 300, lure, upgrade: false });
    return r.state.xp / r.casts; // 1キャストあたりの獲得ポイント
  };
  const plain = points('none');
  const glow = points('glow');
  const chum = points('chum');
  assert.ok(glow > plain * 1.2, `夜光ルアーの効果が弱い (${plain.toFixed(1)} → ${glow.toFixed(1)})`);
  assert.ok(chum > glow, `撒き餌が夜光ルアーに負けている (${glow.toFixed(1)} → ${chum.toFixed(1)})`);
});

test('糸を強化すると、同じ荒い巻き方でもバラシが減る', () => {
  // 糸の強さを考えずに一定のテンションまで巻いてしまうプレイヤーを想定する
  const rough = { high: 0.79 };
  const weak = play({ seed: 6, maxCasts: 250, upgrade: false, line: 1, fight: rough });
  const strong = play({ seed: 6, maxCasts: 250, upgrade: false, line: 5, fight: rough });
  assert.ok(weak.state.misses > 0, 'そもそもバラシが起きていない（テストが役に立っていない）');
  assert.ok(strong.state.misses < weak.state.misses,
    `糸を強化してもバラシが減らない (${weak.state.misses} → ${strong.state.misses})`);
});

test('竿を強化すると、同じ釣果までのファイト時間が短くなる', () => {
  const slow = play({ seed: 6, maxCasts: 200, upgrade: false, rod: 1 });
  const fast = play({ seed: 6, maxCasts: 200, upgrade: false, rod: 5 });
  assert.equal(fast.state.catches, slow.state.catches, '比較の前提（同じ魚を釣っている）が崩れている');
  assert.ok(fast.fightMs < slow.fightMs * 0.9,
    `竿を強化しても速くならない (${slow.fightMs}ms → ${fast.fightMs}ms)`);
});

test('最大レベルに到達しても状態が壊れない', () => {
  const { state, FQ } = play({ seed: 2, maxCasts: 4000 });
  const p = FQ.Progress.levelProgress(state.xp);
  assert.equal(p.level, FQ.Progress.LEVEL_MAX);
  assert.equal(p.ratio, 1);
  assert.ok(state.coins >= 0, '所持ポイントが負になっている');
  assert.ok(state.records.length <= FQ.Store.RECORD_MAX);
});

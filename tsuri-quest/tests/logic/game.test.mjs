import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, seededRandom, autoFight } from './helpers.mjs';

const FQ = loadFQ(['fish.js', 'progress.js', 'world.js', 'gear.js', 'game.js']);
const { Fish, Gear, Game } = FQ;

function newGame(seed = 5) {
  return Game.create({ random: seededRandom(seed) });
}
const ctx = () => ({ level: 10, phase: 'day', weather: 'sunny', lure: Gear.lure('none'), rod: Gear.rod(1), line: Gear.line(1) });

/** 指定フェーズまで進める。 */
function advanceTo(game, phase, maxMs = 30000) {
  let t = 0;
  while (game.state.phase !== phase && t < maxMs) { game.tick(16); t += 16; }
  assert.equal(game.state.phase, phase, `${phase} に到達しなかった`);
  return t;
}

test('キャストは idle のときだけ受け付ける', () => {
  const g = newGame();
  assert.equal(g.cast(ctx()), true);
  assert.equal(g.state.phase, 'casting');
  assert.equal(g.cast(ctx()), false, '二重キャストが通ってしまう');
});

test('着水 → 待機 → 当たり の順に進み、魚とサイズはキャスト時に決まっている', () => {
  const g = newGame();
  g.cast(ctx());
  assert.ok(g.state.fish, 'キャスト時点で魚が決まっていない');
  assert.ok(g.state.size >= g.state.fish.min && g.state.size <= g.state.fish.max);

  advanceTo(g, 'waiting');
  const ev = (() => { let e = null; while (!(e = g.tick(16))); return e; })();
  assert.equal(ev.type, 'bite');
  assert.equal(g.state.phase, 'bite');
});

test('当たりの猶予内に合わせればファイトに入る', () => {
  const g = newGame();
  g.cast(ctx());
  advanceTo(g, 'bite');
  const ev = g.strike();
  assert.equal(ev.type, 'hooked');
  assert.equal(g.state.phase, 'fight');
  assert.ok(g.state.tension > 0, '合わせた直後にテンションが張っていない');
});

test('早すぎる合わせは early で失敗する', () => {
  const g = newGame();
  g.cast(ctx());
  advanceTo(g, 'waiting');
  const ev = g.strike();
  assert.equal(ev.type, 'missed');
  assert.equal(ev.reason, 'early');
  assert.equal(g.state.phase, 'result');
});

test('合わせないまま猶予を過ぎると late で失敗する', () => {
  const g = newGame();
  g.cast(ctx());
  advanceTo(g, 'bite');
  let ev = null, t = 0;
  while (!ev && t < 10000) { ev = g.tick(16); t += 16; }
  assert.equal(ev.type, 'missed');
  assert.equal(ev.reason, 'late');
  assert.ok(t >= g.state.biteWindowMs - 32 && t <= g.state.biteWindowMs + 32,
    `猶予時間どおりに失敗していない: ${t} vs ${g.state.biteWindowMs}`);
});

test('竿を強化すると当たりの猶予が伸びる', () => {
  const mk = (rodLv) => {
    const g = newGame(11);
    g.cast({ ...ctx(), rod: Gear.rod(rodLv) });
    return g.state.biteWindowMs;
  };
  assert.ok(mk(5) > mk(1), '竿を強化しても猶予が変わらない');
  assert.equal(mk(5) - mk(1), Gear.rod(5).reactionBonusMs - Gear.rod(1).reactionBonusMs);
});

test('巻きっぱなしはラインブレイクで失敗する', () => {
  const g = newGame();
  g.cast(ctx());
  advanceTo(g, 'bite');
  g.strike();
  g.setReeling(true);
  let ev = null, t = 0;
  while (!ev && t < 20000) { ev = g.tick(16); t += 16; }
  assert.equal(ev.type, 'missed');
  assert.equal(ev.reason, 'break');
  assert.ok(g.state.tension >= Gear.line(1).breakAt - 0.01);
});

test('まったく巻かなければ制限時間切れで逃げられる', () => {
  const g = newGame();
  g.cast(ctx());
  advanceTo(g, 'bite');
  g.strike();
  g.setReeling(false);
  let ev = null, t = 0;
  while (!ev && t < 60000) { ev = g.tick(16); t += 16; }
  assert.equal(ev.type, 'missed');
  assert.equal(ev.reason, 'escape');
});

test('緩急をつけて巻けば釣り上げられる（7種すべてで成立する）', () => {
  for (const f of Fish.all()) {
    const g = newGame(3);
    g.cast(ctx());
    // どの魚でも同じ操作で取れることを見たいので、魚だけ差し替える
    g.state.fish = f;
    g.state.size = (f.min + f.max) / 2;
    g.state.limitMs = f.fightMs * Game.FIGHT_LIMIT_MUL;
    advanceTo(g, 'bite');
    g.strike();
    const ev = autoFight(g);
    assert.equal(ev.type, 'landed', `${f.name} が取り込めない (${ev.reason || ev.type})`);
    assert.equal(ev.fish.id, f.id);
  }
});

test('糸を強化すると、同じ操作で許される巻き幅が広がる', () => {
  const reach = (lineLv) => {
    const g = newGame(3);
    g.cast({ ...ctx(), line: Gear.line(lineLv) });
    advanceTo(g, 'bite');
    g.strike();
    g.setReeling(true);
    let ev = null, t = 0;
    while (!ev && t < 20000) { ev = g.tick(16); t += 16; }
    return t;
  };
  assert.ok(reach(5) > reach(1), '糸を強化しても切れるまでの時間が変わらない');
});

test('竿を強化すると取り込みが速くなる', () => {
  const land = (rodLv) => {
    const g = newGame(3);
    g.cast({ ...ctx(), rod: Gear.rod(rodLv) });
    advanceTo(g, 'bite');
    g.strike();
    let t = 0;
    while (t < 60000) {
      const s = g.state;
      if (s.tension >= s.breakAt - 0.12) g.setReeling(false);
      else if (s.tension <= 0.25) g.setReeling(true);
      const ev = g.tick(16);
      t += 16;
      if (ev && ev.type === 'landed') return t;
      if (ev && ev.type === 'missed') return Infinity;
    }
    return Infinity;
  };
  assert.ok(land(5) < land(1), '竿を強化しても取り込み時間が縮まらない');
});

test('レアな魚ほど当たりが短く、ファイトが長い', () => {
  const all = Fish.all();
  const legend = all[all.length - 1], common = all[0];
  assert.ok(legend.reactionMs < common.reactionMs);
  assert.ok(legend.fightMs > common.fightMs);
});

test('嵐は引きの振れ幅を大きくする', () => {
  const amp = (mul) => {
    const g = newGame(21);
    g.cast({ ...ctx(), weatherAmpMul: mul });
    g.state.fish = Fish.byId('buri');
    let min = Infinity, max = -Infinity;
    for (let ms = 0; ms < 6000; ms += 20) {
      const p = g.pullAt(ms);
      if (p < min) min = p;
      if (p > max) max = p;
    }
    return max - min;
  };
  assert.ok(amp(1.35) > amp(1.0) * 1.2, '天候で引きの荒さが変わっていない');
});

test('結果は一定時間で自動的に閉じ、途中でも閉じられる', () => {
  const g = newGame();
  g.cast(ctx());
  advanceTo(g, 'waiting');
  g.strike(); // early で result へ
  assert.equal(g.state.phase, 'result');
  assert.equal(g.dismiss(), true);
  assert.equal(g.state.phase, 'idle');

  const g2 = newGame();
  g2.cast(ctx());
  advanceTo(g2, 'waiting');
  g2.strike();
  let ev = null, t = 0;
  while (!ev && t < 5000) { ev = g2.tick(16); t += 16; }
  assert.equal(ev.type, 'ready');
  assert.equal(g2.state.phase, 'idle');
});

test('同じ種を与えれば結果は完全に再現する', () => {
  const run = () => {
    const g = newGame(1234);
    const out = [];
    for (let i = 0; i < 5; i++) {
      g.cast(ctx());
      out.push(g.state.fish.id + ':' + g.state.size + ':' + Math.round(g.state.waitMs));
      advanceTo(g, 'bite');
      g.strike();
      const ev = autoFight(g);
      out.push(ev.type + (ev.reason || ''));
      g.dismiss();
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('巻いていないあいだは取り込みが戻り、0未満にはならない', () => {
  const g = newGame(8);
  g.cast(ctx());
  advanceTo(g, 'bite');
  g.strike();
  g.setReeling(true);
  for (let i = 0; i < 20; i++) g.tick(16);
  const peak = g.state.progress;
  assert.ok(peak > 0);
  g.setReeling(false);
  for (let i = 0; i < 200; i++) g.tick(16);
  assert.ok(g.state.progress < peak, '巻きを止めても取り込みが戻らない');
  assert.ok(g.state.progress >= 0, '取り込みが負になっている');
});

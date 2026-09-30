/**
 * ミニゲーム「ドロップパズル」（ms-puzzle）。仕様は docs/puzzle-research.md。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, seededRandom } from './helpers.mjs';

const { D, M, Z } = loadAll();
const clone = (x) => JSON.parse(JSON.stringify(x));
/** 文字で盤面を書く: F 火 / W 水 / G 木 / L 光 / K 闇 / H 回復 */
const K = { F: 'fire', W: 'water', G: 'wood', L: 'light', K: 'dark', H: 'heart' };
const board = (...rows) => rows.map((r) => [...r].map((ch) => K[ch]));
const team = () => clone(M.partyUnits(M.newSave(D), D, 'puzzle'));

test('盤面は6×5で6種類。最初はそろった所が無い（どの乱数でも）', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const b = Z.newBoard(seededRandom(seed));
    assert.equal(b.length, 5);
    for (const row of b) { assert.equal(row.length, 6); for (const c of row) assert.ok(Z.COLORS.includes(c)); }
    assert.equal(Z.findMatches(b).length, 0, `seed ${seed}`);
  }
  const colors = new Set(Z.newBoard(seededRandom(3)).flat());
  assert.ok(colors.size >= 5);
});

test('入れ替えは隣（斜めも）だけ', () => {
  const b = Z.newBoard(seededRandom(1)), a = b[0][0], d = b[1][1];
  assert.ok(Z.swap(b, 0, 0, 1, 1));
  assert.equal(b[0][0], d); assert.equal(b[1][1], a);
  assert.equal(Z.swap(b, 0, 0, 0, 2), false, '2つ先');
  assert.equal(Z.swap(b, 0, 0, 0, 0), false, '同じ所');
  assert.equal(Z.swap(b, 0, 0, -1, 0), false, '盤の外');
});

test('縦か横に3個以上で消える。つながった同じ色は1コンボ', () => {
  const b = board(
    'FFFWLK',
    'GHWWLK',
    'GHKFLH',
    'GLKFWW',
    'WLHFKH');
  const cs = Z.findMatches(b);
  const byColor = [...cs].map((c) => `${c.color}:${c.cells.length}`).sort();
  // 火の横3 / 光の縦3 / 木の縦3 / 火の縦3（左上の火の横3とは離れているので別）
  assert.deepEqual(byColor, ['fire:3', 'fire:3', 'light:3', 'wood:3']);
  // L字は1コンボ（5個）
  const l = board(
    'FFFWLK',
    'FHWGLG',
    'FHKGHH',
    'GLKFWW',
    'WLHFKH');
  const cl = Z.findMatches(l);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].cells.length, 5);
});

test('消えた所に上から落ち、空いた所に新しいドロップが降る。落ちコンも数える', () => {
  const b = board(
    'WGLKHF',
    'GWLKHF',
    'FFGWLH',
    'KHFFWL',
    'LLKHFF');
  const cl = Z.copy(b);
  cl[4][0] = null; cl[4][1] = null;
  const f = Z.fall(cl, seededRandom(5));
  assert.equal(f.board[4][0], 'dark', '1つ上の段が落ちる');
  assert.equal(f.board[1][0], 'water');
  assert.equal(f.board[4][2], 'dark', '消えていない列はそのまま');
  assert.equal(f.moves.filter((m) => m.from < 0).length, 2, '新しいドロップは2つ');
  for (const row of f.board) for (const c of row) assert.ok(c);
  // 落ちコン: 火の横3が消えると、左の列の水が3つ縦に並ぶ
  const cascade = board(
    'GKLKHF',
    'WHGLKH',
    'WLKHLG',
    'FFFGHK',
    'WGHWKL');
  const r = Z.resolve(cascade, seededRandom(11));
  assert.ok(r.steps.length >= 2, `${r.steps.length}段`);
  assert.equal(r.steps[0].combos[0].color, 'fire');
  assert.ok(r.steps[1].combos.some((c) => c.color === 'water' && c.cells.every((p) => p[1] === 0)));
  assert.equal(r.combos.length, r.steps.reduce((a, st) => a + st.combos.length, 0));
  assert.equal(Z.findMatches(r.board).length, 0, '終わった盤面にはそろった所が無い');
});

test('倍率: コンボは1つにつき+25%、4個消しは1.25倍、属性はパズドラと同じ', () => {
  assert.equal(Z.comboRate(1), 1); assert.equal(Z.comboRate(5), 2); assert.equal(Z.comboRate(10), 3.25);
  assert.equal(Z.sizeRate(3), 1); assert.equal(Z.sizeRate(4), 1.25); assert.equal(Z.sizeRate(5), 1.5);
  assert.equal(Z.elementRate('water', 'fire'), 2);
  assert.equal(Z.elementRate('fire', 'water'), 0.5);
  assert.equal(Z.elementRate('light', 'dark'), 2);
  assert.equal(Z.elementRate('dark', 'light'), 2);
  assert.equal(Z.elementRate('light', 'fire'), 1);
});

const combo = (color, n = 3) => ({ color, cells: Array.from({ length: n }, (_, i) => [0, i]) });
const floors = (hp = 1e6, atk = 1000, turns = 2) => [[{ id: 'e', name: 'e', element: 'dark', hp, atk, turns }]];

test('攻撃: 消した色と同じ属性のキャラが攻撃。リーダーと同じ属性は1.5倍、5個以上は全体攻撃', () => {
  const t = team();   // A 水（リーダー）/ B 火 / C 木 / D 光 / E 火 / F 水
  const pb = new Z.PuzzleBattle({ team: t, floors: floors() });
  const r = pb.play([combo('water'), combo('fire', 4)]);
  const a = r.attacks.find((x) => x.unit === 'A'), b = r.attacks.find((x) => x.unit === 'B');
  assert.equal(a.hits[0].damage, Math.round(t[0].atk * 1.25 * 1.5), '水: 2コンボ×リーダー');
  assert.equal(b.hits[0].damage, Math.round(t[1].atk * 1.25 * 1.25), '火: 4個消し×2コンボ');
  assert.equal(r.attacks.map((x) => x.unit).join(), 'A,B,E,F', '水と火のキャラだけが攻撃する');
  assert.equal(r.attacks.find((x) => x.unit === 'F').hits[0].damage, Math.round(t[5].atk * 1.25 * 1.5), 'リーダーと同じ水の F も1.5倍');
  const d = pb.play([combo('light')]).attacks[0];
  assert.equal(d.hits[0].damage, Math.round(t[3].atk * 2), '光→闇は2倍');
  const two = new Z.PuzzleBattle({ team: t, floors: [[
    { id: 'x', element: 'dark', hp: 1e6, atk: 1, turns: 9 }, { id: 'y', element: 'dark', hp: 1e6, atk: 1, turns: 9 }]] });
  assert.equal(two.play([combo('fire', 3)]).attacks[0].hits.length, 1, '3個は単体');
  assert.equal(two.play([combo('fire', 5)]).attacks[0].hits.length, 2, '5個は全体');
});

test('回復ドロップで回復（回復力は HP の 1/20）。最大HPは超えない', () => {
  const t = team();
  const pb = new Z.PuzzleBattle({ team: t, floors: floors(1e6, 20000, 1) });
  pb.play([]);
  assert.equal(pb.hp, pb.hpMax - 20000);
  const r = pb.play([combo('heart'), combo('water')]);
  const rcv = t.reduce((a, u) => a + Math.round(u.hp / 20), 0);
  assert.equal(r.heal, Math.round(rcv * 1.25));
  const full = new Z.PuzzleBattle({ team: t, floors: floors() });
  assert.equal(full.play([combo('heart', 5)]).heal, 0);
});

test('敵はターン数が0になると攻撃する。HPが0で負け、全フロアの敵を倒すと勝ち', () => {
  const pb = new Z.PuzzleBattle({ team: team(), floors: floors(1e6, 1e6, 2) });
  assert.equal(pb.play([]).enemyAttacks.length, 0);
  const r = pb.play([]);
  assert.equal(r.enemyAttacks.length, 1);
  assert.equal(r.state, 'lost');
  assert.equal(pb.play([combo('fire')]), null, '終わったら何もしない');
  const win = new Z.PuzzleBattle({ team: team(), floors: [[{ id: 'a', element: 'wood', hp: 1, atk: 1e6, turns: 1 }], [{ id: 'b', element: 'wood', hp: 1, atk: 1e6, turns: 1 }]] });
  const w1 = win.play([combo('fire')]);
  assert.ok(w1.floorCleared && w1.state === 'playing' && win.floor === 1);
  assert.equal(w1.enemyAttacks.length, 0, '倒したフロアの敵は攻撃しない');
  assert.equal(win.play([combo('fire')]).state, 'won');
});

// ------------------------------------------------------------ 難しさ
/** 毎ターン k コンボ（色はでたらめ、たまに4〜5個消し）するプレイヤー */
function sim(k, seed) {
  const rng = seededRandom(seed);
  const pb = new Z.PuzzleBattle({ team: team(), floors: D.puzzle.floors });
  for (let i = 0; i < 60 && pb.state === 'playing'; i++) {
    const cs = [];
    for (let j = 0; j < k; j++) cs.push(combo(Z.COLORS[Math.floor(rng() * 6)], rng() < 0.2 ? 4 + Math.floor(rng() * 2) : 3));
    pb.play(cs);
  }
  return pb.state;
}
const winRate = (k) => { let w = 0; for (let s = 1; s <= 200; s++) if (sim(k, s * 7919) === 'won') w++; return w / 200; };

test('難しさ: 毎ターン5コンボなら勝てて、3コンボだとたまに負け、1コンボでは勝てない', () => {
  const r5 = winRate(5), r3 = winRate(3), r1 = winRate(1);
  assert.ok(r5 >= 0.9, `5コンボ ${r5}`);
  assert.ok(r3 >= 0.4 && r3 <= 0.85, `3コンボ ${r3}`);
  assert.ok(r1 <= 0.05, `1コンボ ${r1}`);
});

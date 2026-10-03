/**
 * ガチャ・手持ち・編成・報酬（ms-meta）と、ガチャで仲間になるキャラの定義。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, seededRandom } from './helpers.mjs';
import { play } from './bot.mjs';

const mods = loadAll();
const { B, D, M } = mods;
const BT = B.Battle;
const clone = (x) => JSON.parse(JSON.stringify(x));
const fresh = () => clone(M.newSave(D));

const ABILITIES = ['antiDamageWall', 'antiGravity', 'superAntiDamageWall', 'superAntiGravity', 'antiWarp', 'antiBlock',
  'antiMagic', 'flying', 'mineSweeper', 'ssAccel', 'lastStand',
  'critical', 'drain', 'wallBoost', 'comboBoost', 'weakKiller', 'bossKiller', 'guard', 'speedUp', 'healTouch', 'counter'];

// ------------------------------------------------------------ キャラの定義
test('キャラは R・SR が15体ずつ、SSR が25体、LR が5体の60体。最初の5体がモンスト、6体がパズルの編成', () => {
  assert.equal(D.roster.length, 60);
  assert.equal(new Set(D.roster.map((u) => u.id)).size, 60);
  const want = { 3: 15, 4: 15, 5: 25, 6: 5 };
  for (const r of [3, 4, 5, 6]) assert.equal(D.roster.filter((u) => u.rarity === r).length, want[r], `★${r}`);
  // LR は5属性1体ずつで、特性と友情が7つ
  const lr = D.roster.filter((u) => u.rarity === 6);
  assert.equal(new Set(lr.map((u) => u.element)).size, 5);
  for (const u of lr) { assert.equal(u.abilities.length, 7, u.id); assert.equal(u.combos.length, 7, u.id); }
  assert.equal(D.roster.slice(0, 5).map((u) => u.id).join(), D.units.map((u) => u.id).join());
  assert.equal(D.meta.starter.join(), 'A,B,C,D,E,F');
  assert.equal(D.slots.length, 5);
  assert.equal(D.puzzleSize, 6);
  const EL = ['fire', 'water', 'wood', 'light', 'dark'];
  for (const u of D.roster) {
    const w = u.id;
    assert.ok(u.title && [3, 4, 5, 6].includes(u.rarity), `${w} の名前とレア度`);
    assert.ok(EL.includes(u.element) && ['reflect', 'pierce'].includes(u.shot), w);
    assert.ok(u.atk > 0 && u.hp > 0 && u.r === 30 && u.colors.length === 3 && u.accent, w);
    for (const a of u.abilities || []) assert.ok(ABILITIES.includes(a), `${w} の ${a}`);
    for (const k of u.killers || []) assert.ok((k.race || k.element) && (!k.rank || BT.KILLER[k.rank]), w);
    assert.ok(u.combos.length === (u.rarity === 6 ? 7 : 3) && u.combos.every((c) => c.power > 0), `${w} の友情`);
    assert.ok(u.ss && u.ss.name && u.ss.turns > 0 && (u.ss.launch || u.ss.atk || u.ss.onStop || u.ss.comboTwice), `${w} の SS`);
  }
  for (const r of [3, 4, 5, 6]) assert.ok(D.roster.some((u) => u.rarity === r), `★${r} がいる`);
  assert.equal(new Set(D.roster.map((u) => u.element)).size, 5, '5属性そろっている');
});

test('レア度が高いほど強い（★ごとの攻撃力と HP の平均が上がる）', () => {
  const avg = (r, k) => { const xs = D.roster.filter((u) => u.rarity === r).map((u) => u[k]); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  for (const k of ['atk', 'hp']) assert.ok(avg(3, k) < avg(4, k) && avg(4, k) < avg(5, k) && avg(5, k) < avg(6, k), k);
});

// ------------------------------------------------------------ 確率
test('確率の表: 合計100%で、全キャラがちょうど1回ずつ入っている（表示も抽選もこの表を使う）', () => {
  const t = M.rateTable(D);
  assert.ok(Math.abs(t.reduce((a, x) => a + x.rate, 0) - 1) < 1e-12);
  const ids = t.flatMap((x) => x.units);
  assert.equal(ids.length, D.roster.length);
  assert.equal(new Set(ids).size, D.roster.length);
  for (const x of t) for (const id of x.units) assert.equal(M.byId(D, id).rarity, x.rarity);
});

test('たくさん引くと、出たレア度の割合が表示の確率に近い', () => {
  const s = fresh();
  s.gems = 1e9;
  const rng = seededRandom(7);
  const count = { 3: 0, 4: 0, 5: 0, 6: 0 }, per = {};
  const N = 30000;
  for (let i = 0; i < N; i++) {
    const r = M.pull(s, D, 1, rng).results[0];
    count[r.rarity]++;
    per[r.id] = (per[r.id] || 0) + 1;
  }
  for (const x of D.gacha.rates) {
    const got = count[x.rarity] / N;
    assert.ok(Math.abs(got - x.rate) < 0.01, `★${x.rarity}: ${got} / ${x.rate}`);
    const units = D.roster.filter((u) => u.rarity === x.rarity);
    for (const u of units) {
      const g = per[u.id] / N, want = x.rate / units.length;
      assert.ok(Math.abs(g - want) < Math.max(0.006, want * 0.15), `${u.id}: ${g} / ${want}`);
    }
  }
});

// ------------------------------------------------------------ 引く
test('1回は5ジェム、10連は50ジェム。足りなければ何も変わらない', () => {
  const s = fresh();
  assert.equal(s.gems, D.meta.startGems);
  const r1 = M.pull(s, D, 1, seededRandom(1));
  assert.equal(r1.cost, 5);
  assert.equal(s.gems, D.meta.startGems - 5);
  assert.equal(r1.results.length, 1);
  const before = JSON.stringify(s);
  const r10 = M.pull(s, D, 10, seededRandom(2));
  assert.equal(r10.error, 'gems');
  assert.equal(JSON.stringify(s), before, 'ジェムが足りないときは何も変えない');
  s.gems = 50;
  const ok = M.pull(s, D, 10, seededRandom(3));
  assert.equal(ok.results.length, 10);
  assert.equal(s.gems, 0);
  assert.equal(s.pulls, 11);
});

test('同じ乱数なら同じ結果（抽選は乱数を外から受け取る）', () => {
  const a = fresh(), b = fresh();
  a.gems = b.gems = 100;
  const ra = M.pull(a, D, 10, seededRandom(99)).results.map((x) => x.id).join();
  const rb = M.pull(b, D, 10, seededRandom(99)).results.map((x) => x.id).join();
  assert.equal(ra, rb);
});

test('10連の10体目は、それまでに ★4 以上が出ていなければ ★4 以上になる', () => {
  const s = fresh();
  s.gems = 50;
  const worst = () => 0.99;   // いつも ★3 が出る乱数
  const r = M.pull(s, D, 10, worst).results;
  assert.ok(r.slice(0, 9).every((x) => x.rarity === 3));
  assert.ok(r[9].rarity >= 4 && r[9].guaranteed);
  const s2 = fresh();
  s2.gems = 5;
  assert.equal(M.pull(s2, D, 1, worst).results[0].rarity, 3, '1回引きには確定がない');
});

test('新しいキャラは手持ちに入り、同じキャラはラックが上がる（上限あり）', () => {
  const s = fresh();
  s.gems = 1e6;
  const always = (id) => {
    // 指定したキャラが出る乱数を作る（レア度の区間の中央 → そのレア度の中の位置）
    const t = M.rateTable(D);
    let acc = 0, a = 0, b = 0;
    for (const x of t) { const i = x.units.indexOf(id); if (i >= 0) { a = (acc + x.rate / 2); b = (i + 0.5) / x.units.length; } acc += x.rate; }
    let n = 0;
    return () => (n++ % 2 === 0 ? a : b);
  };
  const r = M.pull(s, D, 1, always('K')).results[0];
  assert.ok(r.id === 'K' && r.isNew && s.owned.K.luck === 0);
  const r2 = M.pull(s, D, 1, always('K')).results[0];
  assert.ok(!r2.isNew && r2.luck === 1);
  s.owned.K.luck = D.gacha.luckMax;
  M.pull(s, D, 1, always('K'));
  assert.equal(s.owned.K.luck, D.gacha.luckMax);
  const rA = M.pull(s, D, 1, always('A')).results[0];
  assert.ok(!rA.isNew && s.owned.A.luck === 1, '最初からいるキャラもラックが上がる');
});

// ------------------------------------------------------------ 報酬
test('クリア報酬: 勝つたびに同じだけもらえる（クリアするたびに減らない）。負けても少しもらえる', () => {
  const s = fresh();
  const g0 = s.gems;
  assert.deepEqual(clone(M.reward(s, D, 0, false)), { gems: D.meta.rewards[0].lose, first: false, total: g0 + D.meta.rewards[0].lose });
  const first = M.reward(s, D, 0, true);
  assert.ok(first.first && first.gems === D.meta.rewards[0].first);
  const again = M.reward(s, D, 0, true);
  assert.ok(!again.first && again.gems === D.meta.rewards[0].first, '2回目も減らない');
  assert.ok(M.reward(s, D, 1, true).first, 'ステージごとに初回がある');
  assert.ok(s.cleared.s0 && s.cleared.s1);
  for (const r of D.meta.rewards) assert.ok(r.first > r.lose && r.lose >= 0);
  assert.ok(D.meta.rewards[0].first + D.meta.startGems >= D.gacha.cost10, '最初のクリアで10連が引ける');
});

// ------------------------------------------------------------ 編成
test('編成はモンスト5体・パズル6体。手持ちの重ならないキャラだけ。枠の位置に並び、ラックで強くなる（元の定義は変えない）', () => {
  const s = fresh();
  assert.equal(M.setParty(s, D, ['A', 'B', 'C', 'D']), false, '4体');
  assert.equal(M.setParty(s, D, ['A', 'A', 'C', 'D', 'E']), false, '重複');
  assert.equal(M.setParty(s, D, ['A', 'B', 'C', 'D', 'K']), false, '持っていない');
  s.owned.K = { luck: 25 };
  assert.equal(M.setParty(s, D, ['K', 'B', 'C', 'A', 'E']), true);
  const team = M.partyUnits(s, D);
  assert.equal(team.map((u) => u.id).join(), 'K,B,C,A,E');
  team.forEach((u, i) => { assert.equal(u.x, D.slots[i].x); assert.equal(u.y, D.slots[i].y); });
  const k = M.byId(D, 'K');
  assert.equal(team[0].atk, Math.round(k.atk * 1.1), 'ラックの強化は最大10%');
  assert.equal(team[1].atk, M.byId(D, 'B').atk);
  assert.equal(k.x, undefined, 'ガチャのキャラの定義には位置を書き足さない');
  assert.equal(D.units[3].x, D.slots[3].x, 'A は4番目の枠に移っても元の定義は変わらない');
  // パズルは6体で、位置は持たない
  assert.equal(s.pzParty.join(), 'A,B,C,D,E,F');
  assert.equal(M.setParty(s, D, ['K', 'B', 'C', 'A', 'E'], 'puzzle'), false, 'パズルは6体');
  assert.equal(M.setParty(s, D, ['K', 'B', 'C', 'A', 'E', 'F'], 'puzzle'), true);
  const pt = M.partyUnits(s, D, 'puzzle');
  assert.equal(pt.map((u) => u.id).join(), 'K,B,C,A,E,F');
  assert.equal(pt[0].x, undefined);
  assert.equal(s.party.join(), 'K,B,C,A,E', 'モンストの編成はそのまま');
});

test('保存データ: 壊れていたら最初から。知らないキャラや重なった編成は直す。前の4体編成は5体・6体に埋める', () => {
  assert.deepEqual(clone(M.load('{bad json', D)), fresh());
  assert.deepEqual(clone(M.load(null, D)), fresh());
  assert.deepEqual(clone(M.load({ v: 999, gems: 5000 }, D)), fresh(), '版が違う');
  const s = M.load(JSON.stringify({ v: 1, gems: -5, pulls: 3, owned: { A: { luck: 3 }, K: { luck: 500 }, ZZ: { luck: 1 } },
    party: ['K', 'K', 'ZZ', 'A'], cleared: { s0: true } }), D);
  assert.equal(s.gems, 0);
  assert.equal(s.owned.K.luck, D.gacha.luckMax);
  assert.ok(!s.owned.ZZ, '知らないキャラは消す');
  assert.ok(s.owned.B && s.owned.F, '最初の6体はいつも持っている');
  assert.equal(s.party.length, 5);
  assert.equal(new Set(s.party).size, 5);
  assert.equal(s.party.slice(0, 2).join(), 'K,A');
  assert.equal(s.pzParty.length, 6);
  assert.ok(s.cleared.s0);
  const round = M.load(JSON.stringify(s), D);
  assert.deepEqual(clone(round), clone(s), '保存して読み直しても同じ');
});

// ------------------------------------------------------------ ガチャのキャラで遊べるか
const withParty = (ids) => {
  const s = fresh();
  for (const id of ids) s.owned[id] = { luck: 0 };
  M.setParty(s, D, ids);
  return { ...mods, D: { ...D, units: M.partyUnits(s, D) } };
};

test('★3 だけの編成でも、上手なプレイヤーならはじまりの草原をクリアできる', () => {
  const r = play(withParty(['E', 'F', 'G', 'H', 'M']), { policy: 'greedy' });
  assert.equal(r.state, 'won', `${r.state} wave ${r.wave}`);
});

test('ガチャの ★4・★5 を入れた編成で、上手なプレイヤーはからくりの塔をクリアできる', () => {
  const r = play(withParty(['L', 'J', 'I', 'K', 'AH']), { policy: 'greedy', stage: 1 });
  assert.equal(r.state, 'won', `${r.state} wave ${r.wave}`);
});

// ------------------------------------------------------------ ジェムの手に入りやすさ
test('ログインボーナス: 1日1回だけ。日付が変わるとまたもらえる。保存しても残る', () => {
  const s = fresh();
  const g0 = s.gems;
  assert.equal(M.claimDaily(s, D, '2026-09-30').gems, D.meta.daily);
  assert.equal(M.claimDaily(s, D, '2026-09-30').gems, 0, '同じ日は0');
  assert.equal(s.gems, g0 + D.meta.daily);
  const back = M.load(JSON.stringify(s), D);
  assert.equal(back.daily, '2026-09-30');
  assert.equal(M.claimDaily(back, D, '2026-09-30').gems, 0, '読み直しても同じ日は0');
  assert.equal(M.claimDaily(back, D, '2026-10-01').gems, D.meta.daily);
  assert.equal(M.load(JSON.stringify({ ...s, daily: 'x<script>' }), D).daily, '', '日付でなければ捨てる');
});

test('ステージは5つとも報酬があり、後のステージほど多い。ミニゲームにも報酬がある', () => {
  assert.equal(D.meta.rewards.length, D.stages.length);
  for (let i = 1; i < D.meta.rewards.length; i++) assert.ok(D.meta.rewards[i].first > D.meta.rewards[i - 1].first, `ステージ${i}`);
  const s = fresh();
  const p = M.puzzleReward(s, D, true);
  assert.ok(p.first && p.gems === D.meta.puzzle.first && s.cleared.puzzle);
  assert.equal(M.puzzleReward(s, D, true).gems, D.meta.puzzle.first);
  assert.equal(M.puzzleReward(s, D, false).gems, D.meta.puzzle.lose);
  // 最初のジェム＋ログインボーナスで10連が引ける。はじまりの草原の初回クリアでもう1回近く引ける
  assert.ok(D.meta.startGems + D.meta.daily >= D.gacha.cost10);
});

// ------------------------------------------------------------ 重複・合成・コード
test('同じキャラは何体でも持てる。2体目からはストックになり、合成で +1（最大 +5）。攻撃力と HP が上がる', () => {
  const s = fresh();
  s.gems = 1e6;
  const t = M.rateTable(D);
  // A が出る乱数
  let a = 0, b = 0, acc = 0;
  for (const x of t) { const i = x.units.indexOf('A'); if (i >= 0) { a = acc + x.rate / 2; b = (i + 0.5) / x.units.length; } acc += x.rate; }
  let n = 0;
  const rng = () => (n++ % 2 === 0 ? a : b);
  for (let i = 0; i < 7; i++) M.pull(s, D, 1, rng);
  assert.equal(s.owned.A.stock, 7);
  const base = M.partyUnits(s, D)[0];
  for (let i = 0; i < 5; i++) assert.equal(M.fuse(s, D, 'A'), true);
  assert.equal(M.fuse(s, D, 'A'), false, '+5 まで');
  assert.equal(s.owned.A.plus, 5);
  assert.equal(s.owned.A.stock, 2);
  const after = M.partyUnits(s, D)[0];
  assert.ok(after.atk > base.atk * 1.7 && after.hp > base.hp * 1.7, `${base.atk} → ${after.atk}`);
  assert.equal(M.fuse(s, D, 'B'), false, 'ストックが無ければ合成できない');
  const back = M.load(JSON.stringify(s), D);
  assert.deepEqual(clone(back.owned.A), clone(s.owned.A), '保存しても残る');
});

test('ガチャのコード: 「開発者」でジェムが無限になり、ほかのコードは何も起こらない', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  for (const code of ['', 'abc', 'かいはつしゃ', '開発']) {
    assert.equal(M.redeemCode(s, code).ok, false, code);
    assert.equal(JSON.stringify(s), before);
  }
  const r = M.redeemCode(s, ' 開発者 ');
  assert.ok(r.ok && s.infinite);
  s.gems = 0;
  assert.equal(M.pull(s, D, 10, seededRandom(1)).results.length, 10, 'ジェムが0でも引ける');
  assert.equal(s.gems, 0);
  assert.equal(M.load(JSON.stringify(s), D).infinite, true);
});

// ------------------------------------------------------------ おすすめ編成
test('おすすめ編成: 手持ちから重ならない5体。ステージのギミックの対策と、属性の有利なキャラを選ぶ', () => {
  const s = fresh();
  for (const u of D.roster) s.owned[u.id] = { luck: 0, plus: 0, stock: 0 };
  const volcano = M.recommend(s, D, 'strike', 2);
  assert.equal(volcano.ids.length, 5);
  assert.equal(new Set(volcano.ids).size, 5);
  const els = volcano.ids.map((id) => M.byId(D, id).element);
  assert.ok(els.filter((e) => e === 'water').length >= 2, `火のステージは水を入れる: ${els}`);
  assert.ok(!els.includes('wood'), '火に不利な木は入れない');
  // LR を持っていなければ、水がいちばん多くなる
  const noLr = fresh();
  for (const u of D.roster) if (u.rarity < 6) noLr.owned[u.id] = { luck: 0, plus: 0, stock: 0 };
  const els2 = M.recommend(noLr, D, 'strike', 2).ids.map((id) => M.byId(D, id).element);
  assert.ok(els2.filter((e) => e === 'water').length >= 3, `LR なし: ${els2}`);
  // 手持ちが最初の6体だけなら、その中から選ぶ
  const f = fresh();
  const few = M.recommend(f, D, 'strike', 0);
  assert.ok(few.ids.every((id) => f.owned[id]));
  assert.equal(M.setParty(f, D, few.ids), true, 'そのまま編成にできる');
  // ギミックの対策: 古城（魔法陣・地雷・ワープ・重力・電気の壁・ブロック）は対策を持つキャラが多い
  const castle = M.recommend(s, D, 'strike', 4);
  const covered = M.stageProfile(D, D.stages[4]).gimmicks.filter((g) => castle.ids.some((id) => {
    const u = M.byId(D, id);
    return D.counters[g].some((a) => (u.abilities || []).includes(a) || (u.gauge || []).includes(a));
  }));
  assert.ok(covered.length >= 5, `対策できるギミック ${covered.join()}`);
});

test('パズルのおすすめ編成は6体で、先頭（リーダー）はダンジョンの敵に有利な属性', () => {
  const s = fresh();
  for (const u of D.roster) s.owned[u.id] = { luck: 0, plus: 0, stock: 0 };
  const fire = M.recommend(s, D, 'puzzle', 1);
  assert.equal(fire.ids.length, 6);
  assert.equal(M.byId(D, fire.ids[0]).element, 'water');
  assert.equal(M.setParty(s, D, fire.ids, 'puzzle'), true);
});

test('パズルのダンジョンは5つ。後ほどフロアが多く報酬も多い。報酬はダンジョンごとに記録する', () => {
  const dg = D.puzzle.dungeons;
  assert.equal(dg.length, 5);
  for (let i = 1; i < dg.length; i++) assert.ok(dg[i].reward > dg[i - 1].reward && dg[i].floors.length >= dg[i - 1].floors.length);
  for (const d of dg) assert.ok(d.floors[d.floors.length - 1].some((e) => e.boss), `${d.name} の最後はボス`);
  const s = fresh();
  const r1 = M.puzzleReward(s, D, true, 2);
  assert.ok(r1.first && r1.gems === dg[2].reward && s.cleared.puzzle2);
  assert.equal(M.puzzleReward(s, D, true, 2).gems, dg[2].reward, '何回でも同じだけ');
  assert.equal(M.puzzleReward(s, D, false, 4).gems, dg[4].lose);
});

// ------------------------------------------------------------ 難しさ（イージー・ノーマル・ディフィカルト・ゴッド）
test('モード: 4段階。上の段ほど敵の HP と攻撃力が増え、ディフィカルト以上はサポートアイテムも増える（元の定義は変えない）', () => {
  assert.deepEqual(Object.keys(D.modes), ['easy', 'normal', 'difficult', 'god']);
  for (let i = 0; i < D.stages.length; i++) {
    const base = D.stages[i];
    const st = Object.fromEntries(Object.keys(D.modes).map((m) => [m, M.stageFor(D, i, m)]));
    base.waves.forEach((w, wi) => w.enemies.forEach((e, ei) => {
      const hp = (m) => st[m].waves[wi].enemies[ei].hp, atk = (m) => st[m].waves[wi].enemies[ei].atk;
      assert.ok(hp('easy') < hp('normal') && hp('normal') < hp('difficult') && hp('difficult') < hp('god'), `${e.id}`);
      assert.ok(atk('easy') <= atk('normal') && atk('normal') <= atk('difficult') && atk('difficult') < atk('god'), `${e.id}`);
    }));
    const items = (x) => x.waves.reduce((a, w) => a + (w.items || []).length, 0);
    const h = st.difficult;
    assert.ok(items(h) >= items(base) + base.waves.length * 2, `${base.name}: ディフィカルトはアイテムが多い`);
    // 足したアイテムは味方の枠・敵・ギミックと重ならず、id が重ならない
    const ids = new Set();
    for (const w of h.waves) for (const it of w.items) {
      assert.ok(!ids.has(it.id)); ids.add(it.id);
      for (const s of D.slots) assert.ok(Math.hypot(s.x - it.x, s.y - it.y) > 48, `${it.id} が枠に近い`);
    }
  }
  assert.equal(D.stages[0].waves[0].enemies[0].hp, M.stageFor(D, 0, 'difficult').waves[0].enemies[0].hp / D.modes.difficult.hp, '元の定義はそのまま');
});

test('モード: 報酬の倍率とクリアの記録はモードごと。前の版のハードはディフィカルトとして読む', () => {
  const s = fresh();
  const n = M.reward(s, D, 1, true, 'normal');
  const h = M.reward(s, D, 1, true, 'difficult');
  const g = M.reward(s, D, 1, true, 'god');
  const e = M.reward(s, D, 1, true, 'easy');
  assert.equal(h.gems, n.gems * 2);
  assert.equal(g.gems, n.gems * 5);
  assert.equal(e.gems, Math.round(n.gems * 0.5));
  assert.ok(s.cleared.s1 && s.cleared.s1h && s.cleared.s1g && s.cleared.s1e);
  assert.ok(h.first, 'ディフィカルトの初クリア');
  assert.equal(M.load(JSON.stringify({ ...s, mode: 'hard' }), D).mode, 'difficult');
  assert.equal(M.load(JSON.stringify({ ...s, mode: 'god' }), D).mode, 'god');
  assert.equal(M.load(JSON.stringify({ ...s, mode: 'x' }), D).mode, 'normal');
});

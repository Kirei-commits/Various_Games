/*
 * バトル（RPGモード）の進行。画面や音声には触らず、時間（dt）と乱数を引数で受け取るので Node でテストできる。
 *
 * - 敵（単語）が画面の上から近づいてくる。一番近い敵が「狙う敵」で、その単語に答えると攻撃できる。
 * - 正解で攻撃（コンボで得点アップ）。間違えると、その敵が一気に近づく。
 * - 敵が自分まで届くと HP が減る（ボスは2）。HP が 0 になったら終わり。
 * - ステージ: 章の単語から敵10体 → 最後にボス（HP3。攻撃のたびに別の単語を出してくる）。倒せばクリア。
 * - エンドレス: 8体倒すごとにレベルが上がり、敵が速く・多くなる。HP が尽きるまで続く。
 *
 * 進行の関数（tick / attack）は、毎フレーム呼ぶため battle オブジェクトを直接書き換える。
 */
import { grant } from "./gacha.js";

export const PLAYER_HP = 5;
export const STAGE_ENEMIES = 10;
export const BOSS_HP = 3;
export const KILL_POINTS = 5;
export const CLEAR_POINTS = 50;
export const BEST_POINTS = 100;
export const BATTLE_DAILY_CAP = 1000;
const LEVEL_UP_KILLS = 8;

/** 答え方ごとの、敵が上から下まで届く時間（ms）と、次の敵が出るまでの間隔 */
export const PACE = {
  choice: { reach: 9000, interval: 3000 },
  type: { reach: 18000, interval: 5500 },
  voice: { reach: 15000, interval: 5000 },
};

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * バトルを始める。
 * @param opts { mode: "stage"|"endless", items, answer: "choice"|"type"|"voice", direction, key, rng }
 *   items はステージなら章の問題、エンドレスなら出題範囲の問題
 */
export function createBattle({ mode = "stage", items, answer = "choice", direction = "en-ja", key = "", rng = Math.random }) {
  const shuffled = shuffle(items, rng);
  const stage = mode === "stage";
  return {
    mode,
    answer,
    direction,
    key,
    pool: items,
    queue: stage ? shuffled.slice(0, STAGE_ENEMIES) : shuffled,
    bossWords: stage ? shuffled.slice(STAGE_ENEMIES, STAGE_ENEMIES + BOSS_HP) : [],
    bossSpawned: false,
    enemies: [],
    hp: PLAYER_HP,
    maxHp: PLAYER_HP,
    score: 0,
    combo: 0,
    maxCombo: 0,
    kills: 0,
    level: 1,
    elapsed: 0,
    nextSpawn: 0,
    uid: 0,
    results: {}, // 問題ID → 最後まで間違えずに倒せたか
    over: false,
    cleared: false,
    lastEvent: null, // { type: "kill"|"hit"|"damage"|"wrong"|"boss", at, ... } 画面の演出用
  };
}

const speedOf = (b) => 1 + (b.mode === "endless" ? (b.level - 1) * 0.15 : 0);
const maxOnField = (b) => (b.mode === "endless" ? Math.min(2 + Math.floor(b.level / 2), 5) : 3);

/** 敵が出る位置（3列）。上のほうにいる敵と重ならない列を選ぶ */
const LANES = [0.2, 0.5, 0.8];

function spawn(b, item, rng, boss = false) {
  b.uid += 1;
  const busy = new Set(b.enemies.filter((e) => e.y < 0.35).map((e) => e.lane));
  const free = LANES.map((_, i) => i).filter((i) => !busy.has(i));
  const lane = boss ? 1 : free.length ? free[Math.floor(rng() * free.length)] : Math.floor(rng() * LANES.length);
  b.enemies.push({ uid: b.uid, item, y: 0, lane, x: LANES[lane], hp: boss ? BOSS_HP : 1, maxHp: boss ? BOSS_HP : 1, boss });
}

/**
 * 時間を進める。
 * @param dt 経過時間（ms）
 * @param moveScale 敵の速さの倍率（テスト用。0 なら止まる）
 */
export function tick(b, dt, rng = Math.random, moveScale = 1) {
  if (b.over) return b;
  b.elapsed += dt;
  const pace = PACE[b.answer] || PACE.choice;
  const speed = speedOf(b);

  // 敵を出す
  if (b.elapsed >= b.nextSpawn && b.enemies.length < maxOnField(b)) {
    if (b.mode === "endless") {
      if (!b.queue.length) b.queue = shuffle(b.pool, rng);
      spawn(b, b.queue.shift(), rng);
      b.nextSpawn = b.elapsed + pace.interval / speed;
    } else if (b.queue.length) {
      spawn(b, b.queue.shift(), rng);
      b.nextSpawn = b.elapsed + pace.interval;
    }
  }
  // ステージ: ザコをすべて片づけたらボス
  if (b.mode === "stage" && !b.queue.length && !b.enemies.length && !b.bossSpawned) {
    b.bossSpawned = true;
    spawn(b, b.bossWords[0] || b.pool[0], rng, true);
    b.lastEvent = { type: "boss", at: b.elapsed };
  }

  // 敵が近づく
  for (const e of b.enemies) e.y += (dt / pace.reach) * speed * (e.boss ? 0.6 : 1) * moveScale;
  const reached = b.enemies.filter((e) => e.y >= 1);
  for (const e of reached) {
    b.hp = Math.max(0, b.hp - (e.boss ? 2 : 1));
    b.combo = 0;
    b.results[e.item.id] = false;
    b.lastEvent = { type: "damage", at: b.elapsed, uid: e.uid };
    if (e.boss) e.y = 0; // ボスは倒すまで何度でも来る
  }
  b.enemies = b.enemies.filter((e) => e.boss || e.y < 1);
  if (b.hp <= 0) b.over = true;
  return b;
}

/** 狙う敵（一番近い敵） */
export function target(b) {
  return b.enemies.reduce((best, e) => (!best || e.y > best.y ? e : best), null);
}

/**
 * 狙う敵に答える。correct なら攻撃、違えば敵が近づく。
 * @returns 答えた問題（正解の表示や読み上げに使う）
 */
export function attack(b, correct, rng = Math.random) {
  const t = target(b);
  if (!t || b.over) return null;
  const item = t.item;
  if (!correct) {
    b.combo = 0;
    b.results[item.id] = false;
    t.y = Math.min(0.97, t.y + 0.22);
    b.lastEvent = { type: "wrong", at: b.elapsed, uid: t.uid, item };
    return item;
  }
  if (!(item.id in b.results)) b.results[item.id] = true;
  b.combo += 1;
  b.maxCombo = Math.max(b.maxCombo, b.combo);
  b.score += 10 * (1 + Math.floor((b.combo - 1) / 5)) * (t.boss ? 3 : 1);
  t.hp -= 1;
  if (t.hp > 0) {
    // ボスは攻撃されるたびに別の単語に変わり、少し押し戻される
    const next = b.bossWords[t.maxHp - t.hp] || b.pool[Math.floor(rng() * b.pool.length)];
    t.item = next;
    t.y = Math.max(0, t.y - 0.15);
    b.lastEvent = { type: "hit", at: b.elapsed, uid: t.uid, item };
    return item;
  }
  b.enemies = b.enemies.filter((e) => e !== t);
  b.kills += 1;
  b.lastEvent = { type: "kill", at: b.elapsed, uid: t.uid, item, boss: t.boss };
  if (b.mode === "endless") b.level = 1 + Math.floor(b.kills / LEVEL_UP_KILLS);
  if (t.boss) {
    b.cleared = true;
    b.over = true;
  }
  return item;
}

/** 途中でやめる */
export function quit(b) {
  b.over = true;
  return b;
}

/** クリア時の星（ノーダメージ3、HP半分以上2、それ以外1） */
export const starsOf = (b) => (b.cleared ? (b.hp >= b.maxHp ? 3 : b.hp >= Math.ceil(b.maxHp / 2) ? 2 : 1) : 0);

/** 答えた問題の結果（テスト結果と同じ形: 苦手の記録に使う） */
export const resultsOf = (b) => Object.entries(b.results).map(([id, correct]) => ({ id, correct }));

// ---------------------------------------------------------------------------
// 記録と報酬
// ---------------------------------------------------------------------------

export const initialBattle = () => ({
  stars: {}, // ステージのキー（章ID@向き）→ 最高の星
  best: {}, // エンドレスのキー（範囲@向き）→ 最高得点
  kills: 0,
  clears: 0,
  ticketStages: [], // 星3のレアチケットを受け取ったステージ
  day: null,
  earned: 0, // その日にバトルでもらったポイント
});

/**
 * バトルの結果を記録し、ガチャのポイント・チケットを渡す。
 * - 1体 5pt、ステージクリア +50pt、エンドレスの最高得点更新 +100pt（1日 1000pt まで）
 * - ステージを初めて星3でクリアしたら、レアチケット1枚
 * @returns {{ state, reward: { points, tickets, stars, newBest } }}
 */
export function applyBattle(state, b, today) {
  const rec = { ...initialBattle(), ...state.battle };
  const stars = starsOf(b);
  const stage = b.mode === "stage";
  const newBest = !stage && b.score > (rec.best[b.key] || 0);
  let points = b.kills * KILL_POINTS + (b.cleared ? CLEAR_POINTS : 0) + (newBest && b.score > 0 ? BEST_POINTS : 0);
  const earned = rec.day === today ? rec.earned : 0;
  points = Math.max(0, Math.min(points, BATTLE_DAILY_CAP - earned));
  const tickets = stage && stars === 3 && !rec.ticketStages.includes(b.key) ? 1 : 0;
  const next = {
    ...rec,
    stars: stage ? { ...rec.stars, [b.key]: Math.max(rec.stars[b.key] || 0, stars) } : rec.stars,
    best: newBest ? { ...rec.best, [b.key]: b.score } : rec.best,
    kills: rec.kills + b.kills,
    clears: rec.clears + (b.cleared ? 1 : 0),
    ticketStages: tickets ? [...rec.ticketStages, b.key] : rec.ticketStages,
    day: today,
    earned: earned + points,
  };
  return { state: grant({ ...state, battle: next }, { points, tickets }), reward: { points, tickets, stars, newBest } };
}

const nonNeg = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const numberMap = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).map(([k, v]) => [k, nonNeg(v)]));

export function restoreBattle(saved) {
  const base = initialBattle();
  if (!saved || typeof saved !== "object") return base;
  return {
    stars: numberMap(saved.stars),
    best: numberMap(saved.best),
    kills: nonNeg(saved.kills),
    clears: nonNeg(saved.clears),
    ticketStages: Array.isArray(saved.ticketStages) ? [...new Set(saved.ticketStages)] : [],
    day: typeof saved.day === "string" ? saved.day : null,
    earned: nonNeg(saved.earned),
  };
}

/** 2台の端末の記録を統合する（星・最高得点・回数は大きい方、チケット受け取り済みは和集合） */
export function mergeBattle(a, b) {
  const x = restoreBattle(a);
  const y = restoreBattle(b);
  const maxMap = (p, q) => {
    const out = { ...p };
    for (const [k, v] of Object.entries(q)) out[k] = Math.max(out[k] || 0, v);
    return out;
  };
  const newer = (y.day || "") >= (x.day || "") ? y : x;
  return {
    stars: maxMap(x.stars, y.stars),
    best: maxMap(x.best, y.best),
    kills: Math.max(x.kills, y.kills),
    clears: Math.max(x.clears, y.clears),
    ticketStages: [...new Set([...x.ticketStages, ...y.ticketStages])],
    day: newer.day,
    earned: x.day === y.day ? Math.max(x.earned, y.earned) : newer.earned,
  };
}

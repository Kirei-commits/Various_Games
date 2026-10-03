/*
 * 早押しクイズ（対戦）の進行。画面・通信には触らない純粋関数（Node でテストできる）。
 *
 * - 問題と4択は同時に出る。いちばん早く正解を押した人が1ポイント（早押し）。
 * - 1問に答えられるのは1回だけ（間違えたら、その問題はもう押せない）。
 * - 5秒たつか、全員が答えるか、誰かが正解して少し（GRACE_MS）たつと、答えと解説（REVEAL_MS 表示）→ 次の問題。
 *   正解してすぐ締め切らないのは、通信が遅い人が実は先に押していた場合に順番を正しく決めるため
 *   （速さは各自の端末で、問題が出てから押すまでの時間 ms で比べる）。
 * - 1人モードも同じ部屋の形で動かす（プレイヤーが1人の部屋。答えたらすぐ解説へ、「次の問題へ」で進める）。
 *
 * 部屋（room）はクラウドの1ドキュメント（rooms/{code}）にそのまま保存する形。
 * 書き換えはクラウドのトランザクションの中で、これらの関数を通して行う（同時に押しても壊れない）。
 */
import { makeChoices } from "./logic.js";

export const TIME_MS = 5000; // 1問の制限時間
export const REVEAL_MS = 5000; // 解説を見せる時間
export const GRACE_MS = 700; // 誰かが正解してから締め切るまで（遅い通信の人の答えを待つ）
export const MAX_PLAYERS = 4;
export const COUNTS = [5, 10, 20];
/** この時間より古い部屋は空いているとみなす（同じ番号を作り直せる） */
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
/** 部屋の形の版（アプリの版が違う人どうしで遊ばないため） */
export const PROTOCOL = 1;

/** 部屋の番号（4桁） */
export const roomCode = (rng = Math.random) => String(1000 + Math.floor(rng() * 9000));

/** 問題を作る: [{ id, choices: [id, id, id, id] }]。choices は表示する順（全員同じ順で出す） */
export function makeQuestions(items, pool, count, rng = Math.random) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.min(count, list.length)).map((item) => ({
    id: item.id,
    choices: makeChoices(item, pool.length >= 4 ? pool : items, rng, 4, "japanese").map((c) => c.id),
  }));
}

export function newRoom({ code, uid, name, now = 0, scope = "word", count = 10, solo = false }) {
  return {
    code,
    protocol: PROTOCOL,
    solo,
    status: "lobby", // lobby（待合室）→ playing → done
    scope,
    count,
    createdAt: now,
    players: { [uid]: { name: String(name || "").slice(0, 20), joined: now } },
    questions: [],
    q: 0,
    phase: "question", // question（答える時間）| reveal（答えと解説）
    round: 0, // 「もう一度」のたびに増える（画面が新しいゲームだと気づくため）
    answers: {}, // 問題の番号 → { uid: { c: 選んだ選択肢の番号, ms: 押すまでの時間 } }
  };
}

const err = (error) => ({ error });

/** 部屋に入る（待合室のときだけ。最大 MAX_PLAYERS 人。もう入っていればそのまま） */
export function joinRoom(room, uid, name, now = 0) {
  if (!room) return err("not-found");
  if (room.protocol !== PROTOCOL) return err("version");
  if (room.players[uid]) return { room };
  if (room.status !== "lobby") return err("started");
  if (Object.keys(room.players).length >= MAX_PLAYERS) return err("full");
  return { room: { ...room, players: { ...room.players, [uid]: { name: String(name || "").slice(0, 20), joined: now } } } };
}

/** 部屋を出る（待合室のときは名簿から消す。遊んでいる途中は記録を残すため消さない） */
export function leaveRoom(room, uid) {
  if (!room?.players[uid] || room.status !== "lobby") return { room };
  const players = { ...room.players };
  delete players[uid];
  return { room: { ...room, players } };
}

/** 始める（待合室か、終わったあとの「もう一度」）。questions は makeQuestions で作ったもの */
export function startRoom(room, questions) {
  if (!room) return err("not-found");
  if (room.status === "playing") return { room };
  if (!room.solo && Object.keys(room.players).length < 2) return err("alone");
  if (!questions.length) return err("no-questions");
  return { room: { ...room, status: "playing", questions, q: 0, phase: "question", answers: {}, round: (room.round || 0) + 1 } };
}

const answersOf = (room, q) => room.answers?.[q] || {};
const correctIndex = (room, q) => {
  const qu = room.questions[q];
  return qu ? qu.choices.indexOf(qu.id) : -1;
};

/** 答える（答える時間のあいだに1回だけ） */
export function submitAnswer(room, uid, q, choice, ms) {
  if (!room || room.status !== "playing" || room.q !== q || room.phase !== "question") return err("closed");
  if (!room.players[uid]) return err("not-member");
  if (answersOf(room, q)[uid]) return err("answered");
  const a = { c: choice, ms: Math.max(0, Math.round(ms)) };
  return { room: { ...room, answers: { ...room.answers, [q]: { ...answersOf(room, q), [uid]: a } } } };
}

/**
 * 1問の結果: { correct: 正解の選択肢の番号, results: { uid: { c, ms, ok } }, winner: いちばん早く正解した uid | null }
 */
export function questionResult(room, q) {
  const correct = correctIndex(room, q);
  const results = {};
  let winner = null;
  for (const [uid, a] of Object.entries(answersOf(room, q))) {
    const ok = a.c === correct;
    results[uid] = { ...a, ok };
    if (ok && (!winner || a.ms < results[winner].ms)) winner = uid;
  }
  return { correct, results, winner };
}

/**
 * 答えの時間を締め切ってよいか（どの端末からでも判定できる）。
 * @param elapsed この端末で問題が出てからの時間（ms）
 * @param sinceCorrect この端末で最初の正解に気づいてからの時間（ms。まだなら null）
 */
export function canReveal(room, q, elapsed, sinceCorrect = null) {
  if (!room || room.status !== "playing" || room.q !== q || room.phase !== "question") return false;
  if (elapsed >= TIME_MS) return true;
  const n = Object.keys(room.players).length;
  if (Object.keys(answersOf(room, q)).length >= n) return true;
  return !room.solo && sinceCorrect != null && sinceCorrect >= GRACE_MS;
}

/** 答えと解説へ（すでに進んでいれば何もしない） */
export function reveal(room, q) {
  if (!room || room.status !== "playing" || room.q !== q || room.phase !== "question") return { room };
  return { room: { ...room, phase: "reveal" } };
}

/** 次の問題へ（最後の問題なら終わり）。すでに進んでいれば何もしない */
export function nextQuestion(room, q) {
  if (!room || room.status !== "playing" || room.q !== q || room.phase !== "reveal") return { room };
  if (q + 1 >= room.questions.length) return { room: { ...room, status: "done" } };
  return { room: { ...room, q: q + 1, phase: "question" } };
}

/**
 * 得点: 早押しで取ったポイント（points）、正解の数（correct）、正解したときの時間の合計（ms）。
 * 並びは ポイント → 正解数 → 時間の短い順
 */
export function standings(room) {
  const rows = Object.entries(room.players).map(([uid, p]) => ({ uid, name: p.name, points: 0, correct: 0, ms: 0 }));
  const by = Object.fromEntries(rows.map((r) => [r.uid, r]));
  const upto = room.status === "done" ? room.questions.length : room.phase === "reveal" ? room.q + 1 : room.q;
  for (let q = 0; q < upto; q++) {
    const { results, winner } = questionResult(room, q);
    for (const [uid, r] of Object.entries(results)) {
      if (!by[uid] || !r.ok) continue;
      by[uid].correct += 1;
      by[uid].ms += r.ms;
    }
    if (winner && by[winner]) by[winner].points += 1;
  }
  return rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.ms - b.ms);
}

/** 空いている（古い・終わった）部屋なら、その番号で新しく作ってよい */
export const isStale = (room, now) => !room || room.status === "done" || now - (room.createdAt || 0) > ROOM_TTL_MS;

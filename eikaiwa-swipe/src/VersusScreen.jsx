/*
 * 対戦（早押しクイズ）の画面。進行は src/versus.js、通信は cloud.rooms（src/cloud.js の窓口）だけを使う。
 * - 1人で練習: 端末の中だけで進める（答えるとすぐ解説、「次の問題へ」ボタンあり）
 * - 部屋を作る / 部屋に入る: ログインした人どうしでリアルタイムに対戦（部屋の番号を伝えて入ってもらう）
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Users, User, Crown, LogOut, ArrowRight, RotateCcw, Zap } from "lucide-react";
import { tr } from "./i18n.js";
import {
  TIME_MS,
  REVEAL_MS,
  COUNTS,
  MAX_PLAYERS,
  roomCode,
  makeQuestions,
  newRoom,
  joinRoom,
  leaveRoom,
  startRoom,
  submitAnswer,
  questionResult,
  canReveal,
  answerPatch,
  finishRoom,
  standings,
  isStale,
  versusReward,
  VERSUS_POINTS,
} from "./versus.js";

const SOLO_UID = "me";

const ERRORS = () => ({
  "not-found": tr("その番号の部屋はありません", "No room with that number"),
  started: tr("その部屋はもう始まっています", "That room has already started"),
  full: tr(`満員です（${MAX_PLAYERS}人まで）`, `The room is full (up to ${MAX_PLAYERS})`),
  version: tr("アプリの版が違います。画面上の「更新する」で新しくしてください", "Different app versions. Update the app and try again"),
  alone: tr("2人以上そろうと始められます", "You need at least 2 players to start"),
  taken: tr("部屋を作れませんでした。もう一度試してください", "Couldn't create a room. Please try again"),
  "no-questions": tr("この範囲には問題がありません", "No questions in this range"),
  network: tr("通信できませんでした。接続を確かめてください", "Connection problem. Check your network"),
});
const errorText = (code) => ERRORS()[code] || ERRORS().network;

const firstName = (user) => (user?.name || "").split(/\s+/)[0] || tr("プレイヤー", "Player");

/** 共通: ボタンの見た目 */
const btn = "flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold shadow transition active:scale-95 disabled:opacity-40";

export default function VersusScreen({ header, user, rooms, onSignIn, scopeOptions, itemsFor, byId, triviaOf, speech, sound, active = true, config, setConfig, onReward = () => null }) {
  // 報酬は1ゲームに1回だけ（部屋・作った時刻・何回目のゲームか で見分ける）
  const rewarded = useRef({});
  const claim = useCallback(
    (room, uid) => {
      const key = `${room.code}:${room.createdAt}:${room.round}`;
      if (!rewarded.current[key]) {
        const { points, won } = versusReward(room, uid);
        rewarded.current[key] = { ...(onReward(points) || { points: 0 }), won };
      }
      return rewarded.current[key];
    },
    [onReward]
  );
  const [mode, setMode] = useState("home"); // home | solo | room
  const [solo, setSolo] = useState(null);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const online = !!rooms;
  const items = itemsFor(config.scope);

  const startSolo = () => {
    const room = startRoom(
      newRoom({ code: "solo", uid: SOLO_UID, name: tr("あなた", "You"), solo: true, scope: config.scope, count: config.count, now: Date.now() }),
      makeQuestions(items, items, config.count)
    ).room;
    setSolo(room);
    setMode("solo");
  };

  const createRoom = async () => {
    setBusy(true);
    setError("");
    try {
      for (let i = 0; i < 6; i++) {
        const c = roomCode();
        const now = Date.now();
        const out = await rooms.transact(c, (r) => (isStale(r, now) ? { room: newRoom({ code: c, uid: user.uid, name: firstName(user), now, scope: config.scope, count: config.count }) } : { error: "taken" }));
        if (!out.error) {
          setCode(c);
          setMode("room");
          return;
        }
      }
      setError(errorText("taken"));
    } catch {
      setError(errorText("network"));
    } finally {
      setBusy(false);
    }
  };

  const enterRoom = async (e) => {
    e.preventDefault();
    const c = input.replace(/\D/g, "");
    if (c.length !== 4) return setError(tr("4けたの番号を入れてください", "Enter the 4-digit number"));
    setBusy(true);
    setError("");
    try {
      const out = await rooms.transact(c, (r) => joinRoom(r, user.uid, firstName(user), Date.now()));
      if (out.error) return setError(errorText(out.error));
      setCode(c);
      setMode("room");
    } catch {
      setError(errorText("network"));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "solo" && solo) {
    // 1人のときは端末の中だけで答えを記録する
    const sendAnswer = (q, i, ms) => setSolo((r) => submitAnswer(r, SOLO_UID, q, i, ms).room || r);
    return (
      <Game
        key={solo.createdAt}
        room={solo}
        me={SOLO_UID}
        sendAnswer={sendAnswer}
        onFinished={() => {}}
        byId={byId}
        triviaOf={triviaOf}
        speech={speech}
        sound={sound}
        active={active}
        onRestart={startSolo}
        onExit={() => setMode("home")}
        claim={claim}
      />
    );
  }
  if (mode === "room" && code) {
    return (
      <OnlineRoom
        code={code}
        user={user}
        rooms={rooms}
        itemsFor={itemsFor}
        byId={byId}
        triviaOf={triviaOf}
        speech={speech}
        sound={sound}
        active={active}
        claim={claim}
        onExit={() => {
          setCode("");
          setMode("home");
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6" data-testid="versus-home">
      {header}
      <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs leading-relaxed text-slate-500">
          {tr(
            `英語の意味を4択で早押し！ 問題と選択肢が同時に出るので、わかったらすぐ押そう。${TIME_MS / 1000}秒で答えになり、解説を${REVEAL_MS / 1000}秒見せて次の問題へ。いちばん早く正解した人が1ポイント。`,
            `A quick-fire 4-choice quiz on English meanings! The question and choices appear together — tap as soon as you know. After ${TIME_MS / 1000} seconds the answer is shown, with an explanation for ${REVEAL_MS / 1000} seconds before the next question. The fastest correct answer scores 1 point.`
          )}
          <span className="mt-1 block font-bold text-indigo-600" data-testid="versus-reward-rule">
            {tr(
              `🎁 ガチャポイント: 正解1問 ${VERSUS_POINTS.correct}pt、対戦では早押し1回 +${VERSUS_POINTS.fastest}pt・勝つと +${VERSUS_POINTS.win}pt`,
              `🎁 Gacha points: ${VERSUS_POINTS.correct}pt per correct answer; in versus, +${VERSUS_POINTS.fastest}pt per fastest answer and +${VERSUS_POINTS.win}pt for a win`
            )}
          </span>
        </p>
        <div>
          <label htmlFor="versus-scope" className="text-xs font-bold text-slate-500">
            {tr("出題範囲", "Question range")}
          </label>
          <select
            id="versus-scope"
            value={config.scope}
            onChange={(e) => setConfig({ ...config, scope: e.target.value })}
            className="mt-1 w-full rounded-xl bg-white py-2 pl-3 pr-9 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200"
          >
            {scopeOptions.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500">{tr("問題数", "Number of questions")}</p>
          <div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup">
            {COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={config.count === n}
                onClick={() => setConfig({ ...config, count: n })}
                className={`rounded-lg py-1.5 text-sm font-bold ${config.count === n ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}
              >
                {tr(`${n}問`, `${n}`)}
              </button>
            ))}
          </div>
        </div>
        <button type="button" disabled={items.length < 4} onClick={startSolo} className={`${btn} bg-gradient-to-r from-indigo-500 to-violet-600 text-white`}>
          <User size={18} /> {tr("1人で練習", "Practice solo")}
        </button>
      </div>

      <div className="mt-4 space-y-3 rounded-3xl bg-slate-900 p-5 text-white shadow-lg" data-testid="versus-online">
        <p className="flex items-center gap-2 text-sm font-black">
          <Users size={18} /> {tr("ほかの人と対戦", "Play against others")}
          <span className="text-[11px] font-bold text-white/60">{tr(`（${MAX_PLAYERS}人まで）`, `(up to ${MAX_PLAYERS})`)}</span>
        </p>
        {!online ? (
          <p className="text-xs text-white/70">{tr("この版のアプリでは対戦は使えません。", "Versus isn't available in this version of the app.")}</p>
        ) : !user ? (
          <>
            <p className="text-xs leading-relaxed text-white/70">{tr("対戦には Google でのログインが必要です。", "You need to sign in with Google to play against others.")}</p>
            <button type="button" onClick={onSignIn} className={`${btn} bg-white text-slate-800`}>
              <span className="font-black text-indigo-600">G</span> {tr("Google でログイン", "Sign in with Google")}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || items.length < 4} onClick={createRoom} className={`${btn} bg-gradient-to-r from-rose-500 to-orange-500 text-white`}>
              {tr("部屋を作る", "Create a room")}
            </button>
            <form onSubmit={enterRoom} className="flex gap-2">
              <input
                id="versus-code"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                inputMode="numeric"
                maxLength={4}
                placeholder={tr("部屋の番号（4けた）", "Room number (4 digits)")}
                className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-base font-bold tracking-widest text-slate-900"
              />
              <button type="submit" disabled={busy} className="rounded-2xl bg-amber-400 px-4 text-sm font-extrabold text-amber-950 disabled:opacity-50">
                {tr("入る", "Join")}
              </button>
            </form>
            <p className="text-[11px] leading-relaxed text-white/60">
              {tr("部屋を作ったら、番号を相手に伝えて「入る」で入ってもらいます。", "After creating a room, tell the other player the number so they can join.")}
            </p>
          </>
        )}
        {error && (
          <p className="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-bold text-rose-200" data-testid="versus-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** オンラインの部屋: 部屋を見張って、待合室 → ゲーム → 結果 */
function OnlineRoom({ code, user, rooms, itemsFor, byId, triviaOf, speech, sound, active, onExit, claim }) {
  const [room, setRoom] = useState(undefined); // undefined = 読み込み中、null = 部屋がない
  const [error, setError] = useState("");
  useEffect(() => rooms.watch(code, setRoom, () => setError(errorText("network"))), [rooms, code]);
  const act = useCallback(
    async (fn) => {
      try {
        const out = await rooms.transact(code, fn);
        if (out?.error && !["closed", "answered"].includes(out.error)) setError(errorText(out.error));
        return out;
      } catch {
        setError(errorText("network"));
        return { error: "network" };
      }
    },
    [rooms, code]
  );
  const exit = () => {
    act((r) => leaveRoom(r, user.uid));
    onExit();
  };
  /** 始める（待合室）・もう一度（結果の画面。fromRound のゲームのあと、まだ誰も始めていなければ） */
  const restart = (fromRound = null) => {
    setError("");
    act((r) => {
      const items = itemsFor(r.scope);
      return startRoom(r, makeQuestions(items, items, r.count), fromRound);
    });
  };
  // 答えは自分の欄だけを書く（部屋を読み直さないので、通信の回数が少ない）
  const sendAnswer = (q, i, ms) => {
    if (submitAnswer(room, user.uid, q, i, ms).error) return;
    rooms.update(code, answerPatch(user.uid, q, i, ms)).catch(() => setError(errorText("network")));
  };

  if (room === undefined) return <p className="p-8 text-center text-sm text-slate-500">{tr("読み込み中…", "Loading…")}</p>;
  if (room === null || !room.players?.[user.uid]) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-slate-600">{tr("部屋が見つかりません。", "The room couldn't be found.")}</p>
        <button type="button" onClick={onExit} className={`${btn} mt-4 bg-slate-800 text-white`}>
          {tr("もどる", "Back")}
        </button>
      </div>
    );
  }
  if (room.status === "lobby") {
    const players = Object.entries(room.players).sort((a, b) => a[1].joined - b[1].joined);
    return (
      <div className="h-full overflow-y-auto px-5 pt-6 pb-6" data-testid="versus-lobby">
        <p className="text-center text-xs font-bold text-slate-500">{tr("部屋の番号", "Room number")}</p>
        <p className="text-center text-5xl font-black tracking-[0.3em] text-slate-900" data-testid="versus-code">
          {code}
        </p>
        <p className="mt-1 text-center text-[11px] text-slate-500">{tr("この番号を相手に伝えてください", "Tell the other player this number")}</p>
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <p className="text-xs font-bold text-slate-500">
            {tr("参加者", "Players")} {players.length} / {MAX_PLAYERS}
          </p>
          <ul className="mt-2 space-y-1.5" data-testid="versus-players">
            {players.map(([uid, p]) => (
              <li key={uid} className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <User size={16} className="text-indigo-500" /> {p.name}
                {uid === user.uid && <span className="text-[10px] text-slate-400">{tr("（あなた）", "(you)")}</span>}
              </li>
            ))}
          </ul>
          {players.length < 2 && <p className="mt-2 text-xs text-slate-500">{tr("相手が入るのを待っています…", "Waiting for others to join…")}</p>}
        </div>
        <button type="button" disabled={players.length < 2} onClick={() => restart()} className={`${btn} mt-4 bg-gradient-to-r from-rose-500 to-orange-500 text-white`}>
          <Zap size={18} /> {tr("スタート", "Start")}
        </button>
        <button type="button" onClick={exit} className={`${btn} mt-2 bg-white text-slate-600 ring-1 ring-slate-200`}>
          <LogOut size={16} /> {tr("部屋を出る", "Leave the room")}
        </button>
        {error && <p className="mt-2 text-center text-xs font-bold text-rose-600">{error}</p>}
      </div>
    );
  }
  return (
    <>
      <Game
        room={room}
        me={user.uid}
        sendAnswer={sendAnswer}
        onFinished={(round) => act((r) => finishRoom(r, round))}
        byId={byId}
        triviaOf={triviaOf}
        speech={speech}
        sound={sound}
        active={active}
        onRestart={(round) => restart(round)}
        onExit={exit}
        claim={claim}
      />
      {error && <p className="fixed inset-x-4 top-4 z-50 rounded-xl bg-rose-600 px-3 py-2 text-center text-xs font-bold text-white">{error}</p>}
    </>
  );
}

/**
 * ゲームの画面（1人でも対戦でも同じ）。何問目か・締め切り・次の問題へ は、この端末の時計で進める:
 * 問題が出てから TIME_MS（全員が答えたら・誰かの正解から GRACE_MS たったら、それより早く）で答えと解説、REVEAL_MS 見せたら次へ。
 * クラウドに書くのは自分の答え（sendAnswer）と、最後まで行ったこと（onFinished）だけ
 */
function Game({ room, me, sendAnswer, onFinished, byId, triviaOf, speech, sound, active, onRestart, onExit, claim }) {
  const fresh = () => ({ round: room.round, q: 0, phase: "question", at: performance.now(), correctAt: null, pressed: null, finished: false });
  const [prog, setProg] = useState(fresh);
  // 誰かが「もう一度」を押したら、新しいゲームを最初から
  if (prog.round !== room.round) setProg(fresh());
  const { q, phase } = prog;
  const key = `${prog.round}:${q}:${phase}`;
  const [now, setNow] = useState(() => performance.now());
  const elapsed = Math.max(0, now - prog.at);
  const question = room.questions[q];
  const item = question && byId[question.id];
  const result = questionResult(room, q);
  // 自分の答え（クラウドに届くまでは、押した選択肢をその場で使う）
  const mine = result.results[me] || (prog.pressed != null ? { c: prog.pressed, ms: 0, ok: prog.pressed === result.correct, pending: true } : null);
  const playing = !prog.finished;
  const solo = !!room.solo;
  const revealing = phase === "reveal";

  // 時計（0.1秒ごと）
  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [playing]);

  // 問題が出たら英語を読み上げる
  useEffect(() => {
    if (playing && phase === "question" && item && active) speech.speak(item.english, null, item.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /** 次の問題へ（最後なら終わり） */
  const advance = useCallback(() => {
    setProg((p) => {
      if (p.phase !== "reveal") return p;
      if (p.q + 1 >= room.questions.length) {
        onFinished(p.round);
        return { ...p, finished: true };
      }
      return { ...p, q: p.q + 1, phase: "question", at: performance.now(), correctAt: null, pressed: null };
    });
  }, [room.questions.length, onFinished]);

  // 締め切り・次の問題
  useEffect(() => {
    if (!playing) return;
    const t = performance.now();
    if (phase === "question") {
      // 誰かが正解したことに気づいた時刻（締め切りの猶予に使う）
      if (result.winner && prog.correctAt == null) return setProg((p) => ({ ...p, correctAt: t }));
      const since = prog.correctAt == null ? null : t - prog.correctAt;
      if (canReveal(room, q, elapsed, since)) setProg((p) => (p.q === q && p.phase === "question" ? { ...p, phase: "reveal", at: t } : p));
    } else if (elapsed >= REVEAL_MS) advance();
  });

  const answer = (i) => {
    if (mine || phase !== "question" || elapsed >= TIME_MS) return;
    const ms = performance.now() - prog.at;
    sound.play(i === result.correct ? "correct" : "wrong", 0, { cheer: false });
    setProg((p) => ({ ...p, pressed: i }));
    sendAnswer(q, i, ms);
  };

  if (prog.finished) return <Results room={room} me={me} claim={claim} onRestart={() => onRestart(prog.round)} onExit={onExit} />;
  if (!question) return null;

  const timeLeft = Math.max(0, TIME_MS - elapsed);
  const revealLeft = Math.max(0, REVEAL_MS - elapsed);
  // 得点は答えが出た問題まで（答える時間のあいだは、今の問題の結果を見せない）
  const players = standings(room, revealing ? q + 1 : q);
  const label = (id) => byId[id]?.japanese.split("／")[0] || id;

  return (
    <div className="flex h-full flex-col bg-slate-950 px-4 pt-3 pb-3 text-white" data-testid="versus-game">
      <div className="flex items-center gap-2 text-xs font-bold">
        <button type="button" onClick={onExit} className="rounded-full bg-white/10 px-3 py-1.5 text-white/70">
          {tr("やめる", "Quit")}
        </button>
        <span className="tabular-nums text-white/70" data-testid="versus-progress">
          {tr(`第${q + 1}問 / ${room.questions.length}`, `Q${q + 1} / ${room.questions.length}`)}
        </span>
        <span className="ml-auto flex gap-1.5">
          {players.map((p) => (
            <span key={p.uid} className={`rounded-full px-2 py-0.5 tabular-nums ${p.uid === me ? "bg-indigo-500" : "bg-white/15"}`} data-testid="versus-score">
              {solo ? tr(`正解 ${p.correct}`, `Correct ${p.correct}`) : `${p.name} ${p.points}`}
            </span>
          ))}
        </span>
      </div>

      {/* 残り時間 */}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full ${revealing ? "bg-sky-400" : timeLeft < 2000 ? "bg-rose-500" : "bg-amber-400"}`}
          style={{ width: `${((revealing ? revealLeft / REVEAL_MS : timeLeft / TIME_MS) * 100).toFixed(1)}%` }}
          data-testid="versus-timer"
        />
      </div>

      <div className="mt-4 text-center">
        <p className="text-[11px] font-bold text-amber-300">{tr("この英語の意味は？", "What does this English mean?")}</p>
        <p className={`mt-1 flex items-center justify-center gap-2 font-black ${item && item.english.length > 18 ? "text-2xl" : "text-3xl"}`} data-testid="versus-question">
          {item?.english || question.id}
          <button type="button" aria-label={tr("読み上げる", "Read aloud")} onClick={() => item && speech.speak(item.english, null, item.id)} className="text-amber-300">
            <Volume2 size={22} />
          </button>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {question.choices.map((id, i) => {
          const isCorrect = i === result.correct;
          const picked = mine?.c === i;
          const shown = revealing || picked;
          const style = revealing
            ? isCorrect
              ? "bg-emerald-500 ring-emerald-300"
              : picked
              ? "bg-rose-600 ring-rose-300"
              : "bg-white/5 ring-white/10 text-white/50"
            : picked
            ? mine.ok
              ? "bg-emerald-500 ring-emerald-300"
              : "bg-rose-600 ring-rose-300"
            : "bg-white/10 ring-white/25";
          return (
            <button
              key={i}
              type="button"
              data-testid="versus-choice"
              data-correct={isCorrect ? "1" : "0"}
              disabled={!!mine || revealing || timeLeft <= 0}
              onClick={() => answer(i)}
              className={`flex items-center gap-2 rounded-2xl px-4 py-3.5 text-left text-base font-bold ring-2 transition active:scale-[0.98] ${style}`}
            >
              <span className="flex-1">{label(id)}</span>
              {shown && (isCorrect ? "○" : picked ? "×" : "")}
            </button>
          );
        })}
      </div>

      {!revealing && (
        <p className="mt-2 text-center text-xs font-bold text-white/60" data-testid="versus-status">
          {mine
            ? mine.ok
              ? mine.pending
                ? tr("正解！", "Correct!")
                : tr(`正解！ ${(mine.ms / 1000).toFixed(2)}秒`, `Correct! ${(mine.ms / 1000).toFixed(2)}s`)
              : tr("ざんねん…", "Missed…")
            : timeLeft <= 0
            ? tr("時間切れ", "Time's up")
            : tr(`あと ${Math.ceil(timeLeft / 1000)}秒`, `${Math.ceil(timeLeft / 1000)}s left`)}
        </p>
      )}

      {revealing && (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto" data-testid="versus-reveal">
          {!solo && (
            <ul className="mb-2 space-y-1">
              {players.map((p) => {
                const r = result.results[p.uid];
                return (
                  <li key={p.uid} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold" data-testid="versus-result-row">
                    {result.winner === p.uid ? <Crown size={14} className="text-amber-300" /> : <span className="w-[14px]" />}
                    <span className="flex-1">{p.name}</span>
                    <span className={r ? (r.ok ? "text-emerald-300" : "text-rose-300") : "text-white/40"}>
                      {r ? (r.ok ? "○" : "×") : "—"} {r ? `${(r.ms / 1000).toFixed(2)}${tr("秒", "s")}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {result.winner === me && !solo && <p className="mb-2 text-center text-sm font-black text-amber-300">{tr("早押し成功！ +1ポイント", "Fastest! +1 point")}</p>}
          {item && <Explanation item={item} trivia={triviaOf(item.id)} speech={speech} />}
          <div className="mt-3 flex items-center gap-2">
            <p className="flex-1 text-[11px] text-white/50 tabular-nums">{tr(`${Math.ceil(revealLeft / 1000)}秒後に次の問題`, `Next question in ${Math.ceil(revealLeft / 1000)}s`)}</p>
            {solo && (
              <button type="button" onClick={advance} className="flex items-center gap-1 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-extrabold" data-testid="versus-next">
                {q + 1 >= room.questions.length ? tr("結果を見る", "See results") : tr("次の問題へ", "Next question")} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 解説: 英語・意味・例文・語源 */
function Explanation({ item, trivia, speech }) {
  const ex = item.example || String(item.exampleContext || "").split("\n")[0];
  const exJa = item.exampleJa || String(item.exampleJapanese || "").split("\n")[0];
  return (
    <div className="rounded-2xl bg-white p-4 text-slate-900" data-testid="versus-explain">
      <p className="flex items-center gap-2 text-xl font-black">
        {item.english}
        <button type="button" aria-label={tr("読み上げる", "Read aloud")} onClick={() => speech.speak(item.english, null, item.id)} className="text-indigo-500">
          <Volume2 size={18} />
        </button>
      </p>
      <p className="text-sm font-bold text-indigo-700">{item.japanese}</p>
      {ex && (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {ex.replace(/^[AB]: /, "")}
          {exJa && <span className="block text-slate-400">{exJa.replace(/^[AB]: /, "")}</span>}
        </p>
      )}
      {trivia?.etymology && (
        <p className="mt-2 text-xs leading-relaxed text-amber-700">
          {tr("語源", "Origin")}: {trivia.etymology}
        </p>
      )}
    </div>
  );
}

/** 結果 */
function Results({ room, me, claim, onRestart, onExit }) {
  // 報酬を受け取る（同じゲームでは1回だけ。claim が覚えている）
  const [reward, setReward] = useState(null);
  useEffect(() => {
    setReward(claim(room, me));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code, room.createdAt, room.round]);
  const rows = standings(room);
  const solo = !!room.solo;
  const top = rows[0];
  const meRow = rows.find((r) => r.uid === me);
  const tie = rows.length > 1 && rows[1].points === top.points && rows[1].correct === top.correct && rows[1].ms === top.ms;
  return (
    <div className="h-full overflow-y-auto bg-slate-950 px-5 pt-8 pb-6 text-white" data-testid="versus-results">
      <p className="text-center text-2xl font-black">
        {solo
          ? tr(`${room.questions.length}問中 ${meRow.correct}問 正解`, `${meRow.correct} of ${room.questions.length} correct`)
          : tie
          ? tr("引き分け！", "It's a tie!")
          : top.uid === me
          ? tr("あなたの勝ち！", "You win!")
          : tr(`${top.name}さんの勝ち`, `${top.name} wins`)}
      </p>
      {solo && meRow.correct > 0 && (
        <p className="mt-1 text-center text-xs text-white/60">{tr(`正解の平均 ${(meRow.ms / meRow.correct / 1000).toFixed(2)}秒`, `Average ${(meRow.ms / meRow.correct / 1000).toFixed(2)}s per correct answer`)}</p>
      )}
      {reward?.points > 0 && (
        <p className="mx-auto mt-3 w-fit rounded-full bg-amber-400 px-4 py-1.5 text-sm font-black text-amber-950" data-testid="versus-reward">
          {tr("ガチャポイント", "Gacha points")} +{reward.points.toLocaleString()}
          {reward.boosted ? tr("（ブースト中）", " (boosted)") : ""}
        </p>
      )}
      {!solo && (
        <ol className="mt-5 space-y-2">
          {rows.map((r, i) => (
            <li key={r.uid} className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${r.uid === me ? "bg-indigo-600" : "bg-white/10"}`} data-testid="versus-rank">
              <span className="w-6 text-lg font-black">{i === 0 ? <Crown size={20} className="text-amber-300" /> : i + 1}</span>
              <span className="flex-1 font-bold">{r.name}</span>
              <span className="text-right text-xs tabular-nums">
                <b className="text-lg">{r.points}</b>
                {tr("pt", "pt")}
                <span className="block text-white/60">{tr(`正解 ${r.correct}`, `${r.correct} correct`)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <button type="button" onClick={onRestart} className={`${btn} mt-6 bg-gradient-to-r from-rose-500 to-orange-500 text-white`}>
        <RotateCcw size={18} /> {tr("もう一度", "Play again")}
      </button>
      <button type="button" onClick={onExit} className={`${btn} mt-2 bg-white/10 text-white`}>
        {solo ? tr("もどる", "Back") : tr("部屋を出る", "Leave the room")}
      </button>
    </div>
  );
}

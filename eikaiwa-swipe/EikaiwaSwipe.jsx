import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Volume2,
  X,
  Check,
  RotateCcw,
  Search,
  Layers,
  List,
  Trophy,
  Flame,
  Sparkles,
  Target,
  ChevronDown,
  Hand,
} from "lucide-react";

/*
 * SwipeTalk — スワイプ式 英会話フレーズ学習アプリ（単一ファイル）
 *
 * - 右スワイプ / ⭕️ボタン: 覚えた → 出題キューから外す
 * - 左スワイプ / ❌ボタン: 覚えてない → キューの最後尾へ
 * - カードをタップ: 裏返して日本語訳と会話例を表示
 * - 🔊: Web Speech API (SpeechSynthesis) で英語を読み上げ
 * - 進捗は LocalStorage に保存（使えない環境ではメモリ上のみで動作）
 *
 * スワイプは framer-motion を使わず Pointer Events + CSS transition で実装している。
 * framer-motion は Artifacts 環境で読み込めない場合があり、読み込めないとアプリ全体が
 * 表示されなくなるため、依存を増やさない方を選んだ。
 */

/** @typedef {{ id: string, english: string, japanese: string, exampleContext: string, exampleJapanese?: string, status: 'unlearned' | 'learned' }} Phrase */

// ---------------------------------------------------------------------------
// 初期データ（ネイティブが日常会話でよく使うフレーズ・イディオム・単語）
// exampleContext は "A: ...\nB: ..." の対話形式。exampleJapanese はその訳。
// ---------------------------------------------------------------------------
const SEED_PHRASES = [
  { id: "p01", english: "make sense", japanese: "意味が通じる／筋が通る",
    exampleContext: "A: So we meet at the station and take a cab from there?\nB: Yeah, that makes sense.",
    exampleJapanese: "A: じゃあ駅で待ち合わせて、そこからタクシーね？\nB: うん、それがいいね。" },
  { id: "p02", english: "figure out", japanese: "（考えて）理解する／解決する",
    exampleContext: "A: I can't figure out how to use this app.\nB: Here, let me take a look.",
    exampleJapanese: "A: このアプリの使い方がわからないんだ。\nB: どれ、ちょっと見せて。" },
  { id: "p03", english: "You know what?", japanese: "ねえ聞いて／あのさ",
    exampleContext: "A: You know what? I'm going to quit sugar.\nB: Good luck with that!",
    exampleJapanese: "A: ねえ聞いて、私、砂糖断ちする。\nB: 頑張ってね！" },
  { id: "p04", english: "I'm down.", japanese: "乗った！／いいね、行く",
    exampleContext: "A: Wanna grab some ramen tonight?\nB: I'm down!",
    exampleJapanese: "A: 今夜ラーメン食べに行かない？\nB: 行く行く！" },
  { id: "p05", english: "No worries.", japanese: "気にしないで／大丈夫だよ",
    exampleContext: "A: Sorry I'm late!\nB: No worries, we just got here.",
    exampleJapanese: "A: 遅れてごめん！\nB: 気にしないで、私たちも今着いたところ。" },
  { id: "p06", english: "hang out", japanese: "遊ぶ／ぶらぶら過ごす",
    exampleContext: "A: What did you do this weekend?\nB: I just hung out with some friends.",
    exampleJapanese: "A: 週末は何してたの？\nB: 友達とちょっと遊んでただけだよ。" },
  { id: "p07", english: "It's up to you.", japanese: "あなた次第だよ／任せるよ",
    exampleContext: "A: Pizza or sushi?\nB: It's up to you. I'm fine with either.",
    exampleJapanese: "A: ピザと寿司、どっちにする？\nB: 任せるよ。どっちでもいい。" },
  { id: "p08", english: "catch up", japanese: "近況を報告し合う",
    exampleContext: "A: Let's grab coffee and catch up sometime.\nB: Sounds great. How about Friday?",
    exampleJapanese: "A: 今度お茶でもして近況話そうよ。\nB: いいね。金曜はどう？" },
  { id: "p09", english: "I'm on it.", japanese: "今やってるよ／任せて",
    exampleContext: "A: Can you send me the report by noon?\nB: I'm on it.",
    exampleJapanese: "A: お昼までにレポート送ってもらえる？\nB: 今やってます。" },
  { id: "p10", english: "That's a bummer.", japanese: "それは残念／がっかりだね",
    exampleContext: "A: The concert got canceled.\nB: Oh, that's a bummer.",
    exampleJapanese: "A: コンサート中止になっちゃった。\nB: うわ、それは残念だね。" },
  { id: "p11", english: "get the hang of", japanese: "コツをつかむ",
    exampleContext: "A: How's your new job going?\nB: It's tough, but I'm getting the hang of it.",
    exampleJapanese: "A: 新しい仕事はどう？\nB: 大変だけど、コツがつかめてきたよ。" },
  { id: "p12", english: "Fair enough.", japanese: "まあ、もっともだね／確かに",
    exampleContext: "A: I'd rather not drive in the snow.\nB: Fair enough. Let's take the train.",
    exampleJapanese: "A: 雪の中は運転したくないな。\nB: 確かにね。電車で行こう。" },
  { id: "p13", english: "run late", japanese: "（予定より）遅れている",
    exampleContext: "A: Where are you?\nB: Sorry, I'm running a little late.",
    exampleJapanese: "A: 今どこ？\nB: ごめん、ちょっと遅れてる。" },
  { id: "p14", english: "Long time no see.", japanese: "久しぶり！",
    exampleContext: "A: Hey, Mike! Long time no see.\nB: I know! It's been, what, two years?",
    exampleJapanese: "A: あ、マイク！久しぶり。\nB: ほんとだね！2年ぶりくらい？" },
  { id: "p15", english: "I'll pass.", japanese: "やめておくよ／遠慮しておく",
    exampleContext: "A: Want another drink?\nB: I'll pass, thanks. I have work tomorrow.",
    exampleJapanese: "A: もう一杯飲む？\nB: やめとく、ありがとう。明日仕事なんだ。" },
  { id: "p16", english: "come up with", japanese: "（アイデアを）思いつく",
    exampleContext: "A: Did you come up with a name for the puppy?\nB: Yeah, we're calling her Mochi!",
    exampleJapanese: "A: 子犬の名前、思いついた？\nB: うん、モチにするよ！" },
  { id: "p17", english: "Go for it.", japanese: "やってみなよ／頑張って",
    exampleContext: "A: I'm thinking about learning the guitar.\nB: Go for it! It's never too late.",
    exampleJapanese: "A: ギター習おうか迷ってるんだ。\nB: やってみなよ！遅すぎることはないよ。" },
  { id: "p18", english: "It slipped my mind.", japanese: "うっかり忘れてた",
    exampleContext: "A: Did you call the dentist?\nB: Oh no, it totally slipped my mind.",
    exampleJapanese: "A: 歯医者に電話した？\nB: しまった、すっかり忘れてた。" },
  { id: "p19", english: "kind of", japanese: "ちょっと／なんとなく",
    exampleContext: "A: Are you tired?\nB: Kind of. I didn't sleep well last night.",
    exampleJapanese: "A: 疲れてる？\nB: ちょっとね。昨日よく眠れなくて。" },
  { id: "p20", english: "What's the catch?", japanese: "何か裏があるの？",
    exampleContext: "A: This phone is only a hundred bucks.\nB: Really? What's the catch?",
    exampleJapanese: "A: このスマホ、たった100ドルだよ。\nB: 本当？何か裏があるんじゃない？" },
  { id: "p21", english: "Count me in.", japanese: "私も入れて／参加する",
    exampleContext: "A: We're going hiking on Sunday.\nB: Count me in!",
    exampleJapanese: "A: 日曜にハイキング行くんだ。\nB: 私も行く！" },
  { id: "p22", english: "awkward", japanese: "気まずい／ぎこちない",
    exampleContext: "A: I accidentally called my teacher \"Mom.\"\nB: Oh no, that's so awkward!",
    exampleJapanese: "A: 先生のこと、うっかり「お母さん」って呼んじゃった。\nB: うわ、それは気まずい！" },
];

const SEED_IDS = SEED_PHRASES.map((p) => p.id);
const STORAGE_KEY = "swipetalk:v1";
const SWIPE_THRESHOLD = 100; // px。これ以上横に動かして離すと仕分け確定
const TAP_SLOP = 8; // px。これ以下の移動はタップ（裏返し）として扱う
const EXIT_MS = 280;

// ---------------------------------------------------------------------------
// 永続化
// ---------------------------------------------------------------------------
const storage = {
  available() {
    try {
      const k = "__swipetalk_probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  },
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* 保存できない環境ではメモリ上の状態だけで続行する */
    }
  },
};

const ymd = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterdayYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
};

const initialStats = () => ({ totalSwipes: 0, streak: 0, lastStudyDate: null, todayDate: null, todayCount: 0 });

function freshState() {
  return {
    statuses: Object.fromEntries(SEED_IDS.map((id) => [id, "unlearned"])),
    queue: [...SEED_IDS],
    stats: initialStats(),
  };
}

/** 保存データを現在の初期データと突き合わせて整合させる（データ追加・削除に強くする） */
function loadState() {
  const saved = storage.load();
  if (!saved || typeof saved !== "object") return freshState();
  const statuses = {};
  for (const id of SEED_IDS) {
    statuses[id] = saved.statuses?.[id] === "learned" ? "learned" : "unlearned";
  }
  const seen = new Set();
  const queue = (Array.isArray(saved.queue) ? saved.queue : []).filter((id) => {
    if (statuses[id] !== "unlearned" || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of SEED_IDS) if (statuses[id] === "unlearned" && !seen.has(id)) queue.push(id);
  return { statuses, queue, stats: { ...initialStats(), ...(saved.stats || {}) } };
}

function recordStudy(stats) {
  const today = ymd();
  let streak = stats.streak;
  if (stats.lastStudyDate !== today) streak = stats.lastStudyDate === yesterdayYmd() ? streak + 1 : 1;
  return {
    totalSwipes: stats.totalSwipes + 1,
    streak,
    lastStudyDate: today,
    todayDate: today,
    todayCount: stats.todayDate === today ? stats.todayCount + 1 : 1,
  };
}

// ---------------------------------------------------------------------------
// 音声読み上げ（Web Speech API）
// ---------------------------------------------------------------------------
const PREFERRED_VOICES = [
  "Google US English",
  "Samantha",
  "Microsoft Aria Online (Natural) - English (United States)",
  "Microsoft Jenny Online (Natural) - English (United States)",
  "Alex",
  "Karen",
  "Daniel",
  "Google UK English Female",
];

function pickVoice(voices) {
  for (const name of PREFERRED_VOICES) {
    const v = voices.find((x) => x.name === name);
    if (v) return v;
  }
  return (
    voices.find((v) => v.lang === "en-US" && v.localService) ||
    voices.find((v) => v.lang === "en-US") ||
    voices.find((v) => v.lang?.startsWith("en-GB")) ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

function useSpeech() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const voiceRef = useRef(null);
  const [speaking, setSpeaking] = useState(null);

  useEffect(() => {
    if (!supported) return undefined;
    const synth = window.speechSynthesis;
    const update = () => {
      voiceRef.current = pickVoice(synth.getVoices());
    };
    update();
    synth.addEventListener?.("voiceschanged", update);
    return () => {
      synth.removeEventListener?.("voiceschanged", update);
      synth.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text) => {
      if (!supported || !text) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceRef.current?.lang || "en-US";
      if (voiceRef.current) u.voice = voiceRef.current;
      u.rate = 0.92;
      u.pitch = 1;
      u.onstart = () => setSpeaking(text);
      u.onend = () => setSpeaking((cur) => (cur === text ? null : cur));
      u.onerror = () => setSpeaking((cur) => (cur === text ? null : cur));
      synth.speak(u);
    },
    [supported]
  );

  return { supported, speak, speaking };
}

/** "A: Hello\nB: Hi" → [{ speaker: "A", text: "Hello" }, ...] */
function parseDialogue(context) {
  return (context || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-Z][\w]*)\s*[:：]\s*(.*)$/);
      return m ? { speaker: m[1], text: m[2] } : { speaker: null, text: line };
    });
}

// ---------------------------------------------------------------------------
// 共通パーツ
// ---------------------------------------------------------------------------
function SpeakButton({ text, speak, speaking, supported, size = "md", className = "", label }) {
  const active = speaking === text;
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const icon = size === "sm" ? 16 : size === "lg" ? 24 : 20;
  return (
    <button
      type="button"
      aria-label={label || `「${text}」を再生`}
      disabled={!supported}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
      className={`${dims} shrink-0 inline-flex items-center justify-center rounded-full transition active:scale-90 disabled:opacity-30 ${
        active ? "bg-indigo-600 text-white shadow-lg" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
      } ${className}`}
    >
      <Volume2 size={icon} className={active ? "animate-pulse" : ""} />
    </button>
  );
}

function Dialogue({ context, translation, speak, speaking, supported, compact = false }) {
  const lines = parseDialogue(context);
  const ja = parseDialogue(translation);
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const isB = line.speaker === "B";
        return (
          <div key={i} className={`flex items-start gap-2 ${isB ? "flex-row-reverse" : ""}`}>
            <span
              className={`mt-1 h-6 w-6 shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${
                isB ? "bg-pink-100 text-pink-600" : "bg-sky-100 text-sky-600"
              }`}
            >
              {line.speaker || "•"}
            </span>
            <div
              className={`min-w-0 flex-1 rounded-2xl px-3 py-2 ${
                isB ? "bg-pink-50 rounded-tr-sm" : "bg-sky-50 rounded-tl-sm"
              }`}
            >
              <div className="flex items-start gap-2">
                <p className={`flex-1 text-slate-800 leading-snug ${compact ? "text-sm" : "text-sm"}`}>{line.text}</p>
                <SpeakButton text={line.text} speak={speak} speaking={speaking} supported={supported} size="sm" />
              </div>
              {ja[i] && <p className="mt-1 text-xs text-slate-500 leading-snug">{ja[i].text}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 学習画面
// ---------------------------------------------------------------------------
function SwipeCard({ phrase, exit, onRelease, flipped, onFlip, speech }) {
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const start = useRef(null);

  const onPointerDown = (e) => {
    if (exit) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ dx: 0, dy: 0, active: true });
  };
  const onPointerMove = (e) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - start.current.x, dy: e.clientY - start.current.y, active: true });
  };
  const finish = (e, cancelled) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (!cancelled && Math.hypot(dx, dy) < TAP_SLOP) {
      setDrag({ dx: 0, dy: 0, active: false });
      onFlip();
      return;
    }
    if (!cancelled && Math.abs(dx) > SWIPE_THRESHOLD) {
      setDrag({ dx, dy, active: false });
      onRelease(dx > 0 ? "right" : "left");
      return;
    }
    setDrag({ dx: 0, dy: 0, active: false });
  };

  const dx = exit ? (exit === "right" ? 1 : -1) * (typeof window !== "undefined" ? window.innerWidth + 200 : 800) : drag.dx;
  const dy = exit ? drag.dy : drag.dy * 0.3;
  const rotate = exit ? (exit === "right" ? 25 : -25) : drag.dx / 15;
  const rightOpacity = exit === "right" ? 1 : Math.max(0, Math.min(drag.dx / SWIPE_THRESHOLD, 1));
  const leftOpacity = exit === "left" ? 1 : Math.max(0, Math.min(-drag.dx / SWIPE_THRESHOLD, 1));

  const face =
    "absolute inset-0 rounded-3xl bg-white shadow-xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col";

  return (
    <div
      data-testid="swipe-card"
      className="absolute inset-0 select-none cursor-grab active:cursor-grabbing"
      style={{
        transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`,
        transition: drag.active ? "none" : `transform ${EXIT_MS}ms ease-out`,
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
    >
      <div className="relative h-full w-full" style={{ perspective: "1200px" }}>
        <div
          className="relative h-full w-full"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.5s cubic-bezier(.2,.8,.2,1)",
            transform: `rotateY(${flipped ? 180 : 0}deg)`,
          }}
        >
          {/* 表：英語 */}
          <div className={face} style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
            <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500" />
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-600">
                PHRASE
              </span>
              <h2 className="text-4xl font-extrabold leading-tight text-slate-900 break-words">{phrase.english}</h2>
              <SpeakButton
                text={phrase.english}
                size="lg"
                className="mt-8"
                label="英語を再生"
                {...speech}
              />
            </div>
            <p className="pb-5 text-center text-xs text-slate-400 flex items-center justify-center gap-1">
              <Hand size={14} /> タップで意味と例文を表示
            </p>
          </div>

          {/* 裏：日本語訳と会話例 */}
          <div
            className={face}
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="h-2 bg-gradient-to-r from-pink-500 via-violet-500 to-indigo-500" />
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex items-center gap-2">
                <h3 className="flex-1 text-xl font-bold text-slate-900">{phrase.english}</h3>
                <SpeakButton text={phrase.english} label="英語を再生" {...speech} />
              </div>
              <p className="mt-2 text-2xl font-bold text-indigo-600">{phrase.japanese}</p>
              <div className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400">CONVERSATION</div>
              <Dialogue context={phrase.exampleContext} translation={phrase.exampleJapanese} {...speech} />
            </div>
            <p className="pb-4 pt-1 text-center text-xs text-slate-400">タップで表に戻る</p>
          </div>
        </div>
      </div>

      {/* スワイプ中のスタンプ */}
      <div
        className="pointer-events-none absolute left-5 top-8 -rotate-12 rounded-xl border-4 border-emerald-500 px-3 py-1 text-2xl font-black text-emerald-500 bg-white"
        style={{ opacity: rightOpacity }}
      >
        覚えた！
      </div>
      <div
        className="pointer-events-none absolute right-5 top-8 rotate-12 rounded-xl border-4 border-rose-500 px-3 py-1 text-2xl font-black text-rose-500 bg-white"
        style={{ opacity: leftOpacity }}
      >
        まだ…
      </div>
    </div>
  );
}

function StudyScreen({ state, phraseById, onSwipe, onResetAll, speech }) {
  const [exit, setExit] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [round, setRound] = useState(0);
  const timer = useRef(null);

  const currentId = state.queue[0];
  const nextId = state.queue[1];
  const current = currentId ? phraseById[currentId] : null;
  const next = nextId ? phraseById[nextId] : null;
  const total = SEED_IDS.length;
  const learned = total - state.queue.length;

  const decide = useCallback(
    (dir) => {
      if (!current || exit) return;
      setExit(dir);
      timer.current = setTimeout(() => {
        onSwipe(current.id, dir);
        setExit(null);
        setFlipped(false);
        setRound((r) => r + 1);
      }, EXIT_MS);
    },
    [current, exit, onSwipe]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") decide("right");
      else if (e.key === "ArrowLeft") decide("left");
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  return (
    <div className="flex h-full flex-col px-5 pt-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 leading-none">SwipeTalk</h1>
            <p className="text-xs text-slate-500">スキマ時間で英会話フレーズ</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">残り</p>
          <p className="text-lg font-bold text-slate-900 leading-none" data-testid="remaining">
            {state.queue.length}
            <span className="text-xs font-medium text-slate-400"> 枚</span>
          </p>
        </div>
      </header>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
          style={{ width: `${(learned / total) * 100}%` }}
        />
      </div>
      <p className="mt-1 text-right text-xs text-slate-500">
        覚えた {learned} / {total}
      </p>

      {current ? (
        <>
          <div className="relative mx-auto mt-3 w-full flex-1" style={{ maxHeight: 520, minHeight: 360 }}>
            {next && (
              <div
                className="absolute inset-0 rounded-3xl bg-white shadow-md ring-1 ring-slate-900/5 flex items-center justify-center px-6 text-center transition-transform duration-300"
                style={{ transform: exit ? "scale(1) translateY(0)" : "scale(0.94) translateY(14px)" }}
                aria-hidden="true"
              >
                <h2 className="text-3xl font-extrabold text-slate-300">{next.english}</h2>
              </div>
            )}
            <SwipeCard
              key={round}
              phrase={current}
              exit={exit}
              onRelease={decide}
              flipped={flipped}
              onFlip={() => setFlipped((f) => !f)}
              speech={speech}
            />
          </div>

          <div className="flex items-center justify-center gap-10 py-5">
            <button
              type="button"
              onClick={() => decide("left")}
              aria-label="覚えてない"
              className="group flex flex-col items-center gap-1"
            >
              <span className="h-16 w-16 rounded-full bg-white shadow-lg ring-1 ring-rose-100 flex items-center justify-center text-rose-500 transition group-active:scale-90 group-hover:bg-rose-50">
                <X size={32} strokeWidth={3} />
              </span>
              <span className="text-xs font-semibold text-rose-500">覚えてない</span>
            </button>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              aria-label="カードを裏返す"
              className="h-11 w-11 rounded-full bg-white shadow ring-1 ring-slate-200 flex items-center justify-center text-slate-500 transition active:scale-90"
            >
              <RotateCcw size={18} />
            </button>
            <button
              type="button"
              onClick={() => decide("right")}
              aria-label="覚えた"
              className="group flex flex-col items-center gap-1"
            >
              <span className="h-16 w-16 rounded-full bg-white shadow-lg ring-1 ring-emerald-100 flex items-center justify-center text-emerald-500 transition group-active:scale-90 group-hover:bg-emerald-50">
                <Check size={32} strokeWidth={3} />
              </span>
              <span className="text-xs font-semibold text-emerald-500">覚えた</span>
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center pb-10">
          <div className="text-6xl">🎉</div>
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900">全部覚えました！</h2>
          <p className="mt-2 text-sm text-slate-500">
            {total}個のフレーズをすべてマスター。
            <br />
            忘れないうちにもう一周してみましょう。
          </p>
          <button
            type="button"
            onClick={onResetAll}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-3 font-bold text-white shadow-lg transition active:scale-95"
          >
            <RotateCcw size={18} /> もう一周する
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 単語一覧画面
// ---------------------------------------------------------------------------
function ListScreen({ phrases, onToggle, speech }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return phrases.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.english.toLowerCase().includes(q) ||
        p.japanese.includes(q) ||
        p.exampleContext.toLowerCase().includes(q)
      );
    });
  }, [phrases, query, filter]);

  const counts = {
    all: phrases.length,
    unlearned: phrases.filter((p) => p.status === "unlearned").length,
    learned: phrases.filter((p) => p.status === "learned").length,
  };
  const tabs = [
    ["all", "すべて"],
    ["unlearned", "未習得"],
    ["learned", "覚えた"],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-4 pb-3 bg-slate-50">
        <h1 className="text-2xl font-extrabold text-slate-900">フレーズ一覧</h1>
        <div className="relative mt-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="英語・日本語で検索"
            className="w-full rounded-2xl border-0 bg-white py-3 pl-10 pr-10 text-base text-slate-900 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="検索をクリア"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {label} <span className="opacity-60">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto px-5 pb-6 space-y-2" data-testid="phrase-list">
        {filtered.length === 0 && (
          <li className="py-16 text-center text-sm text-slate-400">該当するフレーズがありません</li>
        )}
        {filtered.map((p) => {
          const open = openId === p.id;
          const learned = p.status === "learned";
          return (
            <li key={p.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <SpeakButton text={p.english} {...speech} />
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : p.id)}
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={open}
                >
                  <p className="font-bold text-slate-900 truncate">{p.english}</p>
                  <p className="text-sm text-slate-500 truncate">{p.japanese}</p>
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(p.id)}
                  aria-label={learned ? "未習得に戻す" : "覚えたにする"}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold transition active:scale-95 ${
                    learned ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {learned ? "⭕️ 覚えた" : "未習得"}
                </button>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
                  onClick={() => setOpenId(open ? null : p.id)}
                />
              </div>
              {open && (
                <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
                  <Dialogue context={p.exampleContext} translation={p.exampleJapanese} compact {...speech} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 進捗画面
// ---------------------------------------------------------------------------
function ProgressRing({ value, size = 200, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <defs>
        <linearGradient id="swipetalk-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#swipetalk-ring)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
    </svg>
  );
}

function motivation(pct) {
  if (pct === 0) return { emoji: "🌱", text: "さあ、最初の1枚からはじめよう！" };
  if (pct < 25) return { emoji: "🚀", text: "いいスタート！この調子で続けよう。" };
  if (pct < 50) return { emoji: "💪", text: "順調です！もうすぐ半分。" };
  if (pct < 75) return { emoji: "🔥", text: "半分突破！ネイティブ表現が身についてきた。" };
  if (pct < 100) return { emoji: "⭐️", text: "あと少しで全制覇！ラストスパート！" };
  return { emoji: "🏆", text: "コンプリート！素晴らしい！" };
}

function ProgressScreen({ state, onResetAll, storageOk }) {
  const [confirming, setConfirming] = useState(false);
  const total = SEED_IDS.length;
  const learned = SEED_IDS.filter((id) => state.statuses[id] === "learned").length;
  const pct = Math.round((learned / total) * 100);
  const { emoji, text } = motivation(pct);
  const today = ymd();
  const s = state.stats;
  const streak = s.lastStudyDate === today || s.lastStudyDate === yesterdayYmd() ? s.streak : 0;
  const todayCount = s.todayDate === today ? s.todayCount : 0;
  const level = Math.floor(learned / 5) + 1;
  const toNext = 5 - (learned % 5);

  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const tiles = [
    { icon: <Flame size={20} />, label: "連続学習", value: `${streak}日`, color: "text-orange-500 bg-orange-50" },
    { icon: <Target size={20} />, label: "今日の仕分け", value: `${todayCount}枚`, color: "text-sky-500 bg-sky-50" },
    { icon: <Layers size={20} />, label: "累計スワイプ", value: `${s.totalSwipes}回`, color: "text-violet-500 bg-violet-50" },
    { icon: <Trophy size={20} />, label: "レベル", value: `Lv.${level}`, color: "text-amber-500 bg-amber-50" },
  ];

  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6">
      <h1 className="text-2xl font-extrabold text-slate-900">学習の進捗</h1>

      <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 flex flex-col items-center">
        <div className="relative">
          <ProgressRing value={learned / total} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-black text-slate-900" data-testid="progress-pct">
              {pct}
              <span className="text-2xl">%</span>
            </span>
            <span className="text-sm text-slate-500">
              {learned} / {total} 覚えた
            </span>
          </div>
        </div>
        <div className="mt-5 w-full rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 text-center">
          <p className="text-sm font-bold text-slate-800">
            <span className="mr-1">{emoji}</span>
            {text}
          </p>
          {learned < total && (
            <p className="mt-1 text-xs text-slate-500">あと {toNext} 個覚えると Lv.{level + 1} にアップ！</p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${t.color}`}>{t.icon}</div>
            <p className="mt-3 text-xs text-slate-500">{t.label}</p>
            <p className="text-2xl font-extrabold text-slate-900">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-bold text-slate-800">マスター状況</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SEED_IDS.map((id) => (
            <span
              key={id}
              className={`h-5 w-5 rounded-md transition-colors ${
                state.statuses[id] === "learned" ? "bg-emerald-400" : "bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {!storageOk && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          この環境ではブラウザ保存（LocalStorage）が使えないため、進捗はページを閉じると消えます。
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          if (confirming) {
            onResetAll();
            setConfirming(false);
          } else {
            setConfirming(true);
          }
        }}
        className={`mt-6 w-full rounded-2xl py-3 text-sm font-bold transition ${
          confirming ? "bg-rose-500 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"
        }`}
      >
        {confirming ? "もう一度タップで進捗をリセット" : "進捗をリセット"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// アプリ本体
// ---------------------------------------------------------------------------
export default function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState("study");
  const [storageOk] = useState(() => storage.available());
  const speechApi = useSpeech();
  const speech = { speak: speechApi.speak, speaking: speechApi.speaking, supported: speechApi.supported };

  useEffect(() => {
    storage.save(state);
  }, [state]);

  /** @type {Phrase[]} */
  const phrases = useMemo(
    () => SEED_PHRASES.map((p) => ({ ...p, status: state.statuses[p.id] })),
    [state.statuses]
  );
  const phraseById = useMemo(() => Object.fromEntries(phrases.map((p) => [p.id, p])), [phrases]);

  const onSwipe = useCallback((id, dir) => {
    setState((s) => {
      const queue = s.queue.filter((q) => q !== id);
      if (dir === "left") queue.push(id);
      return {
        statuses: { ...s.statuses, [id]: dir === "right" ? "learned" : "unlearned" },
        queue,
        stats: recordStudy(s.stats),
      };
    });
  }, []);

  const onToggle = useCallback((id) => {
    setState((s) => {
      const nowLearned = s.statuses[id] !== "learned";
      const queue = s.queue.filter((q) => q !== id);
      if (!nowLearned) queue.push(id);
      return { ...s, statuses: { ...s.statuses, [id]: nowLearned ? "learned" : "unlearned" }, queue };
    });
  }, []);

  const onResetAll = useCallback(() => {
    setState((s) => ({ ...freshState(), stats: s.stats }));
    setTab("study");
  }, []);

  const navItems = [
    { key: "study", label: "学習", icon: Layers },
    { key: "list", label: "一覧", icon: List },
    { key: "progress", label: "進捗", icon: Trophy },
  ];

  return (
    <div className="w-full bg-slate-100" style={{ height: "100dvh" }}>
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col bg-slate-50 shadow-xl">
        <main className="min-h-0 flex-1 overflow-hidden">
          {tab === "study" && (
            <StudyScreen
              state={state}
              phraseById={phraseById}
              onSwipe={onSwipe}
              onResetAll={onResetAll}
              speech={speech}
            />
          )}
          {tab === "list" && <ListScreen phrases={phrases} onToggle={onToggle} speech={speech} />}
          {tab === "progress" && <ProgressScreen state={state} onResetAll={onResetAll} storageOk={storageOk} />}
        </main>

        <nav
          className="border-t border-slate-200 bg-white/90 backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="grid grid-cols-3">
            {navItems.map(({ key, label, icon: Icon }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${
                    active ? "text-indigo-600" : "text-slate-400"
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

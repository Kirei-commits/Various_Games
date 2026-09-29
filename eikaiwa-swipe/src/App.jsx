import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  Mic,
  Keyboard,
  ListChecks,
  Settings,
  Play,
  PenLine,
  ArrowRight,
  Ear,
  Eye,
  Repeat,
  Pause,
  SkipBack,
  SkipForward,
  Cloud,
  CloudOff,
  LogOut,
  Gift,
  BookOpen,
  Award,
  Swords,
  Heart,
  Music,
  Key,
  Zap,
  Palette,
  Store,
  Star,
  Hourglass,
  Flame as FlameIcon,
  Feather as NotebookPen,
  Castle,
} from "lucide-react";
import { BattleBackdrop, Monster, Dragon, Hero, monsterKindOf } from "./battle-art.jsx";
import QuestScreen from "./QuestScreen.jsx";
import { equip as questEquip, autoEquip as questAutoEquip, applyQuest, runResults, savePreset as questSavePreset, loadPreset as questLoadPreset } from "./quest.js";
import { loadRecordedIndex, playRecorded, recordedCount, recordedUrls, stopRecorded } from "./recorded.js";
import { cheersAvailable, loadCheers, noteSpeech } from "./cheers.js";
import { Art, CARD_BACK_ART, CHEST_ART, MACHINE_ART, SHOP_ART, WALLET_ICON } from "./gacha-art.jsx";
import { saveDiary } from "./diary.js";
import rawChapters, { PARTS, RENAMED } from "./data/index.js";
import { analyzeLinking, LINK_LABELS } from "./linking.js";
import {
  buildCatalog,
  pull as gachaPull,
  exchange as gachaExchange,
  currentRates,
  titleProgress,
  claimStarter,
  grant,
  earnTimePoints,
  activateBoost,
  boostActive,
  boostRate,
  pointsForTime,
  redeemCode,
  codesLeft,
  endUnlimited,
  upgradeTickets,
  makeMyTitle,
  equipMyTitle,
  deleteMyTitle,
  equippedMyTitle,
  myTitleText,
  MY_TITLE_PARTS,
  buyItem,
  consumeItem,
  SHOP,
  BALANCE_KEY,
  TICKET_UPGRADE,
  DUP_MEDALS,
  LOGIN_SR_TICKETS,
  levelOf,
  RARITIES,
  MAX_LEVEL,
  PULL_COST,
  PITY_SSR,
  EXCHANGE_COST,
  LOGIN_POINTS,
  GOAL_POINTS,
  STARTER,
  MULTI_PULLS,
  MAX_PULLS,
  CODE_DAILY_LIMIT,
  CODE_POINTS,
  POINTS_PER_MINUTE,
  BOOST_RATE,
} from "./gacha.js";
import { POS_LABELS, TITLES } from "./data/gacha-data.js";
import {
  createBattle,
  tick,
  attack,
  target,
  quit,
  resultsOf,
  STAGE_ENEMIES,
  BATTLE_POINTS,
  BATTLE_TICKETS,
  applyBattle,
  difficultyTiers,
  freeze as battleFreeze,
  special as battleSpecial,
  isFrozen,
  FREEZE_MS,
  endlessLevelBonus,
} from "./battle.js";
import {
  buildLibrary,
  parseDialogue,
  chapterQueue,
  restoreState,
  applySwipe,
  toggleLearned,
  resetChapter,
  applyTestResult,
  freshState,
  currentStreak,
  recordActivity,
  todayAndYesterday,
  gradeAnswer,
  gradeEnglish,
  englishHint,
  testKey,
  isCorrect,
  makeChoices,
  buildQuiz,
  prosodyPlan,
  shadowSteps,
  pauseMs,
  resolveLogin,
  fuzzySearch,
  claimDailyBonus,
  claimGoalBonus,
  canClaimGoal,
  todayProgress,
  themeById,
  toggleFavorite,
  THEMES,
  DAILY_GOAL,
  mulberry32,
  stateVersionOf,
  STATE_VERSION,
} from "./logic.js";
import { cloud, authErrorMessage } from "./cloud.js";
import { usableVoices, pickVoices } from "./voices.js";
import { SoundEngine, setMicActive, silentSound } from "./audio.js";
import { detectInAppBrowser } from "./env.js";
import { analyzePronunciation, verdictText, commonIssues } from "./pronounce.js";

const IN_APP = typeof navigator !== "undefined" ? detectInAppBrowser(navigator.userAgent) : null;
const SKIP_LOGIN_KEY = "swipetalk:skipLogin";
const session = {
  get(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* 使えない環境では、この表示中だけ覚えておく */
    }
  },
};

/** 効果音（画面のどこからでも鳴らせるように Context で渡す） */
const SoundContext = createContext(silentSound);
const useSound = () => useContext(SoundContext);

/** ドーパミンモード（on のとき、hit(正解か) で派手な演出と連続正解の音） */
const DopamineContext = createContext({ on: false, hit() {} });
const useDopamine = () => useContext(DopamineContext);

const DP_COLORS = ["#f43f5e", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#facc15"];
const DP_EMOJI = ["🔥", "✨", "💥", "⭐", "🎉", "💎", "⚡", "🌈"];
const dpLabel = (n) =>
  n >= 30 ? "🌈 GODLIKE 🌈" : n >= 20 ? "🔥 FEVER 🔥" : n >= 15 ? "UNSTOPPABLE!!" : n >= 10 ? "PERFECT!!!" : n >= 6 ? "EXCELLENT!!" : n >= 3 ? "GREAT!" : "NICE!";
/** 5連続ごとの節目（大きな演出と音） */
const dpMilestone = (n) => n > 0 && n % 5 === 0;

/**
 * ドーパミンモードの演出（画面全体に重ねる。タップは下に通す）。
 * 連続正解が増えるほど派手になる: 光の輪・放射の光・紙吹雪・絵文字の雨・虹色の文字。5連続ごとに画面いっぱいの節目の演出、
 * 10連続からはフィーバー（画面のふちが虹色に光り続ける）
 */
function DopamineLayer({ fx, streak }) {
  if (!fx && !streak) return null;
  const n = fx?.streak || 0;
  const hot = n >= 10;
  const big = fx && dpMilestone(n);
  const color = DP_COLORS[n % DP_COLORS.length];
  const confetti = Math.min(18 + n * 3, big ? 90 : 60);
  const emoji = Math.min(Math.floor(n / 2) * 2 + (big ? 12 : 0), 28);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden" data-testid="dopamine">
      {streak >= 10 && <span className="dp-fever absolute inset-0 block" data-testid="dopamine-fever" />}
      {streak > 0 && (
        <p
          key={`m${streak}`}
          className={`dp-meter absolute bottom-[84px] right-3 rounded-full px-2.5 py-1 text-xs font-black text-white shadow-lg ${
            streak >= 10 ? "dp-rainbow-bg" : streak >= 5 ? "bg-gradient-to-r from-orange-500 to-rose-600" : "bg-slate-900/80"
          }`}
          data-testid="dopamine-streak"
        >
          🔥 ×{streak}
        </p>
      )}
      {fx && (
        <div key={fx.id}>
          <span className="dp-flash absolute inset-0 block" style={{ background: big ? "white" : color, "--o": big ? 0.85 : 0.35 }} />
          <span className="dp-glow absolute inset-0 block" style={{ boxShadow: `inset 0 0 ${hot ? 110 : 60}px ${hot ? 36 : 16}px ${color}` }} />
          {n >= 3 && (
            <span
              className="dp-rays absolute left-1/2 top-[36%] block rounded-full"
              style={{
                width: big ? 900 : 600,
                height: big ? 900 : 600,
                background: `repeating-conic-gradient(from 0deg, ${color}66 0deg 8deg, transparent 8deg 20deg)`,
              }}
            />
          )}
          <span className="dp-ring absolute left-1/2 top-[36%] block rounded-full" style={{ borderColor: color }} />
          {big && <span className="dp-ring dp-ring-2 absolute left-1/2 top-[36%] block rounded-full" style={{ borderColor: "#facc15" }} />}
          <p
            className={`${big ? "dp-stamp" : "bt-pop"} absolute inset-x-0 top-[28%] text-center font-black italic tracking-tight`}
            style={{ fontSize: big ? 58 : hot ? 46 : 36, textShadow: "0 4px 0 rgba(0,0,0,0.25), 0 0 24px rgba(255,255,255,0.95)" }}
          >
            <span className={hot || big ? "dp-rainbow-text" : ""} style={hot || big ? undefined : { color }}>
              {dpLabel(n)}
            </span>
            {n >= 2 && <span className="block text-3xl text-slate-900">{n} COMBO{big ? "!!" : ""}</span>}
          </p>
          {Array.from({ length: confetti }, (_, i) => {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * (big ? 3.4 : 2.4);
            const d = 180 + Math.random() * (big ? 420 : 300);
            return (
              <span
                key={i}
                className="dp-confetti absolute bottom-24 left-1/2 block h-2.5 w-1.5 rounded-sm"
                style={{
                  background: DP_COLORS[(i + n) % DP_COLORS.length],
                  "--dx": `${Math.cos(a) * d}px`,
                  "--dy": `${Math.sin(a) * d}px`,
                  "--rot": `${Math.random() * 720 - 360}deg`,
                  animationDelay: `${Math.random() * 0.1}s`,
                }}
              />
            );
          })}
          {Array.from({ length: emoji }, (_, i) => (
            <span
              key={`e${i}`}
              className="dp-rain absolute top-0 block text-2xl"
              style={{ left: `${Math.random() * 92}%`, animationDelay: `${Math.random() * 0.35}s`, "--fall": `${55 + Math.random() * 40}vh`, "--rot": `${Math.random() * 90 - 45}deg` }}
            >
              {DP_EMOJI[(i + n) % DP_EMOJI.length]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 話す速さ（設定の rate）。音声を流す画面から、その場で変えられるように Context で渡す */
const RateContext = createContext({ rate: 1, setRate() {} });

/** 話す速さのバー（学習・シャドーイング・一覧・テストの画面に置く。設定の「話す速さ」と同じ値） */
function SpeedBar({ className = "" }) {
  const { rate, setRate } = useContext(RateContext);
  return (
    <label className={`flex items-center gap-1.5 text-xs font-bold text-slate-500 ${className}`} data-testid="speed-bar">
      <span aria-hidden="true">🐢</span>
      <input
        type="range"
        min="0.6"
        max="1.3"
        step="0.05"
        value={rate}
        onChange={(e) => setRate(Number(e.target.value))}
        aria-label="話す速さ"
        className="w-24 accent-indigo-600"
      />
      <span aria-hidden="true">🐇</span>
      <span className="w-10 tabular-nums text-slate-700">×{rate.toFixed(2)}</span>
    </label>
  );
}

/** 着せかえの色（カードの帯とアイコン） */
const ThemeContext = createContext(THEMES[0]);
const useThemeColors = () => useContext(ThemeContext);
/** リンキング（音のつながり）を表示するか（設定） */
const LinkingContext = createContext(true);
const gradient = (theme, dir = "90deg") => ({ background: `linear-gradient(${dir}, ${theme.colors.join(", ")})` });

/*
 * SwipeTalk — スワイプ式 英会話フレーズ学習アプリ
 *
 * - 学習: 右スワイプ=覚えた（キューから外す）/ 左スワイプ=覚えてない（最後尾へ）
 * - テスト: 英語（文字 or 音声のみ）を見て、日本語の意味を「入力・音声・4択」で答える
 * - 全110章 × 50問 = 5500問（src/data/）。フレーズ50章（基本編・アメリカ生活編・もっと話せる編）と単語60章
 * - リンキング: 単語どうしの音のつながりを ‿ と説明で表示（linking.js）
 * - 音声: Web Speech API。文ごとに pitch/rate を変えて抑揚をつける（logic.js の prosodyPlan）
 * - 保存: LocalStorage。使えない環境ではメモリ上だけで動く
 */

const LIBRARY = buildLibrary(rawChapters, { renamed: RENAMED });
const CHAPTERS = LIBRARY.chapters;
const CHAPTER_BY_ID = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));
const CHAPTER_NO = Object.fromEntries(CHAPTERS.map((c, i) => [c.id, i + 1]));
const ALL_ITEMS = CHAPTERS.flatMap((c) => c.items);
const TOTAL = ALL_ITEMS.length;

const STATE_KEY = "swipetalk:v2";
const LEGACY_KEY = "swipetalk:v1";
const SETTINGS_KEY = "swipetalk:settings";
/** 端末に保存している進捗が誰のものか（owner = ログイン中のユーザーID）と、最後に変更した時刻 */
const META_KEY = "swipetalk:meta";

/** この距離（px）を超えて離せば仕分ける。カードの幅の 22% と比べて小さい方（画面の小さいスマホでも届きやすく） */
const SWIPE_THRESHOLD = 100;
const SWIPE_RATIO = 0.22;
const MIN_SWIPE = 56;
/** 距離が短くても、この速さ（px/ms）以上で横に払えば仕分ける */
const FLICK_VELOCITY = 0.35;
const FLICK_MIN_DISTANCE = 24;
const TAP_SLOP = 8;
const EXIT_MS = 280;

const chapterLabel = (c) => `第${CHAPTER_NO[c.id]}章 ${c.title}`;
/** 部ごとの章（章選択のグループ分けと進捗画面の見出しに使う） */
const PART_GROUPS = PARTS.map((p) => {
  const chapters = CHAPTERS.slice(p.from - 1, p.to);
  return { ...p, chapters, count: chapters.reduce((n, c) => n + c.items.length, 0) };
});
/** 種類ごとの問題（フレーズ全部・単語全部） */
/** 単語ガチャの対象（単語の章 3000語＋シークレット） */
const CATALOG = buildCatalog(LIBRARY, PARTS);
/** 冒険で出す単語（ガチャの対象の単語。シークレットは除く） */
const QUEST_POOL = Object.values(CATALOG.cards).filter((c) => !c.secret);
/** 冒険の宝箱から出る、冒険限定の単語 */
const CHEST_WORDS = Object.values(CATALOG.cards)
  .filter((c) => c.questOnly)
  .map((c) => ({ id: c.id, rarity: c.rarity }));
const KIND_ITEMS = {
  phrase: PART_GROUPS.filter((p) => p.kind === "phrase").flatMap((p) => p.chapters.flatMap((c) => c.items)),
  word: PART_GROUPS.filter((p) => p.kind === "word").flatMap((p) => p.chapters.flatMap((c) => c.items)),
};

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
  load(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できない環境ではメモリ上の状態だけで続行する */
    }
  },
};

/**
 * 端末に保存された進捗を読み込む。古い形のデータを新しい形に移すときは、
 * 念のため移行前のデータを swipetalk:backup:v{版} に残しておく（万一の復旧用）。
 */
function loadInitialState() {
  const saved = storage.load(STATE_KEY) || storage.load(LEGACY_KEY);
  if (saved && stateVersionOf(saved) < STATE_VERSION) {
    const key = `swipetalk:backup:v${stateVersionOf(saved)}`;
    if (!storage.load(key)) storage.save(key, saved);
  }
  return restoreState(saved, LIBRARY);
}

const DEFAULT_SETTINGS = {
  rate: 0.95,
  linking: true,
  sfx: true,
  sfxVolume: 0.6,
  cheers: true, // 合いの手（正解・連続正解・バトル・ガチャなどで英語の声で応援する）
  battleBgm: true, // バトル中の BGM
  bgmVolume: 0.35,
  studyBgm: true, // 学習中の BGM（シャドーイング中は流さない）
  studyBgmVolume: 0.25,
  dopamine: false, // ドーパミンモード（派手な演出でテンポよく）
  theme: "", // 着せかえ（空なら以前ログインボーナスで選んだもの、なければスタンダード）
  test: { scope: "ch01", count: 10, direction: "en-ja", prompt: "text", answer: "type" },
  play: "test", // テスト画面で「テスト」「バトル」「冒険」のどれを開くか
  battle: { mode: "stage", chapter: "ch51", scope: "word", direction: "en-ja", answer: "choice", order: "random" },
};

function loadSettings() {
  const s = storage.load(SETTINGS_KEY) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    test: { ...DEFAULT_SETTINGS.test, ...(s.test || {}) },
    battle: { ...DEFAULT_SETTINGS.battle, ...(s.battle || {}) },
  };
}

// ---------------------------------------------------------------------------
// 音声読み上げ（Web Speech API）
// ---------------------------------------------------------------------------
function useSpeech(settings) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(null);
  const [recorded, setRecorded] = useState(0); // 使える録音の数（audio/index.json を読んだあと）
  const [cheers, setCheers] = useState(false); // 合いの手の声があるか（audio/cheers.json を読んだあと）
  const token = useRef(0);

  useEffect(() => {
    let alive = true;
    loadRecordedIndex().then(() => alive && setRecorded(recordedCount()));
    loadCheers().then(() => alive && setCheers(cheersAvailable()));
    return () => {
      alive = false;
      stopRecorded();
    };
  }, []);

  useEffect(() => {
    if (!supported) return undefined;
    const synth = window.speechSynthesis;
    const update = () => {
      setVoices(usableVoices(synth.getVoices()));
    };
    update();
    synth.addEventListener?.("voiceschanged", update);
    return () => {
      synth.removeEventListener?.("voiceschanged", update);
      synth.cancel();
    };
  }, [supported]);

  // B役（会話の相手）は A役と性別が違う声。見つからなければ同じ声を少し高くして区別する
  const { a: voiceA, b: voiceB, sameVoice } = useMemo(
    // 端末の声は録音の無い文（日記など）だけに使うので、選べるようにはせず自動で選ぶ
    () => pickVoices(voices, { twoVoices: true }),
    [voices]
  );

  /** speechSynthesis で読み上げる（my は呼び出し側で進めたトークン） */
  const synthLines = useCallback(
    (lines, key, onDone, seed, my) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterances = [];
      // 端末の声は選んだ声で固定（ネイティブの録音があるので、会話ごとに声を変える設定・いろいろな国の声の設定はなくした）
      const cast = { a: voiceA, b: voiceB, sameVoice };
      for (const line of lines) {
        const voice = line.role === "B" ? cast.b : cast.a;
        const persona = { pitch: 1, rate: 1 };
        for (const chunk of prosodyPlan(line.text, {
          expressive: true,
          rate: settings.rate,
          // 声の高さで役を区別するのは、B役も同じ声を使うときだけ（別の声を高くすると不自然になる）
          role: cast.sameVoice ? line.role : null,
        })) {
          const u = new SpeechSynthesisUtterance(chunk.text);
          u.lang = voice?.lang || "en-US";
          if (voice) u.voice = voice;
          u.pitch = Math.min(2, Math.max(0.5, chunk.pitch * persona.pitch));
          u.rate = Math.min(2, Math.max(0.5, chunk.rate * persona.rate));
          utterances.push(u);
        }
      }
      if (!utterances.length) return false;
      const finish = (completed) => {
        if (token.current !== my) return;
        setSpeaking(null);
        if (completed) onDone?.();
      };
      utterances[0].onstart = () => {
        if (token.current !== my) return;
        setSpeaking(key);
      };
      utterances[utterances.length - 1].onend = () => finish(true);
      // 声が使えないなどのエラーでも先へ進める（止めた・割り込まれたときは除く）
      utterances.forEach((u) => (u.onerror = (e) => finish(!["interrupted", "canceled"].includes(e?.error))));
      // Chrome は cancel 直後の speak を取りこぼすことがあるので1拍おく
      setTimeout(() => token.current === my && utterances.forEach((u) => synth.speak(u)), 0);
      return true;
    },
    [voiceA, voiceB, sameVoice, settings.rate]
  );

  /**
   * lines: [{ text, role }] を順番に読み上げる。key は再生中表示に使う。
   * onDone は最後まで読み終えたときだけ呼ぶ（途中で止めた・別の再生に割り込まれたときは呼ばない）。
   * 読み上げできない環境では false を返す。
   */
  const speakLines = useCallback(
    (lines, key, onDone, seed = key) => {
      if (!lines.length) return false;
      noteSpeech(); // 読み上げが優先（合いの手を止めて、重ねない）
      // 録音がすべての行にあれば録音を再生する（再生できなければ読み上げに戻す）
      const urls = recordedUrls(lines); // 録音があれば必ず録音で読む
      if (urls) {
        if (supported) window.speechSynthesis.cancel();
        const my = ++token.current;
        playRecorded(urls, { rate: settings.rate, onStart: () => token.current === my && setSpeaking(key) }).then((r) => {
          if (token.current !== my) return;
          if (r === "failed" && supported) {
            synthLines(lines, key, onDone, seed, my);
            return;
          }
          setSpeaking(null);
          if (r === "done" || r === "failed") onDone?.();
        });
        return true;
      }
      if (!supported) return false;
      stopRecorded();
      return synthLines(lines, key, onDone, seed, ++token.current);
    },
    [supported, settings.rate, synthLines]
  );

  /** seed を渡すと、その会話と同じ声で読む（見出しと会話例の声をそろえるため） */
  const speak = useCallback((text, role = null, seed = text) => speakLines([{ text, role }], text, undefined, seed), [speakLines]);

  const stop = useCallback(() => {
    token.current++;
    setSpeaking(null);
    stopRecorded();
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, speakLines, stop, speaking, voices, voiceA, voiceB, sameVoice, recorded, cheers };
}

// ---------------------------------------------------------------------------
// 音声入力（Web Speech API の SpeechRecognition）
// ---------------------------------------------------------------------------
const RECOGNITION_ERRORS = {
  "not-allowed":
    "マイクが許可されていません。iPhone は「設定 → Safari（または Chrome）→ マイク」、Android はアドレスバー左の鍵アイコンから許可してください。いまはキーボードのマイクで話して入力できます。",
  "service-not-allowed": "このブラウザでは音声認識が使えません。キーボードのマイク（🎤）で話して入力してください。",
  "no-speech": "聞き取れませんでした。もう一度マイクを押して話してください。",
  "audio-capture": "マイクが見つかりません。キーボードのマイク（🎤）で話して入力してください。",
  network: "音声認識サービスに接続できませんでした。通信を確認するか、キーボードのマイク（🎤）で入力してください。",
};

/** このエラーのあとは、ブラウザの音声認識は使えない（キーボードの音声入力に切り替える） */
const RECOGNITION_BLOCKED = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

/**
 * ブラウザの音声認識。1つずつしか動かさず、古いセッションの結果は無視する
 * （モードを切り替えた直後に前の聞き取り結果で答えてしまわないように）。
 */
function useRecognition() {
  const Ctor = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);
  const rec = useRef(null);

  /** 聞き取りを止め、結果も捨てる */
  const abort = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (r) {
      try {
        r.abort();
      } catch {
        /* すでに止まっている */
      }
      setMicActive(false);
    }
    setListening(false);
  }, []);

  /** 聞き取りを終える（話した分は結果として受け取る） */
  const stop = useCallback(() => {
    try {
      rec.current?.stop();
    } catch {
      /* すでに止まっている */
    }
  }, []);

  const start = useCallback(
    (onFinal, lang = "ja-JP", onEnd) => {
      if (!Ctor) return false;
      abort();
      setError("");
      setInterim("");
      let r;
      try {
        r = new Ctor();
        r.lang = lang;
        r.interimResults = true;
        r.maxAlternatives = 3;
        r.onresult = (e) => {
          if (rec.current !== r) return;
          const res = e.results[e.results.length - 1];
          const alts = Array.from(res).map((a) => a.transcript);
          setInterim(alts[0] || "");
          if (res.isFinal) onFinal(alts);
        };
        r.onerror = (e) => {
          if (rec.current !== r || e.error === "aborted") return;
          setError(RECOGNITION_ERRORS[e.error] || `音声認識エラー: ${e.error}`);
          if (RECOGNITION_BLOCKED.has(e.error)) setBlocked(true);
        };
        r.onend = () => {
          if (rec.current !== r) return;
          rec.current = null;
          setMicActive(false);
                setListening(false);
          onEnd?.();
        };
        rec.current = r;
        setMicActive(true);
        r.start();
        setListening(true);
        return true;
      } catch {
        rec.current = null;
            setError(RECOGNITION_ERRORS["service-not-allowed"]);
        setBlocked(true);
        setListening(false);
        onEnd?.();
        return false;
      }
    },
    [Ctor, abort]
  );

  useEffect(() => () => abort(), [abort]);

  return {
    // ブラウザの音声認識が使えるか（使えないときはキーボードの音声入力で答える）
    supported: !!Ctor && !blocked,
    listening,
    interim,
    error,
    start,
    stop,
    abort,
    setInterim,
    clearError: () => setError(""),
  };
}

// ---------------------------------------------------------------------------
// 共通パーツ
// ---------------------------------------------------------------------------
function SpeakButton({ text, role = null, seed, speech, size = "md", className = "", label }) {
  const active = speech.speaking === text;
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const icon = size === "sm" ? 16 : size === "lg" ? 24 : 20;
  return (
    <button
      type="button"
      aria-label={label || `「${text}」を再生`}
      disabled={!speech.supported}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        speech.speak(text, role, seed ?? text);
      }}
      className={`${dims} shrink-0 inline-flex items-center justify-center rounded-full transition active:scale-90 disabled:opacity-30 ${
        active ? "bg-indigo-600 text-white shadow-lg" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
      } ${className}`}
    >
      <Volume2 size={icon} className={active ? "animate-pulse" : ""} />
    </button>
  );
}

/**
 * 英文を表示し、つながって発音される単語の間に ‿ を重ねる（文字列そのものは変えない）。
 * 語の中で t の音が変わる語（water, twenty など）には点線の下線を引く。
 */
function LinkedText({ text }) {
  const on = useContext(LinkingContext);
  const tokens = useMemo(() => (on ? analyzeLinking(text).tokens : null), [text, on]);
  if (!tokens) return text;
  return tokens.map((t, i) => (
    <React.Fragment key={i}>
      <span className={t.inner.length ? "underline decoration-dotted decoration-amber-400 underline-offset-4" : undefined}>{t.text}</span>
      {i < tokens.length - 1 &&
        (t.link ? (
          <span className="lk" data-k={t.link} title={LINK_LABELS[t.link]}>
            {" "}
          </span>
        ) : (
          " "
        ))}
    </React.Fragment>
  ));
}

/** 英文の「音のつながり」の説明（どこが・どう聞こえるか・なぜか） */
function LinkingNotes({ text, className = "" }) {
  const on = useContext(LinkingContext);
  const notes = useMemo(() => (on ? analyzeLinking(text).notes : []), [text, on]);
  if (!notes.length) return null;
  return (
    <div className={`rounded-2xl bg-indigo-50/60 p-3 ${className}`} data-testid="linking-notes">
      <p className="text-[11px] font-bold tracking-wide text-indigo-500">音のつながり（リンキング）</p>
      <ul className="mt-1.5 space-y-1.5">
        {notes.map((n, i) => (
          <li key={i} className="text-xs leading-relaxed text-slate-700">
            <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-100">{n.label}</span>
            <span className="font-bold text-slate-900">{n.words}</span>
            {n.sound && <span className="ml-1 inline-block whitespace-nowrap font-bold text-rose-500">→ {n.sound}</span>}
            <span className="block text-[11px] text-slate-500">{n.tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dialogue({ context, translation, speech, seed = context }) {
  const lines = parseDialogue(context);
  const ja = parseDialogue(translation);
  const key = `dialogue:${context}`;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          speech.speakLines(
            lines.map((l) => ({ text: l.text, role: l.speaker })),
            key,
            undefined,
            seed
          );
        }}
        disabled={!speech.supported}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-30 ${
          speech.speaking === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Play size={12} /> {lines.length > 1 ? "会話を通して再生" : "例文を再生"}
      </button>
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
            <div className={`min-w-0 flex-1 rounded-2xl px-3 py-2 ${isB ? "bg-pink-50 rounded-tr-sm" : "bg-sky-50 rounded-tl-sm"}`}>
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm text-slate-800 leading-snug">
                  <LinkedText text={line.text} />
                </p>
                <SpeakButton text={line.text} role={line.speaker} seed={seed} speech={speech} size="sm" />
              </div>
              {ja[i] && <p className="mt-1 text-xs text-slate-500 leading-snug">{ja[i].text}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChapterSelect({ value, onChange, extra = [], id, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl bg-white py-2 pl-3 pr-9 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {extra.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
        {PART_GROUPS.map((part) => (
          <optgroup key={part.title} label={`${part.title}（${part.count}問）`}>
            {part.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {chapterLabel(c)}（{c.items.length}問）
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function Segmented({ value, onChange, options, name }) {
  return (
    <div className="grid gap-1 rounded-xl bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          name={name}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
            value === v ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
          }`}
        >
          {Icon && <Icon size={14} />}
          {label}
        </button>
      ))}
    </div>
  );
}

/** 3回タップしてはじめて実行される、全進捗のリセット（何もしなければ5秒で元に戻る） */
const RESET_STEPS = [
  "進捗をリセット",
  "本当にリセットしますか？（あと2回タップ）",
  "覚えた・テストの記録・苦手がすべて消えます（あと1回）",
];

function ResetButton({ onReset }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step === 0) return undefined;
    const t = setTimeout(() => setStep(0), 5000);
    return () => clearTimeout(t);
  }, [step]);
  return (
    <button
      type="button"
      data-testid="reset-button"
      onClick={() => {
        if (step + 1 < RESET_STEPS.length) return setStep(step + 1);
        setStep(0);
        onReset();
      }}
      className={`w-full rounded-xl py-2.5 text-xs font-bold transition ${
        step === 0 ? "bg-slate-50 text-slate-400 ring-1 ring-slate-200" : step === 1 ? "bg-rose-100 text-rose-700" : "bg-rose-500 text-white"
      }`}
    >
      {RESET_STEPS[step]}
    </button>
  );
}


// ---------------------------------------------------------------------------
// 音声設定
// ---------------------------------------------------------------------------
function SettingsSheet({ open, onClose, settings, setSettings, speech, onResetAll, themeId }) {
  const sound = useSound();
  if (!open) return null;
  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const sample = [
    { text: "Guess what? I got the job!", role: "A" },
    { text: "No way! That's amazing. When do you start?", role: "B" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="音声の設定"
        className="w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))", maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">音声・表示・効果音の設定</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <p className="mt-4 flex items-center gap-1 text-xs font-bold text-slate-500">
          <Palette size={14} /> 着せかえ（カードと画面の色）
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2" data-testid="theme-picker">
          {THEMES.map((t) => {
            const active = themeId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={active}
                onClick={() => update({ theme: t.id })}
                className={`overflow-hidden rounded-xl text-left ring-1 transition active:scale-95 ${active ? "ring-2 ring-slate-900" : "ring-slate-200"}`}
              >
                <div className="h-7" style={gradient(t)} />
                <p className="px-2 py-1 text-xs font-bold text-slate-800">
                  {t.name}
                  {active && <span className="ml-1 text-[10px] text-slate-500">使用中</span>}
                </p>
              </button>
            );
          })}
        </div>

        {!speech.supported && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">このブラウザは音声読み上げに対応していません。</p>
        )}

        <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs text-slate-600" data-testid="voice-note">
          <span className="block text-sm font-bold text-slate-800">読み上げはネイティブの録音</span>
          アメリカ英語の自然な発音・音のつながりで作った録音で読みます{speech.recorded > 0 ? `（${speech.recorded.toLocaleString()}文ぶん）` : ""}。
          日記など録音の無い文だけ、この端末の英語の声で読みます。
        </p>

        <label htmlFor="rate-range" className="mt-4 flex items-center justify-between text-xs font-bold text-slate-500">
          話す速さ <span className="tabular-nums text-slate-700">×{settings.rate.toFixed(2)}</span>
        </label>
        <input
          id="rate-range"
          type="range"
          min="0.6"
          max="1.3"
          step="0.05"
          value={settings.rate}
          onChange={(e) => update({ rate: Number(e.target.value) })}
          className="mt-2 w-full accent-indigo-600"
        />

        <p className="mt-5 text-xs font-bold text-slate-500">表示</p>
        <label className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="flex-1">
            <span className="block text-sm font-bold text-slate-800">リンキング（音のつながり）を表示</span>
            <span className="block text-xs text-slate-500">
              つながって発音される単語の間に ‿ を付け、wanna・gonna などの崩れ方や、やわらかい t の説明を出します
            </span>
          </span>
          <input
            id="toggle-linking"
            type="checkbox"
            checked={settings.linking}
            onChange={(e) => update({ linking: e.target.checked })}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>

        <p className="mt-5 text-xs font-bold text-slate-500">効果音</p>
        <label className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="flex-1">
            <span className="block text-sm font-bold text-slate-800">効果音を鳴らす</span>
            <span className="block text-xs text-slate-500">覚えた・正解・テスト完了・ログインボーナスなど</span>
          </span>
          <input
            id="toggle-sfx"
            type="checkbox"
            checked={settings.sfx}
            onChange={(e) => update({ sfx: e.target.checked })}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>
        {settings.sfx && (
          <>
            <label htmlFor="sfx-volume" className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
              効果音の音量 <span className="tabular-nums text-slate-700">{Math.round(settings.sfxVolume * 100)}%</span>
            </label>
            <input
              id="sfx-volume"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={settings.sfxVolume}
              onChange={(e) => update({ sfxVolume: Number(e.target.value) })}
              onPointerUp={() => sound.play("correct")}
              className="mt-2 w-full accent-indigo-600"
            />
          </>
        )}

        {speech.cheers && (
          <label className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5">
            <span className="flex-1">
              <span className="block text-sm font-bold text-slate-800">合いの手（英語の声で応援）</span>
              <span className="block text-xs text-slate-500">正解・連続正解・テスト完了・バトル・ガチャで “Nice!” “You're on fire!” などと声をかけます（毎回ではありません）</span>
            </span>
            <input
              id="toggle-cheers"
              type="checkbox"
              checked={settings.cheers}
              onChange={(e) => update({ cheers: e.target.checked })}
              className="h-5 w-5 accent-amber-500"
            />
          </label>
        )}

        <p className="mt-5 text-xs font-bold text-slate-500">ドーパミンモード</p>
        <label className="mt-2 flex items-center gap-3 rounded-xl bg-gradient-to-r from-fuchsia-50 to-amber-50 px-3 py-2.5">
          <Zap size={18} className="text-fuchsia-500" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-slate-800">ドーパミンモード</span>
            <span className="block text-xs text-slate-500">正解・連続正解で派手な演出と音。待ち時間を短くして、次の問題へどんどん進みます</span>
          </span>
          <input
            id="toggle-dopamine"
            type="checkbox"
            checked={settings.dopamine}
            onChange={(e) => update({ dopamine: e.target.checked })}
            className="h-5 w-5 accent-fuchsia-600"
          />
        </label>

        <p className="mt-5 text-xs font-bold text-slate-500">BGM</p>
        <label className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <Music size={18} className="text-emerald-500" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-slate-800">学習中に BGM を流す</span>
            <span className="block text-xs text-slate-500">ゆったりした曲。読み上げ中は小さくなり、シャドーイング中は止まります</span>
          </span>
          <input
            id="toggle-studyBgm"
            type="checkbox"
            checked={settings.studyBgm}
            onChange={(e) => update({ studyBgm: e.target.checked })}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>
        {settings.studyBgm && (
          <>
            <label htmlFor="study-bgm-volume" className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
              学習中の BGM の音量 <span className="tabular-nums text-slate-700">{Math.round(settings.studyBgmVolume * 100)}%</span>
            </label>
            <input
              id="study-bgm-volume"
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={settings.studyBgmVolume}
              onChange={(e) => update({ studyBgmVolume: Number(e.target.value) })}
              className="mt-2 w-full accent-indigo-600"
            />
          </>
        )}
        <label className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <Music size={18} className="text-indigo-500" />
          <span className="flex-1">
            <span className="block text-sm font-bold text-slate-800">バトル中に BGM を流す</span>
            <span className="block text-xs text-slate-500">バトルの間だけ流れます（ボス戦は曲が変わります）</span>
          </span>
          <input
            id="toggle-bgm"
            type="checkbox"
            checked={settings.battleBgm}
            onChange={(e) => update({ battleBgm: e.target.checked })}
            className="h-5 w-5 accent-indigo-600"
          />
        </label>
        {settings.battleBgm && (
          <>
            <label htmlFor="bgm-volume" className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">
              BGM の音量 <span className="tabular-nums text-slate-700">{Math.round(settings.bgmVolume * 100)}%</span>
            </label>
            <input
              id="bgm-volume"
              type="range"
              min="0.05"
              max="1"
              step="0.05"
              value={settings.bgmVolume}
              onChange={(e) => update({ bgmVolume: Number(e.target.value) })}
              className="mt-2 w-full accent-indigo-600"
            />
          </>
        )}

        <button
          type="button"
          disabled={!speech.supported}
          onClick={() => speech.speakLines(sample, "sample")}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
        >
          <Play size={16} /> 試しに聞く
        </button>

        <div className="mt-8 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold text-slate-400">進捗のリセット</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            すべての章の「覚えた」、テストの記録、苦手な問題を消して最初からやり直します。ログイン中はクラウドの進捗も消えます。
          </p>
          <div className="mt-2">
            <ResetButton
              onReset={() => {
                onResetAll();
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 学習画面
// ---------------------------------------------------------------------------
function SwipeCard({ phrase, exit, onRelease, flipped, onFlip, speech }) {
  const theme = useThemeColors();
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const start = useRef(null);
  const threshold = useRef(SWIPE_THRESHOLD);

  const onPointerDown = (e) => {
    if (exit) return;
    const now = e.timeStamp || performance.now();
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, last: { x: e.clientX, y: e.clientY, t: now }, prev: null };
    const width = e.currentTarget.getBoundingClientRect?.().width || 0;
    threshold.current = width ? Math.max(MIN_SWIPE, Math.min(SWIPE_THRESHOLD, width * SWIPE_RATIO)) : SWIPE_THRESHOLD;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // 合成イベントなどでキャプチャできなくても、スワイプは続けられる
    }
    setDrag({ dx: 0, dy: 0, active: true });
  };
  const onPointerMove = (e) => {
    const st = start.current;
    if (!st || st.id !== e.pointerId) return;
    st.prev = st.last;
    st.last = { x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() };
    setDrag({ dx: e.clientX - st.x, dy: e.clientY - st.y, active: true });
  };
  /**
   * 指を離した（または OS に操作を奪われた）ときに、仕分けるかを決める。
   * iPhone の Safari は、指の動きの途中で pointercancel を送ってくることがある。
   * そのときも最後に分かっている位置で判定し、スワイプを無駄にしない。
   */
  const finish = (e, cancelled) => {
    const st = start.current;
    if (!st || st.id !== e.pointerId) return;
    start.current = null;
    const x = cancelled ? st.last.x : e.clientX;
    const y = cancelled ? st.last.y : e.clientY;
    const dx = x - st.x;
    const dy = y - st.y;
    if (!cancelled && Math.hypot(dx, dy) < TAP_SLOP) {
      setDrag({ dx: 0, dy: 0, active: false });
      onFlip();
      return;
    }
    // 直近の動きの速さ（払う動作）
    const ref = st.prev || { x: st.x, y: st.y, t: st.last.t - 1 };
    const dt = Math.max(1, st.last.t - ref.t);
    const vx = (st.last.x - ref.x) / dt;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 0.8;
    const far = Math.abs(dx) > threshold.current;
    const flick = Math.abs(vx) > FLICK_VELOCITY && Math.abs(dx) > FLICK_MIN_DISTANCE && Math.sign(vx) === Math.sign(dx);
    if (horizontal && (far || flick)) {
      setDrag({ dx, dy, active: false });
      onRelease(dx > 0 ? "right" : "left");
      return;
    }
    setDrag({ dx: 0, dy: 0, active: false });
  };

  const dx = exit ? (exit === "right" ? 1 : -1) * (typeof window !== "undefined" ? window.innerWidth + 200 : 800) : drag.dx;
  const dy = exit ? drag.dy : drag.dy * 0.3;
  const rotate = exit ? (exit === "right" ? 25 : -25) : drag.dx / 15;
  const rightOpacity = exit === "right" ? 1 : Math.max(0, Math.min(drag.dx / threshold.current, 1));
  const leftOpacity = exit === "left" ? 1 : Math.max(0, Math.min(-drag.dx / threshold.current, 1));
  const face = "absolute inset-0 rounded-3xl bg-white shadow-xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col";
  const hidden = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

  return (
    <div
      data-testid="swipe-card"
      className="absolute inset-0 select-none cursor-grab active:cursor-grabbing"
      style={{
        transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`,
        transition: drag.active ? "none" : `transform ${EXIT_MS}ms ease-out`,
        // 表面は縦の動きも受け取ってスワイプに使う（ページが上下に動かないように）。
        // 裏面は会話例が長いと中身をスクロールしたいので、縦の動きはブラウザに任せる
        touchAction: flipped ? "pan-y" : "none",
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
          <div className={face} style={hidden}>
            <div className="h-2" style={gradient(theme)} />
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-600">
                第{CHAPTER_NO[phrase.chapterId]}章
              </span>
              <h2 className="text-4xl font-extrabold leading-tight text-slate-900 break-words">{phrase.english}</h2>
              <SpeakButton text={phrase.english} seed={phrase.id} size="lg" className="mt-8" label="英語を再生" speech={speech} />
            </div>
            <p className="pb-5 text-center text-xs text-slate-400 flex items-center justify-center gap-1">
              <Hand size={14} /> タップで意味と例文を表示
            </p>
          </div>

          <div className={face} style={{ ...hidden, transform: "rotateY(180deg)" }}>
            <div className="h-2" style={gradient(theme, "270deg")} />
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex items-center gap-2">
                <h3 className="flex-1 text-xl font-bold text-slate-900">
                  <LinkedText text={phrase.english} />
                </h3>
                <SpeakButton text={phrase.english} seed={phrase.id} label="英語を再生" speech={speech} />
              </div>
              <p className="mt-2 text-2xl font-bold text-indigo-600">{phrase.japanese}</p>
              <LinkingNotes text={phrase.english} className="mt-3" />
              <div className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400">
                {parseDialogue(phrase.exampleContext).length > 1 ? "CONVERSATION" : "EXAMPLE"}
              </div>
              <Dialogue context={phrase.exampleContext} translation={phrase.exampleJapanese} seed={phrase.id} speech={speech} />
            </div>
            <p className="pb-4 pt-1 text-center text-xs text-slate-400">タップで表に戻る</p>
          </div>
        </div>
      </div>

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

function ScreenHeader({ title, sub, onSettings, right }) {
  const theme = useThemeColors();
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center text-white shadow" style={gradient(theme, "135deg")}>
          <Sparkles size={18} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-slate-900 leading-none">{title}</h1>
          <p className="truncate text-xs text-slate-500">{sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {right}
        {onSettings && (
          <button
            type="button"
            onClick={onSettings}
            aria-label="音声の設定"
            className="h-9 w-9 rounded-full bg-white shadow-sm ring-1 ring-slate-200 flex items-center justify-center text-slate-500 active:scale-90"
          >
            <Settings size={18} />
          </button>
        )}
      </div>
    </header>
  );
}

function StudyScreen({ active, state, onChapter, onSwipe, onResetChapter, speech, onSettings, onToggleFavorite = () => {} }) {
  const sound = useSound();
  const chapter = CHAPTER_BY_ID[state.chapter] || CHAPTERS[0];
  const queue = useMemo(() => chapterQueue(state, chapter), [state, chapter]);
  const [exit, setExit] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [round, setRound] = useState(0);
  const timer = useRef(null);

  const current = queue[0] ? LIBRARY.byId[queue[0]] : null;
  const next = queue[1] ? LIBRARY.byId[queue[1]] : null;
  const total = chapter.items.length;
  const learned = total - queue.length;

  // 飛んでいくアニメーション中の仕分け。アニメ完了前に画面を離れても取りこぼさない
  const pending = useRef(null);

  const decide = useCallback(
    (dir) => {
      if (!current || exit) return;
      setExit(dir);
      sound.play(dir === "right" ? "learned" : "again");
      if (dir === "right" && queue.length === 1) setTimeout(() => sound.play("complete"), 350); // 章クリア
      pending.current = () => onSwipe(chapter, current.id, dir);
      timer.current = setTimeout(() => {
        pending.current = null;
        onSwipe(chapter, current.id, dir);
        setExit(null);
        setFlipped(false);
        setRound((r) => r + 1);
      }, EXIT_MS);
    },
    [current, exit, onSwipe, chapter, sound, queue.length]
  );

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pending.current?.();
    },
    []
  );
  useEffect(() => {
    setFlipped(false);
    setRound((r) => r + 1);
  }, [chapter.id]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight") decide("right");
      else if (e.key === "ArrowLeft") decide("left");
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, active]);

  return (
    <div className="flex h-full flex-col px-5 pt-4">
      <ScreenHeader
        title="SwipeTalk"
        sub={`全${CHAPTERS.length}章・${TOTAL}問`}
        onSettings={onSettings}
        right={
          <div className="text-right">
            <p className="text-xs text-slate-500 leading-none">残り</p>
            <p className="text-lg font-bold text-slate-900 leading-tight tabular-nums" data-testid="remaining">
              {queue.length}
              <span className="text-xs font-medium text-slate-400"> 枚</span>
            </p>
          </div>
        }
      />

      <ChapterSelect id="study-chapter" value={chapter.id} onChange={onChapter} className="mt-3" />

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
          style={{ width: `${(learned / total) * 100}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <SpeedBar />
        <p className="text-right text-xs text-slate-500 tabular-nums">
          この章で覚えた {learned} / {total}
        </p>
      </div>

      {current ? (
        <>
          <div className="relative mx-auto mt-2 w-full flex-1" style={{ maxHeight: 520, minHeight: 320 }}>
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
              onFlip={() => {
                sound.play("flip");
                setFlipped((f) => !f);
              }}
              speech={speech}
            />
          </div>

          <div className="flex items-center justify-center gap-6 py-4">
            <button type="button" onClick={() => decide("left")} aria-label="覚えてない" className="group flex flex-col items-center gap-1">
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
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow ring-1 ring-slate-200">
              <FavButton id={current.id} favorites={state.favorites} onToggle={onToggleFavorite} size={20} />
            </span>
            <button type="button" onClick={() => decide("right")} aria-label="覚えた" className="group flex flex-col items-center gap-1">
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
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900">第{CHAPTER_NO[chapter.id]}章 クリア！</h2>
          <p className="mt-2 text-sm text-slate-500">
            {total}個のフレーズをすべて覚えました。
            <br />
            テストで定着度を確かめるか、次の章へ進みましょう。
          </p>
          <div className="mt-6 flex flex-col gap-2 w-full max-w-xs">
            {CHAPTER_NO[chapter.id] < CHAPTERS.length && (
              <button
                type="button"
                onClick={() => onChapter(CHAPTERS[CHAPTER_NO[chapter.id]].id)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-3 font-bold text-white shadow-lg transition active:scale-95"
              >
                次の章へ <ArrowRight size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onResetChapter(chapter)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-slate-600 ring-1 ring-slate-200 transition active:scale-95"
            >
              <RotateCcw size={18} /> この章をもう一周
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// テスト画面
// ---------------------------------------------------------------------------
const COUNT_OPTIONS = [10, 20, 50];

/** 単語の難易度5段階（★1 がいちばんやさしい） */
let wordTiers = null;
const WORD_TIERS = () => (wordTiers ||= difficultyTiers(KIND_ITEMS.word));
const TIER_LABELS = ["★1 やさしい", "★2 ふつう", "★3 ややむずかしい", "★4 むずかしい", "★5 超むずかしい"];
const tierOf = (scope) => {
  const m = /^lv([1-5])$/.exec(scope || "");
  return m ? Number(m[1]) : 0;
};

function scopeItems(scope, misses, favorites = {}) {
  if (scope === "all") return ALL_ITEMS;
  if (scope === "phrase" || scope === "word") return KIND_ITEMS[scope];
  if (scope === "weak") return ALL_ITEMS.filter((p) => misses[p.id]);
  if (scope === "fav") return ALL_ITEMS.filter((p) => favorites[p.id]);
  const lv = tierOf(scope);
  if (lv) return WORD_TIERS()[lv - 1];
  return CHAPTER_BY_ID[scope]?.items || [];
}

function scopeLabel(scope) {
  if (scope === "all") return "全章から";
  if (scope === "phrase") return "フレーズ全部から";
  if (scope === "word") return "単語全部から";
  if (scope === "weak") return "苦手な問題";
  if (scope === "fav") return "お気に入り（⭐）";
  const lv = tierOf(scope);
  if (lv) return `単語の難易度 ${TIER_LABELS[lv - 1]}`;
  return chapterLabel(CHAPTER_BY_ID[scope]);
}

/**
 * 出題範囲を選ぶ（タップで開き、グループをタップすると中の章が出る）。長いリストをスクロールしなくてよい。
 * @param special [[値, 表示]] 「まとめて」のグループに出す項目
 * @param levels 難易度5段階のグループを出すか
 */
function ScopePicker({ id, value, onChange, special = [], levels = false }) {
  const groups = [
    ...(special.length ? [{ key: "special", title: "まとめて", options: special }] : []),
    ...(levels
      ? [{ key: "levels", title: "単語の難易度（5段階）", options: TIER_LABELS.map((label, i) => [`lv${i + 1}`, `${label}（${WORD_TIERS()[i].length}問）`]) }]
      : []),
    ...PART_GROUPS.map((part) => ({
      key: part.title,
      title: `${part.title}（${part.count}問）`,
      options: part.chapters.map((c) => [c.id, `${chapterLabel(c)}（${c.items.length}問）`]),
    })),
  ];
  const current = groups.find((g) => g.options.some(([v]) => v === value));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(current?.key || null);
  const label = current?.options.find(([v]) => v === value)?.[1] || scopeLabel(value);
  return (
    <div className="mt-1">
      <button
        type="button"
        id={id}
        data-testid={id}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setExpanded(current?.key || null);
        }}
        className="flex w-full items-center gap-2 rounded-xl bg-white py-2.5 pl-3 pr-3 text-left text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200"
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1 rounded-2xl bg-slate-50 p-2 ring-1 ring-slate-200" data-testid={`${id}-panel`}>
          {groups.map((g) => {
            const isOpen = expanded === g.key;
            return (
              <div key={g.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(isOpen ? null : g.key)}
                  className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-xs font-extrabold ${isOpen ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}
                >
                  <span className="flex-1">{g.title}</span>
                  <ChevronDown size={14} className={`transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="mt-1 grid grid-cols-2 gap-1 pb-1">
                    {g.options.map(([v, text]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={v === value}
                        onClick={() => {
                          onChange(v);
                          setOpen(false);
                        }}
                        className={`rounded-lg px-2 py-1.5 text-left text-[11px] font-bold leading-snug ${
                          v === value ? "bg-amber-300 text-amber-950" : "bg-white text-slate-600 ring-1 ring-slate-200"
                        }`}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function resultMessage(pct) {
  if (pct === 100) return "パーフェクト！完全にマスターしています。";
  if (pct >= 80) return "すばらしい！ほぼ定着しています。";
  if (pct >= 60) return "いい調子。間違えた問題を復習しよう。";
  if (pct >= 40) return "半分近く正解。カードでもう一周しよう。";
  return "まずは学習カードで慣れていこう。";
}

function TestSetup({ config, setConfig, misses, favorites = {}, tests, onStart, onSettings, switcher }) {
  const pool = scopeItems(config.scope, misses, favorites);
  const weakCount = Object.keys(misses).length;
  const record = tests[testKey(config.scope, config.direction)];
  const jaEn = config.direction === "ja-en";
  const set = (patch) => setConfig({ ...config, ...patch });
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6">
      <ScreenHeader title="テスト" sub="意味・英語を答えて定着度をチェック" onSettings={onSettings} />
      {switcher}

      <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <label htmlFor="test-scope" className="text-xs font-bold text-slate-500">
            出題範囲
          </label>
          <ChapterSelect
            id="test-scope"
            value={config.scope}
            onChange={(scope) => set({ scope })}
            extra={[
              ["all", `全章から（${TOTAL}問）`],
              ["phrase", `フレーズ全部から（${KIND_ITEMS.phrase.length}問）`],
              ["word", `単語全部から（${KIND_ITEMS.word.length}問）`],
              ["weak", `苦手な問題（${weakCount}問）`],
              ["fav", `お気に入り ⭐（${Object.keys(favorites).length}問）`],
              ...TIER_LABELS.map((label, i) => [`lv${i + 1}`, `単語の難易度 ${label}（${WORD_TIERS()[i].length}問）`]),
            ]}
            className="mt-1"
          />
          {record && (
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              最高 {record.best}% ・ 前回 {record.last}% ・ {record.count}回受験
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">出題の向き</p>
          <div className="mt-1">
            <Segmented
              name="direction"
              value={config.direction}
              onChange={(direction) => set({ direction })}
              options={[
                { value: "en-ja", label: "英語 → 意味" },
                { value: "ja-en", label: "日本語 → 英語" },
              ]}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            {jaEn
              ? "日本語を見て英語で答えます。言えるようになるための「話す」練習です。"
              : "英語を見て（聞いて）日本語の意味を答えます。聞いてわかる力の確認です。"}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">問題数</p>
          <div className="mt-1">
            <Segmented
              name="count"
              value={config.count}
              onChange={(count) => set({ count })}
              options={COUNT_OPTIONS.map((n) => ({ value: n, label: `${n}問` }))}
            />
          </div>
        </div>

        {!jaEn && (
        <div>
          <p className="text-xs font-bold text-slate-500">問題の出し方</p>
          <div className="mt-1">
            <Segmented
              name="prompt"
              value={config.prompt}
              onChange={(prompt) => set({ prompt })}
              options={[
                { value: "text", label: "英語を表示", icon: Eye },
                { value: "audio", label: "音声だけ", icon: Ear },
              ]}
            />
          </div>
        </div>
        )}

        <div>
          <p className="text-xs font-bold text-slate-500">答え方</p>
          <div className="mt-1">
            <Segmented
              name="answer"
              value={config.answer}
              onChange={(answer) => set({ answer })}
              options={[
                { value: "type", label: "入力", icon: Keyboard },
                { value: "voice", label: "音声", icon: Mic },
                { value: "choice", label: "4択", icon: ListChecks },
              ]}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">
            {config.answer === "type" &&
              (jaEn
                ? "英語をキーボードで入力します。I'm / I am などの短縮形や小さなスペルミスは許容します。"
                : "日本語の意味をキーボードで入力します。多少の言い回しの違いは「ほぼ正解」になります。")}
            {config.answer === "voice" &&
              (jaEn
                ? "マイクを押して英語で話します。発音が通じたかの確認にもなります。マイクが使えない環境では入力に切り替えられます。"
                : "マイクを押して日本語で意味を話します。マイクが使えない環境では入力に切り替えられます。")}
            {config.answer === "choice" && (jaEn ? "4つの英語から正しいものを選びます。" : "4つの選択肢から正しい意味を選びます。")}
          </p>
        </div>
      </div>

      <button
        type="button"
        disabled={pool.length === 0}
        onClick={() => onStart(pool)}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-600 py-4 text-base font-extrabold text-white shadow-lg transition active:scale-95 disabled:opacity-40"
      >
        <PenLine size={20} /> テストを始める（{Math.min(config.count, pool.length)}問）
      </button>
      {pool.length === 0 && (
        <p className="mt-2 text-center text-xs text-slate-500">苦手な問題はまだありません。テストで間違えた問題がここに集まります。</p>
      )}
    </div>
  );
}

function TestRun({ quiz, config, pool, speech, recognition, onFinish, onQuit, active }) {
  const dopamine = useDopamine();
  const sound = useSound();
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [phase, setPhase] = useState("answer");
  const [input, setInput] = useState("");
  const [answerMode, setAnswerMode] = useState(config.answer);
  const [hint, setHint] = useState(false);
  const inputRef = useRef(null);
  const item = quiz[idx];
  const last = results[results.length - 1];
  const jaEn = config.direction === "ja-en";
  const audioPrompt = !jaEn && config.prompt === "audio";
  const grade = (text) => (jaEn ? gradeEnglish(text, item.english) : gradeAnswer(text, item.japanese));

  const choices = useMemo(
    () =>
      answerMode === "choice"
        ? makeChoices(item, pool.length >= 4 ? pool : ALL_ITEMS, Math.random, 4, jaEn ? "english" : "japanese")
        : [],
    [item, answerMode, pool, jaEn]
  );

  useEffect(() => {
    setInput("");
    setHeard([]);
    setHint(false);
    recognition.abort();
    recognition.setInterim("");
    // 音声だけで出題するときは、問題が出た時点で読み上げる
    if (audioPrompt) speech.speak(item.english, null, item.id);
    if (answerMode === "type" || (answerMode === "voice" && !recognition.supported)) setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  /** 答え方を切り替える。聞き取り中なら止め、前の結果で答えてしまわないようにする */
  const switchMode = (mode) => {
    recognition.abort();
    recognition.clearError();
    setHeard([]);
    setAnswerMode(mode);
    if (mode !== "choice") setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submit = (answer, verdict) => {
    sound.play(isCorrect(verdict) ? "correct" : "wrong");
    dopamine.hit(isCorrect(verdict));
    setResults((r) => [...r, { id: item.id, input: answer, verdict, correct: isCorrect(verdict) }]);
    setPhase("feedback");
    recognition.stop();
    // 日本語→英語では、答え合わせのときに正しい英語を聞かせて真似できるようにする
    if (jaEn) speech.speak(item.english, null, item.id);
  };

  const submitText = (text) => submit(text, grade(text).verdict);

  // 音声認識の結果は、すぐ採点せずに入力欄に入れて確認してもらう（聞き違いを直せるように）
  const [heard, setHeard] = useState([]);
  const onHeard = (alternatives) => {
    setHeard(alternatives);
    setInput(alternatives[0] || "");
  };

  /** 声で答えた内容を採点する。書き換えていなければ、認識候補の中で一番よい判定を採用する */
  const submitVoice = () => {
    const candidates = heard.length && input === heard[0] ? heard : [input];
    const order = { correct: 3, close: 2, wrong: 1, empty: 0 };
    let best = { text: candidates[0] || "", verdict: "empty" };
    for (const text of candidates) {
      const { verdict } = grade(text);
      if (order[verdict] > order[best.verdict]) best = { text, verdict };
    }
    submit(best.text, best.verdict);
  };

  const override = () => {
    sound.play("correct");
    setResults((r) => r.map((x, i) => (i === r.length - 1 ? { ...x, verdict: "override", correct: true } : x)));
  };

  const goNext = useCallback(() => {
    if (idx + 1 >= quiz.length) {
      onFinish(results);
      return;
    }
    setIdx((i) => i + 1);
    setPhase("answer");
  }, [idx, quiz.length, onFinish, results]);

  // ドーパミンモード: 正解したら待たずに次の問題へ
  const lastCorrect = results[results.length - 1]?.correct;
  useEffect(() => {
    if (!dopamine.on || !active || phase !== "feedback" || !lastCorrect) return undefined;
    const t = setTimeout(goNext, jaEn ? 900 : 550);
    return () => clearTimeout(t);
  }, [dopamine.on, active, phase, lastCorrect, goNext, jaEn]);

  useEffect(() => {
    if (!active || phase !== "feedback") return undefined;
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        goNext();
      }
    };
    // 送信に使った Enter で即座に次へ進まないよう、次のイベントループから受け付ける
    const t = setTimeout(() => window.addEventListener("keydown", onKey), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, phase, goNext]);

  const score = results.filter((r) => r.correct).length;
  const verdictView = {
    correct: { label: "正解！", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <Check size={22} strokeWidth={3} /> },
    close: { label: "ほぼ正解！", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <Check size={22} strokeWidth={3} /> },
    override: { label: "正解にしました", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: <Check size={22} strokeWidth={3} /> },
    wrong: { label: "不正解", cls: "bg-rose-50 text-rose-700 ring-rose-200", icon: <X size={22} strokeWidth={3} /> },
    empty: { label: "スキップ", cls: "bg-slate-100 text-slate-600 ring-slate-200", icon: <X size={22} strokeWidth={3} /> },
  };

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onQuit} className="rounded-full px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 bg-white">
          やめる
        </button>
        <p className="text-sm font-bold text-slate-700 tabular-nums" data-testid="test-progress">
          {idx + 1} / {quiz.length}
        </p>
        <p className="text-sm font-bold text-emerald-600 tabular-nums">⭕️ {score}</p>
      </div>
      <SpeedBar className="mt-2 justify-end" />
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${((idx + (phase === "feedback" ? 1 : 0)) / quiz.length) * 100}%` }} />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mt-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 text-center">
          <p className="text-xs font-bold tracking-wide text-slate-400">{jaEn ? "これを英語で言うと？" : "この英語の意味は？"}</p>
          {jaEn ? (
            <div className="mt-3">
              <h2 className="text-2xl font-extrabold text-slate-900 break-words" data-testid="test-question" data-phrase-id={item.id}>
                {item.japanese}
              </h2>
              {phase === "answer" &&
                (hint ? (
                  <p className="mt-3 font-mono text-lg tracking-wider text-indigo-600" data-testid="hint">
                    {englishHint(item.english)}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setHint(true)}
                    className="mt-3 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600"
                  >
                    ヒント（頭文字）を見る
                  </button>
                ))}
            </div>
          ) : audioPrompt && phase === "answer" ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <SpeakButton seed={item.id} text={item.english} size="lg" speech={speech} label="問題を再生" />
              <p className="text-xs text-slate-500">音声を聞いて答えてください（何度でも再生できます）</p>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-3">
              <h2 className="text-3xl font-extrabold text-slate-900 break-words" data-testid="test-question" data-phrase-id={item.id}>
                {item.english}
              </h2>
              <SpeakButton seed={item.id} text={item.english} speech={speech} label="問題を再生" />
            </div>
          )}
        </div>

        {phase === "answer" && (
          <div className="mt-4">
            <div className="mb-3">
              <Segmented
                name="answer-mode"
                value={answerMode}
                onChange={switchMode}
                options={[
                  { value: "type", label: "文字で", icon: Keyboard },
                  { value: "voice", label: "声で", icon: Mic },
                  { value: "choice", label: "選ぶ", icon: ListChecks },
                ]}
              />
            </div>
            {(answerMode === "type" || (answerMode === "voice" && !recognition.supported)) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (input.trim()) submitText(input);
                }}
                className="space-y-2"
              >
                <input
                  id="test-answer"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    answerMode === "voice"
                      ? "キーボードのマイク（🎤）を押して話す"
                      : jaEn
                        ? "英語で入力"
                        : "日本語で意味を入力"
                  }
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang={jaEn ? "en" : "ja"}
                  className="w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {answerMode === "voice" && (
                  <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800" data-testid="dictation-hint">
                    {recognition.error ||
                      "このブラウザでは音声認識が使えないため、キーボードの音声入力を使います。入力欄をタップして、キーボードのマイク（🎤）を押して話してください。"}
                    {jaEn && " 英語で話すときは、キーボードを英語に切り替えてください。"}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => submit("", "empty")} className="rounded-2xl bg-white py-3 text-sm font-bold text-slate-500 ring-1 ring-slate-200">
                    わからない
                  </button>
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="col-span-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
                  >
                    答える
                  </button>
                </div>
              </form>
            )}

            {answerMode === "voice" && recognition.supported && (
              <div className="flex flex-col items-center gap-3">
                {recognition.listening ? (
                  <>
                    <button
                      type="button"
                      aria-label="話し終わった"
                      onClick={() => recognition.stop()}
                      className="h-20 w-20 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg animate-pulse transition active:scale-90"
                    >
                      <Check size={34} strokeWidth={3} />
                    </button>
                    <p className="min-h-[1.5rem] text-sm text-slate-600">
                      {recognition.interim || (jaEn ? "聞き取り中…英語で話してください" : "聞き取り中…日本語で話してください")}
                    </p>
                    <p className="text-xs text-slate-400">話し終わったら ✓ を押す</p>
                  </>
                ) : heard.length ? (
                  <form
                    className="w-full space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (input.trim()) submitVoice();
                    }}
                  >
                    <p className="text-xs font-bold text-slate-400">聞き取った答え（聞き違いは直せます）</p>
                    <input
                      id="test-answer"
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      lang={jaEn ? "en" : "ja"}
                      className="w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm ring-1 ring-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setHeard([]);
                          setInput("");
                          recognition.start(onHeard, jaEn ? "en-US" : "ja-JP");
                        }}
                        className="flex items-center justify-center gap-1 rounded-2xl bg-white py-3 text-xs font-bold text-slate-600 ring-1 ring-slate-200"
                      >
                        <Mic size={14} /> もう一度
                      </button>
                      <button
                        type="submit"
                        disabled={!input.trim()}
                        className="col-span-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
                      >
                        この答えで解答
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label="話して答える"
                      onClick={() => recognition.start(onHeard, jaEn ? "en-US" : "ja-JP")}
                      className="h-20 w-20 rounded-full bg-indigo-600 flex items-center justify-center text-white shadow-lg transition active:scale-90"
                    >
                      <Mic size={34} />
                    </button>
                    <p className="min-h-[1.5rem] text-sm text-slate-600">
                      {jaEn ? "マイクを押して英語で答える" : "マイクを押して日本語で答える"}
                    </p>
                  </>
                )}
                {recognition.error && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{recognition.error}</p>}
                {!heard.length && (
                  <button type="button" onClick={() => submit("", "empty")} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                    わからない
                  </button>
                )}
              </div>
            )}

            {answerMode === "choice" && (
              <div className="grid gap-2">
                {choices.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => submit(c.label, c.id === item.id ? "correct" : "wrong")}
                    className="rounded-2xl bg-white px-4 py-3.5 text-left text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.98] hover:ring-indigo-300"
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === "feedback" && last && (
          <div className="mt-4 space-y-3" data-testid="feedback">
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ${verdictView[last.verdict].cls}`}>
              {verdictView[last.verdict].icon}
              <p className="text-lg font-extrabold" data-testid="verdict">
                {verdictView[last.verdict].label}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              {audioPrompt && (
                <div className="mb-2 flex items-center gap-2">
                  <p className="flex-1 text-lg font-bold text-slate-900">{item.english}</p>
                  <SpeakButton seed={item.id} text={item.english} speech={speech} size="sm" />
                </div>
              )}
              <p className="text-xs font-bold text-slate-400">正解</p>
              {jaEn ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-2xl font-bold text-indigo-600" data-testid="answer-english">
                    {item.english}
                  </p>
                  <SpeakButton seed={item.id} text={item.english} speech={speech} label="正解の英語を再生" />
                </div>
              ) : (
                <p className="text-xl font-bold text-indigo-600">{item.japanese}</p>
              )}
              {last.input && (
                <>
                  <p className="mt-2 text-xs font-bold text-slate-400">あなたの答え</p>
                  <p className="text-sm text-slate-700">{last.input}</p>
                </>
              )}
              {(last.verdict === "wrong" || last.verdict === "empty") && answerMode !== "choice" && last.input && (
                <button type="button" onClick={override} className="mt-3 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                  意味は合っているので正解にする
                </button>
              )}
              <div className="mt-4">
                <Dialogue context={item.exampleContext} translation={item.exampleJapanese} seed={item.id} speech={speech} />
              </div>
            </div>
          </div>
        )}
      </div>

      {phase === "feedback" && (
        <button
          type="button"
          onClick={goNext}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-bold text-white transition active:scale-95"
        >
          {idx + 1 >= quiz.length ? "結果を見る" : "次の問題へ"} <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}

function TestResult({ results, scope, direction, speech, onRetryWrong, onRetry, onBack, earned = 0 }) {
  const sound = useSound();
  useEffect(() => sound.play("complete"), [sound]);
  const correct = results.filter((r) => r.correct).length;
  const pct = Math.round((correct / results.length) * 100);
  const wrong = results.filter((r) => !r.correct).map((r) => LIBRARY.byId[r.id]);
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6">
      <h1 className="text-2xl font-extrabold text-slate-900">テスト結果</h1>
      <p className="text-xs text-slate-500">
        {scopeLabel(scope)} ・ {direction === "ja-en" ? "日本語 → 英語" : "英語 → 意味"}
      </p>
      <div className="mt-4 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-6xl font-black text-slate-900 tabular-nums" data-testid="result-pct">
          {pct}
          <span className="text-2xl">%</span>
        </p>
        {earned > 0 && (
          <p className="mt-2 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700" data-testid="test-earned">
            ガチャポイント +{earned}
          </p>
        )}
        <p className="mt-1 text-sm text-slate-500 tabular-nums">
          {results.length}問中 {correct}問 正解
        </p>
        <p className="mt-3 text-sm font-bold text-slate-800">{resultMessage(pct)}</p>
        {wrong.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">間違えた{wrong.length}問は「未習得」に戻し、学習カードの最後に追加しました。</p>
        )}
      </div>

      {wrong.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-bold text-slate-800">間違えた問題</p>
          <ul className="mt-2 space-y-2">
            {wrong.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                <SpeakButton seed={p.id} text={p.english} speech={speech} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{p.english}</p>
                  <p className="text-sm text-slate-500">{p.japanese}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-2">
        {wrong.length > 0 && (
          <button type="button" onClick={() => onRetryWrong(wrong)} className="rounded-2xl bg-indigo-600 py-3.5 text-sm font-bold text-white transition active:scale-95">
            間違えた問題だけもう一度
          </button>
        )}
        <button type="button" onClick={onRetry} className="rounded-2xl bg-white py-3.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 transition active:scale-95">
          同じ条件でもう一度
        </button>
        <button type="button" onClick={onBack} className="rounded-2xl py-3 text-sm font-bold text-slate-500">
          設定に戻る
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// バトル（RPGモード）: 迫ってくる敵（単語）に答えて倒す
// ---------------------------------------------------------------------------
/** 演出の色（敵の種類ごとの爆発の色） */
const MONSTER_COLOR = {
  slime: "#4ade80",
  bat: "#a78bfa",
  ghost: "#e0e7ff",
  mushroom: "#f87171",
  goblin: "#a3e635",
  skull: "#67e8f9",
  eye: "#c084fc",
  fire: "#fb923c",
  golem: "#94a3b8",
  imp: "#f43f5e",
  dragon: "#fbbf24",
};
const FX_LIFE = 1100; // 演出を表示しておく時間（ms）

/** 要素をその場で少し動かす（Web Animations API。使えない環境では何もしない） */
const wiggle = (el, keyframes, duration) => {
  try {
    el?.animate?.(keyframes, { duration, easing: "ease-out" });
  } catch {
    /* 古いブラウザ */
  }
};

function TestKindSwitch({ value, onChange }) {
  return (
    <div className="mt-3">
      <Segmented
        name="test-kind"
        value={value}
        onChange={onChange}
        options={[
          { value: "test", label: "テスト", icon: PenLine },
          { value: "battle", label: "バトル", icon: Swords },
          { value: "quest", label: "冒険", icon: Castle },
        ]}
      />
    </div>
  );
}

const battleKey = (config) => (config.mode === "stage" ? `${config.chapter}@${config.direction}` : `${config.scope}@${config.direction}`);

function BattleSetup({ config, setConfig, record, misses, favorites, onStart, onSettings, switcher }) {
  const set = (patch) => setConfig({ ...config, ...patch });
  const stage = config.mode === "stage";
  const items = stage ? scopeItems(config.chapter, misses, favorites) : scopeItems(config.scope, misses, favorites);
  const key = battleKey(config);
  const stars = record.stars[key] || 0;
  const best = record.best[key] || 0;
  const weakCount = Object.keys(misses).length;
  const favCount = Object.keys(favorites).length;
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6">
      <ScreenHeader title="バトル" sub="迫ってくる単語を倒して覚える" onSettings={onSettings} />
      {switcher}
      <div className="mt-4 space-y-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="text-xs font-bold text-slate-500">モード</p>
          <div className="mt-1">
            <Segmented
              name="battle-mode"
              value={config.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: "stage", label: "ステージ" },
                { value: "endless", label: "エンドレス" },
              ]}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {stage
              ? `章や難易度がステージ。敵${STAGE_ENEMIES}体を倒すとボスが登場。ノーダメージでクリアすると★3（初回はレアチケットおまけ）。`
              : "10体倒すごとにレベルアップ。敵が少しずつ速く・多くなります。HP がなくなるまで何体倒せるか挑戦！"}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">{stage ? "ステージ（章・難易度）" : "出てくる単語"}</p>
          {stage ? (
            <ScopePicker
              key="stage"
              id="battle-chapter"
              value={config.chapter}
              onChange={(chapter) => set({ chapter })}
              levels
              special={[
                ["fav", `お気に入り ⭐（${favCount}問）`],
                ["weak", `苦手な問題（${weakCount}問）`],
              ]}
            />
          ) : (
            <ScopePicker
              key="endless"
              id="battle-scope"
              value={config.scope}
              onChange={(scope) => set({ scope })}
              levels
              special={[
                ["all", `全章から（${TOTAL}問）`],
                ["phrase", `フレーズ全部から（${KIND_ITEMS.phrase.length}問）`],
                ["word", `単語全部から（${KIND_ITEMS.word.length}問）`],
                ["weak", `苦手な問題（${weakCount}問）`],
                ["fav", `お気に入り ⭐（${favCount}問）`],
              ]}
            />
          )}
          <p className="mt-1 text-xs text-slate-500 tabular-nums" data-testid="battle-record">
            {stage ? `このステージの記録 ${"★".repeat(stars)}${"☆".repeat(3 - stars)}` : `最高得点 ${best}`}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">出てくる順番</p>
          <div className="mt-1">
            <Segmented
              name="battle-order"
              value={config.order || "random"}
              onChange={(order) => set({ order })}
              options={[
                { value: "random", label: "ランダム" },
                { value: "level", label: "難易度順" },
              ]}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {config.order === "level"
              ? "やさしい単語から順に、だんだん難しい単語が出てきます（近い難しさの中ではランダム）。"
              : "どの単語もランダムに出てきます。"}
          </p>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">出題の向き</p>
          <div className="mt-1">
            <Segmented
              name="battle-direction"
              value={config.direction}
              onChange={(direction) => set({ direction })}
              options={[
                { value: "en-ja", label: "英語 → 意味" },
                { value: "ja-en", label: "日本語 → 英語" },
              ]}
            />
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">攻撃のしかた（答え方）</p>
          <div className="mt-1">
            <Segmented
              name="battle-answer"
              value={config.answer}
              onChange={(answer) => set({ answer })}
              options={[
                { value: "choice", label: "4択", icon: ListChecks },
                { value: "type", label: "入力", icon: Keyboard },
                { value: "voice", label: "音声", icon: Mic },
              ]}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {config.answer === "choice" && "4つから選んで即攻撃。テンポよく連打できます。"}
            {config.answer === "type" && "答えを入力して Enter で攻撃。敵はゆっくり近づきます。"}
            {config.answer === "voice" && "マイクを押して話すと攻撃。敵はゆっくり近づきます。"}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-slate-900 p-3 text-xs leading-relaxed text-slate-200">
        <p>⚔️ 一番近い敵の単語に答えると攻撃。正解が続くとコンボで得点アップ。</p>
        <p>💥 間違えると敵が一気に近づき、敵が届くと HP が減ります（ボスは2）。</p>
        <p>
          🎁 ガチャポイント {BATTLE_POINTS.min}〜{BATTLE_POINTS.max}pt（遊んだ時間と成績で決まる）とレアチケット {BATTLE_TICKETS.min}〜{BATTLE_TICKETS.max}{" "}
          枚。エンドレスはレベルボーナスつき（Lv5 で +{endlessLevelBonus(5).toLocaleString()}・Lv10 で +{endlessLevelBonus(10).toLocaleString()}pt）。3体以上倒すともらえます。
        </p>
        <p>
          ⏳ 時止めの砂時計・🔥 必殺技の巻物は、ガチャの「ショップ」でメダルと交換できます。
        </p>
      </div>

      <button
        type="button"
        disabled={items.length < 4}
        onClick={() => onStart({ config, items, key })}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 py-4 text-base font-extrabold text-white shadow-lg transition active:scale-95 disabled:opacity-40"
      >
        <Swords size={20} /> バトル開始！
      </button>
      {items.length < 4 && <p className="mt-2 text-center text-xs text-slate-500">4問以上あると挑戦できます（苦手・お気に入りを増やそう）。</p>}
    </div>
  );
}

function BattleRun({ session, speech, recognition, onFinish, active = true, tools = { freeze: 0, special: 0 }, onUseItem = () => "持っていません" }) {
  const dopamine = useDopamine();
  const sound = useSound();
  const { config, items } = session;
  const jaEn = config.direction === "ja-en";
  const battle = useRef(null);
  if (!battle.current) {
    battle.current = createBattle({
      mode: config.mode,
      items,
      answer: config.answer,
      direction: config.direction,
      order: config.order,
      key: session.key,
    });
  }
  const [, setFrame] = useState(0);
  const [flash, setFlash] = useState(null);
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  const finished = useRef(false);
  const fieldRef = useRef(null);
  const heroRef = useRef(null);
  const enemyEls = useRef({}); // 敵の uid → 画面の要素（攻撃を受けたときに揺らす）
  const fx = useRef([]); // 表示中の演出
  const fxId = useRef(0);
  const [casting, setCasting] = useState(0);
  // ほかのタブを見ているあいだは一時停止（テスト画面は裏でも表示したままにしているため）
  const activeRef = useRef(active);
  activeRef.current = active;
  // 敵が出たとき（ボスの単語が変わったときも）に、表示している英単語を読み上げる（英語→意味のときだけ。日本語→英語では答えになるので読まない）
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const announced = useRef(new Set());
  const b = battle.current;
  const t = target(b);
  const pool = items.length >= 4 ? items : ALL_ITEMS;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    recognition.abort();
    sound.setBattleMusic(null);
    onFinish(battle.current);
  }, [onFinish, recognition, sound]);

  // BGM: このタブを見ているあいだだけ流す（ボスが出たらボス戦の曲）
  useEffect(() => {
    const play = () => {
      if (activeRef.current && !document.hidden && !finished.current) sound.setBattleMusic(battle.current.bossSpawned ? "boss" : "battle");
      else sound.setBattleMusic(null);
    };
    play();
    document.addEventListener("visibilitychange", play);
    return () => {
      document.removeEventListener("visibilitychange", play);
      sound.setBattleMusic(null);
    };
  }, [active, sound]);

  const addFx = (list) => {
    const at = performance.now();
    fx.current = [...fx.current.filter((f) => at - f.at < FX_LIFE), ...list.map((f) => ({ ...f, id: ++fxId.current, at }))];
  };
  /** 敵の画面上の位置（px）。上ほど小さく見える（遠近） */
  const layout = () => {
    const el = fieldRef.current;
    return { W: el?.clientWidth || 320, H: el?.clientHeight || 400 };
  };
  const enemyBox = (e, { W, H } = layout()) => {
    const scale = 0.72 + 0.38 * Math.min(e.y, 1);
    const size = Math.round((e.boss ? 110 : 60) * scale); // 上ほど小さく見える（文字は小さくしない）
    const top = 8 + Math.min(e.y, 1) * (H - (e.boss ? 190 : 140));
    // 単語の札は列の間隔（幅の30%）より少し狭く（29%）。となりの敵の札と重ならない。札が戦場の外にはみ出さないよう、端の列は内側に寄せる
    const labelW = Math.min(W * 0.29, 170);
    const x = Math.min(Math.max(e.x * W, labelW / 2 + 4), W - labelW / 2 - 4);
    return { x, top, cy: top + size / 2, size, scale, labelW };
  };

  // ゲームの時間を進める（画面が隠れているあいだは requestAnimationFrame が止まる）
  useEffect(() => {
    let raf;
    let last = performance.now();
    let bossSeen = false;
    const loop = (now) => {
      const bt = battle.current;
      const dt = activeRef.current ? Math.min(100, Math.max(0, now - last)) : 0;
      last = now;
      const hp = bt.hp;
      // E2E 用: __swipetalkBattleTime はゲーム内時間の速さ、__swipetalkBattleSpeed は敵の動きの速さ（0 で止まる）
      const clock = typeof window.__swipetalkBattleTime === "number" ? window.__swipetalkBattleTime : 1;
      const scale = typeof window.__swipetalkBattleSpeed === "number" ? window.__swipetalkBattleSpeed : 1;
      tick(bt, dt * clock, Math.random, scale);
      let fresh = null;
      for (const e of bt.enemies) {
        const key = `${e.uid}:${e.item.id}`;
        if (!announced.current.has(key)) {
          announced.current.add(key);
          fresh = e;
        }
      }
      if (fresh && !jaEn && activeRef.current) speechRef.current.speak(fresh.item.english, null, fresh.item.id);
      if (bt.hp < hp) {
        sound.play("hurt");
        setFlash({ type: "damage", text: "ダメージ！", at: now });
        addFx([{ kind: "vignette" }]);
        wiggle(
          fieldRef.current,
          [{ transform: "translate(0,0)" }, { transform: "translate(-8px,3px)" }, { transform: "translate(7px,-4px)" }, { transform: "translate(-5px,2px)" }, { transform: "translate(3px,2px)" }, { transform: "translate(0,0)" }],
          420
        );
        wiggle(heroRef.current, [{ opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], 600);
      }
      if (bt.bossSpawned && !bossSeen) {
        bossSeen = true;
        sound.play("complete");
        if (activeRef.current) sound.setBattleMusic("boss");
        setFlash({ type: "boss", text: "ボス出現！", at: now });
        addFx([{ kind: "warning" }]);
      }
      setFrame((n) => n + 1);
      if (bt.over) {
        finish();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [finish, sound]);

  const choices = useMemo(
    () => (t && config.answer === "choice" ? makeChoices(t.item, pool, Math.random, 4, jaEn ? "english" : "japanese") : []),
    // 狙う敵の単語が変わったときだけ選択肢を作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t?.uid, t?.item.id, config.answer, jaEn]
  );

  /**
   * 表示中の単語（itemId）に答える。狙う敵が入れ替わっていたら無視する。
   * how = "special" は必殺技の巻物（答えずに攻撃）
   */
  const answer = (itemId, correct, how = "answer") => {
    const bt = battle.current;
    const cur = target(bt);
    if (!cur || cur.item.id !== itemId || bt.over) return;
    const isSpecial = how === "special";
    const box = layout();
    const pos = enemyBox(cur, box);
    const hero = { x: box.W / 2, y: box.H - 44 };
    const kind = cur.boss ? "dragon" : monsterKindOf(cur.item.id);
    const color = MONSTER_COLOR[kind];
    const before = { score: bt.score, level: bt.level };
    const item = isSpecial ? battleSpecial(bt) : attack(bt, correct);
    const ev = bt.lastEvent;
    const now = performance.now();
    if (!isSpecial) dopamine.hit(correct);
    if (correct || isSpecial) {
      const killed = ev.type === "kill";
      sound.play("slash");
      if (killed) sound.play(ev.boss ? "bonus" : "explode");
      setCasting(now);
      wiggle(heroRef.current, [{ transform: "translateY(0)" }, { transform: "translateY(-8px) rotate(-5deg)" }, { transform: "translateY(0)" }], 260);
      const hit = [
        { kind: "bolt", x: pos.x, y: pos.cy, fx: hero.x - pos.x, fy: hero.y - pos.cy },
        { kind: "burst", x: pos.x, y: pos.cy, color, big: killed },
        { kind: "slash", x: pos.x, y: pos.cy, rot: -30 - Math.random() * 30 },
        { kind: "score", x: pos.x, y: pos.top, text: `+${bt.score - before.score}` },
      ];
      if (killed) {
        const n = cur.boss ? 18 : 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
          const d = (cur.boss ? 70 : 38) + Math.random() * 30;
          hit.push({ kind: "particle", x: pos.x, y: pos.cy, dx: Math.cos(a) * d, dy: Math.sin(a) * d, color: i % 3 ? color : "#fef08a" });
        }
        hit.push({ kind: "die", x: pos.x, top: pos.top, size: pos.size, monster: kind });
      } else {
        wiggle(
          enemyEls.current[cur.uid],
          [{ filter: "brightness(4) saturate(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { filter: "none" }],
          380
        );
      }
      addFx(hit);
      const levelUp = bt.level > before.level;
      if (levelUp) setTimeout(() => sound.play("levelup"), 250);
      setFlash({
        type: levelUp ? "level" : "kill",
        text: levelUp
          ? `LEVEL UP! Lv.${bt.level}`
          : isSpecial
          ? `必殺技！「${jaEn ? item.english : item.japanese.split("／")[0]}」`
          : killed
          ? ev.boss
            ? "ボス撃破！"
            : "撃破！"
          : "ヒット！",
        at: now,
      });
      if (jaEn || isSpecial) speech.speak(item.english, null, item.id);
      if (isSpecial) {
        addFx([{ kind: "special" }]);
        sound.play("ssr");
      }
    } else {
      sound.play("wrong");
      addFx([
        { kind: "fizzle", x: (pos.x + hero.x) / 2, y: (pos.cy + hero.y) / 2 },
        { kind: "score", x: pos.x, y: pos.top, text: "MISS", miss: true },
      ]);
      wiggle(
        enemyEls.current[cur.uid],
        [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(12px) scale(1.18)" }, { transform: "translateY(0) scale(1)" }],
        400
      );
      setFlash({ type: "wrong", text: `正解は「${jaEn ? item.english : item.japanese.split("／")[0]}」`, at: now });
    }
    setInput("");
    setFrame((n) => n + 1);
    if (bt.over) finish();
    if (config.answer !== "choice") setTimeout(() => inputRef.current?.focus(), 0);
  };

  const grade = (text, item) => (jaEn ? gradeEnglish(text, item.english) : gradeAnswer(text, item.japanese));
  const submitText = (e) => {
    e.preventDefault();
    if (!t || !input.trim()) return;
    answer(t.item.id, isCorrect(grade(input, t.item).verdict));
  };
  const listen = () => {
    if (!t) return;
    const item = t.item;
    recognition.start((alts) => {
      const ok = alts.some((a) => isCorrect(grade(a, item).verdict));
      answer(item.id, ok);
    }, jaEn ? "en-US" : "ja-JP");
  };

  /** 道具を使う（時止め・必殺技） */
  const useItem = (id) => {
    const bt = battle.current;
    if (bt.over || (id === "special" && !target(bt))) return;
    const err = onUseItem(id);
    if (err) return setFlash({ type: "wrong", text: err, at: performance.now() });
    if (id === "freeze") {
      battleFreeze(bt);
      sound.play("charge");
      setFlash({ type: "freeze", text: "時よ止まれ！", at: performance.now() });
      addFx([{ kind: "freeze" }]);
      setFrame((n) => n + 1);
    } else {
      answer(target(bt).item.id, true, "special");
    }
  };
  const frozen = isFrozen(b);

  const showFlash = flash && performance.now() - flash.at < 1400;
  const stageLabel =
    b.mode === "stage" ? (b.bossSpawned ? "BOSS" : `敵 ${Math.min(b.kills, STAGE_ENEMIES)} / ${STAGE_ENEMIES}`) : `Lv.${b.level}`;

  return (
    <div className="flex h-full flex-col px-4 pt-3 pb-3" data-testid="battle">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            quit(battle.current);
            finish();
          }}
          aria-label="バトルをやめる"
          className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200"
        >
          やめる
        </button>
        <p className="flex items-center gap-0.5" data-testid="battle-hp" aria-label={`HP ${b.hp}`}>
          {Array.from({ length: b.maxHp }, (_, i) => (
            <Heart
              key={i}
              size={18}
              className={i < b.hp ? "fill-rose-500 text-rose-600 drop-shadow" : "text-slate-300"}
              strokeWidth={2.5}
            />
          ))}
        </p>
        <p className="ml-auto text-right text-xs font-bold tabular-nums text-slate-500">
          {stageLabel}
          <span className="block text-base font-black text-slate-900" data-testid="battle-score">
            {b.score}
          </span>
        </p>
      </div>

      {/* 戦場: 敵が上から迫ってくる */}
      <div
        ref={fieldRef}
        className="relative mt-2 min-h-[220px] flex-1 overflow-hidden rounded-3xl bg-slate-950 shadow-inner ring-1 ring-black/20"
        data-testid="battle-field"
      >
        <BattleBackdrop />
        {b.enemies.map((e) => {
          const isTarget = t && e.uid === t.uid;
          const box = enemyBox(e);
          return (
            <div
              key={e.uid}
              data-testid="enemy"
              data-target={isTarget ? "1" : "0"}
              data-phrase-id={e.item.id}
              data-boss={e.boss ? "1" : "0"}
              className="absolute flex flex-col items-center"
              style={{ left: box.x, top: box.top, transform: "translateX(-50%)", zIndex: isTarget ? 140 : 10 + Math.round(e.y * 100) }}
            >
              <div className="relative" ref={(el) => (el ? (enemyEls.current[e.uid] = el) : delete enemyEls.current[e.uid])}>
                <span
                  className={`absolute bottom-0 left-1/2 block rounded-[50%] ${isTarget ? "bt-ring border-2 border-amber-300 bg-amber-300/20" : "bg-black/35"}`}
                  style={{ width: box.size * 0.8, height: box.size * 0.22, transform: "translateX(-50%)", marginBottom: -box.size * 0.06 }}
                />
                <div className="relative drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]">
                  {e.boss ? <Dragon size={box.size} /> : <Monster kind={monsterKindOf(e.item.id)} size={box.size} />}
                </div>
              </div>
              {e.boss && (
                <div className="mt-1 h-2 w-24 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/30">
                  <div className="h-full bg-gradient-to-r from-rose-500 to-amber-400 transition-all" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
                </div>
              )}
              <span
                data-testid="enemy-label"
                style={{ maxWidth: box.labelW }}
                className={`mt-1 block break-words rounded-xl px-2.5 py-0.5 text-center text-xs font-extrabold leading-snug shadow ${
                  isTarget ? "bg-white text-slate-900 ring-2 ring-amber-400" : "bg-slate-900/60 text-white ring-1 ring-white/20"
                }`}
              >
                {jaEn ? e.item.japanese.split("／")[0] : e.item.english}
              </span>
            </div>
          );
        })}

        {/* 演出（弾・爆発・粒・得点） */}
        <div className="pointer-events-none absolute inset-0" style={{ zIndex: 200 }}>
          {fx.current
            .filter((f) => performance.now() - f.at < FX_LIFE)
            .map((f) => {
              const at = { position: "absolute", left: f.x, top: f.y };
              switch (f.kind) {
                case "bolt":
                  return (
                    <span key={f.id} className="bt-bolt" style={{ ...at, marginLeft: -9, marginTop: -9, "--fx": `${f.fx}px`, "--fy": `${f.fy}px` }}>
                      <span className="block h-[18px] w-[18px] rounded-full bg-cyan-100 shadow-[0_0_14px_6px_rgba(34,211,238,0.9)]" />
                    </span>
                  );
                case "burst":
                  return (
                    <span
                      key={f.id}
                      className="bt-burst block rounded-full"
                      style={{ ...at, width: f.big ? 70 : 44, height: f.big ? 70 : 44, background: `radial-gradient(circle, #fff 0%, ${f.color} 45%, transparent 70%)` }}
                    />
                  );
                case "slash":
                  return (
                    <span
                      key={f.id}
                      className="bt-slash block h-[5px] w-24 rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,0.9)]"
                      style={{ ...at, "--rot": `${f.rot}deg` }}
                    />
                  );
                case "particle":
                  return (
                    <span
                      key={f.id}
                      className="bt-particle block h-2 w-2 rounded-full"
                      style={{ ...at, background: f.color, boxShadow: `0 0 6px 2px ${f.color}`, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` }}
                    />
                  );
                case "die":
                  return (
                    <span key={f.id} className="bt-die block" style={{ position: "absolute", left: f.x, top: f.top, transformOrigin: "50% 50%" }}>
                      {f.monster === "dragon" ? <Dragon size={f.size} /> : <Monster kind={f.monster} size={f.size} />}
                    </span>
                  );
                case "score":
                  return (
                    <span
                      key={f.id}
                      className={`bt-score block whitespace-nowrap text-xl font-black ${f.miss ? "text-rose-300" : "text-amber-200"}`}
                      style={{ ...at, textShadow: "0 2px 0 rgba(0,0,0,0.6), 0 0 10px rgba(251,191,36,0.8)" }}
                    >
                      {f.text}
                    </span>
                  );
                case "fizzle":
                  return <span key={f.id} className="bt-fizzle block h-6 w-6 rounded-full border-2 border-slate-300/80" style={at} />;
                case "vignette":
                  return <span key={f.id} className="bt-vignette absolute inset-0 block" />;
                case "warning":
                  return <span key={f.id} className="bt-warning absolute inset-0 block" />;
                case "special":
                  return <span key={f.id} className="bt-special absolute inset-0 block" />;
                case "freeze":
                  return <span key={f.id} className="gc-flash absolute inset-0 block bg-cyan-100/70" />;
                default:
                  return null;
              }
            })}
        </div>

        {showFlash && (
          <p
            key={flash.at}
            data-testid="battle-flash"
            className={`bt-pop absolute inset-x-4 top-[38%] text-center text-3xl font-black italic tracking-tight ${
              flash.type === "kill"
                ? "text-amber-300"
                : flash.type === "level"
                ? "text-cyan-200"
                : flash.type === "boss"
                ? "text-rose-300"
                : flash.type === "damage"
                ? "text-rose-400"
                : "text-white"
            }`}
            style={{ zIndex: 300, textShadow: "0 3px 0 rgba(0,0,0,0.7), 0 0 16px rgba(0,0,0,0.6)" }}
          >
            {flash.text}
          </p>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center" style={{ zIndex: 150 }}>
          <div ref={heroRef} className="drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)]">
            <Hero casting={performance.now() - casting < 300} />
          </div>
        </div>
        {frozen && (
          <div className="pointer-events-none absolute inset-0 bg-cyan-300/25 ring-4 ring-inset ring-cyan-200/70" style={{ zIndex: 190 }} data-testid="battle-frozen">
            <p className="absolute left-3 top-2 flex items-center gap-1 text-xs font-black text-cyan-100">
              <Hourglass size={14} /> 時止め中
            </p>
          </div>
        )}
        {b.combo >= 2 && (
          <p
            key={b.combo}
            className="bt-combo absolute right-3 top-2 text-sm font-black text-amber-300"
            style={{ zIndex: 300, textShadow: "0 0 8px rgba(251,191,36,0.9), 0 2px 0 rgba(0,0,0,0.6)" }}
            data-testid="battle-combo"
          >
            🔥 {b.combo} COMBO
          </p>
        )}
      </div>

      {/* 道具 */}
      <div className="mt-2 flex justify-center gap-2" data-testid="battle-items">
        <button
          type="button"
          disabled={!tools.freeze || frozen}
          onClick={() => useItem("freeze")}
          className="flex items-center gap-1 rounded-full bg-cyan-600 px-3 py-1.5 text-xs font-extrabold text-white shadow transition active:scale-95 disabled:opacity-35"
        >
          <Hourglass size={14} /> 時止め ×{tools.freeze}
        </button>
        <button
          type="button"
          disabled={!tools.special || !t}
          onClick={() => useItem("special")}
          className="flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-rose-600 px-3 py-1.5 text-xs font-extrabold text-white shadow transition active:scale-95 disabled:opacity-35"
        >
          <FlameIcon size={14} /> 必殺技 ×{tools.special}
        </button>
      </div>

      {/* 攻撃（答える） */}
      <div className="mt-2">
        <p className="text-center text-xs font-bold text-slate-500">
          {t ? (
            <>
              <span className="break-words text-sm text-slate-900" data-testid="battle-question">
                {jaEn ? t.item.japanese : t.item.english}
              </span>
              {jaEn ? " を英語で！" : " の意味は？"}
            </>
          ) : (
            "敵が来るのを待っています…"
          )}
        </p>
        {config.answer === "choice" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                data-testid="battle-choice"
                data-correct={c.id === t?.item.id ? "1" : "0"}
                onClick={() => t && answer(t.item.id, c.id === t.item.id)}
                className="min-h-[3.25rem] rounded-2xl bg-white px-2 py-2 text-sm font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 transition active:scale-95"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        {(config.answer === "type" || (config.answer === "voice" && !recognition.supported)) && (
          <form onSubmit={submitText} className="mt-2 flex gap-2">
            <input
              id="battle-answer"
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={config.answer === "voice" ? "キーボードのマイク（🎤）で話す" : jaEn ? "英語で入力" : "意味を入力"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              lang={jaEn ? "en" : "ja"}
              className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-base shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
            <button type="submit" disabled={!t || !input.trim()} className="rounded-2xl bg-rose-500 px-4 text-sm font-extrabold text-white disabled:opacity-40">
              攻撃
            </button>
          </form>
        )}
        {config.answer === "voice" && recognition.supported && (
          <div className="mt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="話して攻撃"
              disabled={!t}
              onClick={() => (recognition.listening ? recognition.stop() : listen())}
              className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition active:scale-90 disabled:opacity-40 ${
                recognition.listening ? "animate-pulse bg-rose-500" : "bg-indigo-600"
              }`}
            >
              {recognition.listening ? <Check size={28} strokeWidth={3} /> : <Mic size={28} />}
            </button>
            <p className="min-h-[1.5rem] max-w-[12rem] text-xs text-slate-600">
              {recognition.listening ? recognition.interim || "聞き取り中…話し終わったら ✓" : "マイクを押して話すと攻撃"}
            </p>
          </div>
        )}
        {config.answer !== "choice" && (
          <button
            type="button"
            disabled={!t}
            onClick={() => t && answer(t.item.id, false)}
            className="mx-auto mt-2 block rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200 disabled:opacity-40"
          >
            わからない（答えを見る）
          </button>
        )}
      </div>
    </div>
  );
}

/** ⭐ お気に入りボタン */
function FavButton({ id, favorites, onToggle, size = 18, className = "" }) {
  const on = !!favorites?.[id];
  return (
    <button
      type="button"
      aria-label={on ? "お気に入りから外す" : "お気に入りに追加"}
      aria-pressed={on}
      data-testid="fav"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(id);
      }}
      className={`shrink-0 rounded-full p-1.5 transition active:scale-90 ${on ? "text-amber-400" : "text-slate-300 hover:text-amber-300"} ${className}`}
    >
      <Star size={size} className={on ? "fill-amber-400" : ""} />
    </button>
  );
}

/** 撃破した単語の復習: タップすると意味が出る（英→日）／英語が出る（日→英） */
function DefeatedReview({ items, jaEn, speech, favorites, onToggleFavorite }) {
  const [shown, setShown] = useState({});
  const all = items.length > 0 && items.every((p) => shown[p.id]);
  return (
    <div className="mt-4" data-testid="defeated-review">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">撃破した単語を復習（{items.length}語）</p>
        <button
          type="button"
          onClick={() => setShown(all ? {} : Object.fromEntries(items.map((p) => [p.id, true])))}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
        >
          {all ? "答えを隠す" : "答えを全部見る"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">タップで答えを確認。覚えたい単語は ⭐ でお気に入りに。</p>
      <ul className="mt-2 space-y-2">
        {items.map((p) => (
          <li
            key={p.id}
            onClick={() => setShown((s) => ({ ...s, [p.id]: !s[p.id] }))}
            className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
            data-testid="defeated-item"
          >
            <SpeakButton seed={p.id} text={p.english} speech={speech} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{jaEn ? p.japanese.split("／")[0] : p.english}</p>
              <p className={`text-sm ${shown[p.id] ? "text-slate-500" : "text-slate-300"}`}>
                {shown[p.id] ? (jaEn ? p.english : p.japanese) : "タップで答え"}
              </p>
            </div>
            <FavButton id={p.id} favorites={favorites} onToggle={onToggleFavorite} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BattleResult({ battle, reward, speech, onRetry, onNext, onBack, favorites = {}, onToggleFavorite = () => {} }) {
  const sound = useSound();
  useEffect(() => sound.play(battle.cleared ? "complete" : "again"), [sound, battle.cleared]);
  const stage = battle.mode === "stage";
  const wrong = resultsOf(battle)
    .filter((r) => !r.correct)
    .map((r) => LIBRARY.byId[r.id])
    .filter(Boolean);
  const defeated = resultsOf(battle)
    .filter((r) => r.correct)
    .map((r) => LIBRARY.byId[r.id])
    .filter(Boolean);
  const title = stage ? (battle.cleared ? "STAGE CLEAR!" : "GAME OVER") : "RESULT";
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6" data-testid="battle-result">
      <div
        className={`rounded-3xl p-6 text-center text-white shadow-lg ${
          battle.cleared ? "bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500" : "bg-gradient-to-br from-slate-700 to-indigo-900"
        }`}
      >
        <p className="text-3xl font-black tracking-wide" data-testid="battle-result-title">
          {title}
        </p>
        {stage && battle.cleared && (
          <p className="mt-2 text-4xl tracking-widest text-yellow-200" data-testid="battle-stars">
            {"★".repeat(reward.stars)}
            <span className="opacity-40">{"★".repeat(3 - reward.stars)}</span>
          </p>
        )}
        <p className="mt-3 text-5xl font-black tabular-nums">{battle.score}</p>
        <p className="text-xs font-bold text-white/80 tabular-nums">
          撃破 {battle.kills} ・ 最大コンボ {battle.maxCombo} ・ 残り HP {battle.hp}
        </p>
        {reward.newBest && <p className="mt-2 text-sm font-black text-yellow-200">最高得点を更新！</p>}
      </div>

      <div className="mt-3 rounded-2xl bg-indigo-50 px-4 py-3 text-center text-sm font-bold text-indigo-700" data-testid="battle-reward">
        ガチャポイント +{reward.points}
        {reward.boosted && `（${BOOST_RATE}倍ブースト！）`}
        {reward.tickets > 0 && `・レアチケット +${reward.tickets}`}
        {reward.firstStar3 && <span className="block text-xs">初めての★3でチケットおまけ +2 枚！</span>}
        {reward.levelBonus > 0 && (
          <span className="block text-xs" data-testid="level-bonus">
            （Lv.{battle.level} 到達ボーナス +{reward.levelBonus.toLocaleString()}pt を含む）
          </span>
        )}
        {reward.tickets === 0 && <span className="block text-xs font-normal text-indigo-500">3体以上倒すと、レアチケットと {BATTLE_POINTS.min}pt 以上がもらえます</span>}
      </div>

      {wrong.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-bold text-slate-800">間違えた・逃した単語（苦手に追加しました）</p>
          <ul className="mt-2 space-y-2">
            {wrong.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                <SpeakButton seed={p.id} text={p.english} speech={speech} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{p.english}</p>
                  <p className="text-sm text-slate-500">{p.japanese}</p>
                </div>
                <FavButton id={p.id} favorites={favorites} onToggle={onToggleFavorite} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {defeated.length > 0 && (
        <DefeatedReview items={defeated} jaEn={battle.direction === "ja-en"} speech={speech} favorites={favorites} onToggleFavorite={onToggleFavorite} />
      )}

      <div className="mt-5 grid gap-2">
        {onNext && (
          <button type="button" onClick={onNext} className="rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 py-3.5 text-sm font-extrabold text-white">
            次のステージへ
          </button>
        )}
        <button type="button" onClick={onRetry} className="rounded-2xl bg-white py-3.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
          もう一度
        </button>
        <button type="button" onClick={onBack} className="rounded-2xl py-3 text-sm font-bold text-slate-500">
          設定に戻る
        </button>
      </div>
    </div>
  );
}

function TestScreen({ active, state, settings, setSettings, speech, onFinishTest, onFinishBattle, onSettings, onUseItem, onToggleFavorite, quest }) {
  const sound = useSound();
  const dopamine = useDopamine();
  const recognition = useRecognition();
  const [session, setSession] = useState(null); // { quiz, pool, runId }
  const [result, setResult] = useState(null);
  const [earned, setEarned] = useState(0);
  const [battle, setBattle] = useState(null); // { config, items, key, runId }
  const [battleResult, setBattleResult] = useState(null); // { battle, reward }
  const config = settings.test;
  const setConfig = (test) => setSettings((s) => ({ ...s, test }));
  const battleConfig = settings.battle;
  const setBattleConfig = (b) => setSettings((s) => ({ ...s, battle: b }));
  const switcher = <TestKindSwitch value={settings.play} onChange={(play) => setSettings((s) => ({ ...s, play }))} />;
  const startBattle = (b) => {
    setBattleResult(null);
    setBattle({ ...b, runId: Date.now() });
  };
  const onBattleOver = useCallback(
    (b) => {
      const reward = onFinishBattle(b);
      setBattleResult({ battle: b, reward });
    },
    [onFinishBattle]
  );

  if (battleResult) {
    const cfg = battle.config;
    const nextChapter = cfg.mode === "stage" && battleResult.battle.cleared ? CHAPTERS[CHAPTER_NO[cfg.chapter]] : null;
    return (
      <BattleResult
        battle={battleResult.battle}
        reward={battleResult.reward}
        speech={speech}
        favorites={state.favorites}
        onToggleFavorite={onToggleFavorite}
        onRetry={() => startBattle(battle)}
        onNext={
          nextChapter
            ? () => {
                const next = { ...cfg, chapter: nextChapter.id };
                setBattleConfig(next);
                startBattle({ config: next, items: nextChapter.items, key: battleKey(next) });
              }
            : null
        }
        onBack={() => {
          setBattleResult(null);
          setBattle(null);
        }}
      />
    );
  }
  if (battle) {
    return (
      <BattleRun
        key={battle.runId}
        active={active}
        session={battle}
        speech={speech}
        recognition={recognition}
        onFinish={onBattleOver}
        tools={state.gacha.items}
        onUseItem={onUseItem}
      />
    );
  }
  if (settings.play === "quest" && !session && !result) {
    return (
      <QuestScreen
        active={active}
        state={state}
        cards={CATALOG.cards}
        pool={QUEST_POOL}
        chestWords={CHEST_WORDS}
        speech={speech}
        sound={sound}
        dopamine={dopamine}
        header={
          <>
            <ScreenHeader title="冒険" sub="集めた単語を装備して、塔をのぼろう" onSettings={onSettings} />
            {switcher}
          </>
        }
        onEquip={quest.onEquip}
        onAutoEquip={quest.onAutoEquip}
        onSavePreset={quest.onSavePreset}
        onLoadPreset={quest.onLoadPreset}
        onFinish={quest.onFinish}
      />
    );
  }
  if (settings.play === "battle" && !session && !result) {
    return (
      <BattleSetup
        config={battleConfig}
        setConfig={setBattleConfig}
        record={state.battle}
        misses={state.misses}
        favorites={state.favorites}
        onStart={startBattle}
        onSettings={onSettings}
        switcher={switcher}
      />
    );
  }

  const start = (pool, items = null) => {
    const quiz = items || buildQuiz(pool, config.count, Math.random);
    setResult(null);
    setSession({ quiz, pool, runId: Date.now() });
  };

  if (result) {
    return (
      <TestResult
        results={result}
        earned={earned}
        scope={config.scope}
        direction={config.direction}
        speech={speech}
        onRetryWrong={(wrong) => start(session.pool, buildQuiz(wrong, wrong.length, Math.random))}
        onRetry={() => start(session.pool)}
        onBack={() => {
          setResult(null);
          setSession(null);
        }}
      />
    );
  }
  if (session) {
    return (
      <TestRun
        key={session.runId}
        active={active}
        quiz={session.quiz}
        pool={session.pool}
        config={config}
        speech={speech}
        recognition={recognition}
        onQuit={() => setSession(null)}
        onFinish={(results) => {
          // 取り組んだ時間ぶんのポイント（放っておいた時間は1問60秒までで切る）
          const seconds = Math.min((Date.now() - session.runId) / 1000, results.length * 60);
          setEarned(onFinishTest(testKey(config.scope, config.direction), results, seconds) || 0);
          setResult(results);
        }}
      />
    );
  }
  return (
    <TestSetup
      config={config}
      setConfig={setConfig}
      misses={state.misses}
      favorites={state.favorites}
      tests={state.tests}
      onStart={(pool) => start(pool)}
      onSettings={onSettings}
      switcher={switcher}
    />
  );
}

// ---------------------------------------------------------------------------
// シャドーイング画面
// ---------------------------------------------------------------------------
const PAUSE_OPTIONS = [
  { value: 1, label: "短め" },
  { value: 1.5, label: "ふつう" },
  { value: 2, label: "長め" },
];

function Toggle({ id, checked, onChange, label }) {
  return (
    <label
      htmlFor={id}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${
        checked ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200"
      }`}
    >
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const PRON_KEY = "swipetalk:pronunciation";

/** 1行ぶんの発音チェック結果: 色分け・聞こえた文・講評・つまずきと直し方 */
function PronunciationDetail({ check }) {
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-white/70 p-2.5 ring-1 ring-slate-200" data-testid="pron-detail">
      <p className="flex items-center justify-between text-xs font-bold text-slate-700">
        <span data-testid="shadow-score">発音チェック {Math.round(check.ratio * 100)}%</span>
        <span className="text-slate-500">{verdictText(check.ratio)}</span>
      </p>
      <p className="text-xs text-slate-500">
        聞こえた文: <span className="font-semibold text-slate-700">{check.heard || "（聞き取れませんでした）"}</span>
      </p>
      {check.issues.length > 0 && (
        <ul className="space-y-1.5">
          {check.issues.map((issue, k) => (
            <li key={k} className="rounded-lg bg-rose-50 px-2.5 py-2 text-xs leading-relaxed text-rose-900" data-testid="pron-issue">
              <p className="font-bold">
                「{issue.word}」{issue.heardAs ? `→「${issue.heardAs}」と聞こえた` : "が聞き取られなかった"}
                <span className="ml-1 rounded bg-rose-200/70 px-1.5 py-0.5 text-[10px]">{issue.label}</span>
              </p>
              <p className="mt-0.5 text-rose-800/90">{issue.tip}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** これまでの発音チェックの振り返り（よくあるつまずき + 履歴） */
function PronunciationReview({ log, speech, onClose, onClear }) {
  const common = commonIssues(log).slice(0, 3);
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="発音の振り返り"
        className="w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl"
        style={{ maxHeight: "88dvh", paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">発音の振り返り</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        {common.length > 0 && (
          <div className="mt-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-xs font-bold text-amber-800">よくあるつまずき</p>
            <ul className="mt-2 space-y-2">
              {common.map((c) => (
                <li key={c.kind} className="text-xs leading-relaxed text-amber-900">
                  <span className="font-bold">
                    {c.label}（{c.count}回）
                  </span>
                  ：{c.tip}
                </li>
              ))}
            </ul>
          </div>
        )}
        <ul className="mt-4 space-y-3">
          {log.map((entry, k) => (
            <li key={`${entry.at}-${k}`} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-bold text-slate-800">
                  {entry.words.map((w, j) => (
                    <span key={j} className={w.ok ? "text-emerald-600" : "text-rose-500 underline decoration-2"}>
                      {w.text}{" "}
                    </span>
                  ))}
                </p>
                <SpeakButton text={entry.text} role={entry.role} seed={entry.id} speech={speech} size="sm" label="お手本を聞く" />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {Math.round(entry.ratio * 100)}% ・ 聞こえた文: {entry.heard || "（聞き取れず）"} ・{" "}
                {new Date(entry.at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
              </p>
              {entry.issues.map((issue, j) => (
                <p key={j} className="mt-1 text-xs text-rose-700">
                  ・「{issue.word}」{issue.heardAs ? `→「${issue.heardAs}」` : "が抜けた"}（{issue.label}）
                </p>
              ))}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => (confirmClear ? onClear() : setConfirmClear(true))}
          className={`mt-4 w-full rounded-xl py-2.5 text-xs font-bold ${confirmClear ? "bg-rose-500 text-white" : "bg-slate-50 text-slate-400 ring-1 ring-slate-200"}`}
        >
          {confirmClear ? "もう一度タップで振り返りを消す" : "振り返りを消す"}
        </button>
      </div>
    </div>
  );
}

function ShadowScreen({ state, settings, speech, onShadowDone, onSettings }) {
  const recognition = useRecognition();
  const [chapterId, setChapterId] = useState(state.chapter);
  const chapter = CHAPTER_BY_ID[chapterId] || CHAPTERS[0];
  const [itemIdx, setItemIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | model | turn | done
  const [turnMs, setTurnMs] = useState(0);
  const [checks, setChecks] = useState({});
  const [opts, setOpts] = useState({ hideText: false, showJa: true, pause: 1.5, check: false });
  const timer = useRef(null);
  const run = useRef(0);
  const autoStart = useRef(false);

  const item = chapter.items[Math.min(itemIdx, chapter.items.length - 1)];
  const steps = useMemo(() => shadowSteps(item), [item]);
  const playing = phase === "model" || phase === "turn";
  const reviewAt = useRef(null);
  const [pronLog, setPronLog] = useState(() => storage.load(PRON_KEY) || []);
  const [showReview, setShowReview] = useState(false);
  /** 発音チェックの結果を振り返り用に残す（この端末に最新100件） */
  const savePronunciation = (entry) =>
    setPronLog((log) => {
      const next = [{ ...entry, at: Date.now() }, ...log].slice(0, 100);
      storage.save(PRON_KEY, next);
      return next;
    });

  const halt = useCallback(() => {
    run.current++;
    reviewAt.current = null;
    clearTimeout(timer.current);
    speech.stop();
    recognition.abort();
  }, [speech, recognition]);

  useEffect(() => () => halt(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // マイクが使えないと分かったら発音チェックを切る（練習自体は続ける）
  useEffect(() => {
    if (recognition.error && opts.check) setOpts((o) => ({ ...o, check: false }));
  }, [recognition.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishItem = (my) => {
    if (run.current !== my) return;
    onShadowDone();
    if (itemIdx + 1 < chapter.items.length) {
      autoStart.current = true;
      setChecks({});
      setLineIdx(0);
      setItemIdx(itemIdx + 1);
    } else {
      setPhase("done");
    }
  };

  const advance = (i, my) => {
    if (run.current !== my) return;
    if (i + 1 < steps.length) playStep(i + 1);
    else finishItem(my);
  };

  const startTurn = (i, my) => {
    if (run.current !== my) return;
    const step = steps[i];
    const ms = pauseMs(step.text, settings.rate, opts.pause);
    setPhase("turn");
    setTurnMs(ms);
    if (opts.check && recognition.supported) {
      let result = null;
      recognition.start(
        (alts) => {
          if (run.current !== my) return;
          result = analyzePronunciation(alts[0] || "", step.text);
          setChecks((c) => ({ ...c, [i]: result }));
          savePronunciation({ id: item.id, text: step.text, role: step.role, ...result });
        },
        "en-US",
        () => {
          if (run.current !== my) return;
          // ほぼ完璧なら次へ。直すところがあれば止まって、結果を読んでから進めるようにする
          if (result && result.ratio >= 0.95) timer.current = setTimeout(() => advance(i, my), 900);
          else {
            reviewAt.current = { i, my };
            setPhase("review");
          }
        }
      );
    } else {
      timer.current = setTimeout(() => advance(i, my), ms);
    }
  };

  function playStep(i) {
    const my = ++run.current;
    clearTimeout(timer.current);
    recognition.abort();
    setLineIdx(i);
    setPhase("model");
    const step = steps[i];
    const ok = speech.speakLines([{ text: step.text, role: step.role }], `shadow:${item.id}:${i}`, () => startTurn(i, my), item.id);
    // 読み上げできない環境では、お手本の長さを見積もって待つ
    if (!ok) timer.current = setTimeout(() => startTurn(i, my), pauseMs(step.text, settings.rate, 1));
  }

  useEffect(() => {
    if (autoStart.current) {
      autoStart.current = false;
      playStep(0);
    }
  }, [itemIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => {
    halt();
    setPhase("idle");
  };

  const jump = (nextIdx) => {
    const wasPlaying = playing;
    halt();
    setChecks({});
    setLineIdx(0);
    setPhase("idle");
    if (nextIdx === itemIdx) {
      if (wasPlaying) playStep(0);
      return;
    }
    autoStart.current = wasPlaying;
    setItemIdx(nextIdx);
  };

  const changeChapter = (id) => {
    halt();
    autoStart.current = false;
    setChapterId(id);
    setItemIdx(0);
    setLineIdx(0);
    setChecks({});
    setPhase("idle");
  };

  const nextFromReview = () => {
    const at = reviewAt.current;
    if (!at) return;
    run.current = at.my; // 止まっていた位置から続ける
    advance(at.i, at.my);
  };

  const togglePlay = () => {
    if (playing) return pause();
    if (phase === "review") return nextFromReview();
    if (phase === "done") {
      jump(0);
      autoStart.current = true;
      return;
    }
    playStep(lineIdx);
  };

  const statusText = {
    idle: "▶ を押すと、お手本 → あなたの番 の順に進みます",
    model: "お手本を聞いて…",
    turn: opts.check ? "あなたの番！マイクに向かって真似して言おう" : "あなたの番！すぐに真似して言おう",
    review: "赤い語を確認して「もう一度」か「次へ」",
    done: "この章のシャドーイングが終わりました！",
  }[phase];

  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-3">
      <ScreenHeader title="シャドーイング" sub="聞いて、すぐ真似して言う" onSettings={onSettings} />
      <ChapterSelect id="shadow-chapter" value={chapter.id} onChange={changeChapter} className="mt-3" />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Toggle id="shadow-hide" checked={opts.hideText} onChange={(v) => setOpts((o) => ({ ...o, hideText: v }))} label="英文を隠す" />
        <Toggle id="shadow-ja" checked={opts.showJa} onChange={(v) => setOpts((o) => ({ ...o, showJa: v }))} label="訳を表示" />
        {recognition.supported && (
          <Toggle id="shadow-check" checked={opts.check} onChange={(v) => setOpts((o) => ({ ...o, check: v }))} label="発音チェック" />
        )}
        {pronLog.length > 0 && (
          <button
            type="button"
            onClick={() => setShowReview(true)}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200"
          >
            振り返り {pronLog.length}
          </button>
        )}
      </div>
      {showReview && (
        <PronunciationReview
          log={pronLog}
          speech={speech}
          onClose={() => setShowReview(false)}
          onClear={() => {
            storage.save(PRON_KEY, []);
            setPronLog([]);
            setShowReview(false);
          }}
        />
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-xs font-bold text-slate-500">あなたの番の長さ</span>
        <div className="flex-1">
          <Segmented name="pause" value={opts.pause} onChange={(pause) => setOpts((o) => ({ ...o, pause }))} options={PAUSE_OPTIONS} />
        </div>
      </div>
      <SpeedBar className="mt-2" />
      {recognition.error && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{recognition.error}</p>}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-bold text-slate-400 tabular-nums" data-testid="shadow-counter">
          {itemIdx + 1} / {chapter.items.length}
        </p>
        <ol className="mt-2 space-y-2">
          {steps.map((step, i) => {
            const current = i === lineIdx && phase !== "idle" && phase !== "done";
            const done = i < lineIdx || phase === "done";
            const hidden = opts.hideText && !done && !(current && phase === "turn");
            const check = checks[i];
            return (
              <li
                key={i}
                data-testid="shadow-line"
                className={`rounded-2xl px-3 py-2.5 transition ${
                  current ? (phase === "turn" ? "bg-pink-50 ring-2 ring-pink-300" : "bg-indigo-50 ring-2 ring-indigo-300") : "bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 h-6 w-6 shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${
                      step.role === "B" ? "bg-pink-100 text-pink-600" : step.role === "A" ? "bg-sky-100 text-sky-600" : "bg-indigo-100 text-indigo-600"
                    }`}
                  >
                    {step.role || "★"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`leading-snug ${i === 0 ? "text-lg font-extrabold text-slate-900" : "text-sm text-slate-800"}`}>
                      {hidden ? (
                        <span className="select-none text-slate-300">{step.text.replace(/[A-Za-z]/g, "•")}</span>
                      ) : check ? (
                        check.words.map((w, k) => (
                          <span key={k} className={w.ok ? "text-emerald-600" : "text-rose-500 underline decoration-2"}>
                            {w.text}{" "}
                          </span>
                        ))
                      ) : (
                        <LinkedText text={step.text} />
                      )}
                    </p>
                    {opts.showJa && step.ja && <p className="mt-0.5 text-xs text-slate-500">{step.ja}</p>}
                    {i === 0 && !hidden && !check && <LinkingNotes text={step.text} className="mt-2" />}
                    {check && <PronunciationDetail check={check} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3">
        <p className="text-center text-sm font-bold text-slate-700" data-testid="shadow-status">
          {statusText}
        </p>
        {phase === "review" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => playStep(lineIdx)} className="rounded-2xl bg-white py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
              もう一度
            </button>
            <button type="button" onClick={nextFromReview} className="rounded-2xl bg-indigo-600 py-2.5 text-sm font-bold text-white">
              次へ
            </button>
          </div>
        )}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
          {phase === "turn" && (
            <div
              key={`${item.id}:${lineIdx}`}
              className="h-full rounded-full bg-pink-400"
              style={{ width: "100%", animation: `swipetalk-shrink ${opts.check ? 6000 : turnMs}ms linear forwards` }}
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-5">
        <button
          type="button"
          aria-label="前のフレーズ"
          disabled={itemIdx === 0}
          onClick={() => jump(itemIdx - 1)}
          className="h-11 w-11 rounded-full bg-white shadow ring-1 ring-slate-200 flex items-center justify-center text-slate-600 active:scale-90 disabled:opacity-30"
        >
          <SkipBack size={18} />
        </button>
        <button
          type="button"
          aria-label="この行をもう一度"
          onClick={() => playStep(lineIdx)}
          className="h-11 w-11 rounded-full bg-white shadow ring-1 ring-slate-200 flex items-center justify-center text-slate-600 active:scale-90"
        >
          <Repeat size={18} />
        </button>
        <button
          type="button"
          aria-label={playing ? "一時停止" : "シャドーイングを始める"}
          onClick={togglePlay}
          className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg flex items-center justify-center active:scale-90"
        >
          {playing ? <Pause size={28} /> : <Play size={28} />}
        </button>
        <button
          type="button"
          aria-label="次のフレーズ"
          disabled={itemIdx + 1 >= chapter.items.length}
          onClick={() => jump(itemIdx + 1)}
          className="h-11 w-11 rounded-full bg-white shadow ring-1 ring-slate-200 flex items-center justify-center text-slate-600 active:scale-90 disabled:opacity-30"
        >
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 一覧画面
// ---------------------------------------------------------------------------
const PAGE = 60;

function ListScreen({ state, onToggle, speech, initialScope = "all", onToggleFavorite = () => {} }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState(initialScope);
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(PAGE);

  const base = scope === "all" ? ALL_ITEMS : KIND_ITEMS[scope] || CHAPTER_BY_ID[scope].items;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((p) => {
      const learned = !!state.learned[p.id];
      if (filter === "learned" && !learned) return false;
      if (filter === "unlearned" && learned) return false;
      if (filter === "fav" && !state.favorites?.[p.id]) return false;
      if (!q) return true;
      return p.english.toLowerCase().includes(q) || p.japanese.includes(q) || p.exampleContext.toLowerCase().includes(q);
    });
  }, [base, query, filter, state.learned, state.favorites]);

  useEffect(() => setLimit(PAGE), [query, scope, filter]);

  // 「もしかして」: 綴りや言い回しが少し違っても近いものを、検索結果のあとに出す。
  // 全件と1件ずつ比べるので少し重い。入力が止まってから計算して、文字入力を引っかからせない
  const [settledQuery, setSettledQuery] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setSettledQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  const suggestions = useMemo(() => {
    if (settledQuery !== query || query.trim().length < 2) return [];
    const inScope = base.filter((p) => {
      const learned = !!state.learned[p.id];
      return filter === "all" || (filter === "learned" ? learned : !learned);
    });
    return fuzzySearch(inScope, query, { exclude: new Set(filtered.map((p) => p.id)), limit: 10 });
  }, [base, query, settledQuery, filter, filtered, state.learned]);

  const renderRow = (kind) => (p) => {
    const open = openId === p.id;
    const learned = !!state.learned[p.id];
    return (
      <li key={p.id} data-row={kind} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 p-3">
          <SpeakButton seed={p.id} text={p.english} speech={speech} />
          <button type="button" onClick={() => setOpenId(open ? null : p.id)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
            <p className="font-bold text-slate-900 truncate">{p.english}</p>
            <p className="text-sm text-slate-500 truncate">{p.japanese}</p>
          </button>
          <FavButton id={p.id} favorites={state.favorites} onToggle={onToggleFavorite} />
          <button
            type="button"
            onClick={() => onToggle(CHAPTER_BY_ID[p.chapterId], p.id)}
            aria-label={learned ? "未習得に戻す" : "覚えたにする"}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold transition active:scale-95 ${
              learned ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {learned ? "⭕️ 覚えた" : "未習得"}
          </button>
        </div>
        {open && (
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
            <p className="mb-2 text-xs text-slate-400">{chapterLabel(CHAPTER_BY_ID[p.chapterId])}</p>
            <LinkingNotes text={p.english} className="mb-3" />
            <Dialogue context={p.exampleContext} translation={p.exampleJapanese} seed={p.id} speech={speech} />
          </div>
        )}
      </li>
    );
  };

  const learnedCount = base.filter((p) => state.learned[p.id]).length;
  const counts = {
    all: base.length,
    unlearned: base.length - learnedCount,
    learned: learnedCount,
    fav: base.filter((p) => state.favorites?.[p.id]).length,
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-4 pb-3 bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold text-slate-900">フレーズ一覧</h1>
          <SpeedBar />
        </div>
        <div className="relative mt-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="list-search"
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
        <ChapterSelect id="list-chapter" value={scope} onChange={setScope} extra={[
            ["all", `すべての章（${TOTAL}問）`],
            ["phrase", `フレーズ全部（${KIND_ITEMS.phrase.length}問）`],
            ["word", `単語全部（${KIND_ITEMS.word.length}問）`],
          ]} className="mt-2" />
        <div className="mt-2 flex gap-2">
          {[
            ["all", "すべて"],
            ["unlearned", "未習得"],
            ["learned", "覚えた"],
            ["fav", "⭐"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filter === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {label} <span className="opacity-60 tabular-nums">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto px-5 pb-6 space-y-2" data-testid="phrase-list">
        {filtered.length === 0 && (
          <li className={`text-center text-sm text-slate-400 ${suggestions.length ? "py-4" : "py-16"}`}>該当するフレーズがありません</li>
        )}
        {filtered.slice(0, limit).map(renderRow("result"))}
        {filtered.length > limit && (
          <li>
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-indigo-600 ring-1 ring-slate-200"
            >
              さらに表示（残り {filtered.length - limit}）
            </button>
          </li>
        )}
        {suggestions.length > 0 && (
          <>
            <li className="pt-3 text-xs font-bold text-slate-500" data-testid="did-you-mean">
              もしかして：
            </li>
            {suggestions.map(renderRow("suggestion"))}
          </>
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 進捗画面
// ---------------------------------------------------------------------------
function ProgressRing({ value, size = 180, stroke = 16 }) {
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

function motivation(learned) {
  const ratio = learned / TOTAL;
  if (learned === 0) return "さあ、最初の1枚からはじめよう！";
  if (learned < 50) return "いいスタート！まずは第1章クリアを目指そう。";
  if (ratio < 0.25) return "順調です！毎日少しずつ積み上げよう。";
  if (ratio < 0.5) return "もうすぐ半分！ネイティブ表現が身についてきた。";
  if (ratio < 1) return "後半戦！ここまで来たら全制覇も見えてくる。";
  return `${TOTAL}問 コンプリート！素晴らしい！`;
}

// ---------------------------------------------------------------------------
// 単語ガチャ・図鑑・称号
// ---------------------------------------------------------------------------
const RARITY_STYLE = {
  N: { label: "N", chip: "bg-slate-100 text-slate-600", tile: "from-slate-50 to-white", text: "text-slate-600" },
  R: { label: "R", chip: "bg-sky-100 text-sky-700", tile: "from-sky-50 to-white", text: "text-sky-600" },
  SR: { label: "SR", chip: "bg-violet-100 text-violet-700", tile: "from-violet-100 to-white", text: "text-violet-600" },
  SSR: { label: "SSR", chip: "bg-gradient-to-r from-amber-300 to-pink-400 text-white", tile: "from-amber-100 via-pink-50 to-white", text: "text-amber-600" },
};
/** ダブり進化の見た目: Lv.2 銅・Lv.3 銀・Lv.4 キラキラ */
const LEVEL_FRAME = {
  0: "ring-1 ring-slate-200",
  1: "ring-1 ring-slate-200",
  2: "ring-2 ring-amber-600/70",
  3: "ring-2 ring-slate-400 shadow-md",
  4: "ring-2 ring-amber-400 shadow-lg gacha-kira",
};
const GACHA_POS_OPTIONS = [
  { value: "all", label: "全品詞" },
  { value: "noun", label: "名詞" },
  { value: "verb", label: "動詞" },
  { value: "adj", label: "形容詞" },
  { value: "other", label: "副詞など" },
];
const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));

/** ガチャの乱数（暗号用の乱数。E2E ではシードを渡して結果を固定できる） */
function gachaRng() {
  if (typeof window !== "undefined" && Number.isInteger(window.__swipetalkGachaSeed)) {
    const r = mulberry32(window.__swipetalkGachaSeed);
    window.__swipetalkGachaSeed += 1;
    return r;
  }
  return () => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  };
}

const levelStars = (level) => "★".repeat(level) + "☆".repeat(Math.max(0, MAX_LEVEL - level));
/** 未獲得の単語のシルエット: 頭文字と文字数だけ */
const silhouette = (english) => english.replace(/[A-Za-z]/g, "・").replace(/^・/, english[0]);

function RarityChip({ rarity, secret }) {
  if (secret) return <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-black text-amber-300">SECRET</span>;
  const s = RARITY_STYLE[rarity];
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${s.chip}`}>{s.label}</span>;
}

/** 今の時刻（interval ごとに更新）。ブーストの残り時間の表示に使う */
function useNow(interval = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval, enabled]);
  return now;
}

const mmss = (ms) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** 5倍ブーストの残り時間（使っているときだけ表示） */
function BoostBadge({ gacha, className = "" }) {
  const active = (gacha?.boostUntil || 0) > Date.now();
  const now = useNow(1000, active);
  if (!boostActive(gacha, now)) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-rose-500 px-2.5 py-1 text-[11px] font-black text-white shadow tabular-nums ${className}`}
      data-testid="boost-badge"
    >
      <Zap size={12} className="fill-white" /> ポイント{BOOST_RATE}倍 残り {mmss(gacha.boostUntil - now)}
    </span>
  );
}

function Wallet({ g, onUseBoost }) {
  const [message, setMessage] = useState("");
  const active = boostActive(g, Date.now());
  const items = [
    ["ポイント", g.unlimited ? "∞" : g.points, "text-indigo-600", "wallet-points"],
    ["レアチケ", g.tickets, "text-rose-500", "wallet-tickets"],
    ["SR チケ", g.srTickets, "text-violet-600", "wallet-sr"],
    ["SSR チケ", g.ssrTickets, "text-amber-500", "wallet-ssr"],
    ["交換pt", g.exPoints, "text-emerald-600", "wallet-ex"],
    ["メダル", g.medals, "text-orange-500", "wallet-medals"],
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200" data-testid="wallet">
      {items.map(([label, v, color, id]) => (
        <div key={label} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-1.5 py-1">
          <Art src={WALLET_ICON[id.slice("wallet-".length)]} size={24} />
          <p className="min-w-0 text-[10px] font-bold leading-tight text-slate-400">
            {label}
            <span className={`block text-sm font-black tabular-nums ${color}`} data-testid={id}>
              {typeof v === "number" ? v.toLocaleString() : v}
            </span>
          </p>
        </div>
      ))}
      {(g.boosts > 0 || active) && (
        <div className="col-span-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800" data-testid="wallet-boost">
          <Zap size={14} className="fill-amber-400 text-amber-500" />
          <span className="flex-1">
            {BOOST_RATE}倍ブースト ×{g.boosts}
            <span className="block text-[10px] font-normal text-amber-700">使うと1時間、学習・テスト・バトルのポイントが{BOOST_RATE}倍</span>
          </span>
          {active && <BoostBadge gacha={g} />}
          {g.boosts > 0 && (
            <button
              type="button"
              onClick={() => setMessage(onUseBoost() || "")}
              className="rounded-full bg-amber-500 px-3 py-1 text-xs font-extrabold text-white shadow active:scale-95"
            >
              {active ? "延長する" : "使う"}
            </button>
          )}
        </div>
      )}
      {message && <p className="col-span-3 text-center text-xs font-bold text-rose-500">{message}</p>}
      {(g.selSR > 0 || g.selSSR > 0) && (
        <p className="col-span-3 rounded-xl bg-amber-50 px-3 py-1.5 text-center text-xs font-bold text-amber-700" data-testid="wallet-select">
          選択チケット SR×{g.selSR}・SSR×{g.selSSR}（図鑑で好きな未獲得の単語に使えます）
        </p>
      )}
    </div>
  );
}

function WordTile({ card, copies, onOpen }) {
  const owned = copies > 0;
  const level = levelOf(copies);
  const style = RARITY_STYLE[card.rarity];
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      data-testid="zukan-tile"
      data-owned={owned ? "1" : "0"}
      className={`relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b p-1.5 text-center transition active:scale-95 ${
        owned ? `${style.tile} ${LEVEL_FRAME[level]}` : "bg-slate-200 ring-1 ring-slate-300"
      }`}
    >
      <span className="absolute left-1.5 top-1.5">
        <RarityChip rarity={card.rarity} secret={card.secret} />
      </span>
      {owned ? (
        <>
          <span className="mt-3 break-all text-sm font-extrabold leading-tight text-slate-900">{card.english}</span>
          <span className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500">{card.japanese.split("／")[0]}</span>
          <span className="mt-1 text-[10px] tracking-tighter text-amber-500">{levelStars(level)}</span>
        </>
      ) : (
        <>
          <span className="mt-3 text-sm font-extrabold tracking-widest text-slate-400">{card.secret ? "？？？" : silhouette(card.english)}</span>
          <span className="mt-1 text-lg text-slate-400">？</span>
        </>
      )}
    </button>
  );
}

/** 単語カードの詳細（獲得済みはすべて、未獲得はチラ見せ）と交換所 */
function WordSheet({ card, gacha, speech, onClose, onExchange }) {
  const [message, setMessage] = useState("");
  const copies = gacha.cards[card.id] || 0;
  const owned = copies > 0;
  const level = levelOf(copies);
  const cost = EXCHANGE_COST[card.rarity];
  const selectKey = card.rarity === "SR" ? "selSR" : card.rarity === "SSR" ? "selSSR" : null;
  const [unlocks, setUnlocks] = useState([]);
  const exchange = (payWith) => {
    const r = onExchange(card.id, payWith);
    setMessage(r.error || "");
    if (!r.error) {
      setUnlocks([
        ...r.newSecrets.map((id) => `🔓 シークレット単語「${CATALOG.cards[id].english}」が解放された！`),
        ...r.newTitles.map((id) => `🏅 実績【${TITLE_BY_ID[id].name}】を達成！`),
      ]);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label="単語カード"
        data-testid="word-sheet"
        className="w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))", maxHeight: "90dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <RarityChip rarity={card.rarity} secret={card.secret} />
          <span className="text-xs font-bold text-slate-400">{POS_LABELS[card.pos]}</span>
          {owned && <span className="text-xs tracking-tighter text-amber-500">{levelStars(level)} Lv.{level}</span>}
          <button type="button" onClick={onClose} aria-label="閉じる" className="ml-auto rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className={`mt-3 rounded-3xl bg-gradient-to-b p-5 ${owned ? `${RARITY_STYLE[card.rarity].tile} ${LEVEL_FRAME[level]}` : "bg-slate-100"}`}>
          {owned ? (
            <>
              <div className="flex items-center gap-2">
                <h3 className="flex-1 break-all text-3xl font-black text-slate-900">{card.english}</h3>
                <SpeakButton text={card.english} seed={card.id} speech={speech} label="英語を再生" />
              </div>
              <p className="mt-1 text-xl font-bold text-indigo-600">{card.japanese}</p>
              {card.example && (
                <div className="mt-3 rounded-2xl bg-white/80 p-3">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm leading-snug text-slate-800">
                      <LinkedText text={card.example} />
                    </p>
                    <SpeakButton text={card.example} seed={card.id} speech={speech} size="sm" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{card.exampleJa}</p>
                </div>
              )}
              {card.trivia && (
                <div className="mt-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200" data-testid="word-trivia">
                  <p className="text-[11px] font-bold tracking-wide text-amber-600">語源・豆知識</p>
                  <p className="mt-1 text-sm font-bold leading-relaxed text-slate-800">{card.trivia.etymology}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {card.trivia.teaser}
                    <span className="mt-1 block font-bold text-rose-600">→ {card.trivia.reveal}</span>
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-3xl font-black tracking-widest text-slate-400">{card.secret ? "？？？" : silhouette(card.english)}</p>
              <p className="mt-1 text-sm font-bold text-slate-400">まだ持っていない単語です</p>
              {card.trivia && (
                <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-amber-200" data-testid="word-teaser">
                  <p className="text-[11px] font-bold tracking-wide text-amber-600">豆知識（チラ見せ）</p>
                  <p className="mt-1 text-sm font-bold leading-relaxed text-slate-800">{card.trivia.teaser}</p>
                  <p className="mt-1 text-xs text-slate-400">答えは、この単語を手に入れると見られます</p>
                </div>
              )}
              {card.secret && <p className="mt-3 rounded-2xl bg-slate-900 p-3 text-sm font-bold text-amber-300">解放の条件: {card.hint}</p>}
              {card.questOnly && <p className="mt-3 rounded-2xl bg-emerald-900 p-3 text-sm font-bold text-emerald-200">冒険限定: 冒険でボスを倒した宝箱から手に入ります</p>}
            </>
          )}
        </div>

        {card.questOnly && owned && <p className="mt-3 text-center text-[11px] font-bold text-emerald-700">冒険限定の単語（宝箱でまた手に入ると Lv が上がります）</p>}
        {!card.secret && !card.questOnly && level < MAX_LEVEL && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold text-slate-500">交換所{owned ? `（Lv.${level + 1} に上げる）` : "（この単語を手に入れる）"}</p>
            <button
              type="button"
              onClick={() => exchange("exPoints")}
              disabled={gacha.exPoints < cost}
              className="w-full rounded-2xl bg-emerald-600 py-3 text-sm font-extrabold text-white shadow transition active:scale-95 disabled:opacity-40"
            >
              交換ポイント {cost} で交換（所持 {gacha.exPoints}）
            </button>
            {selectKey && !owned && gacha[selectKey] > 0 && (
              <button
                type="button"
                onClick={() => exchange(selectKey)}
                className="w-full rounded-2xl bg-amber-500 py-3 text-sm font-extrabold text-white shadow transition active:scale-95"
              >
                {card.rarity} 選択チケットを使う（残り {gacha[selectKey]} 枚）
              </button>
            )}
          </div>
        )}
        {owned && level >= MAX_LEVEL && (
          <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700">MAX！この単語はもうガチャから出ません</p>
        )}
        {message && <p className="mt-2 text-center text-xs font-bold text-rose-500">{message}</p>}
        {unlocks.length > 0 && (
          <div className="mt-2 space-y-1 rounded-2xl bg-slate-900 p-3 text-sm font-bold text-amber-300" data-testid="exchange-unlocks">
            {unlocks.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** ガチャの光の玉の色（レア度ごと） */
const ORB = {
  N: { core: "#f8fafc", glow: "rgba(203,213,225,0.9)", label: "" },
  R: { core: "#e0f2fe", glow: "rgba(56,189,248,0.95)", label: "R 以上！" },
  SR: { core: "#f3e8ff", glow: "rgba(168,85,247,0.95)", label: "SR 以上！？" },
  SSR: { core: "#fffbeb", glow: "rgba(251,191,36,1)", label: "SSR の予感…！" },
};

const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 50連以上の結果: レア度ごとの枚数と、SSR・SR・NEW の単語 */
function GachaSummary({ cards, onOpen }) {
  const count = (pred) => cards.filter(pred).length;
  const notable = [
    ...cards.filter((r) => r.rarity === "SSR"),
    ...cards.filter((r) => r.rarity === "SR"),
    ...cards.filter((r) => r.result === "new" && (r.rarity === "R" || r.rarity === "N")),
  ];
  const seen = new Set();
  const unique = notable.filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
  const SHOW = 90;
  return (
    <div className="p-3" style={{ maxHeight: "58dvh", overflowY: "auto" }} data-testid="gacha-summary">
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {["SSR", "SR", "R", "N"].map((r) => (
          <div key={r} className="rounded-xl bg-slate-50 py-2 ring-1 ring-slate-200">
            <RarityChip rarity={r} />
            <p className="mt-1 text-lg font-black tabular-nums text-slate-900" data-testid={`gacha-count-${r}`}>
              {count((x) => x.rarity === r)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-center text-xs font-bold text-slate-600 tabular-nums">
        {cards.length.toLocaleString()} 回引いて、新しい単語 <span className="text-rose-500">{count((x) => x.result === "new")}</span> 枚・Lv アップ {count((x) => x.result !== "new")} 枚
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {unique.slice(0, SHOW).map((r) => {
          const card = CATALOG.cards[r.id];
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              data-rarity={r.rarity}
              className={`rounded-xl bg-gradient-to-b px-2 py-1.5 text-left ${RARITY_STYLE[r.rarity].tile} ${
                r.rarity === "SSR" ? "gc-glow-ssr" : r.rarity === "SR" ? "gc-glow-sr" : ""
              }`}
            >
              <span className="flex items-center gap-1">
                <RarityChip rarity={r.rarity} />
                {r.result === "new" && <span className="text-[9px] font-black text-rose-500">NEW</span>}
              </span>
              <span className="mt-0.5 block truncate text-sm font-extrabold text-slate-900">{card.english}</span>
            </button>
          );
        })}
      </div>
      {unique.length > SHOW && <p className="mt-2 text-center text-[11px] text-slate-500">ほか {unique.length - SHOW} 語は図鑑で見られます</p>}
    </div>
  );
}

/**
 * ガチャの結果。演出: 光の玉がたまる（一番いいカードのレア度まで色が変わる）→ はじける → カードが1枚ずつめくれる。
 * 画面をタップするか「スキップ」で、すぐに全部めくる。
 */
function GachaResult({ result, onClose, onOpen }) {
  const sound = useSound();
  const cards = result.results;
  const big = cards.length > 10; // 50連以上はまとめて表示
  const bestIndex = cards.reduce((b, r) => Math.max(b, RARITIES.indexOf(r.rarity)), 0);
  const best = RARITIES[bestIndex];
  const [phase, setPhase] = useState(() => (prefersReducedMotion() ? "done" : "charge")); // charge → reveal → done
  const [orb, setOrb] = useState(0); // 光の玉の今の色（RARITIES の番号）
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? cards.length : 0)); // めくったカードの枚数
  const timers = useRef([]);
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // 1) 光がたまり、レア度が上がるたびに色が変わる
  useEffect(() => {
    if (phase !== "charge") return;
    sound.play("charge");
    for (let i = 1; i <= bestIndex; i++) later(450 + i * 380, () => (setOrb(i), sound.play("tap")));
    later(900 + bestIndex * 380, () => {
      sound.play(best === "SSR" ? "ssr" : "burst");
      setPhase("reveal");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) カードを1枚ずつめくる（SR 以上は少し溜めてから）
  useEffect(() => {
    if (phase !== "reveal") return;
    if (big) {
      setShown(cards.length);
      setPhase("done");
      return;
    }
    if (shown >= cards.length) {
      setPhase("done");
      return;
    }
    const next = cards[shown];
    const rare = next.rarity === "SR" || next.rarity === "SSR";
    later(shown === 0 ? 350 : rare ? 420 : 170, () => {
      sound.play(next.rarity === "SSR" ? "ssr" : rare ? "rare" : "flip");
      setShown((n) => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, shown]);

  const skip = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("done");
    setShown(cards.length);
  };
  const animating = phase !== "done";
  const multi = cards.length > 1;
  const head = {
    N: "bg-slate-700",
    R: "bg-sky-600",
    SR: "bg-violet-600",
    SSR: "bg-gradient-to-r from-amber-400 via-pink-500 to-violet-600",
  }[best];
  const color = ORB[RARITIES[orb]];
  const back = {
    N: "from-indigo-500 to-indigo-800",
    R: "from-indigo-500 to-indigo-800",
    SR: "from-violet-500 to-fuchsia-800 gc-glow-sr",
    SSR: "from-amber-300 via-pink-500 to-violet-700 gc-glow-ssr",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4"
      onClick={() => (animating ? skip() : onClose())}
    >
      {phase === "charge" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950" data-testid="gacha-charge">
          <div className="relative flex h-72 w-72 items-center justify-center">
            {orb >= 2 && (
              <div
                className="gc-rays absolute inset-[-40%] rounded-full opacity-70"
                style={{
                  background: `repeating-conic-gradient(from 0deg, ${color.glow} 0deg 8deg, transparent 8deg 24deg)`,
                  maskImage: "radial-gradient(circle, black 20%, transparent 65%)",
                  WebkitMaskImage: "radial-gradient(circle, black 20%, transparent 65%)",
                }}
              />
            )}
            {Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className="gc-spark absolute left-1/2 top-1/2 -ml-1 -mt-1 block h-2 w-2 rounded-full"
                style={{ "--a": `${i * 26}deg`, animationDelay: `${(i % 7) * 0.12}s`, background: color.core, boxShadow: `0 0 8px 3px ${color.glow}` }}
              />
            ))}
            <div className={orb >= 2 ? "gc-shake" : ""}>
              <div className="gc-orb relative h-32 w-32" style={{ "--dur": `${0.9 + bestIndex * 0.38}s` }}>
                <span
                  className="gc-pulse absolute -inset-16 rounded-full"
                  style={{ background: `radial-gradient(circle, ${color.glow} 0%, transparent 65%)` }}
                />
                <span
                  className="absolute inset-2 rounded-full transition-all duration-300"
                  style={{ background: `radial-gradient(circle, ${color.core} 0%, ${color.glow} 45%, transparent 72%)` }}
                />
                <Art src={CHEST_ART} size={128} className="relative" />
              </div>
            </div>
          </div>
          <p key={orb} className="bt-pop mt-6 h-8 text-xl font-black text-white" style={{ textShadow: `0 0 14px ${color.glow}` }}>
            {color.label}
          </p>
        </div>
      )}
      {phase !== "charge" && animating && shown === 0 && <div key="flash" className="gc-flash pointer-events-none absolute inset-0 bg-white" />}
      {animating && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            skip();
          }}
          className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/30"
        >
          スキップ <SkipForward size={14} />
        </button>
      )}
      <div
        role="dialog"
        aria-label="ガチャの結果"
        data-testid="gacha-result"
        className={`w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ${phase === "charge" ? "invisible" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (animating) skip();
        }}
      >
        <div className={`px-5 py-3 text-center text-white ${head} ${best === "SSR" && !animating ? "gacha-kira" : ""}`}>
          <p className="text-xs font-bold tracking-widest text-white/80">RESULT</p>
          <p className="text-2xl font-black">{best === "SSR" ? "SSR 出現！" : best === "SR" ? "SR 獲得！" : "ガチャ結果"}</p>
        </div>
        {big ? (
          <GachaSummary cards={cards} onOpen={onOpen} />
        ) : (
        <div className={`grid p-3 ${multi ? "grid-cols-2 gap-1.5" : "grid-cols-1 gap-2"}`} style={{ maxHeight: "58dvh", overflowY: "auto" }}>
          {cards.map((r, i) => {
            const card = CATALOG.cards[r.id];
            const open = i < shown;
            return (
              <div key={i} className="gc-card" ref={i === shown - 1 && animating ? (el) => el?.scrollIntoView?.({ block: "nearest" }) : undefined}>
                <div className={`gc-inner ${open ? "" : "gc-back-up"}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.id)}
                    data-testid="gacha-result-card"
                    data-rarity={r.rarity}
                    tabIndex={open ? 0 : -1}
                    className={`gc-face relative block w-full rounded-2xl bg-gradient-to-b text-left ${multi ? "px-2.5 py-2" : "p-3"} ${RARITY_STYLE[r.rarity].tile} ${LEVEL_FRAME[r.level]} ${
                      open && r.rarity === "SSR" ? "gc-glow-ssr" : open && r.rarity === "SR" ? "gc-glow-sr" : ""
                    } ${open && animating ? "gc-land" : ""}`}
                  >
                    <div className="flex items-center gap-1">
                      <RarityChip rarity={r.rarity} />
                      <span className={`ml-auto text-[10px] font-black ${r.result === "new" ? "text-rose-500" : "text-emerald-600"}`}>
                        {r.result === "new" ? "NEW!" : r.level >= MAX_LEVEL ? "MAX!" : `Lv.${r.level}↑`}
                      </span>
                    </div>
                    <p className={`break-all font-extrabold text-slate-900 ${multi ? "mt-0.5 text-sm leading-tight" : "mt-1 text-base"}`}>{card.english}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{card.japanese.split("／")[0]}</p>
                    {r.byPity && (
                      <p className={`font-bold text-amber-600 ${multi ? "text-[9px]" : "mt-1 text-[10px]"}`}>{r.byPity === "SSR" ? "天井で SSR 確定" : "確定"}</p>
                    )}
                  </button>
                  <div aria-hidden="true" className={`gc-back flex items-center justify-center rounded-2xl bg-gradient-to-br ring-2 ring-white/60 ${back[r.rarity]}`}>
                    <Art src={CARD_BACK_ART} size={multi ? 44 : 64} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
        {!animating && (result.newSecrets?.length > 0 || result.newTitles?.length > 0) && (
          <div className="mx-4 mb-2 space-y-1 rounded-2xl bg-slate-900 p-3 text-sm font-bold text-amber-300" data-testid="gacha-unlocks">
            {result.newSecrets.map((id) => (
              <p key={id}>🔓 シークレット単語「{CATALOG.cards[id].english}」が解放された！</p>
            ))}
            {result.newTitles.map((id) => (
              <p key={id}>🏅 実績【{TITLE_BY_ID[id].name}】を達成！</p>
            ))}
          </div>
        )}
        <p className="px-4 text-center text-xs text-slate-500">
          交換ポイント +{cards.reduce((n, r) => n + r.exGain, 0)}
          {cards.some((r) => r.medals) && `・メダル +${cards.reduce((n, r) => n + (r.medals || 0), 0)}`}　{animating ? "タップでスキップ" : "カードをタップすると詳しく見られます"}
        </p>
        <div className="p-4">
          <button type="button" onClick={onClose} className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-extrabold text-white">
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

/** ガチャの種類（引くのに使うもの）ごとの見た目と、選べる連数 */
const GACHA_KINDS = [
  { currency: "points", label: "ポイント", sub: "通常ガチャ", counts: [1, 10, 50, 100, 500, 1000], bg: "from-indigo-600 via-violet-600 to-pink-500" },
  { currency: "ticket", label: "レア", sub: "レアチケット（R 以上）", counts: [1, 10, 50, 100], bg: "from-rose-500 to-orange-500" },
  { currency: "sr", label: "SR", sub: "SR チケット（SR 以上）", counts: [1, 10], bg: "from-violet-700 to-fuchsia-600" },
  { currency: "ssr", label: "SSR", sub: "SSR チケット（SSR 確定）", counts: [1, 10], bg: "from-amber-400 via-pink-500 to-violet-600" },
];

/** 開閉できる説明の箱 */
function Fold({ title, children, testId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200" data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center px-3 py-2.5 text-left text-xs font-bold text-slate-700">
        <span className="flex-1">{title}</span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-slate-100 px-3 py-2.5 text-xs leading-relaxed text-slate-600">{children}</div>}
    </div>
  );
}

function GachaPanel({ g, onPull, onUpgrade }) {
  const [pos, setPos] = useState("all");
  const [currency, setCurrency] = useState("points");
  const [error, setError] = useState("");
  const kind = GACHA_KINDS.find((k) => k.currency === currency);
  const rates = useMemo(() => currentRates(g, CATALOG, pos, currency), [g, pos, currency]);
  const pull = (times) => setError(onPull({ pos, currency, times }) || "");
  const fmt = (v) => `${Math.round(v * 10) / 10}%`;
  const have = currency === "points" ? g.points : g[BALANCE_KEY[currency]];
  // 「全部引く」: 持っているポイントで引ける回数（無限モードは1000回）
  const allTimes = g.unlimited ? 1000 : Math.min(MAX_PULLS, Math.floor(g.points / PULL_COST));
  const costText = (n) => (currency === "points" ? (g.unlimited ? "∞" : `${(PULL_COST * n).toLocaleString()}pt`) : `${n}枚`);
  const [first, second, ...rest] = kind.counts;
  return (
    <div className="space-y-3">
      <Segmented
        name="gacha-currency"
        value={currency}
        onChange={(c) => {
          setCurrency(c);
          setError("");
        }}
        options={GACHA_KINDS.map((k) => ({ value: k.currency, label: k.label }))}
      />
      <div className={`rounded-3xl bg-gradient-to-br ${kind.bg} p-4 text-white shadow-lg`} data-testid="gacha-machine">
        <div className="flex items-start gap-2">
          <Art src={MACHINE_ART[currency]} size={72} className="-my-2 -ml-1 bt-float drop-shadow-[0_4px_6px_rgba(0,0,0,0.35)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-widest text-white/80">{kind.sub}</p>
            <p className="text-xl font-black">{GACHA_POS_OPTIONS.find((o) => o.value === pos).label}ガチャ</p>
          </div>
          <p className="rounded-full bg-black/20 px-2.5 py-1 text-xs font-black tabular-nums">
            所持 {currency === "points" && g.unlimited ? "∞" : have.toLocaleString()}
            {currency === "points" ? "pt" : "枚"}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {GACHA_POS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={pos === o.value}
              onClick={() => setPos(o.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${pos === o.value ? "bg-white text-slate-900" : "bg-white/15 text-white"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/90 tabular-nums" data-testid="gacha-rates">
          確率 {["N", "R", "SR", "SSR"].filter((r) => rates[r] > 0).map((r) => `${r} ${fmt(rates[r])}`).join("・")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => pull(first)} className="rounded-2xl bg-white py-3 text-sm font-extrabold text-slate-800 shadow transition active:scale-95">
            1回引く
            <span className="block text-[11px] font-bold text-slate-500">{costText(first)}</span>
          </button>
          <button type="button" onClick={() => pull(second)} className="rounded-2xl bg-amber-300 py-3 text-sm font-extrabold text-amber-950 shadow transition active:scale-95">
            10連
            <span className="block text-[11px] font-bold text-amber-800">
              {costText(second)}
            </span>
          </button>
        </div>
        {rest.length > 0 && (
          <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${rest.length}, minmax(0, 1fr))` }}>
            {rest.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pull(n)}
                className="rounded-xl bg-white/20 py-2 text-xs font-extrabold text-white ring-1 ring-white/40 transition active:scale-95"
              >
                {n}連
                <span className="block text-[10px] font-bold text-white/80 tabular-nums">{costText(n)}</span>
              </button>
            ))}
          </div>
        )}
        {currency === "points" && (
          <button
            type="button"
            disabled={allTimes < 1}
            onClick={() => pull(allTimes)}
            className="mt-2 w-full rounded-xl bg-black/20 py-2 text-xs font-extrabold text-white ring-1 ring-white/30 transition active:scale-95 disabled:opacity-50"
          >
            ポイントを全部使って引く
            <span className="ml-1 font-bold text-white/80 tabular-nums">
              {allTimes > 0 ? `（${allTimes.toLocaleString()}回）` : `（${PULL_COST}pt から）`}
            </span>
          </button>
        )}
        {PITY_SSR[currency] && (
          <p className="mt-2 text-[11px] font-bold text-white/90 tabular-nums" data-testid="gacha-pity">
            SSR 確定まで あと {PITY_SSR[currency] - (g.pity[currency] || 0)} 回
          </p>
        )}
      </div>
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs font-bold text-rose-600">{error}</p>}

      <Fold title={`チケット交換（${TICKET_UPGRADE}枚 → 上のチケット1枚）`} testId="ticket-upgrade">
        <div className="grid grid-cols-2 gap-2">
          {[
            ["sr", "レアチケット → SR チケット", g.tickets],
            ["ssr", "SR チケット → SSR チケット", g.srTickets],
          ].map(([to, label, n]) => (
            <button
              key={to}
              type="button"
              disabled={n < TICKET_UPGRADE}
              onClick={() => setError(onUpgrade(to) || "")}
              className="rounded-xl bg-slate-900 px-2 py-2 text-[11px] font-bold text-white transition active:scale-95 disabled:opacity-40"
            >
              {label}
              <span className="block text-[10px] font-normal text-white/70 tabular-nums">
                {n} / {TICKET_UPGRADE}
              </span>
            </button>
          ))}
        </div>
      </Fold>
      <Fold title="ポイントのもらい方・ルール">
        <p>・学習（スワイプ）・シャドーイング・テスト・バトルは、取り組んだ時間に応じて 1分 約{POINTS_PER_MINUTE}pt</p>
        <p>
          ・バトルは1回 {BATTLE_POINTS.min.toLocaleString()}〜{BATTLE_POINTS.max.toLocaleString()}pt ＋ レアチケット {BATTLE_TICKETS.min}〜{BATTLE_TICKETS.max} 枚
        </p>
        <p>
          ・毎日のログインボーナス {LOGIN_POINTS.toLocaleString()}pt・{BOOST_RATE}倍ブースト・SR チケット {LOGIN_SR_TICKETS}枚（3日ごとに SSR チケット、7日ごとにレアチケット）
        </p>
        <p>・今日の目標（{DAILY_GOAL}問）達成で {GOAL_POINTS.toLocaleString()}pt</p>
        <p>・「コード」タブで英単語を入れると、難しい単語ほどたくさん（1日 {CODE_DAILY_LIMIT} 回）</p>
        <p>・天井: 通常 {PITY_SSR.points}回・レアチケット {PITY_SSR.ticket}枚・SR チケット {PITY_SSR.sr}枚で SSR 確定</p>
        <p>・同じ単語が出ると Lv が上がり、フレームが銅→銀→キラキラに（Lv.4 で MAX、以降は出なくなります）</p>
        <p>・引くたびに交換ポイントが1つ貯まり、図鑑から好きな単語と交換できます</p>
        <p>
          ・ダブるとメダル（N {DUP_MEDALS.N}・R {DUP_MEDALS.R}・SR {DUP_MEDALS.SR}・SSR {DUP_MEDALS.SSR}枚）。「ショップ」で道具と交換
        </p>
      </Fold>
    </div>
  );
}

/** 図鑑: 「単語」と「実績」を切り替える */
function ZukanView({ g, onOpen }) {
  const [mode, setMode] = useState("words");
  return (
    <div className="space-y-2">
      <Segmented
        name="zukan-mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "words", label: "単語図鑑" },
          { value: "achievements", label: "実績" },
        ]}
      />
      {mode === "words" ? <Zukan g={g} onOpen={onOpen} /> : <AchievementList g={g} />}
    </div>
  );
}

/** つけている称号のバッジ */
function TitleBadge({ gacha, className = "" }) {
  const t = equippedMyTitle(gacha);
  if (!t) return null;
  const text = myTitleText(CATALOG, t);
  return (
    <span
      data-testid="title-badge"
      className={`inline-flex w-fit max-w-full items-center gap-1 truncate rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[11px] font-black text-white shadow ${TITLE_BG[text.rarity]} ${className}`}
    >
      <Award size={12} /> {text.en}
    </span>
  );
}
const TITLE_BG = {
  N: "from-slate-500 to-slate-700",
  R: "from-sky-500 to-blue-600",
  SR: "from-violet-500 to-fuchsia-600",
  SSR: "from-amber-400 via-pink-500 to-violet-600",
  SECRET: "from-slate-900 to-amber-600",
};

/** マイ称号: 集めた単語を組み合わせて自分だけの称号を作り、付け替える */
function MyTitlePanel({ g, onMake, onEquip, onDelete }) {
  const [parts, setParts] = useState([]);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState("all");
  const [message, setMessage] = useState(null);
  const owned = useMemo(() => CATALOG.order.filter((id) => (g.cards[id] || 0) > 0), [g.cards]);
  const q = query.trim().toLowerCase();
  const list = owned
    .filter((id) => {
      const c = CATALOG.cards[id];
      if (pos !== "all" && c.pos !== pos) return false;
      return !q || c.english.toLowerCase().includes(q) || c.japanese.includes(q);
    })
    .slice(0, 90);
  const preview = parts.length ? myTitleText(CATALOG, { parts }) : null;
  const toggle = (id) => setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MY_TITLE_PARTS ? p : [...p, id]));
  return (
    <div className="space-y-3" data-testid="my-titles">
      <div className="rounded-3xl bg-gradient-to-br from-slate-800 to-indigo-900 p-4 text-white shadow-lg">
        <p className="text-[11px] font-bold tracking-widest text-white/70">MY TITLE</p>
        <p className="text-lg font-black">集めた単語で、自分だけの称号を作ろう</p>
        <p className="mt-1 text-[11px] text-white/80">単語を{MY_TITLE_PARTS}個までえらんで組み合わせます。作った称号はいつでも付け替えられます。</p>
        <div className="mt-3 min-h-[3.5rem] rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/20" data-testid="title-preview">
          {preview ? (
            <>
              <p className="text-xl font-black">{preview.en}</p>
              <p className="text-xs text-white/80">{preview.ja}</p>
            </>
          ) : (
            <p className="pt-2 text-xs text-white/60">下の単語をタップしてえらぶ（順番どおりに並びます）</p>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={!parts.length}
            onClick={() => {
              const err = onMake(parts);
              if (err) return setMessage({ ok: false, text: err });
              setMessage({ ok: true, text: `称号「${preview.en}」を作ってつけました！` });
              setParts([]);
            }}
            className="flex-1 rounded-2xl bg-amber-400 py-2.5 text-sm font-extrabold text-amber-950 shadow active:scale-95 disabled:opacity-40"
          >
            この称号を作る
          </button>
          <button type="button" disabled={!parts.length} onClick={() => setParts([])} className="rounded-2xl bg-white/15 px-4 text-xs font-bold disabled:opacity-40">
            やり直す
          </button>
        </div>
      </div>
      {message && (
        <p className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{message.text}</p>
      )}

      {g.myTitles.length > 0 && (
        <div>
          <p className="text-sm font-bold text-slate-800">作った称号（{g.myTitles.length}）</p>
          <ul className="mt-2 space-y-1.5">
            {[...g.myTitles].reverse().map((t) => {
              const text = myTitleText(CATALOG, t);
              const on = g.equippedTitle === t.id;
              return (
                <li key={t.id} data-testid="my-title" className={`flex items-center gap-2 rounded-2xl bg-white p-2.5 ring-1 ${on ? "ring-2 ring-amber-400" : "ring-slate-200"}`}>
                  <span className={`h-8 w-1.5 shrink-0 rounded-full bg-gradient-to-b ${TITLE_BG[text.rarity]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-slate-900">{text.en}</p>
                    <p className="truncate text-[11px] text-slate-500">{text.ja}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEquip(on ? null : t.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${on ? "bg-slate-100 text-slate-500" : "bg-indigo-600 text-white"}`}
                  >
                    {on ? "外す" : "つける"}
                  </button>
                  <button type="button" aria-label="称号を消す" onClick={() => onDelete(t.id)} className="shrink-0 rounded-full p-1.5 text-slate-300 hover:text-rose-500">
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <p className="text-sm font-bold text-slate-800">使える単語（集めた {owned.length} 語）</p>
        {owned.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-white p-4 text-center text-xs text-slate-500 ring-1 ring-slate-200">ガチャで単語を集めると、称号のパーツに使えます。</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-1">
              {GACHA_POS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={pos === o.value}
                  onClick={() => setPos(o.value)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${pos === o.value ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <input
              id="title-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="英語・日本語で検索"
              className="mt-2 w-full rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="title-words">
              {list.map((id) => {
                const c = CATALOG.cards[id];
                const i = parts.indexOf(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    title={c.japanese}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${i >= 0 ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-700 ring-slate-200"}`}
                  >
                    {i >= 0 && <span className="mr-1 text-[10px]">{i + 1}</span>}
                    {c.english}
                    <span className="ml-1 text-[9px] opacity-60">{c.secret ? "S" : c.rarity}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Zukan({ g, onOpen }) {
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [owned, setOwned] = useState("all");
  const [limit, setLimit] = useState(60);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.order.filter((id) => {
      const c = CATALOG.cards[id];
      const has = (g.cards[id] || 0) > 0;
      if (pos !== "all" && c.pos !== pos) return false;
      if (rarity === "secret" ? !c.secret : rarity !== "all" && (c.secret || c.rarity !== rarity)) return false;
      if (owned === "owned" && !has) return false;
      if (owned === "unowned" && has) return false;
      if (!q) return true;
      // 未獲得の単語は、答えがばれないよう英語と意味では検索しない（チラ見せの文だけ）
      if (!has) return !!c.trivia && c.trivia.teaser.toLowerCase().includes(q);
      return c.english.toLowerCase().includes(q) || c.japanese.includes(q) || (c.trivia && (c.trivia.etymology + c.trivia.reveal).includes(q));
    });
  }, [g.cards, query, rarity, owned, pos]);
  useEffect(() => setLimit(60), [query, rarity, owned, pos]);
  const ownedCount = CATALOG.order.filter((id) => (g.cards[id] || 0) > 0).length;
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-500 tabular-nums" data-testid="zukan-count">
        集めた単語 {ownedCount} / {CATALOG.order.length}
      </p>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id="zukan-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="英語・日本語・豆知識で検索"
          className="w-full rounded-xl bg-white py-2 pl-9 pr-3 text-sm shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <Segmented name="zukan-pos" value={pos} onChange={setPos} options={GACHA_POS_OPTIONS} />
      <div className="flex flex-wrap gap-1.5">
        {[
          ["all", "すべて"],
          ["N", "N"],
          ["R", "R"],
          ["SR", "SR"],
          ["SSR", "SSR"],
          ["secret", "シークレット"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setRarity(k)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${rarity === k ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Segmented
        name="zukan-owned"
        value={owned}
        onChange={setOwned}
        options={[
          { value: "all", label: "すべて" },
          { value: "owned", label: "獲得済み" },
          { value: "unowned", label: "未獲得" },
        ]}
      />
      <div className="grid grid-cols-3 gap-2">
        {list.slice(0, limit).map((id) => (
          <WordTile key={id} card={CATALOG.cards[id]} copies={g.cards[id] || 0} onOpen={onOpen} />
        ))}
      </div>
      {list.length === 0 && <p className="py-10 text-center text-sm text-slate-400">該当する単語がありません</p>}
      {list.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 60)}
          className="w-full rounded-2xl bg-white py-3 text-sm font-bold text-indigo-600 ring-1 ring-slate-200"
        >
          さらに表示（残り {list.length - limit}）
        </button>
      )}
    </div>
  );
}

/** 実績（以前の「称号」）: テーマの単語をそろえると達成。図鑑の中で見る */
function AchievementList({ g }) {
  return (
    <ul className="space-y-2" data-testid="achievements">
      <li className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">テーマの単語をそろえると達成です（{g.titles.length} / {TITLES.length}）。</li>
      {TITLES.map((t) => {
        const got = g.titles.includes(t.id);
        const { have, need } = titleProgress(g, CATALOG, t.rule);
        return (
          <li
            key={t.id}
            data-testid="title-item"
            className={`rounded-2xl p-3 ring-1 ${got ? "bg-amber-50 ring-amber-300" : "bg-white ring-slate-200"}`}
          >
            <div className="flex items-center gap-2">
              <Award size={18} className={got ? "text-amber-500" : "text-slate-300"} />
              <p className={`flex-1 text-sm font-extrabold ${got ? "text-amber-700" : "text-slate-500"}`}>【{t.name}】</p>
              <span className="text-xs font-bold tabular-nums text-slate-400">
                {Math.min(have, need)} / {need}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{t.desc}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (have / need) * 100)}%` }} />
            </div>
          </li>
        );
      })}
      <li className="rounded-2xl bg-slate-900 p-3 text-xs leading-relaxed text-amber-200">
        シークレット単語: 語源のパーツ（com＝一緒に、uni＝1つ など）が同じ単語を集めると、ガチャに出ない特別な単語が解放されます。ヒントは図鑑の「シークレット」で。
      </li>
    </ul>
  );
}

/** メダルショップ: ダブりで貯まったメダルで道具を買う */
function ShopPanel({ g, onBuy }) {
  const [message, setMessage] = useState(null);
  const have = { boost: g.boosts, freeze: g.items.freeze, special: g.items.special };
  return (
    <div className="space-y-2" data-testid="shop">
      <p className="rounded-2xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">
        ガチャでダブるとメダルがもらえます（N {DUP_MEDALS.N}・R {DUP_MEDALS.R}・SR {DUP_MEDALS.SR}・SSR {DUP_MEDALS.SSR}枚）。所持メダル{" "}
        <span className="tabular-nums">{g.medals}</span> 枚
      </p>
      {SHOP.map((item) => {
        return (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200" data-testid="shop-item">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 ring-1 ring-orange-200">
              <Art src={SHOP_ART[item.id]} size={40} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-slate-900">
                {item.name} <span className="text-xs font-bold text-slate-400">所持 {have[item.id]}</span>
              </p>
              <p className="text-[11px] leading-snug text-slate-500">{item.desc}</p>
            </div>
            <button
              type="button"
              disabled={g.medals < item.price}
              onClick={() => {
                const err = onBuy(item.id);
                setMessage(err ? { ok: false, text: err } : { ok: true, text: `${item.name}を手に入れた！` });
              }}
              className="shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-extrabold text-white shadow active:scale-95 disabled:opacity-40"
            >
              {item.price}枚
            </button>
          </div>
        );
      })}
      {message && (
        <p className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{message.text}</p>
      )}
      <p className="text-[11px] text-slate-500">時止めの砂時計と必殺技の巻物は、バトル中の画面のボタンから使えます。</p>
    </div>
  );
}

/** コード入力: 英単語を入れるとポイント（難しいほど多い）。1日5回まで */
function CodePanel({ g, onRedeem, onEndUnlimited }) {
  const { today } = todayAndYesterday();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState(null); // { ok, text }
  const left = codesLeft(g, today);
  const submit = (e) => {
    e.preventDefault();
    const r = onRedeem(code);
    if (r.error) return setMessage({ ok: false, text: r.error });
    setCode("");
    setMessage(
      r.unlimited
        ? { ok: true, text: "開発者コード！ ポイントが無限になりました（ガチャを引いても減りません）" }
        : {
            ok: true,
            text: `「${r.card.english}」（${r.card.secret ? "SECRET" : r.card.rarity}）で ${r.points.toLocaleString()}pt ゲット！${r.got ? "　単語も手に入れた！" : ""}`,
            big: r.points >= 3000,
          }
    );
  };
  const recent = g.codesUsed.slice(-5).reverse().map((id) => CATALOG.cards[id]).filter(Boolean);
  return (
    <div className="space-y-3" data-testid="code-panel">
      <div className="rounded-3xl bg-gradient-to-br from-slate-800 to-indigo-900 p-4 text-white shadow-lg">
        <p className="text-xs font-bold tracking-widest text-white/70">WORD CODE</p>
        <p className="text-lg font-black">英単語を入れてポイントゲット</p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/80">
          単語帳（3000語＋シークレット）にある英単語が使えます。難しい単語・長い単語ほどポイントが多く、最高 100,000pt。同じ単語は1回だけ。
        </p>
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <input
            id="gacha-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="例: adventure"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            lang="en"
            className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button type="submit" disabled={!code.trim()} className="rounded-2xl bg-amber-400 px-4 text-sm font-extrabold text-amber-950 disabled:opacity-50">
            入れる
          </button>
        </form>
        <p className="mt-2 text-xs font-bold tabular-nums text-white/90" data-testid="code-left">
          今日あと {left} / {CODE_DAILY_LIMIT} 回
        </p>
      </div>
      {message && (
        <p
          data-testid="code-message"
          className={`rounded-2xl px-3 py-2.5 text-center text-sm font-bold ${
            message.ok ? (message.big ? "gacha-kira bg-gradient-to-r from-amber-300 to-pink-300 text-slate-900" : "bg-emerald-50 text-emerald-700") : "bg-rose-50 text-rose-600"
          }`}
        >
          {message.text}
        </p>
      )}
      {g.unlimited && (
        <div className="flex items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-amber-300" data-testid="unlimited">
          <span className="flex-1">開発者モード: ポイント無限</span>
          <button type="button" onClick={onEndUnlimited} className="rounded-full bg-white/15 px-3 py-1 text-white">
            やめる
          </button>
        </div>
      )}
      <div className="rounded-2xl bg-white p-3 text-xs text-slate-600 ring-1 ring-slate-200">
        <p className="font-bold text-slate-800">もらえるポイント（短い単語ほど下、長い単語ほど上）</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {["N", "R", "SR", "SSR"].map((r) => (
            <p key={r} className="flex items-center gap-1.5 tabular-nums">
              <RarityChip rarity={r} /> {CODE_POINTS[r][0].toLocaleString()}〜{CODE_POINTS[r][1].toLocaleString()}pt
            </p>
          ))}
          <p className="col-span-2 flex items-center gap-1.5 tabular-nums">
            <RarityChip secret /> {CODE_POINTS.secret[1].toLocaleString()}pt
          </p>
        </div>
        {recent.length > 0 && (
          <>
            <p className="mt-3 font-bold text-slate-800">最近入れた単語</p>
            <p className="mt-1">{recent.map((c) => c.english).join("・")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function GachaScreen({
  state,
  speech,
  onPull,
  onExchange,
  onStarter,
  onSettings,
  onRedeem,
  onEndUnlimited,
  onUseBoost,
  onUpgrade,
  onBuy,
  onMakeTitle,
  onEquipTitle,
  onDeleteTitle,
}) {
  const g = state.gacha;
  const [view, setView] = useState("gacha");
  const [result, setResult] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [starterShown, setStarterShown] = useState(false);
  useEffect(() => {
    if (!g.starter) {
      onStarter();
      setStarterShown(true);
    }
  }, [g.starter, onStarter]);
  const pull = (opts) => {
    const r = onPull(opts);
    if (r.error) return r.error;
    setResult(r);
    return null;
  };
  return (
    <div className="flex h-full flex-col px-5 pt-4 pb-3">
      <ScreenHeader title="単語ガチャ" sub="集めて、語源を知ろう" onSettings={onSettings} />
      <TitleBadge gacha={g} className="mt-2" />
      <Wallet g={g} onUseBoost={onUseBoost} />
      {starterShown && (
        <p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2 text-center text-xs font-bold text-indigo-700" data-testid="gacha-starter">
          はじめてボーナス！ {STARTER.points}pt とレアチケット {STARTER.tickets} 枚をプレゼント
        </p>
      )}
      <div className="mt-3">
        <Segmented
          name="gacha-view"
          value={view}
          onChange={setView}
          options={[
            { value: "gacha", label: "ガチャ" },
            { value: "zukan", label: "図鑑" },
            { value: "titles", label: "マイ称号" },
            { value: "code", label: "コード" },
            { value: "shop", label: "ショップ" },
          ]}
        />
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
        {view === "gacha" && <GachaPanel g={g} onPull={pull} onUpgrade={onUpgrade} />}
        {view === "shop" && <ShopPanel g={g} onBuy={onBuy} />}
        {view === "zukan" && <ZukanView g={g} onOpen={setOpenId} />}
        {view === "titles" && <MyTitlePanel g={g} onMake={onMakeTitle} onEquip={onEquipTitle} onDelete={onDeleteTitle} />}
        {view === "code" && <CodePanel g={g} onRedeem={onRedeem} onEndUnlimited={onEndUnlimited} />}
      </div>
      {result && <GachaResult result={result} onClose={() => setResult(null)} onOpen={setOpenId} />}
      {openId && (
        <WordSheet card={CATALOG.cards[openId]} gacha={g} speech={speech} onClose={() => setOpenId(null)} onExchange={onExchange} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ログインボーナス・今日の目標・着せかえ
// ---------------------------------------------------------------------------
function BonusModal({ reward, gacha, onUseBoost, onClose }) {
  const theme = useThemeColors();
  const weekDay = ((reward.day - 1) % 7) + 1; // 1週間のうち何日目か
  const gift = reward.gacha;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6" onClick={onClose}>
      <div
        role="dialog"
        aria-label="ログインボーナス"
        data-testid="bonus-modal"
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-5 pt-6 text-white" style={gradient(theme, "135deg")}>
          <p className="text-xs font-bold tracking-widest text-white/80">DAILY BONUS</p>
          <p className="mt-1 text-2xl font-black">ログインボーナス</p>
          <p className="mt-1 text-sm font-bold text-white/90">{reward.day}日連続ログイン！</p>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => {
              const d = i + 1;
              const got = d <= weekDay;
              return (
                <div
                  key={d}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[10px] font-bold ${
                    got ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" : "bg-slate-100 text-slate-400"
                  } ${d === weekDay ? "scale-110" : ""}`}
                >
                  <span className="text-base leading-none">{got ? "★" : d === 7 ? "🎁" : "・"}</span>
                  {d}日
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-4xl font-black text-indigo-600 tabular-nums" data-testid="bonus-gacha">
            +{gift.points.toLocaleString()}
            <span className="ml-1 text-base text-indigo-500">pt</span>
          </p>
          <p className="mt-1 text-sm font-bold text-violet-600" data-testid="bonus-tickets">
            SR ガチャチケット +{gift.srTickets}
            {gift.ssrTickets > 0 && <span className="text-amber-500">・SSR ガチャチケット +{gift.ssrTickets}</span>}
            {gift.tickets > 0 && <span className="text-rose-500">・レアチケット +{gift.tickets}</span>}
          </p>
          <div className="mt-3 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200" data-testid="bonus-boost">
            <p className="flex items-center justify-center gap-1 text-sm font-black text-amber-700">
              <Zap size={16} className="fill-amber-400 text-amber-500" /> {BOOST_RATE}倍ブースト +{gift.boosts}（所持 {gacha.boosts}）
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
              使うと1時間、学習・テスト・バトルでもらえるガチャポイントが{BOOST_RATE}倍に。あとで「ガチャ」タブからも使えます。
            </p>
            <button
              type="button"
              onClick={onUseBoost}
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 py-2 text-sm font-extrabold text-white shadow active:scale-95"
            >
              今すぐ使う（1時間 {BOOST_RATE}倍）
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            今日 {DAILY_GOAL} 問学習すると、さらにガチャポイント +{GOAL_POINTS.toLocaleString()}。
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-2xl py-3.5 text-base font-extrabold text-white shadow-lg transition active:scale-95"
            style={gradient(theme)}
          >
            受け取る
          </button>
        </div>
      </div>
    </div>
  );
}

function BonusCard({ state, onClaimGoal }) {
  const { today } = todayAndYesterday();
  const b = state.bonus;
  const progress = Math.min(todayProgress(state, today), DAILY_GOAL);
  const goalDone = b.goalClaimed === today;
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid="bonus-card">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">ログインボーナス</p>
        <BoostBadge gacha={state.gacha} />
      </div>
      <p className="mt-1 text-xs text-slate-500 tabular-nums">
        連続ログイン {b.lastClaim ? b.loginStreak : 0}日 ・ 合計 {b.totalDays}日 ・ {BOOST_RATE}倍ブースト ×{state.gacha.boosts}
      </p>

      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <p className="flex items-center justify-between text-xs font-bold text-slate-600">
          今日の目標：{DAILY_GOAL}問学習
          <span className="tabular-nums">
            {progress} / {DAILY_GOAL}
          </span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${(progress / DAILY_GOAL) * 100}%` }} />
        </div>
        {canClaimGoal(state, today) ? (
          <button
            type="button"
            onClick={onClaimGoal}
            className="mt-2 w-full rounded-xl bg-amber-400 py-2 text-sm font-extrabold text-white shadow active:scale-95"
          >
            目標達成！ ガチャポイント +{GOAL_POINTS.toLocaleString()} を受け取る
          </button>
        ) : (
          <p className="mt-2 text-[11px] text-slate-500">
            {goalDone ? "今日の目標ボーナスは受け取り済みです。また明日！" : "スワイプ・テスト・シャドーイングが数に入ります"}
          </p>
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-500">着せかえ（カードと画面の色）は、右上の ⚙ 設定からいつでも選べます。</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// アカウント（Google ログインとクラウド保存）
// ---------------------------------------------------------------------------
const hhmm = (t) => new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

function AccountCard({ account }) {
  const { user, sync, authError, signIn, signOut, retry } = account;
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (!user) {
    return (
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid="account-card">
        <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <CloudOff size={18} className="text-slate-400" /> この端末にだけ保存中
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Google でログインすると、進捗をクラウドに保存して、スマホとパソコンなど別の端末でも続きから学習できます。
          今までの進捗はそのままアカウントに引き継がれます。
        </p>
        <button
          type="button"
          onClick={signIn}
          disabled={sync.status === "checking"}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-300 transition active:scale-95 disabled:opacity-40"
        >
          <span className="text-base font-black text-indigo-600">G</span> Google でログイン
        </button>
        {authError && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{authError}</p>}
        {IN_APP && (
          <div className="mt-2">
            <InAppNotice app={IN_APP} />
          </div>
        )}
      </div>
    );
  }

  const status = {
    loading: { text: "クラウドから読み込み中…", cls: "text-slate-500" },
    saving: { text: "保存中…", cls: "text-slate-500" },
    saved: { text: `クラウドに保存済み${sync.at ? `（${hhmm(sync.at)}）` : ""}`, cls: "text-emerald-600" },
    error: { text: sync.message || "保存できませんでした。", cls: "text-rose-600" },
  }[sync.status] || { text: "", cls: "" };

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-testid="account-card">
      <div className="flex items-center gap-3">
        {user.photo ? (
          <img src={user.photo} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600">
            {(user.name || user.email || "?")[0]}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{user.name || "ログイン中"}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <Cloud size={20} className={sync.status === "error" ? "text-rose-400" : "text-indigo-500"} />
      </div>
      <p className={`mt-2 text-xs font-semibold ${status.cls}`} data-testid="sync-status">
        {status.text}
      </p>
      {sync.status === "error" && (
        <button type="button" onClick={retry} className="mt-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
          もう一度試す
        </button>
      )}
      <button
        type="button"
        onClick={() => (confirming ? (setConfirming(false), signOut()) : setConfirming(true))}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
          confirming ? "bg-rose-500 text-white" : "bg-slate-50 text-slate-500 ring-1 ring-slate-200"
        }`}
      >
        <LogOut size={14} />
        {confirming ? "もう一度タップでログアウト（この端末の進捗は消え、クラウドには残ります）" : "ログアウト"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 日記: 今日のことを自由に書いて、日付ごとに保存する（採点はしない）
// ---------------------------------------------------------------------------
const DIARY_MOODS = ["😄", "🙂", "😐", "😢", "😡", "😴"];
/** 書くことに迷ったとき用のお題（日付で1つ選ぶ。使わなくてもよい） */
const DIARY_PROMPTS = [
  ["What did you eat today?", "今日は何を食べた？"],
  ["What made you smile today?", "今日笑ったことは？"],
  ["Where did you go today?", "今日はどこへ行った？"],
  ["Who did you talk to today?", "今日は誰と話した？"],
  ["What was the hardest part of your day?", "今日いちばん大変だったことは？"],
  ["What are you looking forward to?", "楽しみにしていることは？"],
  ["What did you learn today?", "今日学んだことは？"],
  ["How was the weather today?", "今日の天気はどうだった？"],
  ["What do you want to do tomorrow?", "明日したいことは？"],
  ["What are you grateful for today?", "今日感謝したいことは？"],
];
const diaryPromptFor = (date) => DIARY_PROMPTS[[...date].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % DIARY_PROMPTS.length];

function DiaryScreen({ state, speech, onSave, onSettings }) {
  const { today } = todayAndYesterday();
  const entry = state.diary?.[today];
  const [text, setText] = useState(entry?.text || "");
  const [mood, setMood] = useState(entry?.mood || null);
  const [saved, setSaved] = useState(false);
  const [openDate, setOpenDate] = useState(null);
  const [prompt, promptJa] = diaryPromptFor(today);
  const wordCount = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
  const english = /[A-Za-z]/.test(text);
  const history = Object.entries(state.diary || {})
    .filter(([d]) => d !== today)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const edited = () => setSaved(false);
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6" data-testid="diary">
      <ScreenHeader title="日記" sub="今日のことを自由に書こう" onSettings={onSettings} />
      {entry && !saved && <p className="mt-2 text-center text-[11px] text-slate-500">今日の日記は保存済みです。書き直して「保存する」で上書きできます。</p>}
      <div className="mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="flex items-center justify-between text-xs font-bold text-slate-500">
          <span>{today.replace(/-/g, "/")} の日記</span>
          <span className="tabular-nums">{english ? `${wordCount}語` : `${text.length}文字`}</span>
        </p>
        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="今日の気分">
          <span className="mr-1 text-[11px] font-bold text-slate-400">気分</span>
          {DIARY_MOODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mood === m}
              onClick={() => {
                setMood(mood === m ? null : m);
                edited();
              }}
              className={`rounded-full px-1.5 py-0.5 text-xl transition ${mood === m ? "scale-110 bg-indigo-100 ring-2 ring-indigo-400" : "opacity-60"}`}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) setText(`${prompt}\n`);
          }}
          className="mt-2 w-full rounded-2xl bg-amber-50 px-3 py-2 text-left ring-1 ring-amber-200"
          data-testid="diary-prompt"
        >
          <span className="block text-[10px] font-bold text-amber-600">今日のお題（書くことに迷ったら）</span>
          <span className="block text-sm font-bold text-slate-800">{prompt}</span>
          <span className="block text-[11px] text-slate-500">{promptJa}</span>
        </button>
        <textarea
          id="diary-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            edited();
          }}
          rows={8}
          spellCheck={false}
          autoCapitalize="sentences"
          placeholder={"Today I had breakfast with my family. ...\n（日本語で書いてもかまいません）"}
          className="mt-2 w-full resize-none rounded-2xl bg-slate-50 p-3 text-base leading-relaxed text-slate-900 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={() => {
              onSave(text, mood);
              setSaved(true);
            }}
            className="flex-1 rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 py-3 text-sm font-extrabold text-white shadow active:scale-95 disabled:opacity-40"
          >
            保存する
          </button>
          <button
            type="button"
            disabled={!english}
            onClick={() => speech.speak(text, null, `diary-${today}`)}
            aria-label="読み上げる"
            className="rounded-2xl bg-white px-4 text-indigo-600 ring-1 ring-slate-200 disabled:opacity-40"
          >
            <Volume2 size={18} />
          </button>
        </div>
        {saved && (
          <p className="mt-2 text-center text-xs font-bold text-emerald-600" data-testid="diary-saved">
            保存しました。あとで「これまでの日記」から見返せます
          </p>
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm font-bold text-slate-800">これまでの日記</p>
        {history.length === 0 && <p className="mt-2 text-xs text-slate-400">まだありません。毎日書くと、ここに並びます。</p>}
        <ul className="mt-2 space-y-2" data-testid="diary-history">
          {history.map(([date, e]) => (
            <li key={date} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
              <button type="button" onClick={() => setOpenDate(openDate === date ? null : date)} className="flex w-full items-center gap-2 text-left">
                <span className="text-xs font-bold text-slate-500">{date.replace(/-/g, "/")}</span>
                {e.mood && <span className="text-base">{e.mood}</span>}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{e.text}</span>
              </button>
              {openDate === date && (
                <div className="mt-2">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{e.text}</p>
                  {/[A-Za-z]/.test(e.text) && (
                    <button
                      type="button"
                      onClick={() => speech.speak(e.text, null, `diary-${date}`)}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600"
                    >
                      <Volume2 size={14} /> 読み上げる
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** 進捗で章を押したとき: 学習するか、一覧で単語を見るか選ぶ */
function ChapterChooser({ chapter, onChoose, onClose, state = null }) {
  const n = state ? chapter.items.filter((p) => state.learned[p.id]).length : null;
  const best = state?.tests[chapter.id]?.best;
  const bestJaEn = state?.tests[testKey(chapter.id, "ja-en")]?.best;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40" onClick={onClose}>
      <div
        role="dialog"
        aria-label="章をひらく"
        data-testid="chapter-chooser"
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-bold text-slate-400">第{CHAPTER_NO[chapter.id]}章</p>
        <p className="text-lg font-extrabold text-slate-900">{chapter.title}</p>
        {n != null && (
          <p className="mt-1 text-xs text-slate-500 tabular-nums" data-testid="chooser-progress">
            覚えた {n}/{chapter.items.length}
            {best != null && <span className="ml-2 text-indigo-500">テスト（意味）{best}%</span>}
            {bestJaEn != null && <span className="ml-2 text-pink-500">テスト（英語）{bestJaEn}%</span>}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChoose("study")}
            className="flex flex-col items-center gap-1 rounded-2xl bg-indigo-600 py-4 text-sm font-extrabold text-white shadow active:scale-95"
          >
            <Layers size={22} /> 学習する
          </button>
          <button
            type="button"
            onClick={() => onChoose("list")}
            className="flex flex-col items-center gap-1 rounded-2xl bg-white py-4 text-sm font-extrabold text-indigo-700 ring-2 ring-indigo-200 active:scale-95"
          >
            <List size={22} /> 一覧で単語を見る
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full py-2 text-sm font-bold text-slate-400">
          閉じる
        </button>
      </div>
    </div>
  );
}

function ProgressScreen({ state, onOpenChapter, storageOk, account, bonusActions }) {
  const [choosing, setChoosing] = useState(null);
  const current = CHAPTERS.find((c) => c.id === state.chapter) || null;
  const chapterLearned = (c) => c.items.filter((p) => state.learned[p.id]).length;
  // 今の章のコースを最初から開いておく
  const [openPart, setOpenPart] = useState(() => PART_GROUPS.find((g) => g.chapters.some((c) => c.id === state.chapter))?.title || null);
  const learned = ALL_ITEMS.filter((p) => state.learned[p.id]).length;
  const pct = Math.round((learned / TOTAL) * 100);
  const { today, yesterday } = todayAndYesterday();
  const s = state.stats;
  const streak = currentStreak(s, today, yesterday);
  const todayCount = s.todayDate === today ? s.todayCount : 0;
  const clearedChapters = CHAPTERS.filter((c) => c.items.every((p) => state.learned[p.id])).length;

  const tiles = [
    { icon: <Flame size={20} />, label: "連続学習", value: `${streak}日`, color: "text-orange-500 bg-orange-50" },
    { icon: <Target size={20} />, label: "今日の学習", value: `${todayCount}問`, color: "text-sky-500 bg-sky-50" },
    { icon: <Layers size={20} />, label: "累計スワイプ", value: `${s.totalSwipes}回`, color: "text-violet-500 bg-violet-50" },
    { icon: <PenLine size={20} />, label: "テスト解答数", value: `${s.totalAnswers || 0}問`, color: "text-amber-500 bg-amber-50" },
    { icon: <Repeat size={20} />, label: "シャドーイング", value: `${s.totalShadows || 0}回`, color: "text-pink-500 bg-pink-50" },
    { icon: <Target size={20} />, label: "苦手な問題", value: `${Object.keys(state.misses).length}問`, color: "text-rose-500 bg-rose-50" },
  ];

  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6">
      {choosing && (
        <ChapterChooser
          state={state}
          chapter={choosing}
          onClose={() => setChoosing(null)}
          onChoose={(where) => {
            setChoosing(null);
            onOpenChapter(choosing.id, where);
          }}
        />
      )}
      <h1 className="text-2xl font-extrabold text-slate-900">学習の進捗</h1>
      <TitleBadge gacha={state.gacha} className="mt-1" />

      <div className="mt-4 flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
          <div className="origin-top-left" style={{ transform: "scale(0.6)" }}>
            <ProgressRing value={learned / TOTAL} />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black text-slate-900 tabular-nums" data-testid="progress-pct">
              {pct}
              <span className="text-sm">%</span>
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 tabular-nums">
            {learned} / {TOTAL} 覚えた
          </p>
          <p className="mt-0.5 text-sm font-bold leading-snug text-slate-800">{motivation(learned)}</p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            クリアした章 {clearedChapters} / {CHAPTERS.length}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white px-2.5 py-2 shadow-sm ring-1 ring-slate-200">
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className={`flex h-5 w-5 items-center justify-center rounded-md ${t.color}`}>{React.cloneElement(t.icon, { size: 12 })}</span>
              {t.label}
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-slate-900 tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>

      {current && (
        <button
          type="button"
          onClick={() => onOpenChapter(current.id, "study")}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 p-3 text-left text-white shadow"
          data-testid="progress-continue"
        >
          <Play size={20} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold text-white/70">続きから（第{CHAPTER_NO[current.id]}章）</span>
            <span className="block truncate text-sm font-bold">{current.title}</span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white" style={{ width: `${(chapterLearned(current) / current.items.length) * 100}%` }} />
            </span>
          </span>
          <span className="text-xs font-bold tabular-nums">
            {chapterLearned(current)}/{current.items.length}
          </span>
        </button>
      )}

      <BonusCard state={state} {...bonusActions} />

      <p className="mt-4 text-sm font-bold text-slate-800">コースごとの進み具合</p>
      <div className="mt-2 space-y-2" data-testid="progress-parts">
        {PART_GROUPS.map((part) => {
          const partLearned = part.chapters.reduce((n, c) => n + chapterLearned(c), 0);
          const partTotal = part.chapters.reduce((n, c) => n + c.items.length, 0);
          const isOpen = openPart === part.title;
          return (
            <div key={part.title} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setOpenPart(isOpen ? null : part.title)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold text-slate-800">
                      {part.title}
                      <span className="ml-1 text-[10px] font-semibold text-slate-400">
                        第{part.from}〜{part.to}章
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums">
                      {partLearned} / {partTotal}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${(partLearned / partTotal) * 100}%` }} />
                  </span>
                </span>
                <ChevronDown size={16} className={`shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="grid grid-cols-5 gap-1.5 px-3 pb-3">
                  {part.chapters.map((c) => {
                    const n = chapterLearned(c);
                    const ratio = n / c.items.length;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setChoosing(c)}
                        aria-label={`第${CHAPTER_NO[c.id]}章 ${c.title} ${n}/${c.items.length}`}
                        title={c.title}
                        className={`relative h-10 overflow-hidden rounded-lg text-xs font-bold tabular-nums ring-1 ${
                          ratio >= 1 ? "bg-emerald-500 text-white ring-emerald-500" : "bg-slate-50 text-slate-600 ring-slate-200"
                        } ${state.chapter === c.id ? "outline outline-2 outline-indigo-500" : ""}`}
                      >
                        {ratio > 0 && ratio < 1 && <span className="absolute inset-x-0 bottom-0 block bg-emerald-300/70" style={{ height: `${ratio * 100}%` }} />}
                        <span className="relative">{CHAPTER_NO[c.id]}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">コースを開いて章の番号を押すと、学習するか一覧で見るかを選べます。</p>
      {cloud.available && <AccountCard account={account} />}

      {!storageOk && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          この環境ではブラウザ保存（LocalStorage）が使えないため、進捗はページを閉じると消えます。
        </p>
      )}


    </div>
  );
}

// ---------------------------------------------------------------------------
// 新しい版のお知らせ
// ---------------------------------------------------------------------------
/* global __BUILD_HASH__ */
const BUILD_HASH = typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : null;

/**
 * 公開中の index.html を取り直し、埋め込まれた source-hash が今動いている版と違えば新しい版がある。
 * 開いたときと、別のアプリから戻ってきたときに確かめる（ブラウザのキャッシュで古い版が残るのを防ぐ）。
 */
function useUpdateCheck() {
  const [newHash, setNewHash] = useState(null);
  useEffect(() => {
    if (!BUILD_HASH || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) return undefined;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch(`${location.pathname}?check=${Date.now()}`, { cache: "no-store" });
        const m = (await res.text()).match(/source-hash: ([0-9a-f]+)/);
        if (alive && m && m[1] !== BUILD_HASH) setNewHash(m[1]);
      } catch {
        /* オフラインなど。次の機会に確かめる */
      }
    };
    const t = setTimeout(check, 2000);
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return newHash;
}

function UpdateBanner({ onUpdate }) {
  return (
    <div className="absolute inset-x-3 top-3 z-50 flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xl" data-testid="update-banner">
      <Sparkles size={18} className="shrink-0 text-amber-300" />
      <p className="flex-1 text-sm font-bold">新しいバージョンがあります</p>
      <button type="button" onClick={onUpdate} className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-slate-900">
        更新する
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 最初の画面（ログイン）
// ---------------------------------------------------------------------------
/** アプリ内ブラウザ（LINE 以外）で開かれたときの案内 */
function InAppNotice({ app }) {
  const [copied, setCopied] = useState(false);
  const url = typeof location !== "undefined" ? location.href.split("?")[0] : "";
  return (
    <div className="rounded-2xl bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200" data-testid="in-app-notice">
      <p className="font-bold">{app} のアプリ内で開いています</p>
      <p className="mt-1">
        ここでは Google ログインと音声入力が使えません。右上（または右下）のメニューから「ブラウザで開く」を選ぶか、
        URL をコピーして Safari / Chrome に貼り付けてください。
      </p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false));
        }}
        className="mt-2 rounded-full bg-white px-3 py-1.5 font-bold text-amber-800 ring-1 ring-amber-300"
      >
        {copied ? "コピーしました" : "URL をコピー"}
      </button>
      <p className="mt-1 select-all break-all text-[11px] text-amber-700">{url}</p>
    </div>
  );
}

function WelcomeScreen({ account, onSkip }) {
  const busy = account.sync.status === "loading" || account.sync.status === "checking";
  return (
    <div className="absolute inset-0 z-40 flex flex-col overflow-y-auto bg-gradient-to-b from-indigo-600 via-violet-600 to-fuchsia-600 px-6 text-white" data-testid="welcome">
      <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-lg ring-1 ring-white/30">
          <Sparkles size={32} />
        </div>
        <h1 className="mt-5 text-4xl font-black tracking-tight">SwipeTalk</h1>
        <p className="mt-2 text-sm text-white/85">スワイプとテストで、話せる英語を。</p>

        <ul className="mt-8 w-full max-w-xs space-y-3 text-left text-sm">
          {[
            [Layers, `${CHAPTERS.length}章・${TOTAL}問（フレーズ${KIND_ITEMS.phrase.length}・単語${KIND_ITEMS.word.length}）`],
            [PenLine, "日本語→英語テストとシャドーイングで口から出す"],
            [Cloud, "ログインすると、どの端末でも続きから"],
          ].map(([Icon, text]) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
                <Icon size={15} />
              </span>
              <span className="leading-snug">{text}</span>
            </li>
          ))}
        </ul>

        <div className="mt-10 w-full max-w-xs space-y-3">
          {IN_APP && <InAppNotice app={IN_APP} />}
          <button
            type="button"
            onClick={account.signIn}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-base font-extrabold text-slate-800 shadow-lg transition active:scale-95 disabled:opacity-60"
          >
            <span className="text-lg font-black text-indigo-600">G</span>
            {busy ? "読み込み中…" : "Google でログイン"}
          </button>
          {account.authError && (
            <p className="rounded-xl bg-white/15 px-3 py-2 text-left text-xs leading-relaxed">{account.authError}</p>
          )}
          <button type="button" onClick={onSkip} className="w-full py-2 text-sm font-bold text-white/90 underline underline-offset-4">
            ログインせずに使う
          </button>
          <p className="text-[11px] leading-relaxed text-white/70">
            ログインしない場合、進捗はこの端末にだけ保存されます。あとから「進捗」タブでログインすると引き継げます。
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// アプリ本体
// ---------------------------------------------------------------------------
export default function App() {
  const [state, setState] = useState(loadInitialState);
  const [settings, setSettings] = useState(loadSettings);
  const [tab, setTab] = useState("study");
  const [listScope, setListScope] = useState({ scope: "all", at: 0 }); // 進捗から「一覧で見る」を選んだ章
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageOk] = useState(() => storage.available());
  const [sound] = useState(() => new SoundEngine());
  const speech = useSpeech(settings);
  const rateCtx = useMemo(() => ({ rate: settings.rate, setRate: (rate) => setSettings((s) => ({ ...s, rate })) }), [settings.rate]);

  // ブラウザは画面に触れるまで音を出させないので、最初のタップで効果音を有効にする
  useEffect(() => {
    // iPhone は touchend・click でないと音の再生を許さないことがあるので、それらでも呼ぶ（何度呼んでもよい）
    const unlock = () => sound.unlock();
    const events = ["pointerdown", "touchend", "click", "keydown"];
    events.forEach((ev) => window.addEventListener(ev, unlock));
    return () => events.forEach((ev) => window.removeEventListener(ev, unlock));
  }, [sound]);
  useEffect(() => sound.set(settings.sfx, settings.sfxVolume), [sound, settings.sfx, settings.sfxVolume]);
  useEffect(() => sound.setCheers(settings.cheers), [sound, settings.cheers]);
  useEffect(() => sound.setBgm(settings.battleBgm, settings.bgmVolume), [sound, settings.battleBgm, settings.bgmVolume]);
  useEffect(() => sound.setStudyBgm(settings.studyBgm, settings.studyBgmVolume), [sound, settings.studyBgm, settings.studyBgmVolume]);
  // 学習中の BGM: シャドーイング（マイクを使う）以外の画面で、アプリを見ているあいだだけ
  useEffect(() => {
    const apply = () => sound.setStudyMusic(tab !== "shadow" && !document.hidden);
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, [sound, tab]);

  useEffect(() => storage.save(STATE_KEY, state), [state]);
  useEffect(() => storage.save(SETTINGS_KEY, settings), [settings]);

  // ---- 端末の進捗の持ち主と最終更新時刻
  const meta = useRef(storage.load(META_KEY) || { owner: null, updatedAt: 0 });
  const setMeta = (m) => {
    meta.current = m;
    storage.save(META_KEY, m);
  };
  const stateRef = useRef(state);
  stateRef.current = state;

  /** 利用者の操作による変更。更新時刻を記録して、ログイン中ならクラウド保存の対象にする */
  const update = useCallback((fn) => {
    setMeta({ ...meta.current, updatedAt: Date.now() });
    setState(fn);
  }, []);

  // ---- ガチャポイント: 学習・シャドーイングは前の操作からの時間（放っておいた分は切る）に応じてもらえる
  const lastActivity = useRef(0);
  const spentSeconds = useCallback((cap) => {
    const now = Date.now();
    const prev = lastActivity.current;
    lastActivity.current = now;
    return prev ? Math.min(cap, (now - prev) / 1000) : Math.min(cap, 5);
  }, []);
  const [earnToast, setEarnToast] = useState(null);
  // ---- ドーパミンモード: 連続正解を数えて、演出と音を出す
  const [dpFx, setDpFx] = useState(null);
  const [dpStreak, setDpStreak] = useState(0);
  const dpStreakRef = useRef(0);
  const rootRef = useRef(null); // 画面を揺らす
  const dopamineOn = settings.dopamine;
  const dopamine = useMemo(
    () => ({
      on: dopamineOn,
      hit(correct) {
        if (!dopamineOn) return;
        if (!correct) {
          dpStreakRef.current = 0;
          setDpStreak(0);
          return;
        }
        const n = (dpStreakRef.current += 1);
        setDpStreak(n);
        setDpFx({ id: Date.now() + Math.random(), streak: n });
        sound.play("streak", n);
        if (dpMilestone(n)) sound.play(n >= 10 ? "ssr" : "bonus");
        const amp = dpMilestone(n) ? 10 : Math.min(2 + n * 0.5, 7);
        wiggle(
          rootRef.current,
          [{ transform: "translate(0,0)" }, { transform: `translate(${-amp}px,${amp / 2}px) rotate(-0.6deg)` }, { transform: `translate(${amp}px,${-amp / 2}px) rotate(0.6deg)` }, { transform: "translate(0,0)" }],
          dpMilestone(n) ? 420 : 240
        );
        try {
          navigator.vibrate?.(n >= 10 ? [15, 30, 25] : 12);
        } catch {
          /* 振動できない端末 */
        }
      },
    }),
    [dopamineOn, sound]
  );
  const showEarned = useCallback((seconds, now) => {
    const points = pointsForTime(seconds) * boostRate(stateRef.current.gacha, now);
    if (points > 0) setEarnToast({ points, at: now, boosted: boostActive(stateRef.current.gacha, now) });
  }, []);

  const onSwipe = useCallback((chapter, id, dir) => {
    const { today, yesterday } = todayAndYesterday();
    const now = Date.now();
    const seconds = spentSeconds(20); // 1枚あたり最大20秒
    showEarned(seconds, now);
    if (dir === "right") dopamine.hit(true);
    update((s) => earnTimePoints(applySwipe(s, chapter, id, dir, today, yesterday), seconds, now).state);
  }, [update, spentSeconds, showEarned, dopamine]);
  const onToggle = useCallback((chapter, id) => update((s) => toggleLearned(s, chapter, id)), [update]);
  const onToggleFavorite = useCallback((id) => update((s) => toggleFavorite(s, id)), [update]);
  /** 日記を保存する（同じ日は上書き） */
  const onSaveDiary = useCallback(
    (text, mood) => {
      const { today } = todayAndYesterday();
      const next = saveDiary(stateRef.current, today, text, [], Date.now(), { mood: mood || null });
      stateRef.current = next;
      update(() => next);
      sound.play("correct");
    },
    [update, sound]
  );
  const onChapter = useCallback((chapter) => update((s) => ({ ...s, chapter })), [update]);
  const onResetChapter = useCallback((chapter) => update((s) => resetChapter(s, chapter)), [update]);
  const onResetAll = useCallback(() => {
    update((s) => ({ ...freshState(CHAPTERS[0].id), stats: s.stats, bonus: s.bonus, gacha: s.gacha }));
    setTab("study");
  }, [update]);
  const onShadowDone = useCallback(() => {
    const { today, yesterday } = todayAndYesterday();
    const now = Date.now();
    const seconds = spentSeconds(60); // 1文あたり最大60秒
    showEarned(seconds, now);
    update((s) => earnTimePoints({ ...s, stats: recordActivity(s.stats, today, yesterday, { shadows: 1 }) }, seconds, now).state);
  }, [update, spentSeconds, showEarned]);
  /** テストが終わった: 苦手の記録と、かかった時間ぶんのポイント。もらったポイントを返す */
  const onFinishTest = useCallback((scope, results, seconds = 0) => {
    const { today, yesterday } = todayAndYesterday();
    const now = Date.now();
    lastActivity.current = now;
    const r = earnTimePoints(applyTestResult(stateRef.current, LIBRARY, scope, results, today, yesterday), seconds, now);
    stateRef.current = r.state;
    update(() => r.state);
    return r.points;
  }, [update]);

  // ---- バトル: 間違えた単語は苦手に入れ、ポイント・チケットを渡す
  const onFinishBattle = useCallback(
    (b) => {
      const { today, yesterday } = todayAndYesterday();
      const withMisses = applyTestResult(stateRef.current, LIBRARY, `battle@${b.direction}`, resultsOf(b), today, yesterday);
      const res = applyBattle(withMisses, b, today, Date.now());
      lastActivity.current = Date.now();
      stateRef.current = res.state;
      update(() => res.state);
      return res.reward;
    },
    [update]
  );

  // ---- 冒険（ガチャの単語を装備にするドラクエ風モード）
  const questActions = useMemo(
    () => ({
      onEquip(slot, id) {
        const next = questEquip(stateRef.current, slot, id);
        stateRef.current = next;
        update(() => next);
        sound.play("tap");
      },
      onAutoEquip() {
        const next = questAutoEquip(stateRef.current, CATALOG.cards);
        stateRef.current = next;
        update(() => next);
        sound.play("correct", 0, { cheer: false });
      },
      onSavePreset(i) {
        const next = questSavePreset(stateRef.current, i);
        stateRef.current = next;
        update(() => next);
        sound.play("tap");
      },
      onLoadPreset(i) {
        const next = questLoadPreset(stateRef.current, i);
        stateRef.current = next;
        update(() => next);
        sound.play("correct", 0, { cheer: false });
      },
      onFinish(run, seconds) {
        const { today, yesterday } = todayAndYesterday();
        const withMisses = applyTestResult(stateRef.current, LIBRARY, "quest@en-ja", runResults(run), today, yesterday);
        const res = applyQuest(withMisses, run, Math.min(seconds, 60 * 60), Date.now());
        lastActivity.current = Date.now();
        stateRef.current = res.state;
        update(() => res.state);
        return res.reward;
      },
    }),
    [update, sound]
  );

  // ---- 単語ガチャ
  const onGachaPull = useCallback(
    (opts) => {
      const r = gachaPull(stateRef.current, CATALOG, opts, gachaRng());
      if (r.error) return r;
      stateRef.current = r.state;
      update(() => r.state);
      const best = r.results.reduce((b, x) => Math.max(b, RARITIES.indexOf(x.rarity)), 0);
      sound.play(best >= 3 || r.newSecrets.length ? "bonus" : best >= 2 ? "complete" : "correct");
      return r;
    },
    [update, sound]
  );
  const onGachaExchange = useCallback(
    (id, payWith) => {
      const r = gachaExchange(stateRef.current, CATALOG, id, payWith);
      if (r.error) return r;
      stateRef.current = r.state;
      update(() => r.state);
      sound.play(r.newSecrets.length || r.newTitles.length ? "bonus" : "correct");
      return r;
    },
    [update, sound]
  );
  const onGachaStarter = useCallback(() => update((s) => claimStarter(s)), [update]);
  const onRedeemCode = useCallback(
    (code) => {
      const { today } = todayAndYesterday();
      const r = redeemCode(stateRef.current, CATALOG, code, today);
      if (r.error) return r;
      stateRef.current = r.state;
      update(() => r.state);
      sound.play(r.unlimited || r.points >= 20000 ? "ssr" : "bonus");
      return r;
    },
    [update, sound]
  );
  const onEndUnlimited = useCallback(() => update((s) => endUnlimited(s)), [update]);
  /** 失敗なら error の文字列、成功なら null を返す操作 */
  const act = useCallback(
    (fn, sfx = "bonus") => {
      const r = fn(stateRef.current);
      if (r.error) return r.error;
      stateRef.current = r.state;
      update(() => r.state);
      sound.play(sfx);
      return null;
    },
    [update, sound]
  );
  const onUpgradeTickets = useCallback((to) => act((s) => upgradeTickets(s, to)), [act]);
  const onBuyItem = useCallback((id) => act((s) => buyItem(s, id), "complete"), [act]);
  const onConsumeItem = useCallback((id) => act((s) => consumeItem(s, id), "tap"), [act]);
  const onMakeTitle = useCallback((parts) => act((s) => makeMyTitle(s, CATALOG, parts, Date.now()), "complete"), [act]);
  const onEquipTitle = useCallback((id) => update((s) => equipMyTitle(s, id)), [update]);
  const onDeleteTitle = useCallback((id) => update((s) => deleteMyTitle(s, id)), [update]);
  const onUseBoost = useCallback(() => {
    const r = activateBoost(stateRef.current, Date.now());
    if (r.error) return r.error;
    stateRef.current = r.state;
    update(() => r.state);
    sound.play("bonus");
    return null;
  }, [update, sound]);

  // ---- クラウド同期（Google ログイン）
  const [user, setUser] = useState(null);
  const [sync, setSync] = useState({ status: cloud.available ? "checking" : "off" });
  const [authError, setAuthError] = useState("");
  const ready = useRef(false); // ログイン後の読み込みが終わり、保存してよい状態か
  const syncedAt = useRef(0); // クラウドに保存済みの更新時刻

  /** ログインしたら、端末とクラウドの進捗を突き合わせてから同期を始める */
  const connect = useCallback(async (u) => {
    ready.current = false;
    setSync({ status: "loading" });
    try {
      const remote = await cloud.load(u.uid);
      const decision = resolveLogin({ state: stateRef.current, ...meta.current }, remote, u.uid, LIBRARY);
      if (decision.newerRemote) {
        setSync({
          status: "error",
          message: "新しい版のアプリで保存された進捗です。上書きしないよう同期を止めています。ページを再読み込みしてください。",
        });
        return;
      }
      const updatedAt = decision.upload ? Date.now() : remote.updatedAt;
      setMeta({ owner: u.uid, updatedAt });
      setState(decision.state);
      if (decision.upload) await cloud.save(u.uid, decision.state, updatedAt);
      syncedAt.current = updatedAt;
      ready.current = true;
      setSync({ status: "saved", at: Date.now() });
    } catch {
      setSync({ status: "error", message: "クラウドに接続できませんでした。進捗はこの端末に保存しています。" });
    }
  }, []);

  useEffect(() => {
    if (!cloud.available) return undefined;
    return cloud.onAuthChange((u) => {
      setUser(u);
      if (u) {
        connect(u);
        return;
      }
      ready.current = false;
      setSync({ status: "signedOut" });
      // ログアウトしたら、次にこの端末を使う人に前の人の進捗が見えないよう消す（クラウドには残っている）
      if (meta.current.owner) {
        setMeta({ owner: null, updatedAt: 0 });
        setState(freshState(CHAPTERS[0].id));
      }
    });
  }, [connect]);

  const flush = useCallback(async () => {
    if (!user || !ready.current || meta.current.updatedAt <= syncedAt.current) return;
    const at = meta.current.updatedAt;
    setSync({ status: "saving" });
    try {
      await cloud.save(user.uid, stateRef.current, at);
      syncedAt.current = Math.max(syncedAt.current, at);
      setSync({ status: "saved", at: Date.now() });
    } catch {
      setSync({ status: "error", message: "保存できませんでした。通信状況を確認してください（この端末には保存済み）。" });
    }
  }, [user]);

  // 操作のたびに書き込まないよう、少し待ってまとめて保存する
  useEffect(() => {
    if (!user || !ready.current || meta.current.updatedAt <= syncedAt.current) return undefined;
    const t = setTimeout(flush, 1500);
    return () => clearTimeout(t);
  }, [state, user, flush]);

  // アプリを閉じる・切り替えるときと、通信が戻ったときはすぐ保存する
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  const account = {
    user,
    sync,
    authError,
    signIn: async () => {
      setAuthError("");
      try {
        await cloud.signIn();
      } catch (e) {
        setAuthError(authErrorMessage(e));
      }
    },
    signOut: async () => {
      await flush();
      await cloud.signOut();
    },
    retry: () => (ready.current ? flush() : user && connect(user)),
  };

  // ログインしていなければ、起動時にログイン画面を出す（「ログインせずに使う」でこの起動中は出さない）
  const [skipLogin, setSkipLogin] = useState(() => session.get(SKIP_LOGIN_KEY) === "1");
  const showWelcome = cloud.available && !user && sync.status === "signedOut" && !skipLogin;

  // ---- ログインボーナス（その日最初に開いたとき。ログイン中はクラウドの進捗を読んでから）
  const [bonusReward, setBonusReward] = useState(null);
  const bonusChecked = useRef(false);
  const bonusReady =
    !showWelcome &&
    (!cloud.available || (user ? sync.status === "saved" || sync.status === "error" : sync.status === "signedOut"));
  useEffect(() => {
    if (!bonusReady || bonusChecked.current) return;
    bonusChecked.current = true;
    if (typeof window !== "undefined" && window.__swipetalkNoDailyBonus) return; // E2E 用
    const { today, yesterday } = todayAndYesterday();
    const result = claimDailyBonus(stateRef.current, today, yesterday);
    if (!result.reward) return;
    update(() => result.state);
    setBonusReward(result.reward);
    sound.play("bonus");
  }, [bonusReady, update, sound]);

  const bonusActions = {
    onClaimGoal: () => {
      const { today } = todayAndYesterday();
      sound.play("bonus");
      update((s) => claimGoalBonus(s, today));
    },
  };
  const theme = themeById(settings.theme || state.bonus?.theme);

  const newVersion = useUpdateCheck();
  const applyUpdate = async () => {
    await flush(); // 進捗をクラウドに保存してから読み込み直す（端末には常に保存済み）
    location.replace(`${location.pathname}?v=${newVersion}`);
  };

  const openSettings = () => setSettingsOpen(true);
  const navItems = [
    { key: "study", label: "学習", icon: Layers },
    { key: "test", label: "テスト", icon: PenLine },
    { key: "shadow", label: "シャドー", icon: Repeat },
    { key: "list", label: "一覧", icon: List },
    { key: "gacha", label: "ガチャ", icon: Gift },
    { key: "diary", label: "日記", icon: NotebookPen },
    { key: "progress", label: "進捗", icon: Trophy },
  ];

  return (
    <SoundContext.Provider value={sound}>
    <RateContext.Provider value={rateCtx}>
    <DopamineContext.Provider value={dopamine}>
    <ThemeContext.Provider value={theme}>
    <LinkingContext.Provider value={settings.linking}>
    <div className="w-full bg-slate-100" style={{ height: "100dvh" }}>
      <div ref={rootRef} className="relative mx-auto flex h-full w-full max-w-md flex-col bg-slate-50 shadow-xl">
        {dopamineOn && <DopamineLayer fx={dpFx} streak={dpStreak} />}
        {earnToast && Date.now() - earnToast.at < 1500 && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center">
            <p
              key={earnToast.at}
              data-testid="earn-toast"
              className="bt-pop rounded-full bg-indigo-600/90 px-3 py-1 text-xs font-black text-white shadow-lg tabular-nums"
            >
              +{earnToast.points}pt{earnToast.boosted ? `（${BOOST_RATE}倍）` : ""}
            </p>
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-hidden">
          {tab === "study" && (
            <StudyScreen
              active
              state={state}
              onChapter={onChapter}
              onSwipe={onSwipe}
              onResetChapter={onResetChapter}
              speech={speech}
              onSettings={openSettings}
              onToggleFavorite={onToggleFavorite}
            />
          )}
          {/* テストは途中でタブを切り替えても続きから再開できるよう、常にマウントしておく */}
          <div className="h-full" hidden={tab !== "test"}>
            <TestScreen
              active={tab === "test"}
              state={state}
              settings={settings}
              setSettings={setSettings}
              speech={speech}
              onFinishTest={onFinishTest}
              onFinishBattle={onFinishBattle}
              quest={questActions}
              onUseItem={onConsumeItem}
              onToggleFavorite={onToggleFavorite}
              onSettings={openSettings}
            />
          </div>
          {tab === "shadow" && (
            <ShadowScreen state={state} settings={settings} speech={speech} onShadowDone={onShadowDone} onSettings={openSettings} />
          )}
          {tab === "list" && (
            <ListScreen
              key={listScope.at}
              state={state}
              onToggle={onToggle}
              speech={speech}
              initialScope={listScope.scope}
              onToggleFavorite={onToggleFavorite}
            />
          )}
          {tab === "gacha" && (
            <GachaScreen
              state={state}
              speech={speech}
              onPull={onGachaPull}
              onExchange={onGachaExchange}
              onStarter={onGachaStarter}
              onSettings={openSettings}
              onRedeem={onRedeemCode}
              onEndUnlimited={onEndUnlimited}
              onUseBoost={onUseBoost}
              onUpgrade={onUpgradeTickets}
              onBuy={onBuyItem}
              onMakeTitle={onMakeTitle}
              onEquipTitle={onEquipTitle}
              onDeleteTitle={onDeleteTitle}
            />
          )}
          {tab === "diary" && <DiaryScreen state={state} speech={speech} onSave={onSaveDiary} onSettings={openSettings} />}
          {tab === "progress" && (
            <ProgressScreen
              state={state}
              bonusActions={bonusActions}
              onOpenChapter={(id, where) => {
                if (where === "list") {
                  setListScope({ scope: id, at: Date.now() });
                  setTab("list");
                } else {
                  onChapter(id);
                  setTab("study");
                }
              }}
              storageOk={storageOk}
              account={account}
            />
          )}
        </main>

        <nav className="border-t border-slate-200 bg-white/90 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="grid grid-cols-7">
            {navItems.map(({ key, label, icon: Icon }) => {
              const current = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    sound.play("tap");
                    setTab(key);
                  }}
                  aria-current={current ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
                    current ? "text-indigo-600" : "text-slate-400"
                  }`}
                >
                  <Icon size={21} strokeWidth={current ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        {newVersion && <UpdateBanner onUpdate={applyUpdate} />}
        {bonusReward && (
          <BonusModal
            reward={bonusReward}
            gacha={state.gacha}
            onUseBoost={() => {
              onUseBoost();
              setBonusReward(null);
            }}
            onClose={() => setBonusReward(null)}
          />
        )}

        {showWelcome && (
          <WelcomeScreen
            account={account}
            onSkip={() => {
              session.set(SKIP_LOGIN_KEY, "1");
              setSkipLogin(true);
            }}
          />
        )}

        <SettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          setSettings={setSettings}
          speech={speech}
          onResetAll={onResetAll}
          themeId={theme.id}
        />
      </div>
    </div>
    </LinkingContext.Provider>
    </ThemeContext.Provider>
    </DopamineContext.Provider>
    </RateContext.Provider>
    </SoundContext.Provider>
  );
}

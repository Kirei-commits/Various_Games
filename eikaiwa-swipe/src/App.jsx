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
} from "lucide-react";
import rawChapters, { PARTS, RENAMED } from "./data/index.js";
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
  wordMatch,
  resolveLogin,
  stateVersionOf,
  STATE_VERSION,
} from "./logic.js";
import { cloud, authErrorMessage } from "./cloud.js";
import { usableVoices, pickVoices, genderLabel } from "./voices.js";

/*
 * SwipeTalk — スワイプ式 英会話フレーズ学習アプリ
 *
 * - 学習: 右スワイプ=覚えた（キューから外す）/ 左スワイプ=覚えてない（最後尾へ）
 * - テスト: 英語（文字 or 音声のみ）を見て、日本語の意味を「入力・音声・4択」で答える
 * - 全40章 × 50問 = 2000問（src/data/）。基本編（1〜20章）とアメリカ生活編（21〜40章）
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

const SWIPE_THRESHOLD = 100;
const TAP_SLOP = 8;
const EXIT_MS = 280;

const chapterLabel = (c) => `第${CHAPTER_NO[c.id]}章 ${c.title}`;
/** 部ごとの章（章選択のグループ分けと進捗画面の見出しに使う） */
const PART_GROUPS = PARTS.map((p) => ({ ...p, chapters: CHAPTERS.slice(p.from - 1, p.to) }));

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
  voiceURI: "",
  voiceBURI: "",
  rate: 0.95,
  expressive: true,
  twoVoices: true,
  test: { scope: "ch01", count: 10, direction: "en-ja", prompt: "text", answer: "type" },
};

function loadSettings() {
  const s = storage.load(SETTINGS_KEY) || {};
  return { ...DEFAULT_SETTINGS, ...s, test: { ...DEFAULT_SETTINGS.test, ...(s.test || {}) } };
}

// ---------------------------------------------------------------------------
// 音声読み上げ（Web Speech API）
// ---------------------------------------------------------------------------
function useSpeech(settings) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState([]);
  const [speaking, setSpeaking] = useState(null);
  const token = useRef(0);

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
    () => pickVoices(voices, { aURI: settings.voiceURI, bURI: settings.voiceBURI, twoVoices: settings.twoVoices }),
    [voices, settings.voiceURI, settings.voiceBURI, settings.twoVoices]
  );

  /**
   * lines: [{ text, role }] を順番に読み上げる。key は再生中表示に使う。
   * onDone は最後まで読み終えたときだけ呼ぶ（途中で止めた・別の再生に割り込まれたときは呼ばない）。
   * 読み上げできない環境では false を返す。
   */
  const speakLines = useCallback(
    (lines, key, onDone) => {
      if (!supported || !lines.length) return false;
      const synth = window.speechSynthesis;
      synth.cancel();
      const my = ++token.current;
      const utterances = [];
      for (const line of lines) {
        const voice = line.role === "B" ? voiceB : voiceA;
        for (const chunk of prosodyPlan(line.text, {
          expressive: settings.expressive,
          rate: settings.rate,
          // 声の高さで役を区別するのは、B役も同じ声を使うときだけ（別の声を高くすると不自然になる）
          role: settings.twoVoices && sameVoice ? line.role : null,
        })) {
          const u = new SpeechSynthesisUtterance(chunk.text);
          u.lang = voice?.lang || "en-US";
          if (voice) u.voice = voice;
          u.pitch = chunk.pitch;
          u.rate = chunk.rate;
          utterances.push(u);
        }
      }
      if (!utterances.length) return false;
      const finish = (completed) => {
        if (token.current !== my) return;
        setSpeaking(null);
        if (completed) onDone?.();
      };
      utterances[0].onstart = () => token.current === my && setSpeaking(key);
      utterances[utterances.length - 1].onend = () => finish(true);
      // 声が使えないなどのエラーでも先へ進める（止めた・割り込まれたときは除く）
      utterances.forEach((u) => (u.onerror = (e) => finish(!["interrupted", "canceled"].includes(e?.error))));
      // Chrome は cancel 直後の speak を取りこぼすことがあるので1拍おく
      setTimeout(() => token.current === my && utterances.forEach((u) => synth.speak(u)), 0);
      return true;
    },
    [supported, voiceA, voiceB, sameVoice, settings.expressive, settings.rate, settings.twoVoices]
  );

  const speak = useCallback((text, role = null) => speakLines([{ text, role }], text), [speakLines]);

  const stop = useCallback(() => {
    token.current++;
    setSpeaking(null);
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speak, speakLines, stop, speaking, voices, voiceA, voiceB, sameVoice };
}

// ---------------------------------------------------------------------------
// 音声入力（Web Speech API の SpeechRecognition）
// ---------------------------------------------------------------------------
const RECOGNITION_ERRORS = {
  "not-allowed": "マイクが許可されていません。この画面ではマイクが使えない可能性があります。入力か4択で答えてください。",
  "service-not-allowed": "この環境では音声認識が使えません。入力か4択で答えてください。",
  "no-speech": "聞き取れませんでした。もう一度マイクを押して話してください。",
  "audio-capture": "マイクが見つかりません。",
  network: "音声認識サービスに接続できませんでした。",
};

function useRecognition() {
  const Ctor = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const rec = useRef(null);

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(
    (onFinal, lang = "ja-JP", onEnd) => {
      if (!Ctor) return;
      setError("");
      setInterim("");
      try {
        const r = new Ctor();
        r.lang = lang;
        r.interimResults = true;
        r.maxAlternatives = 3;
        r.onresult = (e) => {
          const res = e.results[e.results.length - 1];
          const alts = Array.from(res).map((a) => a.transcript);
          setInterim(alts[0] || "");
          if (res.isFinal) onFinal(alts);
        };
        r.onerror = (e) => setError(RECOGNITION_ERRORS[e.error] || `音声認識エラー: ${e.error}`);
        r.onend = () => {
          setListening(false);
          onEnd?.();
        };
        rec.current = r;
        r.start();
        setListening(true);
      } catch {
        setError(RECOGNITION_ERRORS["service-not-allowed"]);
        setListening(false);
        onEnd?.();
      }
    },
    [Ctor]
  );

  useEffect(() => () => rec.current?.abort?.(), []);

  return { supported: !!Ctor, listening, interim, error, start, stop, setInterim };
}

// ---------------------------------------------------------------------------
// 共通パーツ
// ---------------------------------------------------------------------------
function SpeakButton({ text, role = null, speech, size = "md", className = "", label }) {
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
        speech.speak(text, role);
      }}
      className={`${dims} shrink-0 inline-flex items-center justify-center rounded-full transition active:scale-90 disabled:opacity-30 ${
        active ? "bg-indigo-600 text-white shadow-lg" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
      } ${className}`}
    >
      <Volume2 size={icon} className={active ? "animate-pulse" : ""} />
    </button>
  );
}

function Dialogue({ context, translation, speech }) {
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
            key
          );
        }}
        disabled={!speech.supported}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition active:scale-95 disabled:opacity-30 ${
          speech.speaking === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        <Play size={12} /> 会話を通して再生
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
                <p className="flex-1 text-sm text-slate-800 leading-snug">{line.text}</p>
                <SpeakButton text={line.text} role={line.speaker} speech={speech} size="sm" />
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
          <optgroup key={part.title} label={part.title}>
            {part.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {chapterLabel(c)}
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

const voiceLabel = (v) => `${v.name}（${[genderLabel(v), v.lang].filter(Boolean).join("・")}）`;

// ---------------------------------------------------------------------------
// 音声設定
// ---------------------------------------------------------------------------
function SettingsSheet({ open, onClose, settings, setSettings, speech }) {
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
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-slate-900">音声の設定</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {!speech.supported && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">このブラウザは音声読み上げに対応していません。</p>
        )}

        <label htmlFor="voice-select" className="mt-4 block text-xs font-bold text-slate-500">
          声の種類（A役・見出しの読み上げ）
        </label>
        <div className="relative mt-1">
          <select
            id="voice-select"
            value={speech.voiceA?.voiceURI || ""}
            onChange={(e) => update({ voiceURI: e.target.value })}
            className="w-full appearance-none rounded-xl bg-slate-50 py-2.5 pl-3 pr-9 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {speech.voices.length === 0 && <option value="">（利用できる英語の声がありません）</option>}
            {speech.voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {voiceLabel(v)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </div>
        <p className="mt-1 text-xs text-slate-400">「Natural」「Google」「Premium」と付く声は抑揚が自然です（端末により異なります）。</p>

        {settings.twoVoices && (
          <>
            <label htmlFor="voice-b-select" className="mt-4 block text-xs font-bold text-slate-500">
              会話の相手（B役）の声
            </label>
            <div className="relative mt-1">
              <select
                id="voice-b-select"
                value={settings.voiceBURI || ""}
                onChange={(e) => update({ voiceBURI: e.target.value })}
                className="w-full appearance-none rounded-xl bg-slate-50 py-2.5 pl-3 pr-9 text-sm text-slate-800 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">
                  自動{speech.voiceB && !speech.sameVoice && !settings.voiceBURI ? `（${voiceLabel(speech.voiceB)}）` : "（おすすめ）"}
                </option>
                {speech.voices
                  .filter((v) => v !== speech.voiceA)
                  .map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {voiceLabel(v)}
                    </option>
                  ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              自動では A役と性別の違う声を選びます。
              {speech.sameVoice && speech.voices.length > 0 && "この端末では別の声が見つからないため、同じ声を少し高くして区別しています。"}
            </p>
          </>
        )}

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

        <div className="mt-4 space-y-2">
          {[
            ["expressive", "抑揚をつける", "疑問文は語尾を上げ、感嘆文は明るく読み上げます"],
            ["twoVoices", "会話のAとBで声を変える", "B役（会話の相手）を別の声にします"],
          ].map(([key, label, hint]) => (
            <label key={key} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
              <input
                id={`toggle-${key}`}
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => update({ [key]: e.target.checked })}
                className="h-5 w-5 accent-indigo-600"
              />
            </label>
          ))}
        </div>

        <button
          type="button"
          disabled={!speech.supported}
          onClick={() => speech.speakLines(sample, "sample")}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40"
        >
          <Play size={16} /> 試しに聞く
        </button>
      </div>
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
  const face = "absolute inset-0 rounded-3xl bg-white shadow-xl ring-1 ring-slate-900/5 overflow-hidden flex flex-col";
  const hidden = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

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
          <div className={face} style={hidden}>
            <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500" />
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <span className="mb-4 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-600">
                第{CHAPTER_NO[phrase.chapterId]}章
              </span>
              <h2 className="text-4xl font-extrabold leading-tight text-slate-900 break-words">{phrase.english}</h2>
              <SpeakButton text={phrase.english} size="lg" className="mt-8" label="英語を再生" speech={speech} />
            </div>
            <p className="pb-5 text-center text-xs text-slate-400 flex items-center justify-center gap-1">
              <Hand size={14} /> タップで意味と例文を表示
            </p>
          </div>

          <div className={face} style={{ ...hidden, transform: "rotateY(180deg)" }}>
            <div className="h-2 bg-gradient-to-r from-pink-500 via-violet-500 to-indigo-500" />
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex items-center gap-2">
                <h3 className="flex-1 text-xl font-bold text-slate-900">{phrase.english}</h3>
                <SpeakButton text={phrase.english} label="英語を再生" speech={speech} />
              </div>
              <p className="mt-2 text-2xl font-bold text-indigo-600">{phrase.japanese}</p>
              <div className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-400">CONVERSATION</div>
              <Dialogue context={phrase.exampleContext} translation={phrase.exampleJapanese} speech={speech} />
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
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow">
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

function StudyScreen({ active, state, onChapter, onSwipe, onResetChapter, speech, onSettings }) {
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
      pending.current = () => onSwipe(chapter, current.id, dir);
      timer.current = setTimeout(() => {
        pending.current = null;
        onSwipe(chapter, current.id, dir);
        setExit(null);
        setFlipped(false);
        setRound((r) => r + 1);
      }, EXIT_MS);
    },
    [current, exit, onSwipe, chapter]
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
        sub={`全${CHAPTERS.length}章・${TOTAL}フレーズ`}
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
      <p className="mt-1 text-right text-xs text-slate-500 tabular-nums">
        この章で覚えた {learned} / {total}
      </p>

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
              onFlip={() => setFlipped((f) => !f)}
              speech={speech}
            />
          </div>

          <div className="flex items-center justify-center gap-10 py-4">
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

function scopeItems(scope, misses) {
  if (scope === "all") return ALL_ITEMS;
  if (scope === "weak") return ALL_ITEMS.filter((p) => misses[p.id]);
  return CHAPTER_BY_ID[scope]?.items || [];
}

function scopeLabel(scope) {
  if (scope === "all") return "全章から";
  if (scope === "weak") return "苦手な問題";
  return chapterLabel(CHAPTER_BY_ID[scope]);
}

function resultMessage(pct) {
  if (pct === 100) return "パーフェクト！完全にマスターしています。";
  if (pct >= 80) return "すばらしい！ほぼ定着しています。";
  if (pct >= 60) return "いい調子。間違えた問題を復習しよう。";
  if (pct >= 40) return "半分近く正解。カードでもう一周しよう。";
  return "まずは学習カードで慣れていこう。";
}

function TestSetup({ config, setConfig, misses, tests, onStart, onSettings }) {
  const pool = scopeItems(config.scope, misses);
  const weakCount = Object.keys(misses).length;
  const record = tests[testKey(config.scope, config.direction)];
  const jaEn = config.direction === "ja-en";
  const set = (patch) => setConfig({ ...config, ...patch });
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6">
      <ScreenHeader title="テスト" sub="意味・英語を答えて定着度をチェック" onSettings={onSettings} />

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
              ["weak", `苦手な問題（${weakCount}問）`],
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
    setHint(false);
    recognition.setInterim("");
    // 音声だけで出題するときは、問題が出た時点で読み上げる
    if (audioPrompt) speech.speak(item.english);
    if (answerMode === "type") setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const submit = (answer, verdict) => {
    setResults((r) => [...r, { id: item.id, input: answer, verdict, correct: isCorrect(verdict) }]);
    setPhase("feedback");
    recognition.stop();
    // 日本語→英語では、答え合わせのときに正しい英語を聞かせて真似できるようにする
    if (jaEn) speech.speak(item.english);
  };

  const submitText = (text) => submit(text, grade(text).verdict);

  const submitVoice = (alternatives) => {
    // 候補の中で一番よい判定を採用する
    const order = { correct: 3, close: 2, wrong: 1, empty: 0 };
    let best = { text: alternatives[0] || "", verdict: "empty" };
    for (const text of alternatives) {
      const { verdict } = grade(text);
      if (order[verdict] > order[best.verdict]) best = { text, verdict };
    }
    submit(best.text, best.verdict);
  };

  const override = () => {
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
              <SpeakButton text={item.english} size="lg" speech={speech} label="問題を再生" />
              <p className="text-xs text-slate-500">音声を聞いて答えてください（何度でも再生できます）</p>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-3">
              <h2 className="text-3xl font-extrabold text-slate-900 break-words" data-testid="test-question" data-phrase-id={item.id}>
                {item.english}
              </h2>
              <SpeakButton text={item.english} speech={speech} label="問題を再生" />
            </div>
          )}
        </div>

        {phase === "answer" && (
          <div className="mt-4">
            {answerMode === "type" && (
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
                  placeholder={jaEn ? "英語で入力" : "日本語で意味を入力"}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  lang={jaEn ? "en" : "ja"}
                  className="w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-base text-slate-900 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
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

            {answerMode === "voice" && (
              <div className="flex flex-col items-center gap-3">
                {!recognition.supported ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    このブラウザは音声入力に対応していません（Chrome・Edge・Safari で使えます）。
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={recognition.listening ? "聞き取りを止める" : "話して答える"}
                      onClick={() => (recognition.listening ? recognition.stop() : recognition.start(submitVoice, jaEn ? "en-US" : "ja-JP"))}
                      className={`h-20 w-20 rounded-full flex items-center justify-center text-white shadow-lg transition active:scale-90 ${
                        recognition.listening ? "bg-rose-500 animate-pulse" : "bg-indigo-600"
                      }`}
                    >
                      <Mic size={34} />
                    </button>
                    <p className="text-sm text-slate-600 min-h-[1.5rem]">
                      {recognition.listening
                        ? recognition.interim || (jaEn ? "聞き取り中…英語で話してください" : "聞き取り中…日本語で話してください")
                        : jaEn
                          ? "マイクを押して英語で答える"
                          : "マイクを押して日本語で答える"}
                    </p>
                  </>
                )}
                {recognition.error && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{recognition.error}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAnswerMode("type")} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                    入力で答える
                  </button>
                  <button type="button" onClick={() => submit("", "empty")} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                    わからない
                  </button>
                </div>
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
                  <SpeakButton text={item.english} speech={speech} size="sm" />
                </div>
              )}
              <p className="text-xs font-bold text-slate-400">正解</p>
              {jaEn ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-2xl font-bold text-indigo-600" data-testid="answer-english">
                    {item.english}
                  </p>
                  <SpeakButton text={item.english} speech={speech} label="正解の英語を再生" />
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
                <Dialogue context={item.exampleContext} translation={item.exampleJapanese} speech={speech} />
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

function TestResult({ results, scope, direction, speech, onRetryWrong, onRetry, onBack }) {
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
                <SpeakButton text={p.english} speech={speech} size="sm" />
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

function TestScreen({ active, state, settings, setSettings, speech, onFinishTest, onSettings }) {
  const recognition = useRecognition();
  const [session, setSession] = useState(null); // { quiz, pool, runId }
  const [result, setResult] = useState(null);
  const config = settings.test;
  const setConfig = (test) => setSettings((s) => ({ ...s, test }));

  const start = (pool, items = null) => {
    const quiz = items || buildQuiz(pool, config.count, Math.random);
    setResult(null);
    setSession({ quiz, pool, runId: Date.now() });
  };

  if (result) {
    return (
      <TestResult
        results={result}
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
          onFinishTest(testKey(config.scope, config.direction), results);
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
      tests={state.tests}
      onStart={(pool) => start(pool)}
      onSettings={onSettings}
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

  const halt = useCallback(() => {
    run.current++;
    clearTimeout(timer.current);
    speech.stop();
    recognition.stop();
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
      recognition.start(
        (alts) => run.current === my && setChecks((c) => ({ ...c, [i]: wordMatch(alts[0] || "", step.text) })),
        "en-US",
        () => {
          if (run.current !== my) return;
          timer.current = setTimeout(() => advance(i, my), 900);
        }
      );
    } else {
      timer.current = setTimeout(() => advance(i, my), ms);
    }
  };

  function playStep(i) {
    const my = ++run.current;
    clearTimeout(timer.current);
    recognition.stop();
    setLineIdx(i);
    setPhase("model");
    const step = steps[i];
    const ok = speech.speakLines([{ text: step.text, role: step.role }], `shadow:${item.id}:${i}`, () => startTurn(i, my));
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

  const togglePlay = () => {
    if (playing) return pause();
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
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="shrink-0 text-xs font-bold text-slate-500">あなたの番の長さ</span>
        <div className="flex-1">
          <Segmented name="pause" value={opts.pause} onChange={(pause) => setOpts((o) => ({ ...o, pause }))} options={PAUSE_OPTIONS} />
        </div>
      </div>
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
                        step.text
                      )}
                    </p>
                    {opts.showJa && step.ja && <p className="mt-0.5 text-xs text-slate-500">{step.ja}</p>}
                    {check && (
                      <p className="mt-1 text-xs font-bold text-slate-600" data-testid="shadow-score">
                        発音チェック {Math.round(check.ratio * 100)}%
                      </p>
                    )}
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

function ListScreen({ state, onToggle, speech }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(PAGE);

  const base = scope === "all" ? ALL_ITEMS : CHAPTER_BY_ID[scope].items;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((p) => {
      const learned = !!state.learned[p.id];
      if (filter === "learned" && !learned) return false;
      if (filter === "unlearned" && learned) return false;
      if (!q) return true;
      return p.english.toLowerCase().includes(q) || p.japanese.includes(q) || p.exampleContext.toLowerCase().includes(q);
    });
  }, [base, query, filter, state.learned]);

  useEffect(() => setLimit(PAGE), [query, scope, filter]);

  const learnedCount = base.filter((p) => state.learned[p.id]).length;
  const counts = { all: base.length, unlearned: base.length - learnedCount, learned: learnedCount };

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-4 pb-3 bg-slate-50">
        <h1 className="text-2xl font-extrabold text-slate-900">フレーズ一覧</h1>
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
        <ChapterSelect id="list-chapter" value={scope} onChange={setScope} extra={[["all", `すべての章（${TOTAL}）`]]} className="mt-2" />
        <div className="mt-2 flex gap-2">
          {[
            ["all", "すべて"],
            ["unlearned", "未習得"],
            ["learned", "覚えた"],
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
        {filtered.length === 0 && <li className="py-16 text-center text-sm text-slate-400">該当するフレーズがありません</li>}
        {filtered.slice(0, limit).map((p) => {
          const open = openId === p.id;
          const learned = !!state.learned[p.id];
          return (
            <li key={p.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <SpeakButton text={p.english} speech={speech} />
                <button type="button" onClick={() => setOpenId(open ? null : p.id)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
                  <p className="font-bold text-slate-900 truncate">{p.english}</p>
                  <p className="text-sm text-slate-500 truncate">{p.japanese}</p>
                </button>
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
                  <Dialogue context={p.exampleContext} translation={p.exampleJapanese} speech={speech} />
                </div>
              )}
            </li>
          );
        })}
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
  return `${TOTAL}フレーズ コンプリート！素晴らしい！`;
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

function ProgressScreen({ state, onResetAll, onOpenChapter, storageOk, account }) {
  const [confirming, setConfirming] = useState(false);
  const learned = ALL_ITEMS.filter((p) => state.learned[p.id]).length;
  const pct = Math.round((learned / TOTAL) * 100);
  const { today, yesterday } = todayAndYesterday();
  const s = state.stats;
  const streak = currentStreak(s, today, yesterday);
  const todayCount = s.todayDate === today ? s.todayCount : 0;
  const clearedChapters = CHAPTERS.filter((c) => c.items.every((p) => state.learned[p.id])).length;

  useEffect(() => {
    if (!confirming) return undefined;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

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
      <h1 className="text-2xl font-extrabold text-slate-900">学習の進捗</h1>
      {cloud.available && <AccountCard account={account} />}

      <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 flex flex-col items-center">
        <div className="relative">
          <ProgressRing value={learned / TOTAL} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-black text-slate-900 tabular-nums" data-testid="progress-pct">
              {pct}
              <span className="text-xl">%</span>
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {learned} / {TOTAL} 覚えた
            </span>
          </div>
        </div>
        <p className="mt-4 w-full rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 text-center text-sm font-bold text-slate-800">
          {motivation(learned)}
          <span className="mt-1 block text-xs font-medium text-slate-500 tabular-nums">
            クリアした章 {clearedChapters} / {CHAPTERS.length}
          </span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${t.color}`}>{t.icon}</div>
            <p className="mt-3 text-xs text-slate-500">{t.label}</p>
            <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{t.value}</p>
          </div>
        ))}
      </div>

      {PART_GROUPS.map((part) => {
        const partLearned = part.chapters.reduce((n, c) => n + c.items.filter((p) => state.learned[p.id]).length, 0);
        const partTotal = part.chapters.reduce((n, c) => n + c.items.length, 0);
        return (
      <div key={part.title} className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="flex items-baseline justify-between text-sm font-bold text-slate-800">
          {part.title}（第{part.from}〜{part.to}章）
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            {partLearned} / {partTotal}
          </span>
        </p>
        <ul className="mt-2 divide-y divide-slate-100">
          {part.chapters.map((c) => {
            const n = c.items.filter((p) => state.learned[p.id]).length;
            const best = state.tests[c.id]?.best;
            const bestJaEn = state.tests[testKey(c.id, "ja-en")]?.best;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenChapter(c.id)} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <span className="w-8 shrink-0 text-xs font-bold text-slate-400 tabular-nums">{CHAPTER_NO[c.id]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{c.title}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${(n / c.items.length) * 100}%` }} />
                    </span>
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {n}/{c.items.length}
                    {best != null && <span className="block text-indigo-500">意味 {best}%</span>}
                    {bestJaEn != null && <span className="block text-pink-500">英語 {bestJaEn}%</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
        );
      })}

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
        {confirming ? "もう一度タップで全ての進捗をリセット" : "進捗をリセット"}
      </button>
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageOk] = useState(() => storage.available());
  const speech = useSpeech(settings);

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

  const onSwipe = useCallback((chapter, id, dir) => {
    const { today, yesterday } = todayAndYesterday();
    update((s) => applySwipe(s, chapter, id, dir, today, yesterday));
  }, [update]);
  const onToggle = useCallback((chapter, id) => update((s) => toggleLearned(s, chapter, id)), [update]);
  const onChapter = useCallback((chapter) => update((s) => ({ ...s, chapter })), [update]);
  const onResetChapter = useCallback((chapter) => update((s) => resetChapter(s, chapter)), [update]);
  const onResetAll = useCallback(() => {
    update((s) => ({ ...freshState(CHAPTERS[0].id), stats: s.stats }));
    setTab("study");
  }, [update]);
  const onShadowDone = useCallback(() => {
    const { today, yesterday } = todayAndYesterday();
    update((s) => ({ ...s, stats: recordActivity(s.stats, today, yesterday, { shadows: 1 }) }));
  }, [update]);
  const onFinishTest = useCallback((scope, results) => {
    const { today, yesterday } = todayAndYesterday();
    update((s) => applyTestResult(s, LIBRARY, scope, results, today, yesterday));
  }, [update]);

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

  const openSettings = () => setSettingsOpen(true);
  const navItems = [
    { key: "study", label: "学習", icon: Layers },
    { key: "test", label: "テスト", icon: PenLine },
    { key: "shadow", label: "シャドー", icon: Repeat },
    { key: "list", label: "一覧", icon: List },
    { key: "progress", label: "進捗", icon: Trophy },
  ];

  return (
    <div className="w-full bg-slate-100" style={{ height: "100dvh" }}>
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col bg-slate-50 shadow-xl">
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
              onSettings={openSettings}
            />
          </div>
          {tab === "shadow" && (
            <ShadowScreen state={state} settings={settings} speech={speech} onShadowDone={onShadowDone} onSettings={openSettings} />
          )}
          {tab === "list" && <ListScreen state={state} onToggle={onToggle} speech={speech} />}
          {tab === "progress" && (
            <ProgressScreen
              state={state}
              onResetAll={onResetAll}
              onOpenChapter={(id) => {
                onChapter(id);
                setTab("study");
              }}
              storageOk={storageOk}
              account={account}
            />
          )}
        </main>

        <nav className="border-t border-slate-200 bg-white/90 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="grid grid-cols-5">
            {navItems.map(({ key, label, icon: Icon }) => {
              const current = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={current ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold transition ${
                    current ? "text-indigo-600" : "text-slate-400"
                  }`}
                >
                  <Icon size={22} strokeWidth={current ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} setSettings={setSettings} speech={speech} />
      </div>
    </div>
  );
}

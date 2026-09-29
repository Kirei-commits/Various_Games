/*
 * 合いの手（英語の声での応援）。「すごい！」「おめでとう！」を英語の声で流す。
 * - 声は audio/cheers/*.opus、一覧は audio/cheers.json（tools/media/tts.py cheers で作る。元の文は tools/media/cheers.json）
 * - 効果音（SoundEngine.play の名前: correct・streak・levelup・ssr など）に合わせて、その場面の声からランダムに1つ流す
 * - 読み上げ・録音の再生中や、ほかの合いの手の途中には流さない。同じ文が続かないようにする
 * - 一覧が無い・読めないときは何もしない（効果音だけ）
 * - ボタンを押してすぐ鳴るように、合いの手がオンなら声を全部先に読み込んでおく（182本・約0.7MB）。
 *   Web Audio で使える形（AudioBuffer）にできたものは効果音と同じようにすぐ鳴らし、できないものは読み込み済みのデータを <audio> で鳴らす
 */
import { AUDIO_DIR, isRecordedPlaying } from "./recorded.js";

/**
 * 流す合いの手を選ぶ（純粋関数。テスト用に乱数を受け取る）。
 * events: cheers.json の events、name: 効果音の名前、n: 連続正解の数（streak のときだけ）、last: 前に流した文
 * 戻り値: 選んだ { text, voice, file } か null
 */
export function pickCheer(events, name, { n = 0, last = null, rand = Math.random } = {}) {
  const ev = events?.[name];
  if (!ev || !ev.clips?.length) return null;
  if (name === "streak" && (n < 5 || n % 5 !== 0)) return null; // 連続正解は5回ごと
  if (rand() >= (ev.chance ?? 1)) return null;
  const pool = ev.clips.length > 1 ? ev.clips.filter((c) => c.text !== last) : ev.clips;
  return pool[Math.floor(rand() * pool.length)] || null;
}

let events = null;
let loading = null;
let player = null;
let last = null;
let busyUntil = 0;
let voiceUntil = 0; // 英語の読み上げ（単語・会話）を始めた直後は合いの手を流さない
let current = null; // 鳴っている合いの手（止めるため）

/**
 * 英語の読み上げを始めるときに呼ぶ。鳴っている合いの手を止め、しばらく新しい合いの手を流さない
 * （読み上げが優先。声が2つ重ならないように）
 */
export function noteSpeech(ms = 1500) {
  voiceUntil = performance.now() + ms;
  try {
    current?.stop?.();
    current?.pause?.();
  } catch {
    /* もう止まっている */
  }
  current = null;
  busyUntil = 0;
}
const raw = new Map(); // file → ArrayBuffer（先に読み込んだ声）
const urls = new Map(); // file → blob の URL（<audio> 用）
const buffers = new Map(); // file → AudioBuffer（Web Audio 用）
let prefetching = null;
let decodedWith = null;

const allFiles = () => [...new Set(Object.values(events || {}).flatMap((ev) => (ev.clips || []).map((c) => c.file)))];

/** 声を全部先に読み込む（何度呼んでもよい。6本ずつ並べて取る） */
export function prefetchCheers() {
  if (prefetching || !events || typeof fetch !== "function") return prefetching;
  const files = allFiles();
  let i = 0;
  const worker = async () => {
    while (i < files.length) {
      const file = files[i++];
      try {
        const res = await fetch(`${AUDIO_DIR}${file}`);
        if (!res.ok) continue;
        const data = await res.arrayBuffer();
        raw.set(file, data);
        if (typeof URL !== "undefined" && URL.createObjectURL) urls.set(file, URL.createObjectURL(new Blob([data], { type: "audio/ogg" })));
      } catch {
        /* 読めない声は、鳴らすときに取りに行く */
      }
    }
  };
  prefetching = Promise.all(Array.from({ length: 6 }, worker));
  return prefetching;
}

/** 読み込んだ声を Web Audio で使える形にする（効果音の AudioContext ができてから。1回だけ） */
function decodeAll(ctx) {
  if (!ctx || decodedWith === ctx) return;
  decodedWith = ctx;
  (prefetching || Promise.resolve()).then(() => {
    for (const [file, data] of raw) {
      if (buffers.has(file)) continue;
      try {
        ctx.decodeAudioData(data.slice(0)).then((b) => buffers.set(file, b), () => {});
      } catch {
        /* この形式を Web Audio で読めない端末（<audio> で鳴らす） */
      }
    }
  });
}

/** audio/cheers.json を1回だけ読む（失敗しても例外は出さない） */
export function loadCheers() {
  if (loading) return loading;
  if (typeof window === "undefined" || window.__swipetalkNoRecorded || typeof fetch !== "function") {
    loading = Promise.resolve(null);
    return loading;
  }
  loading = fetch(`${AUDIO_DIR}cheers.json`, { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (events = data && typeof data.events === "object" ? data.events : null))
    .then((ev) => {
      if (ev && wantPrefetch) prefetchCheers();
      return ev;
    })
    .catch(() => null);
  return loading;
}

let wantPrefetch = true;
/** 合いの手のオン・オフ（オフのあいだは先読みしない） */
export function setCheersWanted(on) {
  wantPrefetch = on;
  if (on) prefetchCheers();
}

/** 合いの手が使えるか（設定に出すかどうか） */
export function cheersAvailable() {
  return !!events;
}

/**
 * 効果音 name に合わせて合いの手を流す（volume は効果音の音量）。
 * ctx があれば（効果音の AudioContext）、読み込み済みの声をすぐ鳴らす
 */
export function cheer(name, n = 0, volume = 0.8, ctx = null) {
  if (!events) return;
  decodeAll(ctx);
  const speaking = isRecordedPlaying() || (typeof window !== "undefined" && window.speechSynthesis?.speaking);
  if (speaking || performance.now() < busyUntil || performance.now() < voiceUntil) return;
  const pick = pickCheer(events, name, { n, last });
  if (!pick) return;
  last = pick.text;
  if (typeof window !== "undefined") (window.__cheersPlayed ||= []).push(pick.text); // E2E 用
  const vol = Math.min(1, Math.max(0, volume));
  const buf = buffers.get(pick.file);
  if (ctx && ctx.state === "running" && buf) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    current = src;
    busyUntil = performance.now() + buf.duration * 1000;
    return;
  }
  if (typeof Audio === "undefined") return;
  busyUntil = performance.now() + 1500; // 鳴らし始めてすぐは次を重ねない（再生が終われば早めに解除）
  if (!player) player = new Audio();
  player.src = urls.get(pick.file) || `${AUDIO_DIR}${pick.file}`;
  player.volume = vol;
  player.onended = () => (busyUntil = 0);
  current = player;
  player.play().catch(() => (busyUntil = 0));
}

/*
 * 合いの手（英語の声での応援）。「すごい！」「おめでとう！」を英語の声で流す。
 * - 声は audio/cheers/*.opus、一覧は audio/cheers.json（tools/media/tts.py cheers で作る。元の文は tools/media/cheers.json）
 * - 効果音（SoundEngine.play の名前: correct・streak・levelup・ssr など）に合わせて、その場面の声からランダムに1つ流す
 * - 読み上げ・録音の再生中や、ほかの合いの手の途中には流さない。同じ文が続かないようにする
 * - 一覧が無い・読めないときは何もしない（効果音だけ）
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
    .catch(() => null);
  return loading;
}

/** 合いの手が使えるか（設定に出すかどうか） */
export function cheersAvailable() {
  return !!events;
}

/** 効果音 name に合わせて合いの手を流す（volume は効果音の音量） */
export function cheer(name, n = 0, volume = 0.8) {
  if (!events || typeof Audio === "undefined") return;
  const speaking = isRecordedPlaying() || (typeof window !== "undefined" && window.speechSynthesis?.speaking);
  if (speaking || performance.now() < busyUntil) return;
  const pick = pickCheer(events, name, { n, last });
  if (!pick) return;
  last = pick.text;
  busyUntil = performance.now() + 1500; // 鳴らし始めてすぐは次を重ねない（再生が終われば早めに解除）
  if (!player) player = new Audio();
  player.src = `${AUDIO_DIR}${pick.file}`;
  player.volume = Math.min(1, Math.max(0, volume));
  player.onended = () => (busyUntil = 0);
  player.play().catch(() => (busyUntil = 0));
}

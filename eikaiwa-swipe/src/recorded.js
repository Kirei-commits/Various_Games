/*
 * 用意した音声ファイル（Gemini TTS で作った録音）を再生する。
 * - 録音は audio/clips/<hash>.opus。hash は「役|英文」から clipHash で決める（tools/media/tts.py も同じ関数を使う）
 * - どの録音があるかは audio/index.json（{ clips: { hash: 版 } }）で知る。無い・読めないときは録音を使わない
 * - 録音が無い文は、呼び出し側がブラウザの読み上げ（speechSynthesis）に戻す
 */

export const AUDIO_DIR = "audio/";

/** 録音の役: 見出しのフレーズは P、会話は A / B（それ以外の話者は A と同じ声で読む） */
export function clipRole(role) {
  if (!role) return "P";
  return role === "B" ? "B" : "A";
}

export function clipKey(role, text) {
  return `${clipRole(role)}|${String(text).trim()}`;
}

/** 53bit の文字列ハッシュ（cyrb53）を 14 桁の16進数にする。Node とブラウザで同じ値になる */
export function clipHash(key) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** index（{ hash: 版 }）から、その文の録音の URL を返す。無ければ null */
export function clipUrl(index, role, text) {
  if (!index) return null;
  const hash = clipHash(clipKey(role, text));
  const rev = index[hash];
  return rev ? `${AUDIO_DIR}clips/${hash}.opus?v=${rev}` : null;
}

// ---------------------------------------------------------------------------
// ここから下はブラウザ専用（再生）
// ---------------------------------------------------------------------------

let index = null;
let loading = null;

/** audio/index.json を1回だけ読む。失敗しても例外は出さない（録音なしで動く） */
export function loadRecordedIndex() {
  if (loading) return loading;
  if (typeof window === "undefined" || window.__swipetalkNoRecorded || typeof fetch !== "function") {
    loading = Promise.resolve(null);
    return loading;
  }
  loading = fetch(`${AUDIO_DIR}index.json`, { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => (index = data && typeof data.clips === "object" ? data.clips : null))
    .catch(() => null);
  return loading;
}

/** lines（[{ text, role }]）の録音がすべてあれば URL の配列、1つでも欠けていれば null（声が混ざらないようにする） */
export function recordedUrls(lines) {
  if (!index) return null;
  const urls = lines.map((l) => clipUrl(index, l.role, l.text));
  return urls.every(Boolean) ? urls : null;
}

let player = null;
let playing = false;
let session = 0;

/** 使える録音の数（index を読む前は 0） */
export function recordedCount() {
  return index ? Object.keys(index).length : 0;
}

/** 学習 BGM を小さくするかどうかの判定に使う */
export function isRecordedPlaying() {
  return playing;
}

export function stopRecorded() {
  session++;
  playing = false;
  if (player) player.pause();
}

/**
 * urls を順番に再生する。rate は再生の速さ（音の高さは変えない）。
 * 戻り値: "done"（最後まで再生した）/ "stopped"（止めた・割り込まれた）/ "failed"（再生できなかった。呼び出し側は読み上げに戻す）
 */
export async function playRecorded(urls, { rate = 1, onStart } = {}) {
  stopRecorded();
  const my = session;
  if (!player) player = new Audio();
  player.preservesPitch = true;
  for (let i = 0; i < urls.length; i++) {
    player.src = urls[i];
    player.playbackRate = Math.min(2, Math.max(0.5, rate));
    const ended = new Promise((resolve) => {
      player.onended = () => resolve("ended");
      player.onerror = () => resolve("error");
      player.onpause = () => my !== session && resolve("stopped");
    });
    try {
      await player.play();
    } catch {
      // 自動再生の制限・形式に非対応など。最初の1本で失敗したら読み上げに戻せるよう failed を返す
      if (my === session) playing = false;
      return my === session ? (i === 0 ? "failed" : "stopped") : "stopped";
    }
    if (my !== session) return "stopped";
    playing = true;
    if (i === 0) onStart?.();
    const r = await ended;
    if (my !== session) return "stopped";
    if (r === "error") {
      playing = false;
      return i === 0 ? "failed" : "stopped";
    }
  }
  playing = false;
  return "done";
}

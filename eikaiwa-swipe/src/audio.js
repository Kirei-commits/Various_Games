/*
 * 効果音（Web Audio API でその場で合成する。音声ファイルは使わない）。
 *
 * 電子音っぽさを避けるため、
 * - 音程のある音は、木琴・マリンバのような「叩いてすぐ減衰する」音にする
 *   （基音の正弦波に、4倍音を短く重ねると木の板を叩いた響きに近づく）
 * - スワイプやカードをめくる音は、ノイズを帯域フィルタに通した「さっ」という音にする
 *
 * ブラウザは利用者が画面に触れるまで音を出させないので、最初のタップで unlock() する。
 *
 * BGM は2種類。どちらも効果音とは別の音量で、少し先の音符を予約しながらループさせる。
 * - バトル: 冒険っぽいループ（ボス戦は速く）。setBattleMusic("battle" | "boss" | null)
 * - 学習中: 勉強の邪魔にならない、ゆったりしたローファイ風のループ。setStudyMusic(true | false)
 *   読み上げ中は小さくする（英語が聞きとりやすいように）。
 * バトルの曲が優先。どちらも流さないときは止める。
 */
import { isRecordedPlaying } from "./recorded.js";
import { cheer } from "./cheers.js";

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI ノート番号 → 周波数

/**
 * iPhone（Safari）では、消音スイッチ（マナーモード）が入っていると Web Audio の音（BGM・効果音）が鳴らない。
 * 録音（<audio> 要素）は鳴るので、「音が出る声はあるのに BGM だけ聞こえない」になる。
 * 音の種類を「再生（playback）」にして、消音スイッチがあっても鳴るようにする（動画アプリや音楽アプリと同じ扱い）。
 * - Safari 17 以降: navigator.audioSession.type = "playback"
 * - それより古い iOS: 無音の <audio> をループで流しておくと、同じ扱いになる
 */
let silentKeeper = null;
let micActive = false;
function playThroughSilentSwitch() {
  if (typeof navigator === "undefined") return;
  try {
    if (navigator.audioSession) {
      if (micActive) return; // マイクを使っているあいだはそのまま
      if (navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback";
      return;
    }
  } catch {
    /* 設定できない端末 */
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios || typeof Audio === "undefined") return;
  if (!silentKeeper) {
    silentKeeper = new Audio(silentWav());
    silentKeeper.loop = true;
    silentKeeper.setAttribute("x-webkit-airplay", "deny");
  }
  if (silentKeeper.paused) silentKeeper.play().catch(() => {});
}

/**
 * マイクを使うあいだ（音声で答える・シャドーイング）は「録音と再生（play-and-record）」にし、終わったら「再生」に戻す。
 * 「再生」のままだとマイクが使えないことがあるため（navigator.audioSession がある Safari だけ）
 */
export function setMicActive(on) {
  micActive = on;
  try {
    if (typeof navigator !== "undefined" && navigator.audioSession) navigator.audioSession.type = on ? "play-and-record" : "playback";
  } catch {
    /* 設定できない端末 */
  }
}

/** 0.5秒の無音の WAV（data URL） */
function silentWav() {
  const rate = 8000;
  const n = rate / 2;
  const buf = new DataView(new ArrayBuffer(44 + n));
  const str = (o, t) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  buf.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); // PCM
  buf.setUint16(22, 1, true); // モノラル
  buf.setUint32(24, rate, true);
  buf.setUint32(28, rate, true);
  buf.setUint16(32, 1, true);
  buf.setUint16(34, 8, true); // 8bit（無音は 128）
  str(36, "data");
  buf.setUint32(40, n, true);
  for (let i = 0; i < n; i++) buf.setUint8(44 + i, 128);
  let bin = "";
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf.getUint8(i));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.volume = 0.6;
    this.bgmOn = true;
    this.bgmVolume = 0.35;
    this.studyOn = true;
    this.studyVolume = 0.25;
    this.want = { battle: null, study: false }; // いま流したい曲
    this.bgm = null; // 再生中の BGM { kind, timer, step, next }
  }

  get available() {
    return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
  }

  /** 最初のタップで呼ぶ。以後、効果音が鳴らせる */
  unlock() {
    if (!this.available) return;
    playThroughSilentSwitch();
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume;
      // 耳に痛い高音を少し丸める
      const soften = this.ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 6000;
      this.out.connect(soften);
      this.music = this.ctx.createGain();
      this.music.gain.value = this.bgmVolume;
      this.music.connect(soften);
      soften.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    this.refresh();
  }

  set(on, volume = this.volume) {
    this.on = on;
    this.volume = volume;
    if (this.out) this.out.gain.value = volume;
  }

  /** 合いの手（英語の声での応援。src/cheers.js）を流すか */
  setCheers(on) {
    this.cheers = on;
  }

  /** バトルの BGM の設定 */
  setBgm(on, volume = this.bgmVolume) {
    this.bgmOn = on;
    this.bgmVolume = volume;
    this.refresh(true);
  }

  /** 学習中の BGM の設定 */
  setStudyBgm(on, volume = this.studyVolume) {
    this.studyOn = on;
    this.studyVolume = volume;
    this.refresh(true);
  }

  /** バトルの曲を流す（"battle" | "boss"）／やめる（null） */
  setBattleMusic(kind) {
    this.want.battle = kind;
    this.refresh();
  }

  /** 学習中の曲を流す／やめる */
  setStudyMusic(on) {
    this.want.study = on;
    this.refresh();
  }

  /** いま流すべき曲に切りかえる */
  refresh(volumeChanged = false) {
    const kind = this.want.battle && this.bgmOn ? this.want.battle : this.want.study && this.studyOn ? "study" : null;
    if (!kind) return this.stopBgm();
    if (volumeChanged && this.music && this.bgm) this.music.gain.value = this.volumeOf(kind);
    this.startBgm(kind);
  }

  volumeOf(kind) {
    return kind === "study" ? this.studyVolume : this.bgmVolume;
  }

  /** ノイズ（打楽器・爆発に使う）。毎回作らず使い回す */
  noiseBuffer() {
    if (!this.noise) {
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  /** ノイズをフィルタに通した短い音 */
  hiss(t, { type = "highpass", freq = 6000, to = freq, dur = 0.05, gain = 0.1, dest = this.out } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(env);
    env.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** 音程の変わる音（発振器1つ） */
  tone(t, { type = "sine", from, to = from, dur = 0.2, gain = 0.2, attack = 0.005, dest = this.out, filter = 0 }) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filter;
      osc.connect(lp);
      node = lp;
    }
    node.connect(env);
    env.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // -------------------------------------------------------------------------
  // バトルの BGM（ラ短調の冒険っぽいループ。ボス戦はテンポを上げてドラムを増やす）
  // -------------------------------------------------------------------------

  /** BGM を始める（kind: "battle" | "boss" | "study"）。同じ曲が流れていれば何もしない */
  startBgm(kind = "battle") {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    if (this.bgm?.kind === kind) return;
    this.stopBgm();
    const study = kind === "study";
    const bars = study ? STUDY_BARS : BARS;
    const bgm = { kind, step: 0, next: this.ctx.currentTime + 0.08, tempo: kind === "boss" ? 156 : study ? 74 : 132 };
    const volume = this.volumeOf(kind);
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setValueAtTime(volume, this.ctx.currentTime);
    const schedule = () => {
      // 学習中の曲は、読み上げのあいだ小さくする
      if (study) {
        const speaking = isRecordedPlaying() || (typeof window !== "undefined" && window.speechSynthesis?.speaking);
        this.music.gain.setTargetAtTime(this.volumeOf(kind) * (speaking ? 0.3 : 1), this.ctx.currentTime, 0.15);
      }
      // 0.2 秒先までの音符を予約する（タイマーが多少遅れても音が途切れない）
      while (bgm.next < this.ctx.currentTime + 0.2) {
        if (study) this.studyStep(bgm, bgm.step, bgm.next);
        else this.bgmStep(bgm, bgm.step, bgm.next);
        bgm.next += 60 / bgm.tempo / 4; // 16分音符
        bgm.step = (bgm.step + 1) % (bars.length * 16);
      }
    };
    schedule();
    bgm.timer = setInterval(schedule, 50);
    this.bgm = bgm;
  }

  stopBgm() {
    if (!this.bgm) return;
    clearInterval(this.bgm.timer);
    this.bgm = null;
  }

  /** 学習中の曲: エレピ風の和音・やわらかいベース・ブラシのような小さな打楽器・ときどき短いメロディ */
  studyStep(bgm, step, t) {
    const dest = this.music;
    const bar = STUDY_BARS[Math.floor(step / 16)];
    const s = step % 16;
    const beat = 60 / bgm.tempo;
    if (s === 0 || s === 10) {
      // エレピ風: 正弦波に少しだけ倍音を足し、ゆっくり消える（少しずらして弾く）
      bar.chord.forEach((n, i) => {
        const at = t + i * 0.018;
        this.tone(at, { from: NOTE(n), dur: beat * (s === 0 ? 2.4 : 1.4), gain: 0.045, attack: 0.02, dest });
        this.tone(at, { type: "triangle", from: NOTE(n + 12), dur: beat * 0.8, gain: 0.008, attack: 0.01, dest });
      });
    }
    if (s === 0 || s === 7 || s === 10) this.tone(t, { from: NOTE(bar.chord[0] - 12), dur: beat * 1.2, gain: 0.16, attack: 0.02, dest });
    if (s === 0 || s === 10) this.tone(t, { from: 90, to: 45, dur: 0.22, gain: 0.12, dest });
    if (s === 4 || s === 12) this.hiss(t, { type: "bandpass", freq: 2200, dur: 0.14, gain: 0.03, dest });
    if (s % 2 === 0) this.hiss(t, { freq: 7000, dur: 0.03, gain: s % 4 === 2 ? 0.012 : 0.006, dest });
    const n = bar.melody[s];
    if (n) {
      this.tone(t, { from: NOTE(n), dur: beat * 1.6, gain: 0.035, attack: 0.01, dest });
      this.tone(t, { from: NOTE(n) * 4, dur: beat * 0.2, gain: 0.004, dest });
    }
  }

  bgmStep(bgm, step, t) {
    const dest = this.music;
    const bar = BARS[Math.floor(step / 16)];
    const s = step % 16;
    const boss = bgm.kind === "boss";
    const eighth = 60 / bgm.tempo / 2;
    // ドラム
    if (s === 0 || s === 8 || (boss && (s === 6 || s === 14))) this.tone(t, { from: 150, to: 42, dur: 0.18, gain: 0.5, dest });
    if (s === 4 || s === 12) this.hiss(t, { type: "bandpass", freq: 1800, dur: 0.12, gain: 0.22, dest });
    if (s % 2 === 1 || (boss && s % 4 === 2)) this.hiss(t, { freq: 8000, dur: 0.03, gain: s % 4 === 3 ? 0.07 : 0.045, dest });
    // ベース（8分音符）
    if (s % 2 === 0) {
      const n = bar.bass + BASS_PATTERN[s / 2];
      this.tone(t, { type: "triangle", from: NOTE(n), dur: eighth * 0.9, gain: 0.32, dest });
    }
    // 和音（小節の頭と真ん中で、やわらかく）
    if (s === 0 || s === 8) {
      for (const n of bar.chord) this.tone(t, { type: "sawtooth", from: NOTE(n), dur: eighth * 3.5, gain: 0.025, attack: 0.03, dest, filter: 1400 });
    }
    // メロディ（8分音符）
    if (s % 2 === 0) {
      const n = bar.melody[s / 2];
      if (n) {
        this.tone(t, { type: "square", from: NOTE(n), dur: eighth * 1.6, gain: 0.05, dest, filter: 2600 });
        this.tone(t, { type: "triangle", from: NOTE(n + 12), dur: eighth * 0.8, gain: 0.03, dest });
      }
    }
  }

  /** 木琴のような1音 */
  mallet(midi, { at = 0, gain = 0.35, decay = 0.45 } = {}) {
    const t = this.ctx.currentTime + at;
    const f = NOTE(midi);
    for (const [ratio, g, d] of [
      [1, gain, decay],
      [4, gain * 0.18, decay * 0.25], // 叩いた瞬間の硬い響き
      [2.01, gain * 0.08, decay * 0.5],
    ]) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f * ratio;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(g, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(env);
      env.connect(this.out);
      osc.start(t);
      osc.stop(t + d + 0.05);
    }
  }

  /** 「さっ」という短い空気の音（ノイズを帯域フィルタに通す） */
  whoosh({ at = 0, from = 1800, to = 700, dur = 0.16, gain = 0.25 } = {}) {
    const t = this.ctx.currentTime + at;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const band = this.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band);
    band.connect(env);
    env.connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name, n = 0) {
    // 合いの手は効果音と別の設定（効果音をオフにしていても流せる）。音量は効果音に合わせる
    if (this.cheers) cheer(name, n, this.volume);
    if (!this.on || !this.ctx || this.ctx.state !== "running") return;
    switch (name) {
      case "streak": { // ドーパミンモード: 連続正解ほど音が上がっていく（ペンタトニック）
        const scale = [0, 2, 4, 7, 9];
        const k = Math.min(n, 24);
        const midi = 72 + Math.floor(k / 5) * 12 + scale[k % 5];
        this.mallet(midi, { gain: 0.26, decay: 0.35 });
        this.mallet(midi + 7, { at: 0.05, gain: 0.18, decay: 0.3 });
        if (n > 0 && n % 5 === 0) [0, 4, 7, 12].forEach((d, i) => this.mallet(midi + d, { at: 0.1 + i * 0.05, gain: 0.2, decay: 0.8 }));
        break;
      }
      case "learned": // 覚えた: さっ（右へ）＋ 明るい2音
        this.whoosh({ from: 1200, to: 2400 });
        this.mallet(79, { at: 0.05, gain: 0.28 });
        this.mallet(84, { at: 0.13, gain: 0.3 });
        break;
      case "again": // まだ: さっ（左へ）＋ 低めの1音
        this.whoosh({ from: 1600, to: 600 });
        this.mallet(67, { at: 0.06, gain: 0.22, decay: 0.35 });
        break;
      case "flip":
        this.whoosh({ from: 3000, to: 1500, dur: 0.09, gain: 0.15 });
        break;
      case "tap":
        this.mallet(91, { gain: 0.08, decay: 0.12 });
        break;
      case "correct": // 正解: 軽やかな上がる3音
        this.mallet(72, { gain: 0.28 });
        this.mallet(76, { at: 0.09, gain: 0.28 });
        this.mallet(79, { at: 0.18, gain: 0.32, decay: 0.7 });
        break;
      case "wrong": // 不正解: やわらかく下がる2音（責めない音）
        this.mallet(64, { gain: 0.22, decay: 0.35 });
        this.mallet(60, { at: 0.14, gain: 0.22, decay: 0.5 });
        break;
      case "complete": // テスト完了・章クリア
        [72, 76, 79, 84].forEach((n, i) => this.mallet(n, { at: i * 0.11, gain: 0.26 }));
        this.mallet(88, { at: 0.48, gain: 0.3, decay: 1.2 });
        break;
      case "bonus": // ログインボーナス
        [79, 84, 88, 91].forEach((n, i) => this.mallet(n, { at: i * 0.08, gain: 0.24, decay: 0.8 }));
        break;
      case "slash": { // バトル: 攻撃（魔法の弾が飛んで当たる）
        const t = this.ctx.currentTime;
        this.tone(t, { type: "triangle", from: 900, to: 2200, dur: 0.12, gain: 0.12 });
        this.whoosh({ from: 4000, to: 900, dur: 0.14, gain: 0.3 });
        this.mallet(84, { at: 0.1, gain: 0.18, decay: 0.2 });
        break;
      }
      case "explode": { // バトル: 敵を倒した
        const t = this.ctx.currentTime + 0.08;
        this.hiss(t, { type: "lowpass", freq: 2400, to: 120, dur: 0.4, gain: 0.45 });
        this.tone(t, { from: 180, to: 40, dur: 0.3, gain: 0.35 });
        this.mallet(88, { at: 0.16, gain: 0.14, decay: 0.3 });
        break;
      }
      case "hurt": { // バトル: ダメージを受けた
        const t = this.ctx.currentTime;
        this.tone(t, { type: "square", from: 260, to: 70, dur: 0.28, gain: 0.14, filter: 1500 });
        this.hiss(t, { type: "lowpass", freq: 900, to: 200, dur: 0.25, gain: 0.3 });
        break;
      }
      case "levelup": // バトル: レベルアップ
        [72, 79, 84, 91].forEach((n, i) => this.mallet(n, { at: i * 0.06, gain: 0.2, decay: 0.5 }));
        break;
      case "charge": { // ガチャ: 光がたまっていく（約1.2秒）
        const t = this.ctx.currentTime;
        this.tone(t, { type: "triangle", from: 220, to: 880, dur: 1.2, gain: 0.12, attack: 0.6 });
        this.tone(t, { from: 330, to: 1320, dur: 1.2, gain: 0.06, attack: 0.8 });
        this.hiss(t, { type: "bandpass", freq: 400, to: 5000, dur: 1.2, gain: 0.12 });
        break;
      }
      case "burst": // ガチャ: はじける
        this.whoosh({ from: 800, to: 5000, dur: 0.35, gain: 0.3 });
        [72, 79, 84].forEach((n) => this.mallet(n, { at: 0.02, gain: 0.18, decay: 0.9 }));
        break;
      case "rare": // ガチャ: SR 以上のカードがめくれた
        [84, 88, 91].forEach((n, i) => this.mallet(n, { at: i * 0.05, gain: 0.2, decay: 0.7 }));
        break;
      case "ssr": // ガチャ: SSR！
        [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => this.mallet(n, { at: i * 0.07, gain: 0.22, decay: 1 }));
        this.mallet(100, { at: 0.55, gain: 0.2, decay: 1.6 });
        this.hiss(this.ctx.currentTime + 0.5, { freq: 7000, dur: 1.2, gain: 0.06 });
        break;
      default:
    }
  }
}

/** BGM の小節（Am → F → G → E を2周。2周目はメロディを変える） */
const BARS = [
  { bass: 45, chord: [57, 60, 64], melody: [69, 0, 72, 76, 74, 72, 71, 72] },
  { bass: 41, chord: [57, 60, 65], melody: [65, 69, 72, 77, 76, 72, 69, 72] },
  { bass: 43, chord: [55, 59, 62], melody: [71, 0, 74, 79, 77, 74, 71, 74] },
  { bass: 40, chord: [56, 59, 64], melody: [76, 0, 75, 76, 80, 0, 76, 71] },
  { bass: 45, chord: [57, 60, 64], melody: [81, 0, 79, 76, 77, 76, 74, 72] },
  { bass: 41, chord: [57, 60, 65], melody: [72, 74, 76, 77, 76, 74, 72, 69] },
  { bass: 43, chord: [55, 59, 62], melody: [71, 72, 74, 76, 74, 72, 71, 67] },
  { bass: 40, chord: [56, 59, 64], melody: [68, 71, 76, 80, 76, 0, 0, 0] },
];
const BASS_PATTERN = [0, 0, 12, 0, 0, 12, 0, 7];

/** 学習中の曲の小節（Fmaj7 → Em7 → Dm7 → Cmaj7、後半は B♭maj7 → Am7 → Gm7 → C7）。melody は16分音符の位置 → 音 */
const STUDY_BARS = [
  { chord: [53, 57, 60, 64], melody: { 2: 72, 6: 69 } },
  { chord: [52, 55, 59, 62], melody: { 4: 71 } },
  { chord: [50, 53, 57, 60], melody: { 2: 69, 8: 72, 12: 74 } },
  { chord: [48, 52, 55, 59], melody: { 6: 67 } },
  { chord: [46, 50, 53, 57], melody: { 2: 74, 6: 72 } },
  { chord: [45, 48, 52, 55], melody: { 4: 72, 10: 69 } },
  { chord: [43, 46, 50, 53], melody: { 2: 70, 8: 69 } },
  { chord: [48, 52, 55, 58], melody: { 0: 67, 12: 72 } },
];

/** 何もしない代わり（テストやサーバー描画で使う） */
export const silentSound = {
  play() {},
  unlock() {},
  set() {},
  setCheers() {},
  setBgm() {},
  setStudyBgm() {},
  setBattleMusic() {},
  setStudyMusic() {},
  startBgm() {},
  stopBgm() {},
};

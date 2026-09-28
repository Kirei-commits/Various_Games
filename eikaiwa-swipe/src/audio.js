/*
 * 効果音と BGM（Web Audio API でその場で合成する。音声ファイルは使わない）。
 *
 * - 効果音: 覚えた／まだ、カードをめくる、正解／不正解、テスト完了、タップ
 * - BGM: やわらかいコード進行（Fmaj7 → Em7 → Dm7 → Cmaj7）にベースと
 *        ときどき鳴るアルペジオを重ねた、ゆったりしたループ
 * - 読み上げ中は BGM を小さくし、マイクで聞き取り中は無音にする（ducking）
 *
 * ブラウザは利用者が画面に触れるまで音を出させないので、最初のタップで unlock() する。
 */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI ノート番号 → 周波数

// コード（MIDI ノート）: 1小節ずつ
const PROGRESSION = [
  { bass: 41, chord: [53, 57, 60, 64] }, // Fmaj7
  { bass: 40, chord: [52, 55, 59, 62] }, // Em7
  { bass: 38, chord: [50, 53, 57, 60] }, // Dm7
  { bass: 36, chord: [48, 52, 55, 59] }, // Cmaj7
];
const BPM = 76;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

// 小さくするときの倍率（理由ごと。いちばん小さいものを採用）
const DUCK_LEVEL = { speech: 0.25, mic: 0 };

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.bgmOn = false;
    this.bgmVolume = 0.35;
    this.ducks = new Set();
    this.bgmTimer = null;
    this.nextBarTime = 0;
    this.barIndex = 0;
  }

  get available() {
    return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
  }

  /** 最初のタップで呼ぶ。以後、効果音と BGM が鳴らせる */
  unlock() {
    if (!this.available) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(this.master);

      // BGM は柔らかくするためにローパスを通し、軽い残響（フィードバックディレイ）を足す
      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0;
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1800;
      const delay = this.ctx.createDelay();
      delay.delayTime.value = BEAT * 0.75;
      const feedback = this.ctx.createGain();
      feedback.gain.value = 0.25;
      this.bgmBus.connect(lowpass);
      lowpass.connect(this.master);
      lowpass.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.master);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    if (this.bgmOn) this.startBgm();
  }

  setSfx(on) {
    this.sfxOn = on;
  }

  setBgm(on, volume = this.bgmVolume) {
    this.bgmOn = on;
    this.bgmVolume = volume;
    if (!this.ctx) return;
    if (on) this.startBgm();
    else this.stopBgm();
    this.applyBgmGain();
  }

  /** reason（"speech" | "mic"）ごとに BGM を小さくする／戻す */
  duck(reason, on) {
    if (on) this.ducks.add(reason);
    else this.ducks.delete(reason);
    this.applyBgmGain();
  }

  applyBgmGain() {
    if (!this.ctx) return;
    let level = this.bgmOn ? this.bgmVolume * 0.5 : 0;
    for (const r of this.ducks) level *= DUCK_LEVEL[r] ?? 1;
    const g = this.bgmBus.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(level, this.ctx.currentTime, 0.15);
  }

  // ---- 効果音 --------------------------------------------------------------

  /** 短い音を1つ鳴らす */
  tone(freq, { at = 0, dur = 0.18, type = "triangle", gain = 0.5, slideTo = null } = {}) {
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.sfxOn || !this.ctx || this.ctx.state !== "running") return;
    switch (name) {
      case "learned": // 覚えた: 上がる2音
        this.tone(NOTE(76), { dur: 0.12 });
        this.tone(NOTE(83), { at: 0.09, dur: 0.22 });
        break;
      case "again": // まだ: やわらかく下がる音
        this.tone(NOTE(62), { dur: 0.22, type: "sine", gain: 0.45, slideTo: NOTE(55) });
        break;
      case "flip":
        this.tone(NOTE(88), { dur: 0.05, type: "sine", gain: 0.25 });
        break;
      case "tap":
        this.tone(NOTE(84), { dur: 0.04, type: "sine", gain: 0.18 });
        break;
      case "correct": // 正解: きらっと3音
        this.tone(NOTE(84), { dur: 0.1 });
        this.tone(NOTE(88), { at: 0.08, dur: 0.1 });
        this.tone(NOTE(91), { at: 0.16, dur: 0.3 });
        break;
      case "wrong": // 不正解: 低い2音
        this.tone(NOTE(55), { dur: 0.16, type: "square", gain: 0.12 });
        this.tone(NOTE(52), { at: 0.14, dur: 0.26, type: "square", gain: 0.12 });
        break;
      case "complete": // テスト完了・章クリア: 短いファンファーレ
        [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), { at: i * 0.1, dur: 0.18 }));
        this.tone(NOTE(88), { at: 0.42, dur: 0.6, gain: 0.4 });
        break;
      default:
    }
  }

  // ---- BGM -----------------------------------------------------------------

  startBgm() {
    if (this.bgmTimer || !this.ctx) return;
    this.nextBarTime = this.ctx.currentTime + 0.1;
    // 少し先まで予約していく（タブが裏に回っても音が途切れにくい）
    this.bgmTimer = setInterval(() => this.scheduleAhead(), 200);
    this.scheduleAhead();
    this.applyBgmGain();
  }

  stopBgm() {
    clearInterval(this.bgmTimer);
    this.bgmTimer = null;
  }

  scheduleAhead() {
    while (this.nextBarTime < this.ctx.currentTime + 1.2) {
      this.scheduleBar(PROGRESSION[this.barIndex % PROGRESSION.length], this.nextBarTime);
      this.nextBarTime += BAR;
      this.barIndex++;
    }
  }

  voice(freq, t, dur, { type = "sine", gain = 0.1, attack = 0.02 } = {}) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(this.bgmBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  scheduleBar({ bass, chord }, t) {
    // パッド（ゆっくり立ち上がる和音）
    for (const n of chord) this.voice(NOTE(n), t, BAR * 1.05, { type: "sine", gain: 0.05, attack: 0.6 });
    // ベース（1拍目と3拍目）
    this.voice(NOTE(bass), t, BEAT * 1.8, { type: "triangle", gain: 0.12 });
    this.voice(NOTE(bass), t + BEAT * 2, BEAT * 1.8, { type: "triangle", gain: 0.09 });
    // アルペジオ（8分音符、ときどき休む）
    for (let i = 0; i < 8; i++) {
      if (Math.random() < 0.45) continue;
      const n = chord[Math.floor(Math.random() * chord.length)] + 12;
      this.voice(NOTE(n), t + i * (BEAT / 2), BEAT * 0.9, { type: "triangle", gain: 0.045 });
    }
  }
}

/** 何もしない代わり（サーバー描画やテストで使う） */
export const silentSound = { play() {}, duck() {}, unlock() {}, setSfx() {}, setBgm() {} };

/**
 * 魚の定義と抽選。純粋ロジックのみで、他のモジュールに依存しない。
 *
 * 設計の要点:
 *  - 乱数は必ず引数で受け取る（Math.random を直接呼ばない）。テストを決定的にするため。
 *  - 「レベルが上がるとレアが釣れやすくなる」は、出現重みを Lv1 の値から Lv30 の値へ
 *    線形補間することで表現する。コモンが消えるのではなく比率が滑らかに移る。
 *  - 時間帯・天候・ルアーの影響は、すべて重みへの掛け算として一箇所に集約する。
 */
(function (global) {
  'use strict';

  var LEVEL_MIN = 1;
  var LEVEL_MAX = 30;

  // stars: 希少性（1=コモン 〜 5=伝説）
  // w1 / w30: Lv1 と Lv30 における出現重み。この間を線形補間する。
  // reactionMs: 「合わせ」の猶予。fightMs: 巻き切るのに必要な正味の時間。
  // pull / amp / freq: ファイト中の引きの強さ・振れ幅・周期（sin波）。
  var FISH = [
    {
      id: 'aji', name: 'アジ', reading: 'まあじ', stars: 1,
      min: 15, max: 30, base: 10, w1: 40, w30: 12,
      reactionMs: 1500, fightMs: 2400, pull: 0.50, amp: 0.08, freq: 1.0,
      color: '#6fd6ee', accent: '#2f9fc4', belly: '#e8f8ff',
      timeBias: { dawn: 1.2, day: 1.0, dusk: 1.2, night: 0.6 },
      weatherBias: { sunny: 1.1, cloudy: 1.0, rain: 1.0, storm: 0.7 },
      note: '群れで回遊する定番。まずはここから。'
    },
    {
      id: 'saba', name: 'サバ', reading: 'まさば', stars: 1,
      min: 25, max: 45, base: 15, w1: 30, w30: 12,
      reactionMs: 1300, fightMs: 2800, pull: 0.55, amp: 0.14, freq: 1.6,
      color: '#7fb2e8', accent: '#2e6fb0', belly: '#eef6ff',
      timeBias: { dawn: 1.3, day: 1.0, dusk: 1.2, night: 0.7 },
      weatherBias: { sunny: 1.0, cloudy: 1.0, rain: 1.1, storm: 0.8 },
      note: '小刻みに首を振る。テンションが暴れやすい。'
    },
    {
      id: 'ika', name: 'スルメイカ', reading: 'するめいか', stars: 2,
      min: 20, max: 40, base: 25, w1: 15, w30: 16,
      reactionMs: 900, fightMs: 3000, pull: 0.48, amp: 0.18, freq: 2.4,
      color: '#f6a6b6', accent: '#d1587a', belly: '#fff0f4',
      timeBias: { dawn: 0.8, day: 0.6, dusk: 1.4, night: 2.0 },
      weatherBias: { sunny: 0.9, cloudy: 1.1, rain: 1.2, storm: 1.0 },
      note: '当たりが極端に短い。夜に強い。'
    },
    {
      id: 'tai', name: 'マダイ', reading: 'まだい', stars: 2,
      min: 30, max: 70, base: 40, w1: 10, w30: 18,
      reactionMs: 1200, fightMs: 3600, pull: 0.60, amp: 0.20, freq: 1.3,
      color: '#ff9aa8', accent: '#d94a63', belly: '#fff2f4',
      timeBias: { dawn: 1.5, day: 1.0, dusk: 1.5, night: 0.8 },
      weatherBias: { sunny: 1.0, cloudy: 1.1, rain: 1.2, storm: 1.0 },
      note: '三段引き。緩めるタイミングを間違えない。'
    },
    {
      id: 'buri', name: 'ブリ', reading: 'ぶり', stars: 3,
      min: 60, max: 110, base: 80, w1: 4, w30: 20,
      reactionMs: 1000, fightMs: 4500, pull: 0.66, amp: 0.18, freq: 0.9,
      color: '#8fe0b8', accent: '#2f9e6b', belly: '#f0fff8',
      timeBias: { dawn: 1.8, day: 0.9, dusk: 1.8, night: 0.8 },
      weatherBias: { sunny: 0.9, cloudy: 1.1, rain: 1.3, storm: 1.5 },
      note: '重く長い。竿の性能がそのまま出る。'
    },
    {
      id: 'kue', name: 'クエ', reading: 'くえ', stars: 4,
      min: 80, max: 150, base: 160, w1: 1, w30: 15,
      reactionMs: 850, fightMs: 5500, pull: 0.72, amp: 0.22, freq: 0.7,
      color: '#c8a2e8', accent: '#7a44b8', belly: '#f7f0ff',
      timeBias: { dawn: 1.2, day: 0.8, dusk: 1.4, night: 1.8 },
      weatherBias: { sunny: 0.9, cloudy: 1.0, rain: 1.2, storm: 1.8 },
      note: '根に潜られたら終わり。糸の強さが要る。'
    },
    {
      id: 'ryugu', name: 'リュウグウノツカイ', reading: 'りゅうぐうのつかい', stars: 5,
      min: 200, max: 500, base: 400, w1: 0.1, w30: 7,
      reactionMs: 700, fightMs: 7000, pull: 0.70, amp: 0.28, freq: 0.5,
      color: '#ffd76e', accent: '#e0453f', belly: '#fff8e0',
      timeBias: { dawn: 0.5, day: 0.2, dusk: 0.8, night: 4.0 },
      weatherBias: { sunny: 0.6, cloudy: 0.9, rain: 1.3, storm: 2.5 },
      note: '深海からの使者。嵐の夜にだけ、まれに。'
    }
  ];

  var BY_ID = {};
  for (var i = 0; i < FISH.length; i++) BY_ID[FISH[i].id] = FISH[i];

  function clampLevel(level) {
    if (!(level >= LEVEL_MIN)) return LEVEL_MIN;
    return level > LEVEL_MAX ? LEVEL_MAX : level;
  }

  /** Lv1 の重みから Lv30 の重みへの線形補間。 */
  function weightAt(fish, level) {
    var lv = clampLevel(level);
    var t = (lv - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN);
    return fish.w1 + (fish.w30 - fish.w1) * t;
  }

  /**
   * ルアーによるレア寄せ。stars 3 以上にだけ効き、希少なほど強く効く。
   * 指数ではなく線形にしているのは、伝説が出過ぎて壊れるのを避けるため。
   */
  function lureFactor(fish, rareBoost) {
    if (!rareBoost || rareBoost === 1 || fish.stars < 3) return 1;
    return 1 + (rareBoost - 1) * (fish.stars - 2) / 3;
  }

  /**
   * 出現重みの一覧。ctx = { level, phase, weather, rareBoost }
   * phase / weather を省略した場合はその補正を掛けない（テストで単独検証しやすくするため）。
   */
  function weights(ctx) {
    ctx = ctx || {};
    var out = [];
    for (var i = 0; i < FISH.length; i++) {
      var f = FISH[i];
      var w = weightAt(f, ctx.level == null ? 1 : ctx.level);
      if (ctx.phase && f.timeBias[ctx.phase] != null) w *= f.timeBias[ctx.phase];
      if (ctx.weather && f.weatherBias[ctx.weather] != null) w *= f.weatherBias[ctx.weather];
      w *= lureFactor(f, ctx.rareBoost);
      out.push({ fish: f, weight: w });
    }
    return out;
  }

  /** 重み付き抽選。rng は 0<=x<1 を返す関数。 */
  function pick(ctx, rng) {
    var ws = weights(ctx);
    var total = 0, i;
    for (i = 0; i < ws.length; i++) total += ws[i].weight;
    var r = rng() * total;
    for (i = 0; i < ws.length; i++) {
      r -= ws[i].weight;
      if (r < 0) return ws[i].fish;
    }
    return ws[ws.length - 1].fish; // 浮動小数の誤差対策
  }

  /**
   * サイズ抽選。一様乱数2つの平均で中央に寄せ（大物ほど稀）、
   * bigBias>0 のとき分布を上方向へ歪める（ジグや撒き餌の効果）。
   * 戻り値は cm、小数第1位まで。
   */
  function rollSize(fish, rng, opts) {
    var bias = (opts && opts.bigBias) || 0;
    var t = (rng() + rng()) / 2;
    if (bias > 0) t = Math.pow(t, 1 / (1 + bias));
    var cm = fish.min + (fish.max - fish.min) * t;
    return Math.round(cm * 10) / 10;
  }

  global.FQ = global.FQ || {};
  global.FQ.Fish = {
    LEVEL_MIN: LEVEL_MIN,
    LEVEL_MAX: LEVEL_MAX,
    all: function () { return FISH.slice(); },
    byId: function (id) { return BY_ID[id] || null; },
    weightAt: weightAt,
    lureFactor: lureFactor,
    weights: weights,
    pick: pick,
    rollSize: rollSize
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

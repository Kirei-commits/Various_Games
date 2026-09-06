/**
 * 魚の定義と抽選。純粋ロジックのみで、他のモジュールに依存しない。
 *
 * 設計の要点:
 *  - 乱数は必ず引数で受け取る（Math.random を直接呼ばない）。テストを決定的にするため。
 *  - 「レベルが上がるとレアが釣れやすくなる」は、出現重みを Lv1 の値から Lv30 の値へ
 *    線形補間することで表現する。コモンが消えるのではなく比率が滑らかに移る。
 *  - 時間帯・天候・ルアーの影響は、すべて重みへの掛け算として一箇所に集約する。
 *  - 30種ぶんの補正を1匹ずつ手書きすると必ず抜けが出るので、プリセットを共有する。
 */
(function (global) {
  'use strict';

  var LEVEL_MIN = 1;
  var LEVEL_MAX = 30;

  // 時間帯の効きかた。すべてのプリセットが4つの時間帯を必ず持つ。
  var TIME = {
    morning:   { dawn: 1.6, day: 1.0, dusk: 1.4, night: 0.5 }, // 朝に強い
    allday:    { dawn: 1.1, day: 1.1, dusk: 1.1, night: 0.9 }, // 一日中
    twilight:  { dawn: 1.5, day: 0.8, dusk: 1.7, night: 1.0 }, // マヅメ型
    nocturnal: { dawn: 0.8, day: 0.4, dusk: 1.4, night: 2.4 }, // 夜行性
    abyssal:   { dawn: 0.6, day: 0.3, dusk: 0.9, night: 3.2 }  // 深海。夜にしか浮いてこない
  };

  // 天候の効きかた。
  var WEA = {
    calm:    { sunny: 1.2, cloudy: 1.0, rain: 0.9, storm: 0.6 }, // 凪を好む
    neutral: { sunny: 1.0, cloudy: 1.05, rain: 1.05, storm: 0.9 },
    rainy:   { sunny: 0.85, cloudy: 1.05, rain: 1.35, storm: 1.2 },
    rough:   { sunny: 0.8, cloudy: 1.0, rain: 1.3, storm: 1.9 },  // 荒れるほど出る
    abyss:   { sunny: 0.6, cloudy: 0.9, rain: 1.3, storm: 2.6 }
  };

  /**
   * 1匹ぶんの定義を組み立てる。引数が多いので、呼び出し側は必ずこの順で書く。
   * fight は [reactionMs, fightMs, pull, amp, freq]、colors は [体色, ひれ, 腹]。
   */
  function def(o) {
    return {
      id: o.id, name: o.name, reading: o.reading, stars: o.stars,
      min: o.size[0], max: o.size[1], base: o.base,
      w1: o.w[0], w30: o.w[1],
      reactionMs: o.fight[0], fightMs: o.fight[1],
      pull: o.fight[2], amp: o.fight[3], freq: o.fight[4],
      color: o.colors[0], accent: o.colors[1], belly: o.colors[2],
      timeBias: o.time, weatherBias: o.weather,
      note: o.note
    };
  }

  var FISH = [
    // ───────────────────────────── ★1 コモン（8種）
    def({ id: 'iwashi', name: 'マイワシ', reading: 'まいわし', stars: 1, size: [10, 22], base: 8,
      w: [7.5, 2.2], fight: [1600, 2200, 0.46, 0.06, 1.4], colors: ['#9fe0f2', '#3f9fc0', '#f2fdff'],
      time: TIME.morning, weather: WEA.calm, note: '群れの入門編。数だけは釣れる。' }),
    def({ id: 'aji', name: 'アジ', reading: 'まあじ', stars: 1, size: [15, 30], base: 10,
      w: [7.2, 2.1], fight: [1500, 2400, 0.50, 0.08, 1.0], colors: ['#6fd6ee', '#2f9fc4', '#e8f8ff'],
      time: TIME.morning, weather: WEA.calm, note: '群れで回遊する定番。まずはここから。' }),
    def({ id: 'haze', name: 'ハゼ', reading: 'まはぜ', stars: 1, size: [8, 20], base: 12,
      w: [7.0, 2.0], fight: [1550, 2250, 0.44, 0.10, 1.8], colors: ['#c9b18a', '#7d6242', '#f6efe2'],
      time: TIME.allday, weather: WEA.neutral, note: '河口の常連。小さいが数が出る。' }),
    def({ id: 'saba', name: 'サバ', reading: 'まさば', stars: 1, size: [25, 45], base: 15,
      w: [6.9, 2.0], fight: [1300, 2800, 0.55, 0.14, 1.6], colors: ['#7fb2e8', '#2e6fb0', '#eef6ff'],
      time: TIME.morning, weather: WEA.neutral, note: '小刻みに首を振る。テンションが暴れやすい。' }),
    def({ id: 'kawahagi', name: 'カワハギ', reading: 'かわはぎ', stars: 1, size: [15, 30], base: 18,
      w: [6.8, 2.0], fight: [1450, 2500, 0.48, 0.12, 2.0], colors: ['#d8d2a8', '#8a8248', '#f8f6e6'],
      time: TIME.allday, weather: WEA.calm, note: 'エサ取りの名人。前アタリが小さい。' }),
    def({ id: 'mebaru', name: 'メバル', reading: 'めばる', stars: 1, size: [15, 35], base: 21,
      w: [6.7, 1.9], fight: [1400, 2600, 0.52, 0.10, 1.2], colors: ['#8f8fc4', '#4a4a86', '#efeffa'],
      time: TIME.nocturnal, weather: WEA.neutral, note: '春告魚。夜のほうが素直に出る。' }),
    def({ id: 'kisu', name: 'キス', reading: 'しろぎす', stars: 1, size: [15, 30], base: 24,
      w: [6.6, 1.9], fight: [1500, 2400, 0.46, 0.08, 1.5], colors: ['#f0e3c8', '#b79a63', '#fffaf0'],
      time: TIME.allday, weather: WEA.calm, note: '砂地の女王。引きは軽く、上品。' }),
    def({ id: 'bora', name: 'ボラ', reading: 'ぼら', stars: 1, size: [30, 60], base: 27,
      w: [6.3, 1.9], fight: [1350, 2800, 0.56, 0.16, 1.1], colors: ['#a9b4bd', '#5d6a75', '#f0f4f7'],
      time: TIME.allday, weather: WEA.rainy, note: 'どこにでもいる。掛かると意外に走る。' }),

    // ───────────────────────────── ★2 アンコモン（8種）
    def({ id: 'ika', name: 'スルメイカ', reading: 'するめいか', stars: 2, size: [20, 40], base: 32,
      w: [3.7, 3.1], fight: [900, 2900, 0.48, 0.18, 2.4], colors: ['#f6a6b6', '#d1587a', '#fff0f4'],
      time: TIME.nocturnal, weather: WEA.neutral, note: '当たりが極端に短い。夜に強い。' }),
    def({ id: 'kasago', name: 'カサゴ', reading: 'かさご', stars: 2, size: [20, 35], base: 36,
      w: [3.6, 3.0], fight: [1150, 3000, 0.58, 0.14, 1.3], colors: ['#e07a5f', '#94402c', '#ffeee6'],
      time: TIME.nocturnal, weather: WEA.rainy, note: '根の住人。掛けたら一気に浮かせる。' }),
    def({ id: 'aori', name: 'アオリイカ', reading: 'あおりいか', stars: 2, size: [25, 45], base: 40,
      w: [3.6, 3.0], fight: [950, 3100, 0.52, 0.20, 2.2], colors: ['#b8e6d0', '#4f9c7c', '#f2fff9'],
      time: TIME.twilight, weather: WEA.calm, note: 'ジェット噴射で一瞬だけ強く引く。' }),
    def({ id: 'tai', name: 'マダイ', reading: 'まだい', stars: 2, size: [30, 70], base: 45,
      w: [3.5, 3.0], fight: [1200, 3400, 0.60, 0.20, 1.3], colors: ['#ff9aa8', '#d94a63', '#fff2f4'],
      time: TIME.twilight, weather: WEA.rainy, note: '三段引き。緩めるタイミングを間違えない。' }),
    def({ id: 'suzuki', name: 'スズキ', reading: 'すずき', stars: 2, size: [40, 80], base: 50,
      w: [3.5, 2.9], fight: [1050, 3500, 0.60, 0.22, 1.6], colors: ['#cfe0ec', '#6f8ba4', '#fbfdff'],
      time: TIME.nocturnal, weather: WEA.rainy, note: 'エラ洗いでバラしやすい。雨の日が本番。' }),
    def({ id: 'kanpachi', name: 'カンパチ', reading: 'かんぱち', stars: 2, size: [40, 80], base: 56,
      w: [3.4, 2.9], fight: [1000, 3700, 0.62, 0.18, 1.2], colors: ['#ffd9a0', '#c98a2e', '#fff8ec'],
      time: TIME.morning, weather: WEA.rough, note: '若魚でも力は本物。最初の突っ込みが強い。' }),
    def({ id: 'tachiuo', name: 'タチウオ', reading: 'たちうお', stars: 2, size: [60, 130], base: 62,
      w: [3.4, 2.9], fight: [880, 3600, 0.56, 0.24, 2.0], colors: ['#dfe6ee', '#8f9bab', '#ffffff'],
      time: TIME.nocturnal, weather: WEA.neutral, note: '銀の帯。歯が鋭く、糸に厳しい。' }),
    def({ id: 'hirame', name: 'ヒラメ', reading: 'ひらめ', stars: 2, size: [40, 90], base: 70,
      w: [3.3, 2.8], fight: [1250, 3800, 0.64, 0.16, 0.9], colors: ['#b9a98c', '#6d5e44', '#f7f2e6'],
      time: TIME.twilight, weather: WEA.rough, note: '底に張りつく。ゴリ巻きは切られる。' }),

    // ───────────────────────────── ★3 レア（6種）
    def({ id: 'buri', name: 'ブリ', reading: 'ぶり', stars: 3, size: [60, 110], base: 80,
      w: [0.88, 2.6], fight: [1000, 4000, 0.66, 0.18, 0.9], colors: ['#8fe0b8', '#2f9e6b', '#f0fff8'],
      time: TIME.twilight, weather: WEA.rough, note: '重く長い。竿の性能がそのまま出る。' }),
    def({ id: 'sawara', name: 'サワラ', reading: 'さわら', stars: 3, size: [60, 120], base: 92,
      w: [0.84, 2.55], fight: [950, 4200, 0.64, 0.22, 1.5], colors: ['#a8d8e8', '#3d7f9c', '#f2fbff'],
      time: TIME.morning, weather: WEA.rough, note: '走りが速い。止めようとすると切れる。' }),
    def({ id: 'ishidai', name: 'イシダイ', reading: 'いしだい', stars: 3, size: [40, 70], base: 105,
      w: [0.8, 2.5], fight: [1100, 4400, 0.68, 0.20, 1.1], colors: ['#cfd6de', '#2b3138', '#f6f9fc'],
      time: TIME.allday, weather: WEA.rough, note: '磯の王者候補。根に向かって突っ込む。' }),
    def({ id: 'hiramasa', name: 'ヒラマサ', reading: 'ひらまさ', stars: 3, size: [70, 130], base: 120,
      w: [0.8, 2.5], fight: [980, 4700, 0.68, 0.20, 0.8], colors: ['#ffe08a', '#3fa06c', '#fffaea'],
      time: TIME.morning, weather: WEA.rough, note: '海のスプリンター。最初の10秒が勝負。' }),
    def({ id: 'mahata', name: 'マハタ', reading: 'まはた', stars: 3, size: [50, 100], base: 140,
      w: [0.76, 2.45], fight: [1000, 4800, 0.70, 0.18, 0.7], colors: ['#b0c4a8', '#4d6647', '#f3f8f0'],
      time: TIME.nocturnal, weather: WEA.rainy, note: '穴に潜られたら勝負あり。' }),
    def({ id: 'akamutsu', name: 'アカムツ', reading: 'あかむつ', stars: 3, size: [25, 50], base: 160,
      w: [0.72, 2.4], fight: [900, 5000, 0.66, 0.22, 1.3], colors: ['#e8556d', '#8c1f33', '#ffe9ee'],
      time: TIME.abyssal, weather: WEA.rainy, note: 'ノドグロ。深場からゆっくり浮かせる。' }),

    // ───────────────────────────── ★4 スーパーレア（5種）
    def({ id: 'kue', name: 'クエ', reading: 'くえ', stars: 4, size: [80, 150], base: 190,
      w: [0.36, 2.9], fight: [880, 5200, 0.72, 0.22, 0.7], colors: ['#c8a2e8', '#7a44b8', '#f7f0ff'],
      time: TIME.nocturnal, weather: WEA.rough, note: '根に潜られたら終わり。糸の強さが要る。' }),
    def({ id: 'kihada', name: 'キハダマグロ', reading: 'きはだまぐろ', stars: 4, size: [90, 180], base: 230,
      w: [0.34, 2.85], fight: [850, 5600, 0.72, 0.24, 0.9], colors: ['#ffd45e', '#2f6fa8', '#fff8dd'],
      time: TIME.morning, weather: WEA.rough, note: '止まらない。緩めて耐える時間が長い。' }),
    def({ id: 'kajiki', name: 'クロカジキ', reading: 'くろかじき', stars: 4, size: [200, 400], base: 280,
      w: [0.32, 2.8], fight: [820, 6000, 0.74, 0.24, 0.6], colors: ['#5b7fd6', '#22336e', '#eaf0ff'],
      time: TIME.twilight, weather: WEA.rough, note: '海面を割って跳ぶ。テンションが跳ね上がる。' }),
    def({ id: 'manbo', name: 'マンボウ', reading: 'まんぼう', stars: 4, size: [150, 330], base: 340,
      w: [0.31, 2.75], fight: [900, 6200, 0.70, 0.20, 0.4], colors: ['#a9b8c4', '#5a6b78', '#f2f6fa'],
      time: TIME.allday, weather: WEA.neutral, note: 'ただ重い。ひたすら巻くしかない。' }),
    def({ id: 'ookamiuo', name: 'オオカミウオ', reading: 'おおかみうお', stars: 4, size: [80, 140], base: 410,
      w: [0.3, 2.7], fight: [800, 6500, 0.74, 0.26, 1.0], colors: ['#7d8ea0', '#2f3d4c', '#eef3f8'],
      time: TIME.abyssal, weather: WEA.abyss, note: '冷たい海の顎。噛み切られる前に浮かせる。' }),

    // ───────────────────────────── ★5 レジェンド（3種）
    def({ id: 'ryugu', name: 'リュウグウノツカイ', reading: 'りゅうぐうのつかい', stars: 5, size: [200, 500], base: 500,
      w: [0.05, 2.0], fight: [760, 6800, 0.70, 0.28, 0.5], colors: ['#ffd76e', '#e0453f', '#fff8e0'],
      time: TIME.abyssal, weather: WEA.abyss, note: '深海からの使者。嵐の夜にだけ、まれに。' }),
    def({ id: 'rabuka', name: 'ラブカ', reading: 'らぶか', stars: 5, size: [120, 200], base: 650,
      w: [0.04, 1.9], fight: [700, 7400, 0.74, 0.28, 0.6], colors: ['#8c7a9c', '#3a2c4a', '#efe8f6'],
      time: TIME.abyssal, weather: WEA.abyss, note: '生きた化石。引きが人のそれではない。' }),
    def({ id: 'daiouika', name: 'ダイオウイカ', reading: 'だいおういか', stars: 5, size: [300, 900], base: 900,
      w: [0.03, 1.75], fight: [650, 8000, 0.76, 0.30, 0.4], colors: ['#f2857c', '#7d1f2b', '#ffeeea'],
      time: TIME.abyssal, weather: WEA.abyss, note: '海の伝説。掛けた者はほとんどいない。' })
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
    TIME: TIME,
    WEATHER_PRESETS: WEA,
    all: function () { return FISH.slice(); },
    count: FISH.length,
    byId: function (id) { return BY_ID[id] || null; },
    weightAt: weightAt,
    lureFactor: lureFactor,
    weights: weights,
    pick: pick,
    rollSize: rollSize
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

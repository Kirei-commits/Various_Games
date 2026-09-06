/**
 * 時間帯と天候。純粋ロジック。
 *
 * 時間は実時間ではなくゲーム内時計で進める。実時間だと「夜まで待つ」が成立しないため、
 * 1キャストごとに MINUTES_PER_CAST だけ進める。
 */
(function (global) {
  'use strict';

  var MINUTES_PER_DAY = 1440;
  var MINUTES_PER_CAST = 30;

  var PHASES = [
    { id: 'dawn',  name: '朝マヅメ', from: 240,  to: 420,  icon: '🌅' },
    { id: 'day',   name: '日中',     from: 420,  to: 960,  icon: '☀️' },
    { id: 'dusk',  name: '夕マヅメ', from: 960,  to: 1140, icon: '🌇' },
    { id: 'night', name: '夜',       from: 1140, to: 240,  icon: '🌙' }
  ];

  var WEATHER = {
    sunny:  { id: 'sunny',  name: '晴れ',  icon: '☀️', pointMul: 1.00, waitMul: 1.00, ampMul: 1.00 },
    cloudy: { id: 'cloudy', name: 'くもり', icon: '☁️', pointMul: 1.00, waitMul: 0.95, ampMul: 1.05 },
    rain:   { id: 'rain',   name: '雨',    icon: '🌧️', pointMul: 1.05, waitMul: 0.80, ampMul: 1.15 },
    storm:  { id: 'storm',  name: '嵐',    icon: '⛈️', pointMul: 1.20, waitMul: 0.90, ampMul: 1.35 }
  };
  var WEATHER_IDS = ['sunny', 'cloudy', 'rain', 'storm'];

  // 遷移確率。嵐は長続きせず、晴れへ戻りやすい。各行の合計は 1。
  var TRANSITION = {
    sunny:  { sunny: 0.70, cloudy: 0.25, rain: 0.05, storm: 0.00 },
    cloudy: { sunny: 0.30, cloudy: 0.45, rain: 0.22, storm: 0.03 },
    rain:   { sunny: 0.10, cloudy: 0.40, rain: 0.40, storm: 0.10 },
    storm:  { sunny: 0.15, cloudy: 0.40, rain: 0.35, storm: 0.10 }
  };

  function normalizeMinutes(m) {
    m = Math.round(m) % MINUTES_PER_DAY;
    return m < 0 ? m + MINUTES_PER_DAY : m;
  }

  function phaseAt(minutes) {
    var m = normalizeMinutes(minutes);
    for (var i = 0; i < PHASES.length; i++) {
      var p = PHASES[i];
      var inRange = p.from < p.to ? (m >= p.from && m < p.to) : (m >= p.from || m < p.to);
      if (inRange) return p;
    }
    return PHASES[PHASES.length - 1];
  }

  function advance(minutes, by) {
    return normalizeMinutes(minutes + (by == null ? MINUTES_PER_CAST : by));
  }

  function formatClock(minutes) {
    var m = normalizeMinutes(minutes);
    var h = Math.floor(m / 60), mi = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
  }

  function weatherOf(id) { return WEATHER[id] || WEATHER.sunny; }

  function nextWeather(current, rng) {
    var row = TRANSITION[current] || TRANSITION.sunny;
    var r = rng();
    for (var i = 0; i < WEATHER_IDS.length; i++) {
      var id = WEATHER_IDS[i];
      r -= row[id] || 0;
      if (r < 0) return id;
    }
    return 'sunny';
  }

  global.FQ = global.FQ || {};
  global.FQ.World = {
    MINUTES_PER_DAY: MINUTES_PER_DAY,
    MINUTES_PER_CAST: MINUTES_PER_CAST,
    PHASES: PHASES,
    WEATHER: WEATHER,
    WEATHER_IDS: WEATHER_IDS,
    TRANSITION: TRANSITION,
    normalizeMinutes: normalizeMinutes,
    phaseAt: phaseAt,
    advance: advance,
    formatClock: formatClock,
    weatherOf: weatherOf,
    nextWeather: nextWeather
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

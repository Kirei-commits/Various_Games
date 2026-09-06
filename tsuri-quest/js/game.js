/**
 * 釣りの状態機械。描画にもDOMにも依存しないので、Nodeでそのままテストできる。
 *
 *   idle ──cast()──> casting ──> waiting ──> bite ──strike()──> fight ──> (landed | missed)
 *
 * 失敗は3種類。どれも「なぜ失敗したか」が操作から分かるようにしてある:
 *   early  待っている最中に合わせた（早合わせ）
 *   late   当たりの猶予内に合わせられなかった
 *   break  巻きすぎてテンションが糸の限界を超えた
 *   escape 巻かなさすぎて制限時間を使い切った
 *
 * 乱数も経過時間も外から与える。内部で Math.random / Date.now を呼ばない。
 */
(function (global) {
  'use strict';

  var CAST_MS = 700;        // 仕掛けが着水するまで
  var WAIT_MIN_MS = 1200;   // ヒットまでの待ち時間の下限
  var WAIT_SPAN_MS = 3800;  // 〜上限までの幅
  var RESULT_MS = 1600;     // 釣果・バラシの表示時間

  var TENSION_UP = 0.75;    // 巻いている間にテンションが増える基礎速度（/秒）
  var TENSION_PULL = 0.60;  // 魚の引きがテンションに乗る割合
  var TENSION_DOWN = 1.30;  // 巻きを止めたときに緩む速度（/秒）
  var TENSION_MIN_WORK = 0.15; // これ未満だと糸がたるんで巻き取れない
  var PROGRESS_BACK = 0.15; // 巻きを止めている間に取り込みが戻る割合
  var FIGHT_LIMIT_MUL = 3.0; // 制限時間 = fightMs * これ

  function create(opts) {
    opts = opts || {};
    var rng = opts.random || Math.random;

    var s = {
      phase: 'idle',
      t: 0,              // 現在フェーズの経過ms
      waitMs: 0,
      biteWindowMs: 0,
      fish: null,
      size: 0,
      tension: 0,
      progress: 0,
      elapsedFight: 0,
      limitMs: 0,
      reeling: false,
      pullPhase: 0,      // 引きのsin波の初期位相
      ampMul: 1,
      reelRate: 1,
      breakAt: 0.8,
      result: null       // { ok:true, fish, size } | { ok:false, reason }
    };

    /** ファイト中の引きの強さ（0〜1程度）。時刻に対して決定的。 */
    function pullAt(ms) {
      if (!s.fish) return 0;
      var f = s.fish;
      var w = 2 * Math.PI * f.freq * (ms / 1000) + s.pullPhase;
      // sin にもう一段ゆるい波を重ね、単調な周期に見えないようにする
      var wave = Math.sin(w) * 0.75 + Math.sin(w * 0.37 + 1.1) * 0.25;
      return f.pull + f.amp * s.ampMul * wave * 2;
    }

    /**
     * キャストする。ctx:
     *   { level, phase, weather, lure, rod, line }
     * lure/rod/line は Gear の定義オブジェクト（テストでは直接渡せる）。
     */
    function cast(ctx) {
      if (s.phase !== 'idle') return false;
      ctx = ctx || {};
      var Fish = global.FQ.Fish;
      var lure = ctx.lure || { waitMul: 1, rareBoost: 1, bigBias: 0 };
      var rod = ctx.rod || { reelRate: 1, reactionBonusMs: 0 };
      var line = ctx.line || { breakAt: 0.8 };
      var weatherWaitMul = ctx.weatherWaitMul == null ? 1 : ctx.weatherWaitMul;

      s.fish = Fish.pick({
        level: ctx.level, phase: ctx.phase, weather: ctx.weather, rareBoost: lure.rareBoost
      }, rng);
      s.size = Fish.rollSize(s.fish, rng, { bigBias: lure.bigBias });

      s.waitMs = (WAIT_MIN_MS + rng() * WAIT_SPAN_MS) * lure.waitMul * weatherWaitMul;
      s.biteWindowMs = s.fish.reactionMs + rod.reactionBonusMs;
      s.pullPhase = rng() * Math.PI * 2;
      s.ampMul = ctx.weatherAmpMul == null ? 1 : ctx.weatherAmpMul;
      s.reelRate = rod.reelRate;
      s.breakAt = line.breakAt;

      s.tension = 0;
      s.progress = 0;
      s.elapsedFight = 0;
      s.limitMs = s.fish.fightMs * FIGHT_LIMIT_MUL;
      s.reeling = false;
      s.result = null;
      s.phase = 'casting';
      s.t = 0;
      return true;
    }

    function fail(reason) {
      s.result = { ok: false, reason: reason, fish: s.fish, size: s.size };
      s.phase = 'result';
      s.t = 0;
      s.reeling = false;
      return { type: 'missed', reason: reason, fish: s.fish, size: s.size };
    }

    function land() {
      s.result = { ok: true, fish: s.fish, size: s.size };
      s.phase = 'result';
      s.t = 0;
      s.reeling = false;
      return { type: 'landed', fish: s.fish, size: s.size };
    }

    /** 合わせる。当たりが出ている間だけ成功する。 */
    function strike() {
      if (s.phase === 'waiting' || s.phase === 'casting') return fail('early');
      if (s.phase !== 'bite') return null;
      s.phase = 'fight';
      s.t = 0;
      s.tension = 0.25; // 合わせた直後は少し張っている
      return { type: 'hooked', fish: s.fish };
    }

    function setReeling(on) { s.reeling = !!on && s.phase === 'fight'; }

    /** dt ミリ秒進める。状態が変わったときだけイベントを返す。 */
    function tick(dt) {
      if (dt <= 0) return null;
      s.t += dt;

      if (s.phase === 'casting') {
        if (s.t >= CAST_MS) { s.phase = 'waiting'; s.t = 0; }
        return null;
      }

      if (s.phase === 'waiting') {
        if (s.t >= s.waitMs) { s.phase = 'bite'; s.t = 0; return { type: 'bite', fish: s.fish }; }
        return null;
      }

      if (s.phase === 'bite') {
        if (s.t >= s.biteWindowMs) return fail('late');
        return null;
      }

      if (s.phase === 'fight') {
        var sec = dt / 1000;
        s.elapsedFight += dt;
        var pull = pullAt(s.elapsedFight);

        if (s.reeling) {
          s.tension += (TENSION_UP + Math.max(0, pull) * TENSION_PULL) * sec;
        } else {
          s.tension -= TENSION_DOWN * sec;
        }
        if (s.tension < 0) s.tension = 0;
        if (s.tension > 1) s.tension = 1;

        if (s.tension >= s.breakAt) return fail('break');

        var rate = sec * 1000 / s.fish.fightMs;
        if (s.reeling && s.tension >= TENSION_MIN_WORK) {
          s.progress += rate * s.reelRate;
        } else {
          s.progress -= rate * PROGRESS_BACK;
        }
        if (s.progress < 0) s.progress = 0;
        if (s.progress >= 1) { s.progress = 1; return land(); }

        if (s.elapsedFight >= s.limitMs) return fail('escape');
        return null;
      }

      if (s.phase === 'result') {
        if (s.t >= RESULT_MS) { s.phase = 'idle'; s.t = 0; return { type: 'ready' }; }
        return null;
      }

      return null;
    }

    /** 結果表示を待たずに次へ進む（プレイヤーがタップしたとき）。 */
    function dismiss() {
      if (s.phase !== 'result') return false;
      s.phase = 'idle';
      s.t = 0;
      return true;
    }

    function reset() {
      s.phase = 'idle'; s.t = 0; s.fish = null; s.result = null;
      s.tension = 0; s.progress = 0; s.reeling = false;
    }

    return {
      state: s,
      cast: cast,
      strike: strike,
      setReeling: setReeling,
      tick: tick,
      dismiss: dismiss,
      reset: reset,
      pullAt: pullAt,
      setRandom: function (fn) { rng = fn; },
      /** 当たりまでの待ち時間を潰す。E2Eテスト専用。 */
      skipWait: function () {
        if (s.phase === 'casting') { s.phase = 'waiting'; s.t = 0; }
        if (s.phase === 'waiting') s.t = s.waitMs - 1;
      }
    };
  }

  global.FQ = global.FQ || {};
  global.FQ.Game = {
    CAST_MS: CAST_MS,
    WAIT_MIN_MS: WAIT_MIN_MS,
    WAIT_SPAN_MS: WAIT_SPAN_MS,
    RESULT_MS: RESULT_MS,
    TENSION_UP: TENSION_UP,
    TENSION_DOWN: TENSION_DOWN,
    TENSION_MIN_WORK: TENSION_MIN_WORK,
    FIGHT_LIMIT_MUL: FIGHT_LIMIT_MUL,
    create: create
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

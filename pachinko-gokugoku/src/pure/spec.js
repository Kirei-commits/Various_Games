/**
 * 抽選と理論値（純粋。DOM・グローバルな乱数・時計に触らない）→ globalThis.PG.Spec
 *
 *  - createLottery(cfg, rng): ヘソ／電チュー入賞の瞬間に取った乱数 raw（0〜randRange-1）で当否を決め、
 *    同時に演出（リーチ・テロップ・保留色・先バレ…）をすべて決める。rng は [0,1) を返す関数。
 *  - theory(cfg, opts): 設定ファイルから理論値を計算する（実機と同じく「当りの個数 / 乱数の範囲」で離散化）。
 *    テストはこの理論値と、createLottery を大量に回した実測値が一致することを確かめる。
 */
(function (G) {
  'use strict';
  const PG = G.PG || (G.PG = {});
  const COLOR_RANK = { white: 0, blue: 1, green: 2, red: 3, gold: 4, rainbow: 5 };

  function pickW(arr, rng) {
    let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i][1];
    let r = rng() * s;
    for (let i = 0; i < arr.length; i++) { r -= arr[i][1]; if (r < 0) return arr[i][0]; }
    return arr[arr.length - 1][0];
  }
  /** 表の中で value の割合 */
  function share(arr, pred) {
    let s = 0, t = 0; for (let i = 0; i < arr.length; i++) { s += arr[i][1]; if (pred(arr[i][0])) t += arr[i][1]; }
    return s ? t / s : 0;
  }
  /** 分母 denom の当りの個数（最低1個、最大で全部） */
  function threshold(cfg, denom) {
    const R = cfg.spec.randRange;
    return Math.min(R, Math.max(1, Math.round(R / denom)));
  }
  /** 目標の継続率から RUSH の当りの個数を逆算する */
  function rushThreshold(cfg) {
    const { stSpins, targetContinuation } = cfg.spec.rush, R = cfg.spec.randRange;
    const p = 1 - Math.pow(1 - targetContinuation, 1 / stSpins);
    return Math.min(R, Math.max(1, Math.round(R * p)));
  }
  const hitProb = (cfg, denom) => threshold(cfg, denom) / cfg.spec.randRange;
  const rushProb = cfg => rushThreshold(cfg) / cfg.spec.randRange;
  const continuation = cfg => 1 - Math.pow(1 - rushProb(cfg), cfg.spec.rush.stSpins);

  function createLottery(cfg, rng) {
    const S = cfg.spec, SC = cfg.scenario, HC = cfg.holdColor;
    const d9 = () => 1 + (rng() * 9 | 0);
    const L = {
      /**
       * raw: 入賞の瞬間に取った乱数 / isRush: RUSH の表で判定するか / force: 演出チェック用の強制
       * settings: { prob: 分母, preread: 先読み信頼度UP, sakibare: 先バレ率 }
       */
      draw(raw, isRush, force, settings) {
        const thr = isRush ? rushThreshold(cfg) : threshold(cfg, settings.prob);
        let hit = raw < thr;
        if (force) hit = force !== 'miss';
        const h = { raw, isRush, hit, kind: null, route: null, final: 0, nums: [1, 2, 3], reachNum: 0, sc: null, rs: null, color: 'white', dispColor: 'white', changeAt: null, fxType: 'sword', sakibare: false, fx: null, uraDone: false };
        if (isRush) this.rush(h, force);
        else this.normal(h, force, settings);
        h.fxType = h.color === 'rainbow' ? 'thunder' : ['sword', 'bullet', 'thunder'][rng() * 3 | 0];
        if (h.color !== 'white') h.changeAt = h.sakibare ? 'saki' : (rng() < HC.changeAtEntry ? 'entry' : 'spin');
        return h;
      },
      rush(h, force) {
        const R = S.rush;
        h.kind = h.hit ? 'rush' : null; h.route = h.kind;
        if (h.hit) { h.final = rng() < R.sevenRate ? 7 : d9(); h.nums = [h.final, h.final, h.final]; }
        else h.nums = this.missNums();
        const iw = R.iwakanTypes;
        h.rs = { iwakan: h.hit ? ((force === 'iwakan' || rng() < R.iwakanRate) ? iw[rng() * iw.length | 0] : null) : null, battle: h.hit ? true : rng() < R.battleFakeRate };
        h.color = pickW(h.hit ? HC.rushHit : HC.rushMiss, rng);
      },
      normal(h, force, settings) {
        if (h.hit) {
          const special = force && force !== 'hit' && force !== 'sakibare';
          h.kind = force === 'regular' ? 'regular' : special ? 'fever' : (rng() < S.feverRate ? 'fever' : 'regular');
          h.route = h.kind === 'regular' ? 'regular'
            : force === 'scoop' ? 'scoop' : force === 'lever' ? 'lever'
              : (force === 'battle' || force === 'story' || force === 'zenkaiten' || force === 'ippatsu') ? '7direct'
                : pickW(S.feverRoutes, rng);
          h.final = h.route === '7direct' ? 7 : this.nonSeven(h.route);
        }
        const pre = !!settings.preread;
        h.color = pickW(h.hit ? (pre ? HC.hitPreread : HC.hit) : (pre ? HC.missPreread : HC.miss), rng);
        h.sc = this.scenario(h, force);
        this.numbers(h);
        if (h.hit && (force === 'sakibare' || rng() < (settings.sakibare || 0))) { h.sakibare = true; if (COLOR_RANK[h.color] < 3) h.color = 'red'; }
      },
      nonSeven(route) {
        const odd = [1, 3, 5, 9], even = [2, 4, 6, 8];
        const a = rng() < (route === 'regular' ? S.oddRate.regular : S.oddRate.promote) ? odd : even;
        return a[rng() * a.length | 0];
      },
      reach(h, force) {
        if (h.hit) {
          if (force === 'zenkaiten' || force === 'ippatsu') return force;
          if (force === 'battle' || force === 'story' || force === 'scoop' || force === 'lever') return 'sp';
          return pickW(SC.hitReach, rng);
        }
        if (force === 'miss') return 'sp';
        return pickW(SC.missReachByColor[h.color] || SC.missReachByColor.white, rng);
      },
      scenario(h, force) {
        const hit = h.hit, s = {};
        // ステップアップを先に決める（ハズレでも高い段ならリーチにする）
        s.stepup = hit ? (rng() < SC.stepupHitRate ? pickW(SC.stepupHit, rng) : 0) : (rng() < SC.stepupMissRate ? pickW(SC.stepupMiss, rng) : 0);
        s.reach = this.reach(h, force);
        if (s.reach === 'zenkaiten' || s.reach === 'ippatsu') s.stepup = 0;
        if (!hit && s.stepup >= SC.stepupForcesReach && s.reach === 'none') s.reach = 'normal';
        s.spType = force === 'battle' ? 'battle' : force === 'story' ? 'story' : (rng() < SC.spTypeBattle ? 'battle' : 'story');
        s.judge = rng() < SC.judgeButton ? 'button' : 'lever';
        const isReach = s.reach === 'normal' || s.reach === 'sp';
        if (isReach) s.telop = pickW(hit ? SC.telopHit : SC.telopMiss, rng);
        else s.telop = (hit && s.reach !== 'ippatsu' && rng() < SC.telopNoReachHitGold) ? 2 : (rng() < SC.telopNoReachWhite ? 0 : -1);
        s.telopStart = s.telop > 0 && rng() < SC.telopUpgrade ? s.telop - 1 : s.telop;
        const sp = s.reach === 'sp';
        s.cutin = sp ? pickW(hit ? SC.cutinHit : SC.cutinMiss, rng) : 0;
        s.goldTitle = sp && rng() < (hit ? SC.goldTitleHit : SC.goldTitleMiss);
        s.titleColor = s.goldTitle ? 'gold' : (rng() < (hit ? SC.redTitleHit : SC.redTitleMiss) ? 'red' : 'white');
        s.logoDrop = sp && rng() < (hit ? SC.logoDropHit : SC.logoDropMiss);
        s.scoop = null;
        if (hit) {
          if (h.route === 'scoop') s.scoop = { ok: true };
          else if (h.route === 'lever') s.scoop = rng() < SC.scoopFakeLever ? { ok: false } : null;
          else if (h.route === 'regular') s.scoop = rng() < SC.scoopFakeRegular ? { ok: false } : null;
          if (s.scoop) s.scoop.timing = (sp && rng() < SC.scoopPreRate) ? 'pre' : 'post';
        }
        return s;
      },
      missNums() { const l = d9(); let r = d9(); if (r === l) r = (r % 9) + 1; return [l, d9(), r]; },
      numbers(h) {
        if (h.hit) { h.reachNum = h.final; h.nums = [h.final, h.final, h.final]; return; }
        if (h.sc.reach !== 'none') { const n = d9(); h.reachNum = n; const c = rng() < 0.65 ? (n % 9) + 1 : ((n + 7) % 9) + 1; h.nums = [n, c, n]; }
        else h.nums = this.missNums();
      }
    };
    return L;
  }

  /**
   * 理論値。opts: { prob: 分母, preread }
   * cues の各項目は { hit: 当りでの出現率, miss: ハズレでの出現率, reliability: 出たときの大当り信頼度 }
   */
  function theory(cfg, opts) {
    opts = opts || {};
    const SC = cfg.scenario, HC = cfg.holdColor, S = cfg.spec;
    const denom = opts.prob || S.defaultProbDenom;
    const p = hitProb(cfg, denom), q = 1 - p;
    const colHit = opts.preread ? HC.hitPreread : HC.hit, colMiss = opts.preread ? HC.missPreread : HC.miss;
    // リーチの分布
    const hitR = r => share(SC.hitReach, v => v === r);
    const missR = r => { let t = 0; for (const [c, w] of colMiss) { const tot = colMiss.reduce((a, b) => a + b[1], 0); t += (w / tot) * share(SC.missReachByColor[c] || SC.missReachByColor.white, v => v === r); } return t; };
    const stepHigh = SC.stepupMissRate * share(SC.stepupMiss, v => v >= SC.stepupForcesReach);
    const miss = { sp: missR('sp'), normal: missR('normal') + missR('none') * stepHigh };
    miss.none = 1 - miss.sp - miss.normal;
    const hit = { sp: hitR('sp'), normal: hitR('normal'), zenkaiten: hitR('zenkaiten'), ippatsu: hitR('ippatsu') };
    const hitReach = hit.sp + hit.normal;
    const missReach = miss.sp + miss.normal;
    const goldTelop = v => v >= 2;
    const cue = (h, m) => ({ hit: h, miss: m, reliability: p * h / (p * h + q * m || 1) });
    const cues = {
      '金テロップ以上': cue(hitReach * share(SC.telopHit, goldTelop) + (1 - hitReach - hit.ippatsu) * SC.telopNoReachHitGold, missReach * share(SC.telopMiss, goldTelop)),
      '金カットイン': cue(hit.sp * share(SC.cutinHit, v => v === 2), miss.sp * share(SC.cutinMiss, v => v === 2)),
      '金タイトル': cue(hit.sp * SC.goldTitleHit, miss.sp * SC.goldTitleMiss),
      '役物落下': cue(hit.sp * SC.logoDropHit, miss.sp * SC.logoDropMiss),
      '金保留以上': cue(share(colHit, c => COLOR_RANK[c] >= 4), share(colMiss, c => COLOR_RANK[c] >= 4)),
      '赤保留': cue(share(colHit, c => c === 'red'), share(colMiss, c => c === 'red')),
      // 全回転・一発告知ではステップアップを出さない
      'ステップ5': cue(hitReach * SC.stepupHitRate * share(SC.stepupHit, v => v === 5), SC.stepupMissRate * share(SC.stepupMiss, v => v === 5)),
      'SPリーチ': cue(hit.sp, miss.sp),
      'リーチ': cue(hitReach, missReach)
    };
    const c = continuation(cfg);
    const chains = 1 / (1 - c);
    const per = cfg.spec.countPerRound * cfg.payout.attacker;
    return {
      hitThreshold: threshold(cfg, denom), hitProb: p, hitDenom: 1 / p,
      rushThreshold: rushThreshold(cfg), rushProb: rushProb(cfg), rushDenom: 1 / rushProb(cfg),
      continuation: c, expectedChains: chains,
      feverRate: S.feverRate,
      payoutFever: S.rounds.fever * per, payoutRegular: S.rounds.regular * per,
      // 初当り1回あたりの期待出玉（オーバー入賞は含めない）
      payoutPerFirstHit: S.feverRate * S.rounds.fever * per * chains + (1 - S.feverRate) * S.rounds.regular * per,
      reach: { hit, miss }, cues
    };
  }

  PG.Spec = { COLOR_RANK, pickW, share, threshold, rushThreshold, hitProb, rushProb, continuation, createLottery, theory };
})(typeof globalThis !== 'undefined' ? globalThis : this);

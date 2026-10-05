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
  // 図柄は3×3。ラインごとに [左の段, 中の段, 右の段]（0=上 1=中 2=下）
  const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
  const LINE_NAMES = ['上段', '中段', '下段', '右下がり', '右上がり'];

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

  /** 表から k 個を重複なしで順に引いたとき、x が含まれる確率（抽選の引き方と同じ） */
  function pIncl(table, exclude, k, x) {
    if (k <= 0) return 0;
    let tot = 0; for (const [n, w] of table) if (!exclude.includes(n)) tot += w;
    if (!tot) return 0;
    let p = 0;
    for (const [n, w] of table) {
      if (exclude.includes(n) || !w) continue;
      p += (w / tot) * (n === x ? 1 : pIncl(table, exclude.concat(n), k - 1, x));
    }
    return p;
  }
  /** 表から k 個を重複なしで引いたとき、pred を満たすものが1つも無い確率 */
  function pNone(table, exclude, k, pred) {
    if (k <= 0) return 1;
    let tot = 0; for (const [n, w] of table) if (!exclude.includes(n)) tot += w;
    if (!tot) return 1;
    let p = 0;
    for (const [n, w] of table) { if (exclude.includes(n) || !w || pred(n)) continue; p += (w / tot) * pNone(table, exclude.concat(n), k - 1, pred); }
    return p;
  }

  function createLottery(cfg, rng) {
    const S = cfg.spec, SC = cfg.scenario, HC = cfg.holdColor, TP = cfg.tenpai;
    const d9 = () => 1 + (rng() * 9 | 0);
    const pickFrom = (table, exclude) => pickW(table.filter(([n]) => !exclude.includes(n)), rng);
    /** 列の空き(0)を、列の中で重ならない数字で埋める */
    // 乱数で決めた数字が使用済みなら次の数字へ（乱数しだいで終わらないループにしない）
    const fill = col => { for (let r = 0; r < 3; r++) if (!col[r]) { let n = d9(); while (col.includes(n)) n = (n % 9) + 1; col[r] = n; } return col; };
    /** L と R で、lines 以外のラインがテンパイしていないか */
    const onlyLines = (L, R, lines) => LINES.every((ln, i) => lines.includes(i) || L[ln[0]] !== R[ln[2]]);
    /**
     * 3×3 の図柄を作る。lines: [{ line, num }]（テンパイするラインと図柄）, win: 揃うライン（-1 ならハズレ）
     * 返り値 { cols: [左, 中, 右], lineUp: 右リールの途中の列（ライン増加リーチ用）| null }
     */
    function grid(lines, win, lineUp) {
      const ids = lines.map(l => l.line);
      let L, R;
      for (let tries = 0; ; tries++) {
        L = [0, 0, 0]; R = [0, 0, 0];
        for (const { line, num } of lines) { L[LINES[line][0]] = num; R[LINES[line][2]] = num; }
        fill(L); fill(R);
        if (onlyLines(L, R, ids)) break;
        if (tries > 500) throw new Error('図柄が作れない');
      }
      // 中リール: 当りラインだけ揃える。ハズレは本命ラインの図柄を1コマずらした位置に置く（惜しい止まり方）
      let C;
      for (let tries = 0; ; tries++) {
        C = [0, 0, 0];
        if (win >= 0) C[LINES[win][1]] = lines.find(l => l.line === win).num;
        else if (lines.length && rng() < 0.7) { const m = lines[0], rc = LINES[m.line][1], adj = rc === 1 ? (rng() < 0.5 ? 0 : 2) : 1; C[adj] = m.num; }
        fill(C);
        if (lines.every(l => l.line === win || C[LINES[l.line][1]] !== l.num)) break;
        if (tries > 500) throw new Error('中図柄が作れない');
      }
      // ライン増加リーチ: 右リールを止め直すたびに1本ずつテンパイが増える
      let steps = null;
      if (lineUp && lines.length > 1) {
        steps = [];
        for (let k = 1; k < lines.length; k++) {
          const keep = ids.slice(0, k);
          for (let tries = 0; ; tries++) {
            const Rk = [0, 0, 0];
            for (const { line, num } of lines.slice(0, k)) Rk[LINES[line][2]] = num;
            fill(Rk);
            if (onlyLines(L, Rk, keep)) { steps.push(Rk); break; }
            if (tries > 500) throw new Error('ライン増加の図柄が作れない');
          }
        }
      }
      return { cols: [L, C, R], lineUp: steps };
    }
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
        if (h.hit) { h.final = rng() < R.sevenRate ? 7 : d9(); this.setGrid(h, [{ line: 1, num: h.final }], 1, false); }
        else this.setGrid(h, [], -1, false);
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
          h.final = h.route === '7direct' ? 7 : pickW(h.route === 'regular' ? TP.hitNum.regular : TP.hitNum.promote, rng);
        }
        const pre = !!settings.preread;
        h.color = pickW(h.hit ? (pre ? HC.hitPreread : HC.hit) : (pre ? HC.missPreread : HC.miss), rng);
        h.sc = this.scenario(h, force);
        this.numbers(h, force);
        if (h.hit && (force === 'sakibare' || rng() < (settings.sakibare || 0))) { h.sakibare = true; if (COLOR_RANK[h.color] < 3) h.color = 'red'; }
      },
      reach(h, force) {
        if (h.hit) {
          if (force === 'zenkaiten' || force === 'ippatsu') return force;
          if (force === 'battle' || force === 'story' || force === 'scoop' || force === 'lever' || force === 'double' || force === 'lineup') return 'sp';
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
        else s.telop = (hit && s.reach !== 'ippatsu' && rng() < SC.telopNoReachHitGold) ? 4 : (rng() < SC.telopNoReachWhite ? 0 : -1);
        // 一段か二段下の色で出てから昇格する（白→青→緑→赤→金→虹）
        s.telopStart = s.telop > 0 && rng() < SC.telopUpgrade ? Math.max(0, s.telop - 1 - (rng() < 0.5 ? 1 : 0)) : s.telop;
        const sp = s.reach === 'sp';
        s.cutin = sp ? pickW(hit ? SC.cutinHit : SC.cutinMiss, rng) : -1;
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
      setGrid(h, lines, win, lineUp) {
        const g = grid(lines, win, lineUp);
        h.lines = lines; h.win = win; h.cols = g.cols; h.lineUp = g.lineUp;
        h.tenpai = lines.map(l => l.num);
        h.reachNum = win >= 0 ? h.final : (lines.length ? lines[0].num : 0);
      },
      /** テンパイライン数・ライン・図柄を決めて3×3を作る */
      numbers(h, force) {
        const s = h.sc, reach = s.reach === 'normal' || s.reach === 'sp';
        if (h.hit && !reach) { this.setGrid(h, [{ line: 1, num: h.final }], 1, false); return; } // 全回転・一発告知
        if (!reach) { this.setGrid(h, [], -1, false); return; }
        // 演出チェック: double=ダブルテン、lineup=トリプルまで増えるライン増加リーチ
        const n = force === 'lineup' ? 3 : force === 'double' ? 2 : pickW(h.hit ? TP.linesHit : TP.linesMiss, rng);
        const set = pickW(TP.lineSets[n], rng);
        const nums = [];
        if (h.hit) {
          const winAt = rng() * n | 0;
          for (let i = 0; i < n; i++) nums.push(i === winAt ? h.final : 0);
          for (let i = 0; i < n; i++) if (!nums[i]) nums[i] = pickFrom(TP.extraHit, nums.concat(h.final));
          this.setGrid(h, set.map((line, i) => ({ line, num: nums[i] })), set[winAt], force === 'lineup' || (force !== 'double' && n > 1 && rng() < TP.lineUpHit));
        } else {
          for (let i = 0; i < n; i++) nums.push(pickFrom(TP.missNum, nums));
          this.setGrid(h, set.map((line, i) => ({ line, num: nums[i] })), -1, n > 1 && rng() < TP.lineUpMiss);
        }
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
    const goldTelop = v => v >= 4;
    const cue = (h, m) => ({ hit: h, miss: m, reliability: p * h / (p * h + q * m || 1) });
    const cues = {
      '金テロップ以上': cue(hitReach * share(SC.telopHit, goldTelop) + (1 - hitReach - hit.ippatsu) * SC.telopNoReachHitGold, missReach * share(SC.telopMiss, goldTelop)),
      '金カットイン以上': cue(hit.sp * share(SC.cutinHit, v => v >= 4), miss.sp * share(SC.cutinMiss, v => v >= 4)),
      '赤カットイン': cue(hit.sp * share(SC.cutinHit, v => v === 3), miss.sp * share(SC.cutinMiss, v => v === 3)),
      '金タイトル': cue(hit.sp * SC.goldTitleHit, miss.sp * SC.goldTitleMiss),
      '役物落下': cue(hit.sp * SC.logoDropHit, miss.sp * SC.logoDropMiss),
      '金保留以上': cue(share(colHit, c => COLOR_RANK[c] >= 4), share(colMiss, c => COLOR_RANK[c] >= 4)),
      '赤保留': cue(share(colHit, c => c === 'red'), share(colMiss, c => c === 'red')),
      // 全回転・一発告知ではステップアップを出さない
      'ステップ5': cue(hitReach * SC.stepupHitRate * share(SC.stepupHit, v => v === 5), SC.stepupMissRate * share(SC.stepupMiss, v => v === 5)),
      'SPリーチ': cue(hit.sp, miss.sp),
      ...tenpaiCues(cfg, hitReach, missReach, cue),
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

  /** テンパイ図柄とライン数の信頼度（抽選の引き方と同じ計算） */
  function tenpaiCues(cfg, hitReach, missReach, cue) {
    const S = cfg.spec, TP = cfg.tenpai;
    const w7 = share(S.feverRoutes, r => r === '7direct');
    const routes = [[S.feverRate * w7, [[7, 1]]], [S.feverRate * (1 - w7), TP.hitNum.promote], [1 - S.feverRate, TP.hitNum.regular]];
    const lnH = TP.linesHit, lnM = TP.linesMiss;
    const tot = t => t.reduce((a, b) => a + b[1], 0);
    // 当りで pred(テンパイ図柄の集合) が成り立つ確率。f=当り図柄、残り n-1 本は extraHit から
    const hitP = (withF, extra) => { let p = 0; for (const [pr, tbl] of routes) for (const [f, wf] of tbl) for (const [n, wn] of lnH) p += pr * (wf / tot(tbl)) * (wn / tot(lnH)) * (withF(f) ? 1 : extra(f, n - 1)); return p; };
    const missP = fn => { let p = 0; for (const [n, wn] of lnM) p += (wn / tot(lnM)) * fn(n); return p; };
    const out = {};
    for (let x = 1; x <= 9; x++) {
      out[x + 'テン'] = cue(hitReach * hitP(f => f === x, (f, k) => pIncl(TP.extraHit, [f], k, x)), missReach * missP(n => pIncl(TP.missNum, [], n, x)));
    }
    const odd = n => n % 2 === 1, even = n => n % 2 === 0;
    out['奇数テン'] = cue(hitReach * hitP(odd, (f, k) => 1 - pNone(TP.extraHit, [f], k, odd)), missReach * missP(n => 1 - pNone(TP.missNum, [], n, odd)));
    out['偶数テン'] = cue(hitReach * hitP(even, (f, k) => 1 - pNone(TP.extraHit, [f], k, even)), missReach * missP(n => 1 - pNone(TP.missNum, [], n, even)));
    const nShare = (t, pred) => share(t, pred);
    out['ダブルテンパイ以上'] = cue(hitReach * nShare(lnH, n => n >= 2), missReach * nShare(lnM, n => n >= 2));
    out['トリプルテンパイ'] = cue(hitReach * nShare(lnH, n => n >= 3), missReach * nShare(lnM, n => n >= 3));
    out['ライン増加リーチ'] = cue(hitReach * nShare(lnH, n => n >= 2) * TP.lineUpHit, missReach * nShare(lnM, n => n >= 2) * TP.lineUpMiss);
    return out;
  }

  PG.Spec = { COLOR_RANK, LINES, LINE_NAMES, pIncl, pNone, pickW, share, threshold, rushThreshold, hitProb, rushProb, continuation, createLottery, theory };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/**
 * 道具（竿・糸・エサ／ルアー）。純粋データと計算のみ。
 *
 * 効果の分担を混ぜないこと:
 *   竿  … 巻き取り速度（＝取り込みが速い）と合わせの猶予
 *   糸  … ラインブレイクの閾値（＝強く巻ける）
 *   エサ… ヒットまでの待ち時間・レア寄せ・大物寄せ
 * どれか1つで全部が良くなると、強化の選択が意味を失う。
 */
(function (global) {
  'use strict';

  // level は 1 始まり。cost は「その段階へ上げるのに必要なポイント」。
  var RODS = [
    { level: 1, name: '竹の延べ竿',   cost: 0,    reelRate: 1.00, reactionBonusMs: 0,   desc: '素朴だが確かな一本。' },
    { level: 2, name: 'グラス竿',     cost: 250,  reelRate: 1.08, reactionBonusMs: 150, desc: '粘りがあり、合わせがやさしい。' },
    { level: 3, name: 'カーボン竿',   cost: 700,  reelRate: 1.18, reactionBonusMs: 300, desc: '軽く、感度が高い。' },
    { level: 4, name: 'オフショア竿', cost: 1800, reelRate: 1.30, reactionBonusMs: 450, desc: '大物を想定した強靭な設計。' },
    { level: 5, name: '伝説の竿',     cost: 4500, reelRate: 1.45, reactionBonusMs: 650, desc: '深海の主にも臆さない。' }
  ];

  var LINES = [
    { level: 1, name: 'ナイロン2号', cost: 0,    breakAt: 0.80, desc: '標準的な強度。' },
    { level: 2, name: 'ナイロン3号', cost: 250,  breakAt: 0.84, desc: '少しだけ強く巻ける。' },
    { level: 3, name: 'フロロ4号',   cost: 700,  breakAt: 0.88, desc: '根ズレに強い。' },
    { level: 4, name: 'PE 2号',      cost: 1800, breakAt: 0.92, desc: '伸びが少なく力が伝わる。' },
    { level: 5, name: '特製PE 4号',  cost: 4500, breakAt: 0.96, desc: 'ほとんど切れない。' }
  ];

  // rareBoost は Fish.lureFactor 経由で stars>=3 の魚にだけ効く。
  var LURES = [
    { id: 'none',   name: '素エサ',       cost: 0,   waitMul: 1.00, rareBoost: 1.0, bigBias: 0.0, desc: 'いつでも使える。消費しない。' },
    { id: 'shrimp', name: 'オキアミ',     cost: 30,  waitMul: 0.60, rareBoost: 1.0, bigBias: 0.0, desc: 'アタリが早い。手返し重視。' },
    { id: 'jig',    name: 'メタルジグ',   cost: 80,  waitMul: 0.90, rareBoost: 1.2, bigBias: 0.6, desc: '同じ魚でもサイズが伸びる。' },
    { id: 'glow',   name: '夜光ルアー',   cost: 150, waitMul: 0.85, rareBoost: 2.5, bigBias: 0.2, desc: 'レアな魚を強く寄せる。' },
    { id: 'chum',   name: '秘伝の撒き餌', cost: 300, waitMul: 0.55, rareBoost: 2.5, bigBias: 0.8, desc: '全部入り。ただし高い。' }
  ];

  var LURE_BY_ID = {};
  for (var i = 0; i < LURES.length; i++) LURE_BY_ID[LURES[i].id] = LURES[i];

  function clampIndex(list, level) {
    var lv = Math.round(level || 1);
    if (lv < 1) lv = 1;
    if (lv > list.length) lv = list.length;
    return lv - 1;
  }

  function rod(level) { return RODS[clampIndex(RODS, level)]; }
  function line(level) { return LINES[clampIndex(LINES, level)]; }
  function lure(id) { return LURE_BY_ID[id] || LURE_BY_ID.none; }

  function maxLevel(kind) { return (kind === 'rod' ? RODS : LINES).length; }

  /** 次段階のコスト。最大なら null。opts.free なら 0。 */
  function upgradeCost(kind, level, opts) {
    var list = kind === 'rod' ? RODS : LINES;
    var next = Math.round(level || 1) + 1;
    if (next > list.length) return null;
    return (opts && opts.free) ? 0 : list[next - 1].cost;
  }

  /**
   * 強化を試みる。成功したら { ok:true, level, coins }、失敗なら { ok:false, reason }。
   * 状態は書き換えず新しい値を返す（呼び出し側が state に反映する）。
   * opts.free は管理者コードによる「全商品0円」モード。
   */
  function tryUpgrade(kind, level, coins, opts) {
    var cost = upgradeCost(kind, level, opts);
    if (cost == null) return { ok: false, reason: 'max' };
    if (coins < cost) return { ok: false, reason: 'poor', cost: cost };
    return { ok: true, level: Math.round(level) + 1, coins: coins - cost, cost: cost };
  }

  /** ルアーを count 個買う。opts.free なら 0円。 */
  function tryBuyLure(id, count, coins, opts) {
    var l = LURE_BY_ID[id];
    if (!l || l.cost === 0) return { ok: false, reason: 'unbuyable' };
    var n = Math.max(1, Math.round(count || 1));
    var total = ((opts && opts.free) ? 0 : l.cost) * n;
    if (coins < total) return { ok: false, reason: 'poor', cost: total };
    return { ok: true, count: n, coins: coins - total, cost: total };
  }

  global.FQ = global.FQ || {};
  global.FQ.Gear = {
    RODS: RODS, LINES: LINES, LURES: LURES,
    rod: rod, line: line, lure: lure,
    maxLevel: maxLevel,
    upgradeCost: upgradeCost,
    tryUpgrade: tryUpgrade,
    tryBuyLure: tryBuyLure
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

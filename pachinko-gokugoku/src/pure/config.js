/**
 * 調整値をすべてここに集める（データだけ。DOM・乱数・時計に触らない）→ globalThis.PG.CONFIG
 *
 * 数値を変えたら:
 *   npm run measure   … 理論値（このファイルから計算）とシミュレーションの実測値を並べて表示
 *   npm test          … targets の範囲に収まっているかをテストで確かめる
 *
 * 重みの表は [値, 重み] の配列。合計が 100 である必要はない（比で効く）。
 */
(function (G) {
  'use strict';
  const PG = G.PG || (G.PG = {});

  // 激熱演出がハズレで出るときの重み（当りでの重みと比べて桁違いに小さくして信頼度99%以上にする）
  const KM = 0.00005;

  PG.CONFIG = {
    // ------------------------------------------------------------------
    // スペック
    // ------------------------------------------------------------------
    spec: {
      randRange: 65536,                 // 乱数の範囲（0〜65535）。当りの個数 = round(範囲 / 分母)
      probDenoms: [319.6, 199, 99, 1],  // 設定モードで選べる大当り確率（分母）
      defaultProbDenom: 319.6,
      feverRate: 0.6,                   // 初当りのうち FEVER（10R + RUSH）になる割合。残りは 3R
      feverRoutes: [['7direct', 50], ['scoop', 30], ['lever', 20]], // FEVER の見せ方（7直揃い / スクープ昇格 / 一撃レバー昇格）
      rounds: { fever: 10, regular: 3 },
      countPerRound: 10,                // 1ラウンドのカウント
      rush: {
        stSpins: 100,                   // RUSH の回転数（ST）
        targetContinuation: 0.81,       // 狙う継続率。当りの個数はここから逆算する（spec.js の rushThreshold）
        sevenRate: 0.5,                 // RUSH 当りで 7 揃いにする割合
        iwakanRate: 0.85,               // 爆速モードで当りに違和感が付く割合
        iwakanTypes: ['bgmStop', 'lampOff', 'count777'],
        battleFakeRate: 0.1             // バトルモードでハズレでもバトルになる割合
      }
    },

    // ------------------------------------------------------------------
    // 出玉・発射
    // ------------------------------------------------------------------
    payout: { heso: 3, denchu: 1, general: 10, attacker: 15, lendBalls: 250, lendYen: 1000, yenPerBall: 4 },
    fire: { normal: 0.6, rush: 0.42, bonus: 0.2 },  // 発射間隔（秒）。大当り中は爆速消化
    denchu: { cycle: 1.8, open: 1.35 },             // RUSH 中の電チュー開閉（秒）
    holdMax: 4,

    // ------------------------------------------------------------------
    // 演出の振り分け（当否はすでに決まっている前提での表）
    // ------------------------------------------------------------------
    scenario: {
      KM,
      hitReach: [['sp', 80], ['normal', 8], ['zenkaiten', 4], ['ippatsu', 8]],
      // ハズレのリーチは保留の色で変わる（赤・金はSP確定）
      missReachByColor: {
        white: [['none', 84], ['normal', 12], ['sp', 4]],
        blue: [['none', 60], ['normal', 28], ['sp', 12]],
        green: [['none', 40], ['normal', 35], ['sp', 25]],
        red: [['sp', 1]],
        gold: [['sp', 1]]
      },
      spTypeBattle: 0.55,               // SP リーチがバトルになる割合（残りはストーリー）
      judgeButton: 0.55,                // 当否判定がデカボタンになる割合（残りは Vコンレバー）
      // 文字色のチャンスアップ（テロップ・SPの煽り文字）: 0=白 1=青 2=緑 3=赤 4=金 5=虹（金以上は激熱）
      telopHit: [[0, 6], [1, 8], [2, 10], [3, 30], [4, 32], [5, 14]],
      telopMiss: [[0, 55], [1, 25], [2, 14], [3, 6], [4, KM]],
      telopNoReachHitGold: 0.5,         // リーチなし当り（全回転以外）で金テロップが出る割合
      telopNoReachWhite: 0.1,           // リーチなしで白テロップが出る割合（ガセ）
      telopUpgrade: 0.55,               // テロップが一段下の色で出てから昇格する割合
      // カットイン: -1=なし 0=白 1=青 2=緑 3=赤 4=金 5=虹
      cutinHit: [[-1, 20], [0, 4], [1, 6], [2, 8], [3, 28], [4, 24], [5, 10]],
      cutinMiss: [[-1, 60], [0, 18], [1, 12], [2, 7], [3, 3], [4, KM]],
      goldTitleHit: 0.45, goldTitleMiss: KM,
      redTitleHit: 0.6, redTitleMiss: 0.25,
      logoDropHit: 0.3, logoDropMiss: KM,
      stepupHitRate: 0.5, stepupHit: [[3, 20], [4, 40], [5, 40]],
      stepupMissRate: 0.1, stepupMiss: [[1, 40], [2, 35], [3, 22], [4, 3]],
      stepupForcesReach: 3,             // ハズレでもこの段以上ならリーチにする
      scoopFakeLever: 0.4,              // 一撃レバー当りでスクープ失敗演出が出る割合
      scoopFakeRegular: 0.5,            // 3R 当りでスクープ失敗演出が出る割合
      scoopPreRate: 0.5                 // スクープを揃い直前（SP の判定中）にする割合
    },
    // テンパイ（図柄は3×3、ラインは 0=上段 1=中段 2=下段 3=右下がり 4=右上がり）
    tenpai: {
      linesHit: [[1, 55], [2, 30], [3, 15]],     // テンパイライン数（シングル / ダブル / トリプル）
      linesMiss: [[1, 90], [2, 8.5], [3, 1.5]],
      lineUpHit: 0.5, lineUpMiss: 0.15,          // 2ライン以上のとき、1本ずつ増えていく見せ方にする割合
      // ハズレのテンパイ図柄（1ラインごと）。偶数が多く、奇数は少なめ、3・5はまれ、7はほぼ無い（7テン＝当り濃厚）
      missNum: [[1, 10], [2, 20], [3, 0.1], [4, 20], [5, 0.1], [6, 20], [7, KM], [8, 20], [9, 5]],
      // 当りの図柄（7以外で揃う当り）。昇格する当り（スクープ・一撃レバー）は奇数、特に3・5が多い。3R は偶数が多い
      hitNum: {
        promote: [[1, 8], [2, 7], [3, 26], [4, 8], [5, 26], [6, 7], [8, 8], [9, 10]],
        regular: [[1, 10], [2, 17], [3, 8], [4, 17], [5, 8], [6, 17], [8, 17], [9, 6]]
      },
      // 当りのとき、当りライン以外のテンパイラインに出る図柄（7は出さない＝7テンは RUSH 直行の当りだけ）
      extraHit: [[1, 14], [2, 20], [3, 0.1], [4, 20], [5, 0.1], [6, 20], [8, 20], [9, 6]],
      // ライン数ごとのライン（左・右で同じ段を2回使わない組み合わせだけ）。先頭が最初にテンパイするライン
      lineSets: {
        1: [[[1], 70], [[0], 10], [[2], 10], [[3], 5], [[4], 5]],
        2: [[[1, 0], 30], [[1, 2], 30], [[0, 2], 15], [[3, 4], 25]],
        3: [[[1, 0, 2], 60], [[1, 3, 4], 40]]
      }
    },
    holdColor: {
      hit: [['white', 25], ['blue', 15], ['green', 15], ['red', 30], ['gold', 10], ['rainbow', 5]],
      miss: [['white', 88], ['blue', 8], ['green', 3.5], ['red', 0.5], ['gold', 0.00001]],
      hitPreread: [['white', 15], ['blue', 10], ['green', 15], ['red', 37], ['gold', 15], ['rainbow', 8]],
      missPreread: [['white', 94], ['blue', 4.5], ['green', 1.4], ['red', 0.1]],
      rushHit: [['white', 55], ['red', 25], ['gold', 12], ['rainbow', 8]],
      rushMiss: [['white', 97], ['blue', 3]],
      changeAtEntry: 0.45,              // 変化する保留のうち入賞時に変化する割合（残りは当該変動で変化）
      sakibareOptions: [0, 0.01, 0.1]   // 先バレ（当りのうち入賞時に先バレする割合）
    },

    // ------------------------------------------------------------------
    // 時間（秒）
    // ------------------------------------------------------------------
    timing: {
      normalSpin: [2, 3], fullSpin: [0.8, 1.1], reachSpin: 2.3, // 通常 / 保留満タン / リーチ前
      stopL: 0.45, stopR: 0.7,          // 変動時間に対する左・右の停止位置（左→右→中）
      stepupInterval: 0.55,
      normalReach: 3.6, spDevelop: 1.5, spEnter: 2.1,
      lineUp: 1.1,                      // テンパイライン増加の1本ごとの間隔
      sp: { title: 1.8, battleActs: [2.0, 2.9, 3.8, 4.7, 5.6], cutin: 3.4, telop: 4.6, logoDrop: 5.6, judge: 6.8 },
      judge: 3.6,
      scoop: { duration: 3.3, autoRate: 0.2, tapGain: 0.075, failCap: [0.5, 0.8] },
      zenkaiten: { freeze: 1.7, stop: 5.6, align: 8.4 },
      rushSpin: 0.5, rushIwakanSpin: 1.25,
      rushBattle: { acts: [0.7, 1.3, 1.9, 2.5], final: 3.1, result: 3.6, winEnd: 5.0, loseEnd: 4.6 },
      fanfare: 2.8,
      bonus: { roundTimeout: 30, overWindow: 0.22, interval: 0.6, ending: 2.6, leverAfterRound: 4, leverAuto: 6 },
      modeSelect: 12,
      lastChance: { duration: 5.5, holdRate: 0.42, autoRate: 0.09, failCap: [0.62, 0.9] },
      result: { closable: 1.6, auto: 12 }
    },
    result: { ranks: [[15000, '神', 'rainbow'], [5000, '一騎当千', 'gold'], [0, '凡人', 'silver']] },
    input: { uraTaps: 5, uraWindow: 1.5, uraHold: 0.6, skipHold: 1.5, doubleTap: 0.32 },

    // ------------------------------------------------------------------
    // 盤面の形（論理座標 720×1320）と物理
    // ------------------------------------------------------------------
    layout: {
      W: 720, H: 1320,
      lcd: { x: 134, y: 372, w: 452, h: 324, r: 40 },
      field: { top: 346, left: 30, right: 690, bottom: 992, arcR: 200, arcL: { x: 230, y: 546 }, arcRc: { x: 490, y: 546 }, rail: 4 },
      heso: { x0: 349, x1: 371, y0: 844, y1: 858 },
      general: { x0: 143, x1: 161, y0: 932, y1: 946 },
      denchu: { x: 640, y: 826, zone: { x0: 612, x1: 668, y0: 808, y1: 838 } },
      plate: { x1: 690, y1: 884, x2: 586, y2: 912 },
      attacker: { x0: 592, x1: 682 },
      innerWall: 586,
      road: { x1: 104, y1: 777, x2: 312, y2: 816 },
      mills: [{ x: 78, y: 738, r: 11, vr: 19, w: 3.2 }, { x: 640, y: 600, r: 11, vr: 19, w: -3.2 }],
      warpZone: { x0: 118, x1: 146, y0: 520, y1: 610 },
      stageDrop: { x: 344, w: 32, y: 704 }
    },
    physics: {
      ballR: 6, pinR: 3.2, gravity: 1150, substeps: 3, maxSpeed: 1400,
      pinGap: 19,                       // 横並びの釘の最小間隔（球が通れる幅）
      pinMargin: 17,                    // 壁・液晶から釘を離す距離（挟まり防止）
      restitution: { pin: 0.5, wall: 0.36, rail: 0.35, mill: 0.45, road: 0.25 },
      friction: { pin: 0.9, wall: 0.94, rail: 0.95, road: 0.999 },
      pinJitter: 0.3, millKick: 2.2,
      railSpeed: 1500, releaseSpeed: [200, 340],
      releaseLeft: [196, 226], releaseRight: [292, 318], // レールから離れる角度（度）
      warpRate: 0.6, warpTime: 0.85,
      stuckSpeed: 20, stuckTime: 2.5,
      poolSize: 72
    },

    // ------------------------------------------------------------------
    // 目標値（テストと npm run measure がこの範囲を確かめる）
    // ------------------------------------------------------------------
    targets: {
      continuation: [0.805, 0.815],     // RUSH 継続率（理論値）
      hesoRate: [1 / 9, 1 / 5],         // 左打ちの球がヘソに入る割合
      attackerCatch: 0.9,               // アタッカー開放中に右打ちの球が入る割合（以上）
      denchuCatch: 0.85,                // 電チュー開放中に右打ちの球が入る割合（以上）
      hotReliability: 0.99,             // 激熱演出の大当り信頼度（以上、1/319.6 のとき）
      tenpai35: [0.5, 0.7],             // 3・5テンパイの大当り信頼度
      sevenTen: 0.99,                   // 7テンパイの大当り信頼度（以上）。7テンの当りはすべて RUSH 直行
      feverRate: [0.58, 0.62]           // 初当りの FEVER 割合（実測）
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

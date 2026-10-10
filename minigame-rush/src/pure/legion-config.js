/**
 * 武器拾いレギオンの調整値（データだけ）。数値を変えたいときはまずここを探す。
 * 座標はワールド単位: x は 0〜5（盤面の5列ぶん）、y は手前 0 → 奥。盤面は y 0〜6、通路は y 6〜22。
 */
(function (G) {
  const MGR = G.MGR = G.MGR || {};
  const L = MGR.Legion = MGR.Legion || {};

  L.CONFIG = {
    world: { W: 5, boardRows: 6, fieldTop: 22, spawnY: 22.6, leakY: 6 },

    // 遠近法: z = y + z0、画面の y = horizon + A / z、x = 中央 + (x - 2.5) * B / z
    view: { w: 720, h: 1280, z0: 14, A: 25660, B: 2000, horizon: -583 },

    board: {
      cols: 5, rows: 6,
      shiftEvery: 5,          // 秒ごとに盤面が手前へ1段流れる
      fallSpeed: 9,           // 詰めるときの見た目の速さ（マス/秒）
      ownedWeight: 0.62,      // 新しい武器が「持っている英雄の武器」になる割合
      unlockedPool: 4         // 持っていない武器の候補は、ステージで出る檻の英雄の武器を優先
    },

    hero: {
      ammoMax: 4, maxHeroes: 12, maxTier: 4, idleReach: 1,
      tierDmg: [1, 2.3, 5.2, 11.5],
      tierRate: [1, 1.15, 1.3, 1.5],
      dragSpeedBot: 9         // ボットの指の速さ（マス/秒）
    },

    // dmg: 1発の威力 / every: 投げる間隔(秒) / speed: 弾速(単位/秒) / r: 当たり判定
    weapons: {
      sickle:   { name: '鎌',       dmg: 10, every: 0.36, speed: 13, r: 0.32, pierce: 2, spin: true },
      sword:    { name: '剣',       dmg: 27, every: 0.62, speed: 12, r: 0.3, pierce: 0 },
      staff:    { name: '杖',       dmg: 13, every: 0.46, speed: 10, r: 0.3, pierce: 0, homing: 3.2 },
      sling:    { name: 'パチンコ', dmg: 9,  every: 0.5,  speed: 13, r: 0.26, pierce: 0, aoe: 0.85, aoeDmg: 0.6 },
      bow:      { name: '弓',       dmg: 8,  every: 0.52, speed: 16, r: 0.24, pierce: 0, spread: [-0.16, 0, 0.16] },
      spear:    { name: '槍',       dmg: 7,  every: 0.42, speed: 21, r: 0.22, pierce: 99 },
      axe:      { name: '斧',       dmg: 18, every: 0.56, speed: 11, r: 0.55, pierce: 1, spin: true },
      bomb:     { name: '爆弾',     dmg: 26, every: 0.95, speed: 8,  r: 0.34, pierce: 0, aoe: 1.45, aoeDmg: 0.8 },
      shuriken: { name: '手裏剣',   dmg: 5,  every: 0.2,  speed: 18, r: 0.22, pierce: 0, bounce: 2, spin: true }
    },
    weaponOrder: ['sickle', 'sword', 'staff', 'sling', 'bow', 'spear', 'axe', 'bomb', 'shuriken'],

    heroes: {
      reaper:  { weapon: 'sickle',   names: ['死神', '大死神', '冥王', '終焉の神'],          color: '#6b46c1', accent: '#c4b5fd' },
      knight:  { weapon: 'sword',    names: ['騎士', '聖騎士', '英雄王', '天騎神'],          color: '#3b82f6', accent: '#e5e7eb' },
      mage:    { weapon: 'staff',    names: ['魔法使い', '大魔導師', '賢者', '星詠みの神'],  color: '#16a34a', accent: '#bbf7d0' },
      rascal:  { weapon: 'sling',    names: ['いたずら小僧', 'ガキ大将', '悪童王', '天下無双'], color: '#ea580c', accent: '#fde68a' },
      elf:     { weapon: 'bow',      names: ['エルフ', 'エルフの狩人', '森の守護者', '月弓の女神'], color: '#0d9488', accent: '#99f6e4' },
      lancer:  { weapon: 'spear',    names: ['槍兵', '竜騎兵', '槍聖', '天槍の神'],          color: '#b91c1c', accent: '#fecaca' },
      warrior: { weapon: 'axe',      names: ['戦士', '狂戦士', '覇王', '鬼神'],              color: '#92400e', accent: '#fcd34d' },
      bomber:  { weapon: 'bomb',     names: ['ボマー', '爆破職人', '破壊神の弟子', '破壊神'], color: '#374151', accent: '#f87171' },
      ninja:   { weapon: 'shuriken', names: ['忍者', '上忍', '影の頭領', '夜叉神'],          color: '#1e293b', accent: '#a5b4fc' }
    },
    heroOrder: ['reaper', 'knight', 'mage', 'rascal', 'elf', 'lancer', 'warrior', 'bomber', 'ninja'],
    starterHero: 'reaper',

    // hp: 基本HP / speed: 単位/秒 / r: 大きさ / leak: 拠点へのダメージ / coin: 倒したときのコイン
    enemies: {
      goblin:   { name: 'ゴブリン',         hp: 22,  speed: 0.95, r: 0.27, leak: 2, coin: 1, from: 1 },
      runner:   { name: '韋駄天ゴブリン',   hp: 13,  speed: 1.75, r: 0.25, leak: 2, coin: 1, from: 2 },
      orc:      { name: '重装オーク',       hp: 85,  speed: 0.62, r: 0.36, leak: 5, coin: 3, from: 3 },
      shield:   { name: '盾持ち',           hp: 40,  speed: 0.82, r: 0.3,  leak: 3, coin: 2, from: 5, armor: 5 },
      skeleton: { name: 'ガイコツ',         hp: 28,  speed: 0.9,  r: 0.27, leak: 2, coin: 2, from: 7, revive: 0.5 },
      slime:    { name: 'スライム',         hp: 44,  speed: 0.75, r: 0.32, leak: 3, coin: 2, from: 9, split: 2 },
      bat:      { name: 'コウモリ',         hp: 16,  speed: 1.3,  r: 0.24, leak: 2, coin: 1, from: 11, zigzag: 1.1 },
      ghost:    { name: 'ゴースト',         hp: 30,  speed: 0.85, r: 0.28, leak: 3, coin: 2, from: 13, phase: [2.4, 1.0] },
      shaman:   { name: '呪術師',           hp: 34,  speed: 0.7,  r: 0.28, leak: 3, coin: 3, from: 15, heal: [3, 1.6, 0.12] },
      bombgob:  { name: '爆弾ゴブリン',     hp: 26,  speed: 1.05, r: 0.28, leak: 9, coin: 2, from: 17 },
      minislime:{ name: 'ちびスライム',     hp: 18,  speed: 0.95, r: 0.22, leak: 1, coin: 0, from: 999 }
    },
    enemyOrder: ['goblin', 'runner', 'orc', 'shield', 'skeleton', 'slime', 'bat', 'ghost', 'shaman', 'bombgob'],

    bosses: {
      king:   { name: 'ゴブリンキング', hp: 1500, speed: 0.32, r: 0.85, leak: 60, coin: 40, summon: [6, 5] },
      gslime: { name: '巨大スライム',   hp: 1250, speed: 0.3,  r: 0.9,  leak: 60, coin: 40, split: 4 },
      dknight:{ name: '闇の騎士',       hp: 1300, speed: 0.3,  r: 0.8,  leak: 60, coin: 40, armor: 6, charge: [7, 1.2, 3] }
    },
    bossOrder: ['king', 'gslime', 'dknight'],

    // 拠点
    base: { hp: 100 },

    // ゲート。kind: good / bad。w: 出やすさ。v: 効果の値（配列なら抽選）
    gates: {
      heroes:   { kind: 'good', w: 16, label: '英雄の数', fmt: '+', v: [1, 2, 3] },
      atkspd:   { kind: 'good', w: 9,  label: '攻撃速度', fmt: 'x', v: [1.5, 2] },
      atk:      { kind: 'good', w: 9,  label: '攻撃力',   fmt: 'x', v: [1.5, 2] },
      pierce:   { kind: 'good', w: 5,  label: '貫通',     fmt: '+', v: [1] },
      multi:    { kind: 'good', w: 5,  label: '弾数',     fmt: '+', v: [1] },
      pspeed:   { kind: 'good', w: 4,  label: '弾速',     fmt: 'x', v: [1.5] },
      big:      { kind: 'good', w: 4,  label: '弾の大きさ', fmt: 'x', v: [1.5] },
      crit:     { kind: 'good', w: 4,  label: '会心率',   fmt: '+%', v: [15, 25] },
      wpn:      { kind: 'good', w: 5,  label: '威力',     fmt: 'x', v: [2] },      // 武器を1種類決めて、その威力
      ammo:     { kind: 'good', w: 3,  label: '弾を持てる数', fmt: '+', v: [2] },
      heal:     { kind: 'good', w: 4,  label: '拠点回復', fmt: '+', v: [25, 40] },
      barrier:  { kind: 'good', w: 3,  label: 'バリア',   fmt: '+', v: [5, 8] },
      fever:    { kind: 'good', w: 4,  label: '武器フィーバー', fmt: '', v: [0] },
      slow:     { kind: 'good', w: 4,  label: '敵の速さ', fmt: 'x', v: [0.8] },
      thunder:  { kind: 'good', w: 4,  label: '雷',       fmt: '', v: [0] },
      evolve:   { kind: 'good', w: 3,  label: '英雄の進化', fmt: '', v: [0] },
      coin:     { kind: 'good', w: 4,  label: 'コイン',   fmt: '+', v: [20, 50] },
      // わな
      atkDown:  { kind: 'bad',  w: 4,  label: '攻撃力',   fmt: 'x', v: [0.7] },
      spdDown:  { kind: 'bad',  w: 4,  label: '攻撃速度', fmt: 'x', v: [0.7] },
      horde:    { kind: 'bad',  w: 4,  label: '敵',       fmt: '+', v: [10, 16] },
      haste:    { kind: 'bad',  w: 3,  label: '敵の速さ', fmt: 'x', v: [1.25] },
      loseHero: { kind: 'bad',  w: 2,  label: '英雄の数', fmt: '-', v: [1] }
    },
    gate: { w: 1.9, h: 0.55, hpBase: 30, hpGrow: 1.045, hpPerValue: 0.35, badFrom: 4, critMul: 3 },
    cap: { atkspd: 6, atk: 12, multi: 4, pierce: 5, crit: 60, pspeed: 2.5, big: 2.5, slow: 0.45, haste: 2 },

    // ステージ
    stage: {
      count: 99,
      duration: 150,            // 雑魚が出てくる時間（秒）。最後にボス
      hpGrow: 1.044,            // ステージごとの敵HPの伸び
      countBase: 70, countGrow: 6, countMax: 260,
      gates: [7, 11],           // 1ステージのゲートの数（最小〜最大）
      cages: [2, 3],
      cageHp: 70, cageHpGrow: 1.05, cageTierFrom: [18, 40, 70],  // 檻の英雄が★2/★3/★4で出るステージ
      waveEvery: 10,            // 敵の群れの間隔(秒)の目安
      layoutsFrom: { A: 1, B: 4, C: 6, D: 8, E: 10 },
      star: [0.8, 0.4],         // 拠点HPの残りが 80% 以上で★3、40% 以上で★2
      clearCoin: 40, clearCoinGrow: 8
    },

    endless: { waveEvery: 9, gateEvery: 8, cageEvery: 38, bossEvery: 6, hpGrow: 1.075 },

    difficulty: {
      easy:   { name: 'かんたん',   hp: 0.7,  count: 0.8, speed: 0.9,  coin: 0.7, baseHp: 1.3 },
      normal: { name: 'ふつう',     hp: 1,    count: 1,   speed: 1,    coin: 1,   baseHp: 1 },
      hard:   { name: 'むずかしい', hp: 1.45, count: 1.2, speed: 1.12, coin: 1.6, baseHp: 1 }
    },

    // 永続強化。cost = base * grow^lv
    upgrades: {
      atk:    { name: '攻撃力',       desc: '全員の攻撃力 +10%', per: 0.1,  max: 30, base: 60,  grow: 1.18 },
      rate:   { name: '攻撃速度',     desc: '投げる速さ +5%',    per: 0.05, max: 20, base: 80,  grow: 1.22 },
      base:   { name: '拠点HP',       desc: '拠点HP +15',        per: 15,   max: 20, base: 50,  grow: 1.2 },
      start:  { name: '最初の英雄',   desc: '最初の英雄 +1体',   per: 1,    max: 3,  base: 300, grow: 3 },
      ammo:   { name: '弾を持てる数', desc: '持てる弾 +1',       per: 1,    max: 4,  base: 200, grow: 2.2 },
      greed:  { name: 'コイン獲得',   desc: 'もらえるコイン +10%', per: 0.1, max: 10, base: 120, grow: 1.35 }
    },
    upgradeOrder: ['atk', 'rate', 'base', 'start', 'ammo', 'greed'],

    fx: { maxParticles: 260, maxTexts: 40 }
  };
})(globalThis);

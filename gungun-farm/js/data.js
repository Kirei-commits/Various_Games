/**
 * 農園のデータ定義。純データで、他のどのファイルにも依存しない。
 *
 * このゲームの約束は「どんなに長くても10秒で出来上がる」こと。
 * 秒数は必ず MAX_SEC 以下にする（tests/lint.mjs が検査する）。
 */
(function (global) {
  'use strict';

  /** 待ち時間の上限。この数字がこのゲームの存在理由なので、超えるものは作らない。 */
  const MAX_SEC = 10;

  /**
   * 倉庫に入るもの。sell は1個あたりの売値。
   * 作物も加工品も同じ器に入れる（注文はどちらも指定できる）。
   */
  const ITEMS = {
    wheat:   { name: 'こむぎ',       emoji: '🌾', sell: 3 },
    carrot:  { name: 'にんじん',     emoji: '🥕', sell: 6 },
    corn:    { name: 'とうもろこし', emoji: '🌽', sell: 11 },
    soy:     { name: 'だいず',       emoji: '🫘', sell: 18 },
    cane:    { name: 'さとうきび',   emoji: '🎋', sell: 26 },
    berry:   { name: 'いちご',       emoji: '🍓', sell: 36 },
    pumpkin: { name: 'かぼちゃ',     emoji: '🎃', sell: 47 },
    grape:   { name: 'ぶどう',       emoji: '🍇', sell: 60 },

    flour:   { name: 'こむぎこ',     emoji: '🥣', sell: 12 },
    feed:    { name: 'しりょう',     emoji: '🧺', sell: 22 },
    egg:     { name: 'たまご',       emoji: '🥚', sell: 30 },
    bread:   { name: 'パン',         emoji: '🍞', sell: 34 },
    popcorn: { name: 'ポップコーン', emoji: '🍿', sell: 32 },
    milk:    { name: 'ミルク',       emoji: '🥛', sell: 56 },
    juice:   { name: 'ジュース',     emoji: '🧃', sell: 88 },
    cheese:  { name: 'チーズ',       emoji: '🧀', sell: 130 },
    jam:     { name: 'ジャム',       emoji: '🍯', sell: 146 },
    cake:    { name: 'ケーキ',       emoji: '🍰', sell: 210 },
    pie:     { name: 'パイ',         emoji: '🥧', sell: 200 }
  };

  /**
   * 畑に植えられるもの。
   * sec = 育つ秒数 / cost = タネ代 / xp = 1個収穫したときの経験値 / level = 解放レベル。
   * 売値はタネ代のおよそ2〜3倍。畑だけでも黒字だが、儲けの本体は加工品と注文にある。
   */
  const CROPS = [
    { id: 'wheat',   sec: 2, cost: 1,  xp: 1, level: 1 },
    { id: 'carrot',  sec: 3, cost: 3,  xp: 2, level: 1 },
    { id: 'corn',    sec: 4, cost: 6,  xp: 3, level: 2 },
    { id: 'soy',     sec: 5, cost: 10, xp: 4, level: 4 },
    { id: 'cane',    sec: 6, cost: 15, xp: 5, level: 6 },
    { id: 'berry',   sec: 7, cost: 21, xp: 6, level: 8 },
    { id: 'pumpkin', sec: 8, cost: 28, xp: 7, level: 10 },
    { id: 'grape',   sec: 9, cost: 36, xp: 8, level: 12 }
  ];

  /**
   * 加工機。
   * 1台につきレシピは1つだけにしてある。カードを押す意味が「作る」か「取り出す」の
   * 2つに収まり、選ばせる手間（＝誤タップ）が生まれない。
   * slots = 同時に仕込める数（待ち行列の長さ）。
   */
  const MACHINES = [
    { id: 'mill',     name: 'せいふんき',       emoji: '⚙️', level: 1,  price: 0,    slots: 3,
      recipe: { out: 'flour',   in: { wheat: 2 },                  sec: 3,  xp: 3 } },
    { id: 'feedmill', name: 'しりょう工場',     emoji: '🧺', level: 2,  price: 80,   slots: 3,
      recipe: { out: 'feed',    in: { wheat: 2, corn: 1 },         sec: 3,  xp: 4 } },
    { id: 'coop',     name: 'にわとり小屋',     emoji: '🐔', level: 3,  price: 150,  slots: 3,
      recipe: { out: 'egg',     in: { feed: 1 },                   sec: 4,  xp: 5 } },
    { id: 'bakery',   name: 'パンがま',         emoji: '🍞', level: 4,  price: 260,  slots: 3,
      recipe: { out: 'bread',   in: { flour: 2 },                  sec: 4,  xp: 6 } },
    { id: 'popper',   name: 'ポップコーンき',   emoji: '🍿', level: 5,  price: 380,  slots: 3,
      recipe: { out: 'popcorn', in: { corn: 2 },                   sec: 4,  xp: 6 } },
    { id: 'cowshed',  name: 'うし小屋',         emoji: '🐄', level: 6,  price: 700,  slots: 2,
      recipe: { out: 'milk',    in: { feed: 2 },                   sec: 5,  xp: 8 } },
    { id: 'juicer',   name: 'ジューサー',       emoji: '🧃', level: 8,  price: 1100,  slots: 2,
      recipe: { out: 'juice',   in: { berry: 2 },                  sec: 5,  xp: 9 } },
    { id: 'dairy',    name: 'チーズがま',       emoji: '🧀', level: 9,  price: 1600,  slots: 2,
      recipe: { out: 'cheese',  in: { milk: 2 },                   sec: 7,  xp: 12 } },
    { id: 'cakeshop', name: 'ケーキ工房',       emoji: '🍰', level: 11, price: 2400, slots: 2,
      recipe: { out: 'cake',    in: { flour: 1, egg: 1, milk: 1 }, sec: 8,  xp: 16 } },
    { id: 'pieshop',  name: 'パイ工房',         emoji: '🥧', level: 12, price: 3000, slots: 2,
      recipe: { out: 'pie',     in: { pumpkin: 2, flour: 1 },      sec: 10, xp: 18 } },
    { id: 'jampot',   name: 'ジャムなべ',       emoji: '🍯', level: 13, price: 3600, slots: 2,
      recipe: { out: 'jam',     in: { grape: 2 },                  sec: 6,  xp: 14 } }
  ];

  /**
   * 畑の増設。最初の6マスは持っている。7マス目以降は買う。
   * レベルでも止めているのは、コインが余った瞬間に一気に広げて
   * 「手が足りない畑」だけが残るのを防ぐため。
   */
  const FIELDS_AT_START = 6;
  const FIELD_SLOTS = 12;
  const FIELD_UPGRADES = [
    { price: 120,  level: 3 },
    { price: 240,  level: 5 },
    { price: 420,  level: 7 },
    { price: 900,  level: 9 },
    { price: 1500, level: 11 },
    { price: 2400, level: 13 }
  ];

  /** 倉庫。いっぱいだと収穫も取り出しもできなくなるので、広げるか売る。 */
  const BARN_AT_START = 30;
  const BARN_STEP = 12;
  const barnPrice = (upgrades) => Math.round(70 * Math.pow(1.75, upgrades));

  /**
   * 次のレベルまでに必要な経験値。
   * 係数は当て推量ではなく、`npm run simulate` で測った獲得ペースから逆算している。
   * （最初の版は 12*level^1.35 で、手を止めずに回すと**6分でレベル20**に着いてしまった）
   * いまの狙い: レベル2が約10秒、レベル10が約4分半、レベル20が約17分。
   */
  const xpFor = (level) => Math.round(42 * Math.pow(level, 1.35)) + 30;

  const MAX_LEVEL = 20;

  const item = (id) => ITEMS[id] || null;
  const crop = (id) => CROPS.find((c) => c.id === id) || null;
  const machine = (id) => MACHINES.find((m) => m.id === id) || null;

  /** そのレベルで植えられる作物 */
  const cropsAt = (level) => CROPS.filter((c) => c.level <= level);

  /** そのレベルで買える（＝店に並ぶ）加工機 */
  const machinesAt = (level) => MACHINES.filter((m) => m.level <= level);

  /** レベルが上がったときに新しく解放されたもの。レベルアップの表示に使う。 */
  function unlockedAt(level) {
    const out = [];
    for (const c of CROPS) if (c.level === level) out.push({ kind: 'crop', id: c.id, name: ITEMS[c.id].name, emoji: ITEMS[c.id].emoji });
    for (const m of MACHINES) if (m.level === level && m.price > 0) out.push({ kind: 'machine', id: m.id, name: m.name, emoji: m.emoji });
    FIELD_UPGRADES.forEach((f) => { if (f.level === level) out.push({ kind: 'field', id: 'field', name: '畑の増設', emoji: '🟩' }); });
    return out;
  }

  global.GF = global.GF || {};
  global.GF.Data = {
    MAX_SEC, ITEMS, CROPS, MACHINES,
    FIELDS_AT_START, FIELD_SLOTS, FIELD_UPGRADES,
    BARN_AT_START, BARN_STEP, barnPrice,
    xpFor, MAX_LEVEL,
    item, crop, machine, cropsAt, machinesAt, unlockedAt
  };
})(typeof window !== 'undefined' ? window : globalThis);

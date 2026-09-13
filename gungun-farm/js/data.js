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
    wheat:   { name: 'こむぎ',       emoji: '🌾', sell: 11 },
    carrot:  { name: 'にんじん',     emoji: '🥕', sell: 16 },
    corn:    { name: 'とうもろこし', emoji: '🌽', sell: 21 },
    soy:     { name: 'だいず',       emoji: '🫘', sell: 26 },
    cane:    { name: 'さとうきび',   emoji: '🎋', sell: 32 },
    berry:   { name: 'いちご',       emoji: '🍓', sell: 35 },
    pumpkin: { name: 'かぼちゃ',     emoji: '🎃', sell: 40 },
    grape:   { name: 'ぶどう',       emoji: '🍇', sell: 45 },

    flour:   { name: 'こむぎこ',     emoji: '🥣', sell: 27 },
    feed:    { name: 'しりょう',     emoji: '🧺', sell: 53 },
    egg:     { name: 'たまご',       emoji: '🥚', sell: 67 },
    bread:   { name: 'パン',         emoji: '🍞', sell: 69 },
    popcorn: { name: 'ポップコーン', emoji: '🍿', sell: 53 },
    milk:    { name: 'ミルク',       emoji: '🥛', sell: 138 },
    juice:   { name: 'ジュース',     emoji: '🧃', sell: 91 },
    cheese:  { name: 'チーズ',       emoji: '🧀', sell: 374 },
    jam:     { name: 'ジャム',       emoji: '🍯', sell: 120 },
    cake:    { name: 'ケーキ',       emoji: '🍰', sell: 321 },
    pie:     { name: 'パイ',         emoji: '🥧', sell: 154 },

    // レベル14以降。ここから先が空っぽだと「どんどん増える」が途中で止まる
    tomato:   { name: 'トマト',       emoji: '🍅', sell: 61 },
    olive:    { name: 'オリーブ',     emoji: '🫒', sell: 75 },
    melon:    { name: 'メロン',       emoji: '🍈', sell: 91 },
    ketchup:  { name: 'ケチャップ',   emoji: '🥫', sell: 155 },
    pasta:    { name: 'パスタ',       emoji: '🍝', sell: 153 },
    oil:      { name: 'オリーブ油',   emoji: '🧴', sell: 199 },
    pizza:    { name: 'ピザ',         emoji: '🍕', sell: 785 },
    icecream: { name: 'アイス',       emoji: '🍨', sell: 508 },
    salad:    { name: 'サラダ',       emoji: '🥗', sell: 359 },
    sandwich: { name: 'サンド',       emoji: '🥪', sell: 683 }
  };

  /**
   * 畑に植えられるもの。
   * sec = 育つ秒数 / cost = タネ代 / xp = 1個収穫したときの経験値 / level = 解放レベル。
   * 売値はタネ代のおよそ2〜3倍。畑だけでも黒字だが、儲けの本体は加工品と注文にある。
   */
  const CROPS = [
    { id: 'wheat',     sec: 2, cost:  3, xp:  1, level:  1 },
    { id: 'carrot',    sec: 3, cost:  5, xp:  2, level:  1 },
    { id: 'corn',      sec: 4, cost:  7, xp:  3, level:  2 },
    { id: 'soy',       sec: 5, cost: 10, xp:  4, level:  4 },
    { id: 'cane',      sec: 6, cost: 14, xp:  5, level:  6 },
    { id: 'berry',     sec: 7, cost: 17, xp:  6, level:  8 },
    { id: 'pumpkin',   sec: 8, cost: 21, xp:  7, level: 10 },
    { id: 'grape',     sec: 9, cost: 26, xp:  8, level: 12 },
    { id: 'tomato',    sec: 9, cost: 42, xp:  9, level: 14 },
    { id: 'olive',     sec: 9, cost: 56, xp: 10, level: 16 },
    { id: 'melon',     sec: 9, cost: 72, xp: 11, level: 18 }
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
    { id: 'feedmill', name: 'しりょう工場',     emoji: '🧺', level: 2,  price: 160,   slots: 3,
      recipe: { out: 'feed',    in: { wheat: 2, corn: 1 },         sec: 3,  xp: 4 } },
    { id: 'coop',     name: 'にわとり小屋',     emoji: '🐔', level: 3,  price: 300,  slots: 3,
      recipe: { out: 'egg',     in: { feed: 1 },                   sec: 4,  xp: 5 } },
    { id: 'bakery',   name: 'パンがま',         emoji: '🍞', level: 4,  price: 520,  slots: 3,
      recipe: { out: 'bread',   in: { flour: 2 },                  sec: 4,  xp: 6 } },
    { id: 'popper',   name: 'ポップコーンき',   emoji: '🍿', level: 5,  price: 760,  slots: 3,
      recipe: { out: 'popcorn', in: { corn: 2 },                   sec: 4,  xp: 6 } },
    { id: 'cowshed',  name: 'うし小屋',         emoji: '🐄', level: 6,  price: 1400,  slots: 2,
      recipe: { out: 'milk',    in: { feed: 2 },                   sec: 5,  xp: 8 } },
    { id: 'juicer',   name: 'ジューサー',       emoji: '🧃', level: 8,  price: 2200,  slots: 2,
      recipe: { out: 'juice',   in: { berry: 2 },                  sec: 5,  xp: 9 } },
    { id: 'dairy',    name: 'チーズがま',       emoji: '🧀', level: 9,  price: 3200,  slots: 2,
      recipe: { out: 'cheese',  in: { milk: 2 },                   sec: 7,  xp: 12 } },
    { id: 'cakeshop', name: 'ケーキ工房',       emoji: '🍰', level: 11, price: 4800, slots: 2,
      recipe: { out: 'cake',    in: { flour: 1, egg: 1, milk: 1 }, sec: 8,  xp: 16 } },
    { id: 'pieshop',  name: 'パイ工房',         emoji: '🥧', level: 12, price: 6000, slots: 2,
      recipe: { out: 'pie',     in: { pumpkin: 2, flour: 1 },      sec: 10, xp: 18 } },
    { id: 'jampot',   name: 'ジャムなべ',       emoji: '🍯', level: 13, price: 7200, slots: 2,
      recipe: { out: 'jam',     in: { grape: 2 },                  sec: 6,  xp: 14 } },

    // レベル14以降。作った品をさらに材料にして、生産の鎖を長くしていく
    { id: 'ketchupery', name: 'ケチャップ工場', emoji: '🥫', level: 14, price: 5200, slots: 3,
      recipe: { out: 'ketchup',  in: { tomato: 2 },                            sec: 4, xp: 12 } },
    { id: 'pastashop',  name: 'パスタ工房',     emoji: '🍝', level: 15, price: 6400, slots: 2,
      recipe: { out: 'pasta',    in: { flour: 2, tomato: 1 },                  sec: 6, xp: 13 } },
    { id: 'oilpress',   name: 'オリーブ油しぼり', emoji: '🧴', level: 16, price: 8400, slots: 2,
      recipe: { out: 'oil',      in: { olive: 2 },                             sec: 6, xp: 16 } },
    { id: 'pizzeria',   name: 'ピザ窯',         emoji: '🍕', level: 17, price: 10800, slots: 2,
      recipe: { out: 'pizza',    in: { flour: 1, cheese: 1, ketchup: 1 },      sec: 9, xp: 26 } },
    { id: 'gelateria',  name: 'アイス屋',       emoji: '🍨', level: 18, price: 12400, slots: 2,
      recipe: { out: 'icecream', in: { milk: 2, melon: 1 },                    sec: 8, xp: 22 } },
    { id: 'saladbar',   name: 'サラダバー',     emoji: '🥗', level: 19, price: 14000, slots: 2,
      recipe: { out: 'salad',    in: { tomato: 1, carrot: 1, oil: 1 },         sec: 5, xp: 21 } },
    { id: 'sandwichery', name: 'サンド屋',      emoji: '🥪', level: 20, price: 16000, slots: 2,
      recipe: { out: 'sandwich', in: { bread: 1, cheese: 1, tomato: 1 },       sec: 7, xp: 23 } }
  ];

  /**
   * 畑の増設。最初の6マスは持っている。7マス目以降は買う。
   * レベルでも止めているのは、コインが余った瞬間に一気に広げて
   * 「手が足りない畑」だけが残るのを防ぐため。
   */
  const FIELDS_AT_START = 6;
  const FIELD_SLOTS = 12;
  const FIELD_UPGRADES = [
    { price: 160,   level: 3 },
    { price: 320,   level: 5 },
    { price: 560,  level: 7 },
    { price: 1200,  level: 9 },
    { price: 2000,  level: 11 },
    { price: 3200,  level: 13 }
  ];

  /** 倉庫。いっぱいだと収穫も取り出しもできなくなるので、広げるか売る。 */
  const BARN_AT_START = 30;
  const BARN_STEP = 12;
  const barnPrice = (upgrades) => Math.round(140 * Math.pow(1.75, upgrades));

  /**
   * 次のレベルまでに必要な経験値。
   * 係数は当て推量ではなく、`npm run simulate` で測った獲得ペースから逆算している。
   * 狙いは レベル2が約10秒、レベル10が約4分半、レベル20が約17分。
   *
   * 直した履歴（**畑の回転を変えたら必ずここも測り直す**）:
   *   12*level^1.35 … 手を止めずに回すと6分でレベル20に着いた
   *   42*level^1.35 … 狙いどおり。ただし時間差まきを入れる前の回転
   *   58*level^1.35 … 時間差まきで収穫が1.38倍になったぶんを戻した
   */
  const xpFor = (level) => Math.round(58 * Math.pow(level, 1.35)) + 40;

  const MAX_LEVEL = 20;

  const item = (id) => ITEMS[id] || null;
  const crop = (id) => CROPS.find((c) => c.id === id) || null;
  const machine = (id) => MACHINES.find((m) => m.id === id) || null;

  /** そのレベルで植えられる作物 */
  const cropsAt = (level) => CROPS.filter((c) => c.level <= level);

  /** そのレベルで買える（＝店に並ぶ）加工機 */
  const machinesAt = (level) => MACHINES.filter((m) => m.level <= level);

  /** レベルが上がったときに新しく解放されたもの。レベルアップの表示に使う。 */
  /**
   * 注文の枠。**レベルに沿って増える。**
   *
   * 枠を3つのまま固定していたら、農園の生産量だけが3倍になって
   * **注文が追いつかず、稼ぎの半分が「余りを売っただけ」に戻っていた**
   * （25分で 注文ぜんぶ 50.6% / 余りを売る 51.2%）。
   * 実測で枠を振ったところ、5枠がちょうどよかった（6枠にすると
   * ふなびんの取り分を食うだけで、注文ぜんぶの割合は伸びない）。
   */
  const ORDER_SLOTS = [
    { level: 1,  slots: 3 },
    { level: 8,  slots: 4 },
    { level: 15, slots: 5 }
  ];
  const orderSlotsAt = (level) =>
    ORDER_SLOTS.reduce((a, r) => (level >= r.level ? r.slots : a), ORDER_SLOTS[0].slots);

  /**
   * かざり。**能力は上げない。終盤のコインの行き先。**
   *
   * 25分まわすと施設も畑も倉庫も買いきって、コインが十数万あまる。
   * 使い道が無いと、後半は数字が増えるだけの画面になる。
   *
   * 1画面に収める約束があるので、**場所は取らない**。畑の上の空に重ねて出す
   * （`pointer-events: none` の層。畑のタップを邪魔しない）。
   *
   * **出せるのは畑のいちばん上の帯だけ。** 一度、畑の真ん中と画面の下にも置いてみたが、
   * 作物の絵に虫が重なり、知らせの1行に台が重なって、どちらも読みにくくなった。
   * この画面に空きは無い——**空だけが、何かを足せる唯一の場所**。
   * だから「空に浮かぶもの」しか作らない（地面に置く台や花だんは足さない）。
   *
   * **値段は「その時点で買えるどの施設よりも高い」**ように置く。
   * 農園を育てるほうが先、かざりは本当に余ったぶんで買うもの、という順番にしたい。
   * 合計 74,200 コインで、施設・畑・倉庫をぜんぶ買う額（157,279）のおよそ半分。
   *
   * 最初は「終盤はコインが十数万あまる」と見て10万コインの品まで置いたが、
   * **あまっていたのは稼ぎの総額で、手元のコインではなかった**（25分で約2万）。
   * タネ代が出ていくので、コインはそこまで積み上がらない。測って置き直した。
   */
  const DECOR = [
    { id: 'kite',      name: 'たこ',     emoji: '🪁', level: 5,  price:  1200, charm: 1 },
    { id: 'bee',       name: 'みつばち', emoji: '🐝', level: 7,  price:  2200, charm: 2 },
    { id: 'butterfly', name: 'ちょうちょ', emoji: '🦋', level: 9,  price:  3800, charm: 3 },
    { id: 'bird',      name: 'とり',     emoji: '🐦', level: 11, price:  6000, charm: 4 },
    { id: 'cloud',     name: 'くも',     emoji: '☁️', level: 13, price:  9000, charm: 6 },
    { id: 'balloon',   name: 'ききゅう', emoji: '🎈', level: 15, price: 13000, charm: 8 },
    { id: 'rainbow',   name: 'にじ',     emoji: '🌈', level: 17, price: 17000, charm: 12 },
    { id: 'blimp',     name: 'ひこうせん', emoji: '🛸', level: 20, price: 22000, charm: 20 }
  ];
  const decor = (id) => DECOR.find((d) => d.id === id) || null;
  const decorAt = (level) => DECOR.filter((d) => d.level <= level);

  function unlockedAt(level) {
    const out = [];
    for (const c of CROPS) if (c.level === level) out.push({ kind: 'crop', id: c.id, name: ITEMS[c.id].name, emoji: ITEMS[c.id].emoji });
    for (const m of MACHINES) if (m.level === level && m.price > 0) out.push({ kind: 'machine', id: m.id, name: m.name, emoji: m.emoji });
    FIELD_UPGRADES.forEach((f) => { if (f.level === level) out.push({ kind: 'field', id: 'field', name: '畑の増設', emoji: '🟩' }); });
    for (const r of ORDER_SLOTS) if (r.level === level && r.level > 1) out.push({ kind: 'order', id: 'order', name: `注文が${r.slots}件に`, emoji: '📦' });
    for (const d of DECOR) if (d.level === level) out.push({ kind: 'decor', id: d.id, name: d.name, emoji: d.emoji });
    return out;
  }

  /**
   * 実績。レベル20に着いたあとも目標が残るようにする。
   * `on` は何を数えるか、`goal` はいくつで達成か。
   * 進み具合は engine が state から数える（ここは純データのまま）。
   */
  const ACHIEVEMENTS = [
    { id: 'harvest1',    name: 'はじめの一歩',   emoji: '🌱', on: 'harvested',   goal: 1 },
    { id: 'harvest100',  name: '土いじり',       emoji: '🌾', on: 'harvested',   goal: 100 },
    { id: 'harvest1000', name: '大農家',         emoji: '🚜', on: 'harvested',   goal: 1000 },
    { id: 'craft50',     name: '職人',           emoji: '⚙️', on: 'crafted',     goal: 50 },
    { id: 'craft500',    name: '工場長',         emoji: '🏭', on: 'crafted',     goal: 500 },
    { id: 'deliver20',   name: '配達員',         emoji: '📦', on: 'delivered',   goal: 20 },
    { id: 'deliver100',  name: '働きもの',       emoji: '🏃', on: 'delivered',   goal: 100 },
    { id: 'combo10',     name: '10れんぞく',     emoji: '🔥', on: 'bestCombo',   goal: 10 },
    { id: 'ship1',       name: 'はじめての出港', emoji: '🚢', on: 'shipped',     goal: 1 },
    { id: 'ship10',      name: '船長',           emoji: '⚓', on: 'shipped',     goal: 10 },
    { id: 'level10',     name: '半人前',         emoji: '⭐', on: 'level',       goal: 10 },
    { id: 'level20',     name: '一人前',         emoji: '🌟', on: 'level',       goal: MAX_LEVEL },
    { id: 'machines',    name: 'ぜんぶ揃えた',   emoji: '🎪', on: 'machines',    goal: MACHINES.length },
    { id: 'fields',      name: '大地主',         emoji: '🟩', on: 'fields',      goal: FIELD_SLOTS },
    { id: 'rich',        name: 'ひとやま当てた', emoji: '💰', on: 'coinsEarned', goal: 100_000 }
  ];

  global.GF = global.GF || {};
  global.GF.Data = {
    ACHIEVEMENTS,
    MAX_SEC, ITEMS, CROPS, MACHINES,
    FIELDS_AT_START, FIELD_SLOTS, FIELD_UPGRADES,
    BARN_AT_START, BARN_STEP, barnPrice,
    xpFor, MAX_LEVEL,
    ORDER_SLOTS, orderSlotsAt, DECOR, decor, decorAt,
    item, crop, machine, cropsAt, machinesAt, unlockedAt
  };
})(typeof window !== 'undefined' ? window : globalThis);

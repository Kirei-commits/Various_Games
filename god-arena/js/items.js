/**
 * アイテム定義。純データと抽選だけを持ち、ゲーム進行には依存しない。
 * ここに足すだけで新しい神器が対戦に出てくる。
 */
(function (global) {
  'use strict';

  /** 属性。攻撃は同じ属性の防具でしか止まらない（all は例外で何でも止まる）。 */
  const ELEMENTS = {
    none:    { key: 'none',    label: '無', sym: '◇' },
    fire:    { key: 'fire',    label: '火', sym: '🔥' },
    water:   { key: 'water',   label: '水', sym: '💧' },
    thunder: { key: 'thunder', label: '雷', sym: '⚡' },
    light:   { key: 'light',   label: '光', sym: '✦' },
    dark:    { key: 'dark',    label: '闇', sym: '☾' },
    all:     { key: 'all',     label: '全', sym: '✳' }
  };

  /** 攻撃に使える属性（all は防具専用） */
  const ATTACK_ELEMENTS = ['none', 'fire', 'water', 'thunder', 'light', 'dark'];

  /**
   * weight は抽選の重み。強いものほど小さくして出現を絞る。
   * power は武器なら攻撃力、防具なら防御力、食料なら回復量。
   */
  const CATALOG = [
    // ── 武器・無属性 ──────────────────────────────
    { id: 'stone',    name: 'いし',       kind: 'weapon', element: 'none',    power: 3,  weight: 12 },
    { id: 'club',     name: 'こんぼう',   kind: 'weapon', element: 'none',    power: 5,  weight: 11 },
    { id: 'knife',    name: 'ナイフ',     kind: 'weapon', element: 'none',    power: 6,  weight: 10 },
    { id: 'bow',      name: 'ゆみや',     kind: 'weapon', element: 'none',    power: 7,  weight: 9 },
    { id: 'spear',    name: 'やり',       kind: 'weapon', element: 'none',    power: 8,  weight: 8 },
    { id: 'sword',    name: 'つるぎ',     kind: 'weapon', element: 'none',    power: 9,  weight: 7 },
    { id: 'axe',      name: 'おの',       kind: 'weapon', element: 'none',    power: 11, weight: 5 },
    { id: 'cannon',   name: 'たいほう',   kind: 'weapon', element: 'none',    power: 14, weight: 2 },
    // ── 武器・属性つき ────────────────────────────
    { id: 'ember',    name: 'ひのたま',   kind: 'weapon', element: 'fire',    power: 6,  weight: 9 },
    { id: 'flameblade', name: 'えんぎのけん', kind: 'weapon', element: 'fire', power: 10, weight: 5 },
    { id: 'inferno',  name: 'ごうか',     kind: 'weapon', element: 'fire',    power: 14, weight: 2 },
    { id: 'splash',   name: 'みずでっぽう', kind: 'weapon', element: 'water', power: 5,  weight: 9 },
    { id: 'icicle',   name: 'こおりのやいば', kind: 'weapon', element: 'water', power: 9, weight: 5 },
    { id: 'tsunami',  name: 'おおつなみ', kind: 'weapon', element: 'water',   power: 14, weight: 2 },
    { id: 'spark',    name: 'でんげき',   kind: 'weapon', element: 'thunder', power: 6,  weight: 9 },
    { id: 'boltspear', name: 'いかずちのやり', kind: 'weapon', element: 'thunder', power: 10, weight: 5 },
    { id: 'judgement', name: 'らくらい',  kind: 'weapon', element: 'thunder', power: 14, weight: 2 },
    { id: 'lightarrow', name: 'ひかりのや', kind: 'weapon', element: 'light', power: 7,  weight: 7 },
    { id: 'holyblade', name: 'せいけん',  kind: 'weapon', element: 'light',   power: 12, weight: 3 },
    { id: 'shade',    name: 'やみのやいば', kind: 'weapon', element: 'dark',  power: 7,  weight: 7 },
    { id: 'demonsword', name: 'まけん',   kind: 'weapon', element: 'dark',    power: 12, weight: 3 },

    // ── 防具 ──────────────────────────────────────
    { id: 'woodshield', name: 'きのたて', kind: 'defense', element: 'none',    power: 5,  weight: 12 },
    { id: 'ironshield', name: 'てつのたて', kind: 'defense', element: 'none',  power: 8,  weight: 9 },
    { id: 'armor',     name: 'よろい',    kind: 'defense', element: 'none',    power: 11, weight: 5 },
    { id: 'flameshield', name: 'ほのおのたて', kind: 'defense', element: 'fire', power: 9, weight: 7 },
    { id: 'iceshield', name: 'こおりのたて', kind: 'defense', element: 'water', power: 9,  weight: 7 },
    { id: 'rod',       name: 'ひらいしん', kind: 'defense', element: 'thunder', power: 9,  weight: 7 },
    { id: 'holyshield', name: 'せいなるたて', kind: 'defense', element: 'light', power: 10, weight: 5 },
    { id: 'darkshield', name: 'のろいのたて', kind: 'defense', element: 'dark',  power: 10, weight: 5 },
    { id: 'aegis',     name: 'めがみのたて', kind: 'defense', element: 'all',   power: 9,  weight: 2 },

    // ── 反射具（防いだ分をそのまま撃ち返す） ──────
    // 防ぐだけの防具より弱いが、大技を受け止めると手痛い反撃になる。
    // 出現は絞る（多いと「大きく撃つ」選択そのものが消えてしまう）。
    { id: 'counterplate', name: 'カウンタープレート', kind: 'reflect', element: 'none',    power: 6, weight: 4 },
    { id: 'backfire',  name: 'ほのおのかがみ', kind: 'reflect', element: 'fire',    power: 7, weight: 3 },
    { id: 'frostmirror', name: 'こおりのかがみ', kind: 'reflect', element: 'water', power: 7, weight: 3 },
    { id: 'earthcoil', name: 'アースコイル',   kind: 'reflect', element: 'thunder', power: 7, weight: 3 },
    { id: 'mirror',    name: 'かがみのたて',   kind: 'reflect', element: 'light',   power: 8, weight: 2 },
    { id: 'voidcloak', name: 'やみのころも',   kind: 'reflect', element: 'dark',    power: 8, weight: 2 },

    // ── 食料（1ターン使って回復する） ─────────────
    { id: 'apple',   name: 'りんご',     kind: 'food', element: 'none', power: 5,  weight: 11 },
    { id: 'bread',   name: 'パン',       kind: 'food', element: 'none', power: 8,  weight: 9 },
    { id: 'meat',    name: 'にく',       kind: 'food', element: 'none', power: 12, weight: 6 },
    { id: 'herb',    name: 'やくそう',   kind: 'food', element: 'none', power: 16, weight: 3 },

    // ── 魔法（1ターン使って発動する） ─────────────
    { id: 'cure',    name: 'いやしのまほう', kind: 'magic', element: 'light', power: 20, effect: 'heal',  weight: 4 },
    { id: 'oracle',  name: 'てんけい',       kind: 'magic', element: 'light', power: 4,  effect: 'draw',  weight: 5 },
    { id: 'plunder', name: 'ごうだつ',       kind: 'magic', element: 'dark',  power: 2,  effect: 'steal', weight: 4 }
  ];

  const BY_ID = Object.create(null);
  for (const def of CATALOG) BY_ID[def.id] = def;

  const TOTAL_WEIGHT = CATALOG.reduce((s, d) => s + d.weight, 0);

  let uidSeq = 0;

  /** 定義から手札に入る実体を作る。uid はUIの選択と同一性判定に使う。 */
  function instantiate(id) {
    const def = BY_ID[id];
    if (!def) throw new Error('未知のアイテム: ' + id);
    return Object.assign({ uid: 'i' + (++uidSeq) }, def);
  }

  /** テストを決定的にするため uid の連番を巻き戻せるようにしておく */
  function resetUid(n) { uidSeq = n || 0; }

  /** 重み付き抽選で1つ引く。rng は 0..1 を返す関数。 */
  function drawOne(rng) {
    let r = rng() * TOTAL_WEIGHT;
    for (const def of CATALOG) {
      r -= def.weight;
      if (r < 0) return instantiate(def.id);
    }
    return instantiate(CATALOG[0].id);
  }

  /** n個引く */
  function draw(rng, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(drawOne(rng));
    return out;
  }

  /** 表示用の属性情報（未知の属性でも落ちないように既定値を返す） */
  function element(key) {
    return ELEMENTS[key] || ELEMENTS.none;
  }

  const KIND_LABEL = { weapon: '武器', defense: '防具', reflect: '反射', food: '食料', magic: '魔法' };

  /** 守りに使えるか（防具と反射具）。engine と AI が同じ判定を見るために置く。 */
  function isShield(item) { return item.kind === 'defense' || item.kind === 'reflect'; }

  /** カードに出す短い説明 */
  function describe(item) {
    switch (item.kind) {
      case 'weapon':  return `${element(item.element).label}属性 ${item.power} ダメージ`;
      case 'defense': return item.element === 'all'
        ? `どの属性でも ${item.power} 防ぐ`
        : `${element(item.element).label}属性を ${item.power} 防ぐ`;
      case 'reflect': return `${element(item.element).label}属性を ${item.power} 防ぎ、防いだ分を撃ち返す`;
      case 'food':    return `HP を ${item.power} 回復`;
      case 'magic':
        if (item.effect === 'heal')  return `HP を ${item.power} 回復`;
        if (item.effect === 'draw')  return `アイテムを ${item.power} 個授かる`;
        if (item.effect === 'steal') return `相手から ${item.power} 個うばう`;
        return '';
      default: return '';
    }
  }

  global.GA = global.GA || {};
  global.GA.Items = {
    ELEMENTS, ATTACK_ELEMENTS, CATALOG, KIND_LABEL,
    byId: (id) => BY_ID[id],
    instantiate, resetUid, draw, drawOne, element, describe, isShield
  };
})(typeof window !== 'undefined' ? window : globalThis);

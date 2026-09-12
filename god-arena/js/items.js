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

    // ── 特性つきの武器 ────────────────────────────
    // 同じ火力でも「どう当たるか」が違うので、どれを撃つかに意味が出る。
    // hits   … 連撃。回数分に分かれ、防具1枚では1回分しか受け止められない
    // pierce … 貫通。防具の効果が半分になる
    // crit   … 会心。1点も防がれなければ威力1.5倍（属性を読み切れたご褒美）
    { id: 'twinblade', name: 'にとうりゅう', kind: 'weapon', element: 'none',    power: 4, hits: 2, weight: 4 },
    { id: 'hailstorm', name: 'あられ',       kind: 'weapon', element: 'water',   power: 3, hits: 3, weight: 3 },
    { id: 'chainbolt', name: 'れんらい',     kind: 'weapon', element: 'thunder', power: 3, hits: 3, weight: 3 },
    { id: 'pike',      name: 'つらぬきやり', kind: 'weapon', element: 'none',    power: 6, pierce: true, weight: 4 },
    { id: 'lightlance', name: 'ひかりのそう', kind: 'weapon', element: 'light',  power: 7, pierce: true, weight: 3 },
    { id: 'blazeburst', name: 'ばくえん',    kind: 'weapon', element: 'fire',    power: 7, crit: true, weight: 3 },
    { id: 'assassin',  name: 'あんさつけん', kind: 'weapon', element: 'dark',    power: 6, crit: true, weight: 3 },

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
    { id: 'plunder', name: 'ごうだつ',       kind: 'magic', element: 'dark',  power: 2,  effect: 'steal', weight: 4 },

    // ── 呪い（相手に状態異常をかける） ────────────
    // 一撃の大きさ以外の脅し方。殴るだけの手番にしないために置いている。
    { id: 'poisonmist', name: 'どくのきり', kind: 'magic', element: 'dark', power: 4, effect: 'poison', turns: 3, weight: 5 },
    { id: 'sealward',   name: 'ふうじのふだ', kind: 'magic', element: 'dark', power: 1, effect: 'seal',   turns: 2, weight: 4 },
    { id: 'hexward',    name: 'のろいのふだ', kind: 'magic', element: 'dark', power: 1, effect: 'curse',  turns: 3, weight: 4 }
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

  /** 相手を選ぶ必要があるか。UIの狙い先選択と AI の判断が同じ条件を見るために置く。 */
  const TARGETED = new Set(['steal', 'poison', 'seal', 'curse']);
  function needsTarget(item) { return item.kind === 'magic' && TARGETED.has(item.effect); }

  /** 状態異常をかけるアイテムか */
  function isHex(item) {
    return item.kind === 'magic' && ['poison', 'seal', 'curse'].includes(item.effect);
  }

  /** 状態異常の表示情報 */
  const STATUS = {
    poison: { label: 'どく',   sym: '☠', desc: (st) => `毎ターン ${st.power} ダメージ` },
    seal:   { label: 'ふうじ', sym: '⛔', desc: (st) => `${element(st.element).label}属性が使えない` },
    curse:  { label: 'のろい', sym: '✖', desc: () => '防御力が半分になる' }
  };

  /** 武器の特性を短い言葉にする（カードとログで同じ言い方を使う） */
  function traits(item) {
    const out = [];
    if (item.hits > 1) out.push(`連撃${item.hits}`);
    if (item.pierce) out.push('貫通');
    if (item.crit) out.push('会心');
    return out;
  }

  /**
   * カードの1行に出す要約。
   * 説明文をそのまま入れると枠からあふれるので、カードには属性と数値だけを置き、
   * 効果の説明は describe() を title / aria-label に入れて読めるようにしている。
   */
  function summary(item) {
    const label = element(item.element).label;
    switch (item.kind) {
      case 'weapon':
        return item.hits > 1 ? `${label}属性 ${item.power}×${item.hits}` : `${label}属性 ${item.power}`;
      case 'defense':  return item.element === 'all' ? `全属性を ${item.power}` : `${label}属性を ${item.power}`;
      case 'reflect':  return `${label}属性を ${item.power} 撃ち返す`;
      case 'food':     return `HP +${item.power}`;
      case 'magic':
        if (item.effect === 'heal')   return `HP +${item.power}`;
        if (item.effect === 'draw')   return `神器 ${item.power}個`;
        if (item.effect === 'steal')  return `${item.power}個うばう`;
        if (item.effect === 'poison') return `どく ${item.power}／${item.turns}ターン`;
        if (item.effect === 'seal')   return `ふうじ ${item.turns}ターン`;
        if (item.effect === 'curse')  return `のろい ${item.turns}ターン`;
        return '';
      default: return '';
    }
  }

  /** カードに出す短い説明 */
  function describe(item) {
    switch (item.kind) {
      case 'weapon': {
        const t = traits(item);
        if (!t.length) return `${element(item.element).label}属性 ${item.power} ダメージ`;
        const head = item.hits > 1
          ? `${element(item.element).label}属性 ${item.power}×${item.hits}`
          : `${element(item.element).label}属性 ${item.power}`;
        const note = [];
        if (item.hits > 1) note.push('防具1枚では1回分しか防げない');
        if (item.pierce) note.push('防具の効果が半分');
        if (item.crit) note.push('無防備なら1.5倍');
        return `${head} — ${note.join('・')}`;
      }
      case 'defense': return item.element === 'all'
        ? `どの属性でも ${item.power} 防ぐ`
        : `${element(item.element).label}属性を ${item.power} 防ぐ`;
      case 'reflect': return `${element(item.element).label}属性を ${item.power} 防ぎ、防いだ分を撃ち返す`;
      case 'food':    return `HP を ${item.power} 回復`;
      case 'magic':
        if (item.effect === 'heal')  return `HP を ${item.power} 回復`;
        if (item.effect === 'draw')  return `アイテムを ${item.power} 個授かる`;
        if (item.effect === 'steal') return `相手から ${item.power} 個うばう`;
        if (item.effect === 'poison') return `${item.turns}ターン 毎ターン ${item.power} ダメージ`;
        if (item.effect === 'seal') return `${item.turns}ターン 相手の得意属性を封じる`;
        if (item.effect === 'curse') return `${item.turns}ターン 相手の防御力を半分にする`;
        return '';
      default: return '';
    }
  }

  global.GA = global.GA || {};
  global.GA.Items = {
    ELEMENTS, ATTACK_ELEMENTS, CATALOG, KIND_LABEL,
    byId: (id) => BY_ID[id],
    STATUS,
    instantiate, resetUid, draw, drawOne, element, describe, summary, traits,
    isShield, needsTarget, isHex
  };
})(typeof window !== 'undefined' ? window : globalThis);

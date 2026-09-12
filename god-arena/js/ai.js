/**
 * AI。engine の公開関数だけを使って「次の行動」と「防御の選択」を決める。
 * 相手の手札は見ない。見えない防具はカタログの重みから確率で見積もる。
 */
(function (global) {
  'use strict';

  const Items = global.GA.Items;
  const Engine = global.GA.Engine;

  /**
   * 難易度。
   *  noise … 評価値のブレ。大きいほど最善からずれる。
   *  iq    … 「腕前」。過剰攻撃の回避・手札の読み・防具の出し惜しみに効く。
   *  guard … 防御しようとする度合い。低いと受け損なう。
   */
  // 値は当て推量ではなく、撹拌したseedで各400局を回して決めている。
  // 等差のseedで測ると系列が相関して数値が偏るので、必ず添字を撹拌して測る。
  const LEVELS = {
    easy:   { noise: 0.70, iq: 0.05, guard: 0.35, label: 'かけだし' },
    normal: { noise: 0.30, iq: 0.45, guard: 0.70, label: 'ベテラン' },
    hard:   { noise: 0.0,  iq: 1.00, guard: 1.00, label: 'ゴッド' }
  };

  let rng = Math.random;
  function setRandom(fn) { rng = fn || Math.random; }

  // ── 見えない防具の見積もり ────────────────────────────
  // 「相手の手札1枚がこの属性の防具である確率」と「その平均防御力」を
  // カタログの重みから前計算しておく。攻撃属性を散らす判断の根拠になる。
  function statsFor(kinds) {
    const total = Items.CATALOG.reduce((s, d) => s + d.weight, 0);
    const stats = {};
    for (const el of Items.ATTACK_ELEMENTS) stats[el] = { p: 0, power: 0 };
    for (const d of Items.CATALOG) {
      if (!kinds.includes(d.kind)) continue;
      const targets = d.element === 'all' ? Items.ATTACK_ELEMENTS : [d.element];
      for (const el of targets) {
        const p = d.weight / total;
        stats[el].p += p;
        stats[el].power += p * d.power;
      }
    }
    for (const el of Items.ATTACK_ELEMENTS) {
      if (stats[el].p > 0) stats[el].power /= stats[el].p;
    }
    return stats;
  }

  /** 止められる確率（防具と反射具の両方） */
  const DEF_STATS = statsFor(['defense', 'reflect']);
  /** 撃ち返される確率（反射具だけ） */
  const REFLECT_STATS = statsFor(['reflect']);

  /** その属性の攻撃 raw が、手札 n 枚の相手に何点通りそうか */
  function expectedThrough(element, raw, handSize, bias) {
    const st = DEF_STATS[element] || { p: 0, power: 0 };
    const p = Math.max(0, st.p * (bias === undefined ? 1 : bias));
    const expectedBlock = Math.min(raw, p * handSize * st.power);
    return raw - expectedBlock;
  }

  /** その属性で raw だけ撃ったとき、撃ち返されそうな量 */
  function expectedReflect(element, raw, handSize, bias) {
    const st = REFLECT_STATS[element] || { p: 0, power: 0 };
    const p = Math.max(0, st.p * (bias === undefined ? 1 : bias));
    return Math.min(raw, p * handSize * st.power);
  }

  /**
   * これまでの戦況から「その相手がどの属性を防げそうか」を読む。
   * 実際に防いできた属性は手厚く、素通りさせた属性は薄いとみなす。
   * 見えている情報だけを使う（相手の手札は覗かない）。
   */
  function readDefenses(state, targetId) {
    const bias = {};
    for (const el of Items.ATTACK_ELEMENTS) bias[el] = 1;
    for (const e of state.log) {
      if (e.t !== 'resolve' || e.target !== targetId || !e.detail) continue;
      const guarded = new Set();
      for (const id of e.items || []) {
        const def = Items.byId(id);
        if (!def) continue;
        if (def.element === 'all') for (const el of Items.ATTACK_ELEMENTS) guarded.add(el);
        else guarded.add(def.element);
      }
      for (const row of e.detail) {
        if (guarded.has(row.element)) bias[row.element] = (bias[row.element] || 1) * 1.35;
        else if (row.through >= row.raw) bias[row.element] = (bias[row.element] || 1) * 0.62;
      }
    }
    for (const el of Items.ATTACK_ELEMENTS) bias[el] = Math.max(0.25, Math.min(2.2, bias[el]));
    return bias;
  }

  /** 武器の組み合わせを属性ごとにまとめて期待通過ダメージを出す */
  function estimateDamage(weapons, handSize, bias) {
    const byElement = new Map();
    for (const w of weapons) byElement.set(w.element, (byElement.get(w.element) || 0) + w.power);
    let sum = 0;
    for (const [el, raw] of byElement) {
      sum += expectedThrough(el, raw, handSize, bias ? bias[el] : 1);
    }
    return sum;
  }

  /** 添字の組み合わせを全列挙する（枚数が多い時は強い順に上位だけ見る） */
  function subsets(list, cap) {
    const items = list.length > cap
      ? list.slice().sort((a, b) => b.power - a.power).slice(0, cap)
      : list;
    const out = [];
    for (let mask = 1; mask < (1 << items.length); mask++) {
      const pick = [];
      for (let i = 0; i < items.length; i++) if (mask & (1 << i)) pick.push(items[i]);
      out.push(pick);
    }
    return out;
  }

  const jitter = (level) => 1 + (rng() - 0.5) * 2 * LEVELS[level].noise;

  /**
   * どの状態異常を誰にかけるか。
   *  どく   … HPが残っている相手ほど効く（削り切れる量が増える）
   *  ふうじ … 手札の厚い相手ほど効く（大事な属性を止めやすい）
   *  のろい … これから殴る相手＝HPが高くて手強い相手に効く
   */
  function bestHex(hexes, targets, cfg) {
    let best = null;
    for (const item of hexes) {
      for (const target of targets) {
        const alreadyOn = (target.status || []).some((st) => st.id === item.effect);
        let value = 0;
        if (item.effect === 'poison') value = Math.min(target.hp, item.power * (item.turns || 2));
        else if (item.effect === 'seal') value = 3 + target.hand.length * 1.1;
        else if (item.effect === 'curse') value = 4 + (target.hp / target.maxHp) * 8;
        if (alreadyOn) value *= 0.25;          // 重ねがけは効きが薄い
        value *= 0.7 + 0.6 * cfg.iq;           // 腕が上がるほど使い所が良くなる
        value *= 1 + (rng() - 0.5) * 2 * cfg.noise;
        if (!best || value > best.value) best = { item, target, value };
      }
    }
    return best;
  }

  /** 狙いやすさ。瀕死ほど、手札が薄いほど狙う価値が高い。 */
  function targetValue(target) {
    const frail = 1 + (1 - target.hp / target.maxHp) * 1.2;
    const naked = 1 + Math.max(0, 6 - target.hand.length) * 0.06;
    return frail * naked;
  }

  /**
   * 次の行動を決める。
   * @returns {{type:'attack',targetId:number,uids:string[]}|{type:'use',uid:string,targetId?:number}|{type:'pray'}}
   */
  function chooseAction(state, levelName) {
    const level = LEVELS[levelName] ? levelName : 'normal';
    const cfg = LEVELS[level];
    const me = Engine.current(state);
    const weapons = Engine.weaponsOf(me);
    const targets = Engine.targetsFor(state, me.id);
    const supports = Engine.supportsOf(me);

    // 1) 生き延びる方が先。瀕死なら回復を優先する。
    const hpRatio = me.hp / me.maxHp;
    const heals = supports.filter((i) => i.kind === 'food' || i.effect === 'heal');
    if (heals.length && hpRatio < 0.45 && rng() < cfg.guard) {
      // 溢れない範囲でいちばん効くものを選ぶ
      const missing = me.maxHp - me.hp;
      const best = heals.slice().sort((a, b) =>
        (Math.min(b.power, missing) - b.power * 0.2) - (Math.min(a.power, missing) - a.power * 0.2))[0];
      return { type: 'use', uid: best.uid };
    }

    // 2) 手札が薄いなら天啓で補充する
    const oracle = supports.find((i) => i.effect === 'draw');
    if (oracle && me.hand.length <= 4 && weapons.length === 0) {
      return { type: 'use', uid: oracle.uid };
    }

    // 3) 状態異常。攻め手が無い手番ほど価値が高い（祈るより仕事になる）
    const hexes = supports.filter(Items.isHex);
    if (hexes.length && targets.length) {
      const useNow = weapons.length === 0 || rng() < 0.18 + 0.25 * cfg.iq;
      if (useNow) {
        const pick = bestHex(hexes, targets, cfg);
        if (pick) return { type: 'use', uid: pick.item.uid, targetId: pick.target.id };
      }
    }

    // 4) 相手の手札が厚いなら奪う（攻め手が無い時ほど積極的に）
    const plunder = supports.find((i) => i.effect === 'steal');
    const rich = targets.slice().sort((a, b) => b.hand.length - a.hand.length)[0];
    if (plunder && rich && rich.hand.length >= 5 && (!weapons.length || rng() < 0.22)) {
      return { type: 'use', uid: plunder.uid, targetId: rich.id };
    }

    // 5) 攻撃できるなら、期待ダメージがいちばん大きい組み合わせを探す。
    //    武器を持っている間は祈れないので、ここに来たら必ず攻める。
    if (weapons.length && targets.length) {
      let best = null;
      for (const target of targets) {
        const value = targetValue(target);
        // 腕のいい相手ほど、これまでの防ぎ方から手札を読む
        const read = readDefenses(state, target.id);
        const bias = {};
        for (const el of Items.ATTACK_ELEMENTS) bias[el] = 1 + (read[el] - 1) * cfg.iq;

        for (const combo of subsets(weapons, 10)) {
          const est = estimateDamage(combo, target.hand.length, bias);
          const raw = combo.reduce((a, w) => a + w.power, 0);
          const lethal = raw >= target.hp && est >= target.hp * 0.75;

          // 反射で撃ち返される見込み。大きな単属性攻撃ほど危ない。
          const byElement = new Map();
          for (const w of combo) byElement.set(w.element, (byElement.get(w.element) || 0) + w.power);
          let backlash = 0;
          for (const [el, r] of byElement) backlash += expectedReflect(el, r, target.hand.length, bias[el]);

          // 相手のHPを超える分は捨てているのと同じ。腕がいいほどそれを嫌う。
          const overkill = Math.max(0, est - target.hp);
          // 弱い武器を手元に残すと、次の手番でその弱い一撃を強制される
          const leftover = combo.length >= weapons.length
            ? null
            : weapons.filter((w) => !combo.includes(w));
          const stuck = leftover && leftover.length
            ? Math.max(0, 8 - Math.max(...leftover.map((w) => w.power))) * 0.45
            : -1.6;   // 撃ち切れば次は祈って引き直せる

          let score = Math.min(est, target.hp) * value
            - overkill * 0.45 * cfg.iq
            - stuck * cfg.iq
            - backlash * (backlash >= me.hp ? 4 : 1.1) * cfg.iq
            + (lethal ? 18 : 0);
          score *= jitter(level);
          if (!best || score > best.score) {
            best = { score, targetId: target.id, uids: combo.map((w) => w.uid) };
          }
        }
      }
      if (best) return { type: 'attack', targetId: best.targetId, uids: best.uids };
    }

    // 6) 余裕があるうちに食べておく
    if (heals.length && me.hp < me.maxHp - 6 && rng() < cfg.guard) {
      return { type: 'use', uid: heals[0].uid };
    }

    return { type: 'pray' };
  }

  /**
   * 防御の選択。受ける攻撃は見えているので、防いだ量と使う枚数を天秤にかける。
   * 致死の攻撃だけは出し惜しみしない。
   */
  function chooseDefense(state, levelName) {
    const level = LEVELS[levelName] ? levelName : 'normal';
    const cfg = LEVELS[level];
    const pending = state.pending;
    if (!pending) return [];
    const me = Engine.byId(state, pending.targetId);
    const shields = Engine.defensesOf(me);
    if (!shields.length) return [];

    const bare = Engine.previewDefense(state, []);
    if (bare.damage <= 0) return [];
    const lethal = bare.damage >= me.hp;

    // 危険なほど1枚あたりの価値を低く見る（出し惜しみしない）
    const danger = Math.min(1, bare.damage / Math.max(1, me.hp));
    const costPerItem = lethal ? 0 : (1 - danger) * 6 * cfg.iq + 0.8;

    const attacker = Engine.byId(state, pending.attackerId);
    let best = { uids: [], score: 0, prevented: 0 };
    for (const combo of subsets(shields, 10)) {
      const res = Engine.previewDefense(state, combo);
      const prevented = bare.damage - res.damage;
      // 撃ち返せるなら、防げる量が同じでも反射具を選ぶ理由になる
      const payback = res.reflected * (1 + 0.6 * cfg.iq);
      const finishes = res.reflected >= attacker.hp ? 70 * cfg.iq : 0;
      if (prevented <= 0 && res.reflected <= 0) continue;
      const survives = res.damage < me.hp;
      let score = prevented + payback + finishes
        - combo.length * costPerItem + (lethal && survives ? 60 : 0);
      score *= jitter(level);
      if (score > best.score) best = { uids: combo.map((d) => d.uid), score, prevented };
    }

    // かけだしは時々しくじる
    if (!lethal && rng() > cfg.guard) return [];
    return best.uids;
  }

  global.GA = global.GA || {};
  global.GA.AI = {
    LEVELS, DEF_STATS, REFLECT_STATS, setRandom, chooseAction, chooseDefense,
    estimateDamage, expectedThrough, expectedReflect, readDefenses, bestHex
  };
})(typeof window !== 'undefined' ? window : globalThis);

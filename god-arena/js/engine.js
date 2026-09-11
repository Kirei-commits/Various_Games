/**
 * ゲーム進行。DOM にも描画にも依存しない純ロジックで、
 * 状態を引数に取り、状態を書き換えて「何が起きたか」を返す。
 * 乱数は setRandom() で差し替えられる（テストを決定的にするため）。
 */
(function (global) {
  'use strict';

  const Items = global.GA.Items;

  const START_HP = 40;
  const HAND_LIMIT = 12;
  const OPENING_HAND = 5;
  const PRAY_DRAW = 3;

  let rng = Math.random;
  function setRandom(fn) { rng = fn || Math.random; }
  function random() { return rng(); }

  /** 0..n-1 の整数 */
  function randInt(n) { return Math.floor(rng() * n) % n; }

  /**
   * 新しい対戦を作る。
   * @param {{names?:string[], humans?:number, hp?:number, levels?:string[]}} opts
   */
  function create(opts) {
    const o = opts || {};
    const names = o.names || ['あなた', 'アレス', 'ヘラ', 'ロキ'];
    const humans = o.humans === undefined ? 1 : o.humans;
    const hp = o.hp || START_HP;
    const players = names.map((name, i) => ({
      id: i,
      name,
      isHuman: i < humans,
      level: (o.levels && o.levels[i]) || 'normal',
      hp,
      maxHp: hp,
      alive: true,
      hand: Items.draw(rng, OPENING_HAND),
      stats: { dealt: 0, blocked: 0, taken: 0, healed: 0, kills: 0, reflected: 0 }
    }));
    return {
      players,
      turn: 0,
      round: 1,
      phase: 'turn',        // 'turn' | 'defense' | 'over'
      pending: null,        // 防御待ちの攻撃
      winner: null,
      log: [],
      handLimit: HAND_LIMIT
    };
  }

  // ── 参照系 ────────────────────────────────────────────

  const current = (s) => s.players[s.turn];
  const alivePlayers = (s) => s.players.filter((p) => p.alive);
  const byId = (s, id) => s.players[id];
  const weaponsOf = (p) => p.hand.filter((i) => i.kind === 'weapon');
  /** 守りに使える手札（防具と反射具） */
  const defensesOf = (p) => p.hand.filter(Items.isShield);
  const supportsOf = (p) => p.hand.filter((i) => i.kind === 'food' || i.kind === 'magic');

  /** 攻撃できる相手（自分以外の生存者） */
  function targetsFor(s, id) {
    return s.players.filter((p) => p.alive && p.id !== id);
  }

  /**
   * 攻撃と防御からダメージを求める純関数。ここがルールの核。
   *  - 攻撃は属性ごとに合算される
   *  - 同じ属性の防具だけがその属性を止められる
   *  - 反射具は同属性を止めたうえで、止めた分をそのまま攻撃側へ返す
   *  - 全属性(all)の防具は余りを引き受ける。大きく通っている属性から順に充てる
   *
   * 同じ属性に反射具と防具の両方を出したときは、反射具を先に充てる
   * （撃ち返せる量が増えるので、出した側に有利な配分にする）。
   */
  function resolveDamage(weapons, defenses) {
    const atk = new Map();
    for (const w of weapons) atk.set(w.element, (atk.get(w.element) || 0) + w.power);

    const shield = new Map();
    const mirror = new Map();
    let universal = 0;
    for (const d of defenses) {
      if (d.kind === 'reflect') mirror.set(d.element, (mirror.get(d.element) || 0) + d.power);
      else if (d.element === 'all') universal += d.power;
      else shield.set(d.element, (shield.get(d.element) || 0) + d.power);
    }

    // 属性ごとに 反射 → 同属性の防具 の順で充てる
    const rows = [...atk.entries()].map(([element, raw]) => {
      const reflected = Math.min(raw, mirror.get(element) || 0);
      let rest = raw - reflected;
      const sameBlocked = Math.min(rest, shield.get(element) || 0);
      rest -= sameBlocked;
      return { element, raw, reflected, sameBlocked, rest, universalBlocked: 0 };
    });

    // 残りの大きい属性から全属性防具を充てる（防御側に最も有利な配分）
    rows.sort((a, b) => b.rest - a.rest);
    for (const row of rows) {
      if (universal <= 0) break;
      const use = Math.min(row.rest, universal);
      row.universalBlocked = use;
      row.rest -= use;
      universal -= use;
    }

    let damage = 0, blocked = 0, reflected = 0;
    const detail = rows.map((r) => {
      damage += r.rest;
      blocked += r.reflected + r.sameBlocked + r.universalBlocked;
      reflected += r.reflected;
      return {
        element: r.element,
        raw: r.raw,
        blocked: r.reflected + r.sameBlocked + r.universalBlocked,
        reflected: r.reflected,
        through: r.rest
      };
    });
    detail.sort((a, b) => b.raw - a.raw);
    return { damage, blocked, reflected, detail, wasted: universal };
  }

  // ── 手札操作 ───────────────────────────────────────────

  function takeFromHand(player, uids) {
    const set = new Set(uids);
    const taken = player.hand.filter((i) => set.has(i.uid));
    if (taken.length !== set.size) throw new Error('手札にないアイテムが指定された');
    player.hand = player.hand.filter((i) => !set.has(i.uid));
    return taken;
  }

  /**
   * 手札としての価値。上限を超えた時にどれを捨てるかを決めるのに使う。
   * 攻め手が無いまま手札が埋まると誰も動けなくなるため、武器を高く見る。
   */
  function itemValue(item) {
    switch (item.kind) {
      case 'weapon':  return item.power + 3;
      case 'reflect': return item.power * 1.15;
      case 'defense': return item.power * 0.9;
      case 'magic':   return 11;
      case 'food':    return item.power * 0.55;
      default:        return 1;
    }
  }

  /**
   * アイテムを渡す。上限を超えたら、いちばん価値の低い手札から捨てる。
   * 「上限に達したら新しく引いた分を全部捨てる」にすると、
   * 防具と食料で手札が埋まった時に永久に攻め手が来なくなる（実際に膠着した）。
   * @returns {object[]} 捨てられたアイテム
   */
  function give(s, player, items) {
    for (const it of items) player.hand.push(it);
    const discarded = [];
    while (player.hand.length > s.handLimit) {
      let worst = 0;
      for (let i = 1; i < player.hand.length; i++) {
        if (itemValue(player.hand[i]) < itemValue(player.hand[worst])) worst = i;
      }
      discarded.push(player.hand.splice(worst, 1)[0]);
    }
    return discarded;
  }

  function log(s, entry) {
    s.log.push(Object.assign({ n: s.log.length + 1, round: s.round }, entry));
    if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
    return entry;
  }

  // ── 行動 ──────────────────────────────────────────────

  /**
   * 祈れるかどうか。武器を持っていて狙える相手がいるなら祈れない。
   * 「攻め手があるのに祈って引き直す」を許すと、全員が祈り続けて試合が終わらない。
   */
  function canPray(s, player) {
    const p = player || current(s);
    return weaponsOf(p).length === 0 || targetsFor(s, p.id).length === 0;
  }

  /** その手番でできることの一覧（UIとAIが同じ判断を使うため一箇所に置く） */
  function availableActions(s) {
    if (s.phase !== 'turn') return [];
    const p = current(s);
    const acts = [];
    if (canPray(s, p)) acts.push('pray');
    if (weaponsOf(p).length && targetsFor(s, p.id).length) acts.push('attack');
    if (supportsOf(p).length) acts.push('use');
    return acts;
  }

  /**
   * 攻撃を宣言する。実際のダメージは防御側が defend() を呼んだ時に確定する。
   */
  function attack(s, targetId, uids) {
    if (s.phase !== 'turn') throw new Error('攻撃できる局面ではない');
    const attacker = current(s);
    const target = byId(s, targetId);
    if (!target || !target.alive || target.id === attacker.id) throw new Error('対象が不正');
    if (!uids || !uids.length) throw new Error('武器が選ばれていない');

    const weapons = takeFromHand(attacker, uids);
    if (weapons.some((i) => i.kind !== 'weapon')) {
      give(s, attacker, weapons);
      throw new Error('武器以外では攻撃できない');
    }
    const total = weapons.reduce((sum, w) => sum + w.power, 0);
    s.pending = { attackerId: attacker.id, targetId, weapons, total };
    s.phase = 'defense';
    log(s, {
      t: 'attack', actor: attacker.id, target: targetId,
      items: weapons.map((w) => w.id), total
    });
    return s.pending;
  }

  /**
   * 防御して攻撃を解決する。uids が空なら無防備で受ける。
   * @returns {{damage:number, blocked:number, detail:Array, defeated:boolean}}
   */
  function defend(s, uids) {
    if (s.phase !== 'defense' || !s.pending) throw new Error('防御する場面ではない');
    const { attackerId, targetId, weapons } = s.pending;
    const defender = byId(s, targetId);
    const attacker = byId(s, attackerId);

    const used = uids && uids.length ? takeFromHand(defender, uids) : [];
    if (used.some((i) => !Items.isShield(i))) {
      give(s, defender, used);
      throw new Error('防具以外では防御できない');
    }

    const res = resolveDamage(weapons, used);
    defender.hp = Math.max(0, defender.hp - res.damage);
    defender.stats.taken += res.damage;
    defender.stats.blocked += res.blocked;
    attacker.stats.dealt += res.damage;

    const defeated = defender.hp <= 0 && defender.alive;
    if (defeated) {
      defender.alive = false;
      defender.hand = [];
      attacker.stats.kills++;
    }

    // 反射は防御が済んだあとに攻撃側へ返る。攻撃側はこれを防げない。
    let attackerDefeated = false;
    if (res.reflected > 0) {
      attacker.hp = Math.max(0, attacker.hp - res.reflected);
      attacker.stats.taken += res.reflected;
      defender.stats.dealt += res.reflected;
      defender.stats.reflected += res.reflected;
      if (attacker.hp <= 0 && attacker.alive) {
        attacker.alive = false;
        attacker.hand = [];
        attackerDefeated = true;
        if (defender.alive) defender.stats.kills++;
      }
    }

    log(s, {
      t: 'resolve', actor: attackerId, target: targetId,
      items: used.map((i) => i.id),
      damage: res.damage, blocked: res.blocked, reflected: res.reflected,
      detail: res.detail, defeated, attackerDefeated
    });

    s.pending = null;
    s.phase = 'turn';
    endTurn(s);
    return Object.assign({ defeated, attackerDefeated }, res);
  }

  /** 祈る。神からアイテムを授かって手番を終える。攻め手があるうちは祈れない。 */
  function pray(s) {
    if (s.phase !== 'turn') throw new Error('祈れる局面ではない');
    const p = current(s);
    if (!canPray(s, p)) throw new Error('武器を持っている間は祈れない');
    const got = Items.draw(rng, PRAY_DRAW);
    const discarded = give(s, p, got);
    log(s, {
      t: 'pray', actor: p.id, items: got.map((i) => i.id),
      dropped: discarded.length, discarded: discarded.map((i) => i.id)
    });
    endTurn(s);
    return { items: got, dropped: discarded.length, discarded };
  }

  /** 食料・魔法を1つ使って手番を終える。 */
  function useItem(s, uid, targetId) {
    if (s.phase !== 'turn') throw new Error('使える局面ではない');
    const p = current(s);
    const [item] = takeFromHand(p, [uid]);
    if (item.kind !== 'food' && item.kind !== 'magic') {
      give(s, p, [item]);
      throw new Error('その場では使えないアイテム');
    }

    const out = { item, healed: 0, drawn: [], stolen: [] };
    if (item.kind === 'food' || item.effect === 'heal') {
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + item.power);
      out.healed = p.hp - before;
      p.stats.healed += out.healed;
    } else if (item.effect === 'draw') {
      out.drawn = Items.draw(rng, item.power);
      give(s, p, out.drawn);
    } else if (item.effect === 'steal') {
      const victim = targetId === undefined || targetId === null
        ? pickRichestOpponent(s, p.id)
        : byId(s, targetId);
      if (victim && victim.alive && victim.hand.length) {
        for (let i = 0; i < item.power && victim.hand.length; i++) {
          const idx = randInt(victim.hand.length);
          out.stolen.push(victim.hand.splice(idx, 1)[0]);
        }
        give(s, p, out.stolen);
        out.victim = victim.id;
      }
    }

    log(s, {
      t: 'use', actor: p.id, item: item.id, healed: out.healed,
      drawn: out.drawn.length, stolen: out.stolen.length, victim: out.victim
    });
    endTurn(s);
    return out;
  }

  function pickRichestOpponent(s, id) {
    return targetsFor(s, id).slice().sort((a, b) => b.hand.length - a.hand.length)[0] || null;
  }

  /** 次の生存者へ手番を渡す。決着していれば phase を over にする。 */
  function endTurn(s) {
    const alive = alivePlayers(s);
    if (alive.length <= 1) {
      s.phase = 'over';
      s.winner = alive.length === 1 ? alive[0].id : null;
      log(s, { t: 'over', winner: s.winner });
      return;
    }
    let next = s.turn;
    for (let i = 0; i < s.players.length; i++) {
      next = (next + 1) % s.players.length;
      if (s.players[next].alive) break;
    }
    if (next <= s.turn) s.round++;
    s.turn = next;
    s.phase = 'turn';
  }

  global.GA = global.GA || {};
  global.GA.Engine = {
    START_HP, HAND_LIMIT, OPENING_HAND, PRAY_DRAW,
    setRandom, random,
    create, current, alivePlayers, byId, targetsFor, availableActions, canPray, itemValue,
    weaponsOf, defensesOf, supportsOf,
    resolveDamage, attack, defend, pray, useItem, endTurn
  };
})(typeof window !== 'undefined' ? window : globalThis);

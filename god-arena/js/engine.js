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
      status: [],
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
  /** 状態異常をひとつ探す */
  const statusOf = (p, id) => (p.status || []).find((st) => st.id === id) || null;

  /** ふうじ中の属性は攻撃にも防御にも使えない */
  function isSealed(p, item) {
    const seal = statusOf(p, 'seal');
    return !!seal && item.element === seal.element;
  }

  /** いま手札から出せるか。UI・AI・engine が同じ判定を見るために一箇所に置く。 */
  function isUsable(p, item) { return !isSealed(p, item); }

  // 「持っている」ではなく「出せる」で数える。封じられた武器では攻撃できないため。
  const weaponsOf = (p) => p.hand.filter((i) => i.kind === 'weapon' && isUsable(p, i));
  /** 守りに使える手札（防具と反射具） */
  const defensesOf = (p) => p.hand.filter((i) => Items.isShield(i) && isUsable(p, i));
  const supportsOf = (p) => p.hand.filter((i) => (i.kind === 'food' || i.kind === 'magic') && isUsable(p, i));

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
  function resolveDamage(weapons, defenses, opts) {
    const scale = (opts && opts.defenseScale !== undefined) ? opts.defenseScale : 1;
    const atk = new Map();
    for (const w of weapons) atk.set(w.element, (atk.get(w.element) || 0) + w.power);

    // のろい中は防御力が目減りする（scale < 1）。反射できる量も同じだけ減る。
    const bend = (v) => Math.floor(v * scale);
    const shield = new Map();
    const mirror = new Map();
    let universal = 0;
    for (const d of defenses) {
      const power = bend(d.power);
      if (d.kind === 'reflect') mirror.set(d.element, (mirror.get(d.element) || 0) + power);
      else if (d.element === 'all') universal += power;
      else shield.set(d.element, (shield.get(d.element) || 0) + power);
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

  /** のろいを考慮した防御倍率 */
  function defenseScaleOf(p) { return statusOf(p, 'curse') ? 0.5 : 1; }

  /**
   * いま受けている攻撃を、渡した防具で受けたらどうなるか。
   * UI のプレビューと AI の判断と実際の解決が、必ず同じ数字になるようにここを通す。
   * @param {object[]|string[]} items 防具の実体か uid
   */
  function previewDefense(s, items) {
    if (!s.pending) return { damage: 0, blocked: 0, reflected: 0, detail: [], wasted: 0 };
    const defender = byId(s, s.pending.targetId);
    const list = (items || []).map((it) =>
      (typeof it === 'string' ? defender.hand.find((h) => h.uid === it) : it)).filter(Boolean);
    return resolveDamage(s.pending.weapons, list, { defenseScale: defenseScaleOf(defender) });
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
    if (weapons.some((i) => isSealed(attacker, i))) {
      give(s, attacker, weapons);
      throw new Error('封じられた属性は使えない');
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
    if (used.some((i) => isSealed(defender, i))) {
      give(s, defender, used);
      throw new Error('封じられた属性は使えない');
    }

    const res = resolveDamage(weapons, used, { defenseScale: defenseScaleOf(defender) });
    defender.hp = Math.max(0, defender.hp - res.damage);
    defender.stats.taken += res.damage;
    defender.stats.blocked += res.blocked;
    attacker.stats.dealt += res.damage;

    const defeated = defender.hp <= 0 && defender.alive;
    if (defeated) {
      defender.alive = false;
      defender.hand = [];
      defender.status = [];
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
        attacker.status = [];
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

    if (isSealed(p, item)) {
      give(s, p, [item]);
      throw new Error('封じられた属性は使えない');
    }

    const out = { item, healed: 0, drawn: [], stolen: [], hex: null };
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
    } else if (Items.isHex(item)) {
      const victim = targetId === undefined || targetId === null
        ? pickRichestOpponent(s, p.id)
        : byId(s, targetId);
      if (!victim || !victim.alive || victim.id === p.id) {
        give(s, p, [item]);
        throw new Error('状態異常の対象が不正');
      }
      out.hex = applyHex(victim, item);
      out.victim = victim.id;
    }

    log(s, {
      t: 'use', actor: p.id, item: item.id, healed: out.healed,
      drawn: out.drawn.length, stolen: out.stolen.length, victim: out.victim,
      hex: out.hex ? { id: out.hex.id, turns: out.hex.turns, element: out.hex.element } : null
    });
    endTurn(s);
    return out;
  }

  /**
   * 状態異常をかける。同じものが既にかかっていたら、残りターンの長い方を採る
   * （重ねがけで無限に伸びないようにする）。
   */
  function applyHex(victim, item) {
    const st = { id: item.effect, turns: item.turns || 2, power: item.power };
    if (item.effect === 'seal') st.element = strongestElement(victim);
    const existing = (victim.status || []).find((x) => x.id === st.id);
    if (existing) {
      existing.turns = Math.max(existing.turns, st.turns);
      existing.power = Math.max(existing.power, st.power);
      if (st.element) existing.element = st.element;
      return existing;
    }
    victim.status.push(st);
    return st;
  }

  /**
   * 手札の中で総合力がいちばん高い属性。ふうじの対象を決めるのに使う。
   * 攻撃側には相手の手札が見えないので、「必ず痛いところに当たるが、
   * どこに当たるかは撃つ側にも分からない」効果になる。
   */
  function strongestElement(p) {
    const total = new Map();
    for (const it of p.hand) {
      if (it.element === 'all') continue;
      total.set(it.element, (total.get(it.element) || 0) + it.power);
    }
    let best = null, bestValue = -1;
    for (const el of Items.ATTACK_ELEMENTS) {
      const v = total.get(el) || 0;
      if (v > bestValue) { bestValue = v; best = el; }
    }
    return best || 'none';
  }

  /**
   * 手番のはじめに状態異常を処理する。毒のダメージを与え、残りターンを1減らす。
   * @returns {{poison:number, expired:string[]}}
   */
  function tickStatus(s, p) {
    const out = { poison: 0, expired: [] };
    if (!p.status || !p.status.length) return out;
    const poison = statusOf(p, 'poison');
    if (poison) {
      out.poison = Math.min(p.hp, poison.power);
      p.hp = Math.max(0, p.hp - poison.power);
      p.stats.taken += out.poison;
    }
    for (const st of p.status) st.turns--;
    out.expired = p.status.filter((st) => st.turns <= 0).map((st) => st.id);
    p.status = p.status.filter((st) => st.turns > 0);
    return out;
  }

  function pickRichestOpponent(s, id) {
    return targetsFor(s, id).slice().sort((a, b) => b.hand.length - a.hand.length)[0] || null;
  }

  /** 決着していれば phase を over にして true を返す */
  function checkOver(s) {
    const alive = alivePlayers(s);
    if (alive.length > 1) return false;
    s.phase = 'over';
    s.winner = alive.length === 1 ? alive[0].id : null;
    log(s, { t: 'over', winner: s.winner });
    return true;
  }

  /** 手番の札を次の生存者へ進めるだけ（状態異常の処理はしない） */
  function advance(s) {
    let next = s.turn;
    for (let i = 0; i < s.players.length; i++) {
      next = (next + 1) % s.players.length;
      if (s.players[next].alive) break;
    }
    if (next <= s.turn) s.round++;
    s.turn = next;
    s.phase = 'turn';
  }

  /**
   * 手番のはじめの処理。毒で倒れたら、そのまま次の人へ送る。
   * 毒で全滅しうるので、生存者を見ながら回す（再帰にすると読みづらいのでループにした）。
   */
  function startTurn(s) {
    for (let guard = 0; guard <= s.players.length + 1; guard++) {
      const p = current(s);
      const tick = tickStatus(s, p);
      if (tick.poison > 0) {
        log(s, { t: 'poison', actor: p.id, damage: tick.poison });
      }
      if (p.hp <= 0 && p.alive) {
        p.alive = false;
        p.hand = [];
        p.status = [];
        log(s, { t: 'fall', actor: p.id, cause: 'poison' });
      }
      if (checkOver(s)) return;
      if (p.alive) return;
      advance(s);
    }
  }

  /** 次の生存者へ手番を渡す。決着していれば phase を over にする。 */
  function endTurn(s) {
    if (checkOver(s)) return;
    advance(s);
    startTurn(s);
  }

  global.GA = global.GA || {};
  global.GA.Engine = {
    START_HP, HAND_LIMIT, OPENING_HAND, PRAY_DRAW,
    setRandom, random,
    create, current, alivePlayers, byId, targetsFor, availableActions, canPray, itemValue,
    statusOf, isSealed, isUsable, defenseScaleOf, previewDefense, strongestElement, tickStatus,
    weaponsOf, defensesOf, supportsOf,
    resolveDamage, attack, defend, pray, useItem, endTurn
  };
})(typeof window !== 'undefined' ? window : globalThis);

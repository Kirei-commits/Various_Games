/**
 * ゲーム進行。DOM にも描画にも依存しない純ロジックで、
 * 状態を引数に取り、状態を書き換えて「何が起きたか」を返す。
 * 乱数は setRandom() で差し替えられる（テストを決定的にするため）。
 */
(function (global) {
  'use strict';

  const Items = global.GA.Items;

  // 特性つきの武器が入って1局が短くなり、運の比重が上がった。
  // HPを増やして手数を戻すと、腕の差が出る幅も戻る（撹拌シード300局で実測）。
  const START_HP = 48;
  // 人数が増えるとその分だけ毎ラウンドの被弾が増える（全員が必ず攻撃するため）。
  // 人数に応じてHPを足さないと、多人数戦で何もできずに退場する者が出る。
  const HP_PER_EXTRA_PLAYER = 6;
  const HAND_LIMIT = 12;
  const OPENING_HAND = 5;
  // 1対1では先手が1回多く攻撃できるぶん有利になる（撹拌シード1200局の実測で
  // 54.7% ±2.8pt）。後手に神器を1つ渡すと 50.4% に戻る。
  // 3人以上では手番順の偏りが別の形（最後が有利）になり、同じ補正を足すと
  // かえって悪化したので、1対1に限って当てる。
  const DUEL_SECOND_BONUS = 1;
  const PRAY_DRAW = 3;

  let rng = Math.random;
  function setRandom(fn) { rng = fn || Math.random; }
  function random() { return rng(); }

  /** 0..n-1 の整数 */
  function randInt(n) { return Math.floor(rng() * n) % n; }

  /**
   * 新しい対戦を作る。
   *
   * **先手は既定でランダムに決まる。** 手番順には有利不利が残っていて
   * （3人戦では最後の手番が 37.7%／期待33.3%、撹拌シード1200局の実測）、
   * 人間をいつも先頭に置くと、その偏りをいつも人間が背負うことになる。
   * 席と手番順を切り離せば、人間の期待勝率は全席の平均＝公平になる。
   * テストは `firstTurn` を明示して決定的にする。
   *
   * @param {{names?:string[], humans?:number, hp?:number, levels?:string[],
   *          firstTurn?:number}} opts
   */
  function create(opts) {
    const o = opts || {};
    const names = o.names || ['あなた', 'アレス', 'ヘラ', 'ロキ'];
    const humans = o.humans === undefined ? 1 : o.humans;
    const hp = o.hp || (START_HP + HP_PER_EXTRA_PLAYER * Math.max(0, names.length - 2));
    const first = (o.firstTurn === undefined || o.firstTurn === null)
      ? randInt(names.length)
      : Math.max(0, Math.min(names.length - 1, o.firstTurn));
    // 1対1の補正は「後に動く側」に渡す（席ではなく手番順に紐づける）
    const duel = names.length === 2;
    const players = names.map((name, i) => ({
      id: i,
      name,
      isHuman: i < humans,
      level: (o.levels && o.levels[i]) || 'normal',
      hp,
      maxHp: hp,
      alive: true,
      status: [],
      hand: Items.draw(rng, OPENING_HAND + (duel && i !== first ? DUEL_SECOND_BONUS : 0)),
      stats: { dealt: 0, blocked: 0, taken: 0, healed: 0, kills: 0, reflected: 0 }
    }));
    return {
      players,
      turn: first,
      first,
      round: 1,
      turnsThisRound: 0,
      phase: 'turn',        // 'turn' | 'defense' | 'over'
      pending: null,        // 防御待ちの攻撃
      winner: null,
      events: 0,          // 積んだログの総数（表示は300件で打ち切るが、これは減らない）
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
   * 攻撃を「命中パケット」に展開する。
   * 連撃(hits)は回数分のパケットに分かれ、1つの防具では1回分しか受け止められない。
   * それ以外の武器は、同じ性質（属性・貫通・会心）どうしをまとめる
   * （防具を何枚も重ねて受けられるため）。
   */
  function toPackets(weapons) {
    const merged = new Map();
    const packets = [];
    for (const w of weapons) {
      const hits = w.hits > 1 ? w.hits : 1;
      if (hits > 1) {
        for (let i = 0; i < hits; i++) {
          packets.push({
            element: w.element, power: w.power, pierce: !!w.pierce, crit: !!w.crit,
            solo: true, blocked: 0, reflected: 0, shielded: false
          });
        }
        continue;
      }
      const key = `${w.element}/${w.pierce ? 1 : 0}/${w.crit ? 1 : 0}`;
      const found = merged.get(key);
      if (found) { found.power += w.power; continue; }
      const packet = {
        element: w.element, power: w.power, pierce: !!w.pierce, crit: !!w.crit,
        solo: false, blocked: 0, reflected: 0, shielded: false
      };
      merged.set(key, packet);
      packets.push(packet);
    }
    return packets;
  }

  /**
   * 攻撃と防御からダメージを求める純関数。ここがルールの核。
   *
   *  - 攻撃は属性ごとにまとまる。同じ属性の防具だけがその属性を止められる
   *  - 全属性(all)の防具はどの属性でも受けられる
   *  - 反射具は止めた分をそのまま攻撃側へ返す
   *  - 貫通(pierce)に対しては防具の効果が半分になる
   *  - 連撃(hits)は回数分に分かれ、防具1枚が受け止められるのは1回分だけ
   *  - 会心(crit)は、その一撃が1点も防がれなかったときだけ威力が1.5倍になる
   *
   * 防具の割り当ては「防御側にとって有利な順」で決める（出した側が損しないように）。
   *   1. 反射具を先に使う（撃ち返せる量が最大になる）
   *   2. 強い防具から順に、いちばん多く止められる相手に充てる
   *   3. 同じだけ止まるなら連撃の1回分に充てる（残りの防具を重ねる余地を残せる）
   */
  function resolveDamage(weapons, defenses, opts) {
    const scale = (opts && opts.defenseScale !== undefined) ? opts.defenseScale : 1;
    const packets = toPackets(weapons);

    const shields = defenses
      .map((d) => ({ element: d.element, power: Math.floor(d.power * scale), reflect: d.kind === 'reflect' }))
      .filter((d) => d.power > 0)
      // 1) 反射具を先に（撃ち返せる量が最大になる）
      // 2) 次に属性が決まっている防具（全属性の防具に先を譲ると、その属性しか
      //    止められない防具が出番を失って防げる量が減る）
      // 3) 同じ条件なら強いものから
      .sort((a, b) => {
        if (a.reflect !== b.reflect) return a.reflect ? -1 : 1;
        const aAll = a.element === 'all', bAll = b.element === 'all';
        if (aAll !== bAll) return aAll ? 1 : -1;
        return b.power - a.power;
      });

    let wasted = 0;
    for (const shield of shields) {
      let best = null;
      for (const packet of packets) {
        if (shield.element !== 'all' && shield.element !== packet.element) continue;
        if (packet.solo && packet.shielded) continue;            // 連撃の1回分には1枚だけ
        const remaining = packet.power - packet.blocked;
        if (remaining <= 0) continue;
        const effect = Math.floor(shield.power * (packet.pierce ? 0.5 : 1));
        const stop = Math.min(effect, remaining);
        if (stop <= 0) continue;
        const better = !best || stop > best.stop
          || (stop === best.stop && packet.solo && !best.packet.solo);
        if (better) best = { packet, stop };
      }
      if (!best) { wasted += shield.power; continue; }
      best.packet.blocked += best.stop;
      if (best.packet.solo) best.packet.shielded = true;
      if (shield.reflect) best.packet.reflected += best.stop;
      wasted += shield.power - best.stop;
    }

    // 属性ごとにまとめ直す
    const rows = new Map();
    let damage = 0, blocked = 0, reflected = 0, crits = 0;
    for (const packet of packets) {
      let through = packet.power - packet.blocked;
      const critHit = packet.crit && packet.blocked === 0 && through > 0;
      if (critHit) { through = Math.floor(through * 1.5); crits++; }
      damage += through;
      blocked += packet.blocked;
      reflected += packet.reflected;
      const row = rows.get(packet.element)
        || { element: packet.element, raw: 0, blocked: 0, reflected: 0, through: 0, crit: false };
      row.raw += packet.power;
      row.blocked += packet.blocked;
      row.reflected += packet.reflected;
      row.through += through;
      row.crit = row.crit || critHit;
      rows.set(packet.element, row);
    }
    const detail = [...rows.values()].sort((a, b) => b.raw - a.raw);
    return { damage, blocked, reflected, crits, detail, wasted };
  }

  /** のろいを考慮した防御倍率 */
  function defenseScaleOf(p) { return statusOf(p, 'curse') ? 0.5 : 1; }

  /**
   * 神の怒り。長引くほど、通ったダメージが重くなる。
   *
   * 問題は中央値ではなく**長い試合の尾**だった。実測（撹拌シード各300局）:
   *   怒りなし   6人戦 ログ中央265 / 9割339 / 最長448
   *   from=18    6人戦 ログ中央189〜206 / 9割239 / 最長285
   * 中央値はほとんど変えずに最長を切れる。from を 14 まで下げると
   * タイマンにも効いてしまい、腕の差（ゴッド vs かけだし）が 75%→72% に落ちた。
   */
  const WRATH = {
    from: 18,    // このラウンドを超えてから効きはじめる
    step: 0.2,   // 1ラウンドごとの増分
    max: 2.5     // 上限
  };

  function wrathScale(round) {
    if (round <= WRATH.from) return 1;
    return Math.min(WRATH.max, 1 + (round - WRATH.from) * WRATH.step);
  }

  /** 神の加護がかかる残りHPの割合 */
  const GRACE_AT = 0.4;
  /** 加護がかかっている間、通ってきたダメージに掛ける倍率 */
  const GRACE_SCALE = 0.5;

  /**
   * 神の加護。瀕死の者は神に守られ、受けるダメージが軽くなる。
   *
   * 多人数戦では「武器を持っていたら必ず攻撃する」ため、人数分の火力が
   * 毎ラウンド誰か1人に集まる。加護が無いと、6人戦で4人に1人が
   * 一度も行動しないまま退場していた。倒しきるには重ねて殴る必要がある、
   * という形にして、狙われた側に手番が回るようにしている。
   */
  function graceScale(p) { return p.hp <= Math.ceil(p.maxHp * GRACE_AT) ? GRACE_SCALE : 1; }

  /** 加護を考慮した実ダメージ */
  function applyGrace(p, damage) { return Math.ceil(damage * graceScale(p)); }

  /**
   * 合計を `target` に合わせて、各行の整数値を比例配分で詰める。
   * 端数は「削る量が大きい行から」引く（最大剰余法）。
   * これをやらないと、属性ごとの内訳の合計と実ダメージが食い違う。
   */
  function rescaleRows(rows, key, target) {
    const current = rows.reduce((sum, r) => sum + r[key], 0);
    if (current === target || current <= 0) return;
    const exact = rows.map((r) => (r[key] * target) / current);
    const floored = exact.map((v) => Math.floor(v));
    let rest = target - floored.reduce((a, b) => a + b, 0);
    const order = rows
      .map((r, i) => ({ i, frac: exact[i] - floored[i] }))
      .sort((a, b) => b.frac - a.frac);
    for (const { i } of order) {
      if (rest <= 0) break;
      floored[i]++;
      rest--;
    }
    rows.forEach((r, i) => { r[key] = floored[i]; });
  }

  /**
   * 加護を効かせる。通ったダメージと撃ち返しを軽くし、
   * **属性ごとの内訳も同じ比率で詰める**（行の合計が実ダメージと一致するように）。
   * 攻撃側と防御側で加護の有無が違うので、それぞれの倍率を使う。
   */
  function applyGraceToResult(res, defender, attacker, round) {
    // 先に神の怒りで重くし、そのあと加護で軽くする。
    // 内訳の行も同じ比率で詰めて、合計と一致させる。
    const wrath = wrathScale(round || 1);
    res.wrath = wrath;
    if (wrath > 1 && res.damage > 0) {
      const heavier = Math.ceil(res.damage * wrath);
      rescaleRows(res.detail, 'through', heavier);
      res.wrathAdded = heavier - res.damage;
      res.damage = heavier;
    } else {
      res.wrathAdded = 0;
    }

    const damage = applyGrace(defender, res.damage);
    res.graced = res.damage - damage;
    if (damage !== res.damage) {
      const before = res.detail.map((r) => r.through);
      rescaleRows(res.detail, 'through', damage);
      // 加護で軽くなった分は行ごとに覚えておく（表示で「どこへ消えたか」が要る）。
      // **blocked は書き換えない。** 加護で減った分を「防いだ」に足すと、
      // 防具を出していないのに防いだことになり、同じ点を二重に数える。
      res.detail.forEach((r, i) => { r.graced = before[i] - r.through; });
    } else {
      res.detail.forEach((r) => { r.graced = 0; });
    }
    res.damage = damage;

    const reflected = applyGrace(attacker, res.reflected);
    if (reflected !== res.reflected) rescaleRows(res.detail, 'reflected', reflected);
    res.reflected = reflected;
    return res;
  }

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
    const res = resolveDamage(s.pending.weapons, list, { defenseScale: defenseScaleOf(defender) });
    // 加護もここで効かせる。UIのプレビューと実際の解決が違う数字になってはいけない。
    // 撃ち返しは攻撃側が受けるので、加護は攻撃側のものを見る。
    return applyGraceToResult(res, defender, byId(s, s.pending.attackerId), s.round);
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

  /**
   * ログに1件積む。
   * 表示用に直近300件だけを保つが、`events` は切り捨てず数え続ける
   * （進行しているかどうかの判定に log.length を使うと、上限に達した時点で
   *   「進んでいない」と誤判定される。実際に通しプレイで踏んだ）。
   */
  function log(s, entry) {
    s.events++;
    s.log.push(Object.assign({ n: s.events, round: s.round }, entry));
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

    const res = applyGraceToResult(
      resolveDamage(weapons, used, { defenseScale: defenseScaleOf(defender) }),
      defender, attacker, s.round);
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
    // ただし加護は効く（受ける側が瀕死なら軽くなる）。
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
      crits: res.crits, graced: res.graced, wrath: res.wrath, wrathAdded: res.wrathAdded,
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
    // どくは神の加護を貫く。加護で粘っている相手に、毒がとどめの手段として残る。
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

  /**
   * 手番の札を次の生存者へ進めるだけ（状態異常の処理はしない）。
   *
   * ラウンドの数え方は「席の番号が巻き戻ったら」ではなく
   * **生存者が一巡したら** にする。先手はランダムなので、席の番号で数えると
   * 最初のラウンドが1手で終わってしまい、神の怒りの開始が席によってずれる。
   */
  function advance(s) {
    let next = s.turn;
    for (let i = 0; i < s.players.length; i++) {
      next = (next + 1) % s.players.length;
      if (s.players[next].alive) break;
    }
    s.turn = next;
    s.phase = 'turn';

    s.turnsThisRound++;
    if (s.turnsThisRound >= alivePlayers(s).length) {
      s.round++;
      s.turnsThisRound = 0;
    }
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
    START_HP, HP_PER_EXTRA_PLAYER, HAND_LIMIT, OPENING_HAND, PRAY_DRAW, DUEL_SECOND_BONUS,
    setRandom, random,
    create, current, alivePlayers, byId, targetsFor, availableActions, canPray, itemValue,
    statusOf, isSealed, isUsable, defenseScaleOf, previewDefense, strongestElement, tickStatus,
    GRACE_AT, GRACE_SCALE, graceScale, applyGrace, applyGraceToResult, rescaleRows,
    WRATH, wrathScale,
    weaponsOf, defensesOf, supportsOf,
    resolveDamage, toPackets, attack, defend, pray, useItem, endTurn
  };
})(typeof window !== 'undefined' ? window : globalThis);

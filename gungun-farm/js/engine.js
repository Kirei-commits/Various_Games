/**
 * ルールと進行。DOM も乱数も時計も、ここから直接は触らない。
 *
 * - 時間は必ず外から渡す（`tick(state, now)`）。`Date.now()` をこの中で呼ばない。
 *   そうしておくと、ロジックテストで10分の農園経営を一瞬で回せる。
 * - 乱数は `setRandom()` を通す。`?seed=` で同じ引きを再現するため。
 */
(function (global) {
  'use strict';

  const Data = global.GF.Data;

  let rng = Math.random;
  const setRandom = (fn) => { rng = fn || Math.random; };
  const rand = (n) => Math.floor(rng() * n);
  const pick = (arr) => arr[rand(arr.length)];

  const ORDER_SLOTS = 3;
  const ORDER_REFILL_MS = 2200;      // 空いた注文枠が埋まるまでの間
  const COMBO_MAX = 10;
  const COMBO_STEP = 0.05;           // 連続配達1回あたりの報酬倍率
  const QUICK_RATIO = 0.5;           // 期限の前半に届けると「はやうま」
  const QUICK_BONUS = 0.25;

  /* ---------------------------------------------------------------- 状態 */

  function create(opts = {}) {
    const machines = [{ id: 'mill', queue: [], done: 0 }];  // せいふんきは最初から持っている
    const state = {
      now: 0,
      mode: opts.mode === 'rush' ? 'rush' : 'free',
      limit: opts.mode === 'rush' ? (opts.limit || 180_000) : 0,
      over: false,
      coins: opts.coins === undefined ? 30 : opts.coins,
      level: 1,
      xp: 0,
      xpNext: Data.xpFor(1),
      fieldsOwned: Data.FIELDS_AT_START,
      fields: Array.from({ length: Data.FIELD_SLOTS }, () => ({ crop: null, plantedAt: 0, readyAt: 0 })),
      machines,
      barn: {},
      barnUp: 0,
      orders: [],
      orderSeq: 1,
      nextOrderAt: 0,
      combo: 0,
      bestCombo: 0,
      stats: { harvested: 0, crafted: 0, delivered: 0, expired: 0, coinsEarned: 0, xpEarned: 0, rescues: 0 },
      events: [],
      eventSeq: 1
    };
    fillOrders(state);
    return state;
  }

  const barnCap = (state) => Data.BARN_AT_START + state.barnUp * Data.BARN_STEP;
  const barnUsed = (state) => Object.values(state.barn).reduce((a, b) => a + b, 0);
  const barnFree = (state) => Math.max(0, barnCap(state) - barnUsed(state));
  const has = (state, id, n = 1) => (state.barn[id] || 0) >= n;
  const ownsMachine = (state, id) => state.machines.some((m) => m.id === id);

  function event(state, kind, text, extra) {
    state.events.push(Object.assign({ id: state.eventSeq++, t: state.now, kind, text }, extra || {}));
    if (state.events.length > 60) state.events.splice(0, state.events.length - 60);
  }

  /** 倉庫へ入れる。入りきらない分は捨てずに「入った数」を返す。 */
  function store(state, id, n = 1) {
    const put = Math.min(n, barnFree(state));
    if (put > 0) state.barn[id] = (state.barn[id] || 0) + put;
    return put;
  }

  function take(state, id, n = 1) {
    if (!has(state, id, n)) return false;
    state.barn[id] -= n;
    if (state.barn[id] <= 0) delete state.barn[id];
    return true;
  }

  function earn(state, coins, xp) {
    if (coins) { state.coins += coins; state.stats.coinsEarned += coins; }
    if (xp) { state.xp += xp; state.stats.xpEarned += xp; levelUp(state); }
  }

  function levelUp(state) {
    while (state.level < Data.MAX_LEVEL && state.xp >= state.xpNext) {
      state.xp -= state.xpNext;
      state.level++;
      state.xpNext = Data.xpFor(state.level);
      event(state, 'levelup', `レベル ${state.level}！`, { level: state.level, unlocks: Data.unlockedAt(state.level) });
    }
    if (state.level >= Data.MAX_LEVEL) state.xp = Math.min(state.xp, state.xpNext);
  }

  /* ---------------------------------------------------------------- 畑 */

  const canPlant = (state, i, cropId) => {
    const c = Data.crop(cropId);
    if (!c || c.level > state.level) return false;
    if (i >= state.fieldsOwned) return false;
    const f = state.fields[i];
    return !!f && !f.crop && state.coins >= c.cost;
  };

  function plant(state, i, cropId) {
    if (!canPlant(state, i, cropId)) return false;
    const c = Data.crop(cropId);
    state.coins -= c.cost;
    state.fields[i] = { crop: cropId, plantedAt: state.now, readyAt: state.now + c.sec * 1000 };
    return true;
  }

  /** 空いている畑へまとめて植える。コインが尽きたところで止める。 */
  function plantAll(state, cropId) {
    let n = 0;
    for (let i = 0; i < state.fieldsOwned; i++) if (plant(state, i, cropId)) n++;
    return n;
  }

  const isReady = (f, now) => !!f.crop && f.readyAt <= now;

  /**
   * 収穫する。`replant` を渡すと、空いた畑へそのタネをその場で植え直す。
   *
   * 「収穫 → 植える」の往復は、待ち時間のあるゲームでは意味のある操作だが、
   * このゲームには待ちが無いので**ただの往復**になる。計測したら、全操作の
   * 71%が収穫と植え直しで、判断のある操作は11%しか残っていなかった。
   * 植え直しを収穫にくっつけて、その分を注文と店（＝考えるところ）に回す。
   */
  function harvest(state, i, replant) {
    const f = state.fields[i];
    if (!f || !isReady(f, state.now)) return false;
    if (barnFree(state) < 1) return false;          // 倉庫がいっぱいなら収穫できない
    const c = Data.crop(f.crop);
    store(state, f.crop, 1);
    state.fields[i] = { crop: null, plantedAt: 0, readyAt: 0 };
    state.stats.harvested++;
    earn(state, 0, c.xp);
    if (replant) plant(state, i, replant);          // タネ代が無ければ空いたまま
    return true;
  }

  function harvestAll(state, replant) {
    let n = 0;
    for (let i = 0; i < state.fieldsOwned; i++) if (harvest(state, i, replant)) n++;
    return n;
  }

  /* ---------------------------------------------------------------- 加工機 */

  const machineDef = (m) => Data.machine(m.id);

  function canQueue(state, idx) {
    const m = state.machines[idx];
    if (!m) return false;
    const def = machineDef(m);
    if (m.queue.length + m.done >= def.slots) return false;
    return Object.entries(def.recipe.in).every(([id, n]) => has(state, id, n));
  }

  function queue(state, idx, now) {
    if (!canQueue(state, idx)) return false;
    const m = state.machines[idx];
    const def = machineDef(m);
    for (const [id, n] of Object.entries(def.recipe.in)) take(state, id, n);
    const start = now === undefined ? state.now : now;
    m.queue.push({ startedAt: start, readyAt: start + def.recipe.sec * 1000 });
    return true;
  }

  /** 出来上がったものを倉庫へ。倉庫が満杯なら機械の中に残す（消えない）。 */
  function collect(state, idx) {
    const m = state.machines[idx];
    if (!m || m.done < 1) return 0;
    const def = machineDef(m);
    const put = store(state, def.recipe.out, m.done);
    if (put > 0) {
      m.done -= put;
      state.stats.crafted += put;
      earn(state, 0, def.recipe.xp * put);
    }
    return put;
  }

  function collectAll(state) {
    let n = 0;
    for (let i = 0; i < state.machines.length; i++) n += collect(state, i);
    return n;
  }

  /** 開いている注文が欲しがっている数。まとめ仕込みはここに手を出さない。 */
  function reservedForOrders(state) {
    const want = {};
    for (const o of state.orders) {
      for (const [id, n] of Object.entries(o.want)) want[id] = (want[id] || 0) + n;
    }
    return want;
  }

  /**
   * 出来たものを取り出して、余っている材料で全部仕込む。
   * **注文に要るぶんは残す。** 1タップのボタンが、届けるはずだった品を
   * 勝手に材料にしてしまうと、押すのが怖いボタンになる。
   * 1台ずつ押したときは遠慮しない（そちらは自分で決めた操作なので）。
   */
  function workAll(state) {
    const got = collectAll(state);
    const keep = reservedForOrders(state);
    let queued = 0;
    for (let i = 0; i < state.machines.length; i++) {
      const def = machineDef(state.machines[i]);
      for (let guard = 0; guard < 12; guard++) {
        const spare = Object.entries(def.recipe.in)
          .every(([id, n]) => (state.barn[id] || 0) - (keep[id] || 0) >= n);
        if (!spare || !canQueue(state, i)) break;
        queue(state, i);
        queued++;
      }
    }
    return { got, queued };
  }

  /* ---------------------------------------------------------------- 注文 */

  /** いま自力で用意できるもの（解放済みの作物と、持っている機械の作るもの）。 */
  function obtainable(state) {
    const ids = Data.cropsAt(state.level).map((c) => c.id);
    for (const m of state.machines) ids.push(machineDef(m).recipe.out);
    return ids;
  }

  /**
   * 注文を1件作る。**用意できないものは絶対に頼まない**。
   * 高い品ほど選ばれやすくするが、こむぎだけの注文も残す（詰まったときの逃げ道）。
   */
  function makeOrder(state) {
    const ids = obtainable(state);
    const kinds = Math.min(ids.length, 1 + (rng() < 0.45 ? 1 : 0) + (state.level >= 5 && rng() < 0.3 ? 1 : 0));
    const chosen = [];
    const pool = ids.slice();
    for (let k = 0; k < kinds && pool.length; k++) {
      // 高い品に寄せる: 2つ引いて高い方を採る
      const a = rand(pool.length), b = rand(pool.length);
      const i = Data.item(pool[a]).sell >= Data.item(pool[b]).sell ? a : b;
      chosen.push(pool.splice(i, 1)[0]);
    }
    const want = {};
    let units = 0;
    let value = 0;
    for (const id of chosen) {
      const sell = Data.item(id).sell;
      const max = sell >= 80 ? 2 : sell >= 25 ? 3 : 4;
      const n = 1 + rand(max);
      want[id] = n;
      units += n;
      value += sell * n;
    }
    const ttl = Math.min(150_000, 45_000 + units * 12_000);
    return {
      id: state.orderSeq++,
      want,
      coins: Math.max(5, Math.round(value * 1.35)),
      xp: Math.max(2, Math.round(value / 9) + chosen.length * 2),
      createdAt: state.now,
      expiresAt: state.now + ttl,
      ttl
    };
  }

  function fillOrders(state) {
    while (state.orders.length < ORDER_SLOTS) state.orders.push(makeOrder(state));
  }

  const canDeliver = (state, order) => Object.entries(order.want).every(([id, n]) => has(state, id, n));

  const comboMul = (state) => 1 + Math.min(state.combo, COMBO_MAX) * COMBO_STEP;

  function deliver(state, orderId) {
    const idx = state.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return null;
    const order = state.orders[idx];
    if (!canDeliver(state, order)) return null;
    for (const [id, n] of Object.entries(order.want)) take(state, id, n);

    const elapsed = state.now - order.createdAt;
    const quick = elapsed <= order.ttl * QUICK_RATIO;
    state.combo++;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    const coins = Math.round(order.coins * comboMul(state) * (quick ? 1 + QUICK_BONUS : 1));
    earn(state, coins, order.xp);
    state.stats.delivered++;
    state.orders.splice(idx, 1);
    state.nextOrderAt = Math.max(state.nextOrderAt, state.now + ORDER_REFILL_MS);
    event(state, 'deliver', `${coins}コイン`, { coins, quick, combo: state.combo });
    return { coins, xp: order.xp, quick, combo: state.combo };
  }

  /** 気に入らない注文は捨てられる。捨てないと3枠が埋まったまま進まなくなる。 */
  function dismiss(state, orderId) {
    const idx = state.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return false;
    state.orders.splice(idx, 1);
    state.nextOrderAt = Math.max(state.nextOrderAt, state.now + ORDER_REFILL_MS);
    return true;
  }

  /* ---------------------------------------------------------------- 店 */

  function sell(state, id, n = 1) {
    const have = state.barn[id] || 0;
    const num = Math.min(n, have);
    if (num < 1) return 0;
    take(state, id, num);
    const coins = Data.item(id).sell * num;
    earn(state, coins, 0);
    return coins;
  }

  const nextFieldPrice = (state) => {
    const k = state.fieldsOwned - Data.FIELDS_AT_START;
    return Data.FIELD_UPGRADES[k] || null;
  };

  function buyField(state) {
    const up = nextFieldPrice(state);
    if (!up || state.level < up.level || state.coins < up.price) return false;
    state.coins -= up.price;
    state.fieldsOwned++;
    event(state, 'buy', '畑が増えた！');
    return true;
  }

  function buyBarn(state) {
    const price = Data.barnPrice(state.barnUp);
    if (state.coins < price) return false;
    state.coins -= price;
    state.barnUp++;
    event(state, 'buy', `倉庫 ${barnCap(state)}`);
    return true;
  }

  function buyMachine(state, id) {
    const def = Data.machine(id);
    if (!def || ownsMachine(state, id)) return false;
    if (state.level < def.level || state.coins < def.price) return false;
    state.coins -= def.price;
    state.machines.push({ id, queue: [], done: 0 });
    event(state, 'buy', `${def.name}！`);
    return true;
  }

  /* ---------------------------------------------------------------- 進行 */

  /**
   * 行き止まりの救済。
   * タネも買えず、倉庫は空、畑も機械も動いていない——この状態は自力で抜けられない。
   * 「ごえんのタネ」として最低限のコインを渡す。
   * （注文を捨て続けて破産することは実際に起こりうる。tests/logic/economy が見張っている）
   */
  function rescue(state) {
    const cheapest = Math.min(...Data.cropsAt(state.level).map((c) => c.cost));
    if (state.coins >= cheapest) return false;
    if (barnUsed(state) > 0) return false;
    if (state.fields.some((f) => f.crop)) return false;
    if (state.machines.some((m) => m.queue.length || m.done)) return false;
    state.coins = cheapest * 5;
    state.stats.rescues++;
    event(state, 'rescue', 'ごえんのタネ🌱');
    return true;
  }

  /**
   * 時間を進める。ここでだけ「出来上がり」と「期限切れ」が起きる。
   * 何度呼んでも、同じ now なら同じ結果になる（冪等）。
   */
  function tick(state, now) {
    if (state.over) return state;
    state.now = Math.max(state.now, now);

    for (const m of state.machines) {
      while (m.queue.length && m.queue[0].readyAt <= state.now) { m.queue.shift(); m.done++; }
    }

    let lost = 0;
    for (let i = state.orders.length - 1; i >= 0; i--) {
      if (state.orders[i].expiresAt <= state.now) {
        state.orders.splice(i, 1);
        state.stats.expired++;
        lost++;
      }
    }
    if (lost) {
      state.combo = 0;
      state.nextOrderAt = Math.max(state.nextOrderAt, state.now + ORDER_REFILL_MS);
      event(state, 'expire', '注文が流れた…');
    }

    if (state.orders.length < ORDER_SLOTS && state.now >= state.nextOrderAt) {
      state.orders.push(makeOrder(state));
      if (state.orders.length < ORDER_SLOTS) state.nextOrderAt = state.now + ORDER_REFILL_MS;
    }

    rescue(state);

    if (state.mode === 'rush' && state.limit && state.now >= state.limit) {
      state.over = true;
      event(state, 'over', 'おしまい！');
    }
    return state;
  }

  /** 残り時間（rush のみ）。表示用。 */
  const timeLeft = (state) => (state.mode === 'rush' ? Math.max(0, state.limit - state.now) : Infinity);

  /** 3分チャレンジの成績。稼いだコインが本体で、レベルと連続配達を添える。 */
  const score = (state) => state.stats.coinsEarned;

  global.GF = global.GF || {};
  global.GF.Engine = {
    ORDER_SLOTS, COMBO_MAX, QUICK_RATIO, QUICK_BONUS,
    setRandom, create, tick,
    barnCap, barnUsed, barnFree, has, ownsMachine,
    canPlant, plant, plantAll, isReady, harvest, harvestAll,
    canQueue, queue, collect, collectAll, workAll, reservedForOrders, machineDef,
    obtainable, makeOrder, canDeliver, deliver, dismiss, comboMul,
    sell, nextFieldPrice, buyField, buyBarn, buyMachine,
    rescue, timeLeft, score, store, take, event
  };
})(typeof window !== 'undefined' ? window : globalThis);

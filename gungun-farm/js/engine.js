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

  /** 注文の枠。**レベルに沿って増える**（テーブルは data.js） */
  const orderSlots = (state) => Data.orderSlotsAt(state.level);
  const BOAT_LEVEL = 7;              // ふなびんが来はじめるレベル
  const BOAT_TTL = 240_000;          // 出港まで4分
  const BOAT_BONUS = 2.2;            // 積みきったときの倍率（ふつうの注文は1.35倍）
  const BOAT_GAP = 20_000;           // 次の船が来るまでの間
  const ORDER_REFILL_MS = 2200;      // 空いた注文枠が埋まるまでの間
  const COMBO_MAX = 10;
  const COMBO_STEP = 0.05;           // 連続配達1回あたりの報酬倍率
  const QUICK_RATIO = 0.5;           // 期限の前半に届けると「はやうま」
  const QUICK_BONUS = 0.25;

  /**
   * 農園の一日（3分で一巡）。空の色だけの飾りだったものに、遊びの意味を持たせる。
   * **一日ごとに作物がひとつ「きょうの作物」になり、売値が上がる。**
   * 待ちが無いゲームは同じ輪をひたすら回すことになりやすいので、
   * **3分ごとに、手なりで最適だった選択がずれる**ようにしている。
   *
   * 倍率は**もうけ（売値 − タネ代）**に掛ける。育ちの速さにも経験値にも触らない
   * （育ちを速くすると10秒の約束に、経験値を増やすとレベル設計に効いてしまう）。
   *
   * **売値そのものに掛けてはいけない。** タネ代の高い作物ほど得が大きくなり、
   * 「短いほど1秒あたりが良い・長いほど1枠の値打ちが高い」という取引が壊れる
   * （メロンは売値×1.5でもうけが3.4倍になり、1秒あたりでも1枠でも最強になった）。
   * もうけに掛けるなら、どの作物も一律に1.5倍で、順位の関係はそのまま残る。
   */
  const DAY_MS = 180_000;
  const TODAY_BONUS = 1.5;

  /* ---------------------------------------------------------------- 状態 */

  /**
   * 新しい農園を作る。
   * `bare: true` は「形だけ欲しい」とき用（注文を引かないので乱数を消費しない）。
   */
  function create(opts = {}) {
    const machines = [{ id: 'mill', queue: [], done: 0 }];  // せいふんきは最初から持っている
    const state = {
      now: 0,
      mode: opts.mode === 'rush' ? 'rush' : 'free',
      limit: opts.mode === 'rush' ? (opts.limit || 180_000) : 0,
      over: false,
      coins: opts.coins === undefined ? 90 : opts.coins,
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
      boat: null,                    // ふなびん。少しずつ積める大きな注文
      nextBoatAt: 0,
      today: { day: -1, crop: null },  // きょうの作物。day は -1 から始めて最初の tick で引く
      decor: [],                     // 買ったかざり（能力は上げない。コインの行き先）
      combo: 0,
      bestCombo: 0,
      achieved: [],
      stats: {
        harvested: 0, crafted: 0, delivered: 0, expired: 0, shipped: 0, boatMissed: 0,
        coinsEarned: 0, xpEarned: 0, rescues: 0,
        coinsOrder: 0, coinsBoat: 0, coinsSell: 0   // コインの出どころ（測るため）
      },
      events: [],
      eventSeq: 1
    };
    if (!opts.bare) fillOrders(state);
    return state;
  }

  /**
   * 保存された農園に、あとから足した項目を埋める。
   *
   * **項目を増やすたびに古い保存が壊れる。** ふなびんを足したとき、
   * 古い保存には `nextBoatAt` が無く `now >= undefined` が常に false になって
   * **船が永久に来ない**状態になった（`stats.shipped` は `undefined++` で NaN）。
   * 読み込んだら必ずここを通す。増やした項目を個別に書き足す必要はない。
   */
  function normalize(state) {
    if (!state || typeof state !== 'object') return state;
    const shape = create({ bare: true });
    for (const k of Object.keys(shape)) {
      if (state[k] === undefined) state[k] = shape[k];
    }
    if (!state.stats || typeof state.stats !== 'object') state.stats = shape.stats;
    for (const k of Object.keys(shape.stats)) {
      if (typeof state.stats[k] !== 'number') state.stats[k] = 0;
    }
    if (!Array.isArray(state.events)) state.events = [];
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

  /**
   * コインと経験値を受け取る。
   *
   * `src` は**コインの出どころ**（`order` / `boat` / `sell`）。
   * このゲームは一度「稼ぎの55%が余りを売っただけ」になって、
   * 注文がおまけに落ちていた。**主筋がどこかは測らないと分からない**ので、
   * 内訳を数えて `npm run simulate` が毎回出す。
   * stats は平らな数にしておく（`normalize` が入れ子を 0 に潰すため）。
   */
  function earn(state, coins, xp, src) {
    if (coins) {
      state.coins += coins;
      state.stats.coinsEarned += coins;
      if (src === 'order') state.stats.coinsOrder += coins;
      else if (src === 'boat') state.stats.coinsBoat += coins;
      else if (src === 'sell') state.stats.coinsSell += coins;
    }
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

  /**
   * 植える。`readyIn` を渡すとその秒数で実る（時間差まきに使う）。
   * 渡さなければ作物どおりの秒数。
   */
  function plant(state, i, cropId, readyIn) {
    if (!canPlant(state, i, cropId)) return false;
    const c = Data.crop(cropId);
    state.coins -= c.cost;
    const ms = readyIn === undefined ? c.sec * 1000 : Math.max(200, readyIn);
    state.fields[i] = { crop: cropId, plantedAt: state.now, readyAt: state.now + ms };
    return true;
  }

  /**
   * 時間差まき。まとめて植えたぶんを、順番に実るようにずらす。
   *
   * **これが「待ち時間を限りなく0に近づける」仕掛け。**
   * 畑が一斉に実って一斉に空くと、遊ぶ側は「全部タップ → 数秒なにもできない」の
   * 繰り返しになる。測ったら**全体の33.8%が手持ち無沙汰**で、最長13.8秒あった。
   * まとめて k マス植えるとき、j 番目が `sec * (j+1)/k` で実るようにすると、
   * 畑は順番に実り続け、いつ見ても収穫できるものがある。
   *
   * **どの畑も作物の秒数より長くは待たせない**（いちばん遅い1マスがちょうど `sec`）。
   * 上限が伸びないので「最長10秒」の約束は保たれる。
   */
  function sow(state, indexes, cropId) {
    const c = Data.crop(cropId);
    if (!c) return 0;
    const k = indexes.length;
    let n = 0;
    for (let j = 0; j < k; j++) {
      if (plant(state, indexes[j], cropId, (c.sec * 1000 * (j + 1)) / k)) n++;
    }
    return n;
  }

  /** 空いている畑へまとめて植える。コインが尽きたところで止める。 */
  function plantAll(state, cropId) {
    const empty = [];
    for (let i = 0; i < state.fieldsOwned; i++) if (!state.fields[i].crop) empty.push(i);
    return sow(state, empty, cropId);
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

  /**
   * 実ったものをまとめて収穫し、空いたところへ時間差でまき直す。
   * 収穫のときに植え直しまでやってしまうと全部が同じ時刻に揃ってしまうので、
   * **先に収穫だけ済ませてから、空いたマスをまとめて時間差まきする。**
   */
  function harvestAll(state, replant) {
    const emptied = [];
    for (let i = 0; i < state.fieldsOwned; i++) {
      if (harvest(state, i)) emptied.push(i);
    }
    if (replant && emptied.length) sow(state, emptied, replant);
    return emptied.length;
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
  /**
   * 農園の生産力。畑と機械が増えるほど大きくなる。
   *
   * 注文の大きさをこれに合わせる。**合わせないと注文が脇役になる。**
   * 1件 1〜4個の注文を3枠並べても、12マスの畑と18台の機械が産む量には
   * まるで足りず、余りは売るしかなくなる（測ったら 配達44.6% / 売却55.4%）。
   */
  function capacity(state) {
    return 1 + Math.max(0, state.fieldsOwned - Data.FIELDS_AT_START) * 0.18
             + Math.max(0, state.machines.length - 1) * 0.16;
  }

  /**
   * ふつうの注文の大きさ。**上げすぎない。**
   * 生産力にそのまま比例させたら、1件が大きくなって件数が半分になり
   * （10分で67件 → 35件）、コンボの刻みが消えた。
   * 余剰をまとめて引き取るのは、ふつうの注文ではなく**ふなびん**の仕事。
   */
  const orderScale = (state) => Math.min(2, 1 + (capacity(state) - 1) * 0.35);

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
    const scale = orderScale(state);
    const want = {};
    let units = 0;
    let value = 0;
    for (const id of chosen) {
      const sell = Data.item(id).sell;
      const base = sell >= 250 ? 2 : sell >= 80 ? 3 : sell >= 25 ? 4 : 5;
      // 農園が育つほど大きく頼まれる。ただし上限は置く（倉庫に入らない注文を作らない）
      const max = Math.max(1, Math.min(12, Math.round(base * scale)));
      const n = 1 + rand(max);
      want[id] = n;
      units += n;
      value += sell * n;
    }
    // 大きい注文ほど支度に時間が要る。期限は個数で伸ばす
    const ttl = Math.min(180_000, 45_000 + units * 9_000);
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
    while (state.orders.length < orderSlots(state)) state.orders.push(makeOrder(state));
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
    earn(state, coins, order.xp, 'order');
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

  /* ------------------------------------------------------------ ふなびん */

  /**
   * ふなびん（大きな注文）。**ふつうの注文との違いは「少しずつ積める」こと。**
   *
   * 待ち時間の無い農園は、注文が吸える量よりずっと多く産む。
   * 実測で、ふつうの注文が引き取れるのは産んだ量の数%で、残りは売るしかなかった
   * （配達44.6% / 売却55.4%）。ふなびんは**余ったそばから積んでいける**ので、
   * 揃うまで抱えておく必要がなく、余剰の行き先になる。
   */
  function makeBoat(state) {
    const ids = obtainable(state);
    if (!ids.length) return null;
    const kinds = Math.min(ids.length, 3 + rand(2));
    const pool = ids.slice();
    const chosen = [];
    for (let k = 0; k < kinds && pool.length; k++) {
      // **ふつうの注文とは逆に、安いものへ寄せる。**
      // 船が運ぶのは余り物。深い加工品を大量に頼むと、4分では到底揃わず
      // 一度も出港しなかった（ケーキ×11 のような注文が出ていた）。
      const a = rand(pool.length), b = rand(pool.length);
      const i = Data.item(pool[a]).sell <= Data.item(pool[b]).sell ? a : b;
      chosen.push(pool.splice(i, 1)[0]);
    }
    const scale = capacity(state);
    const want = {};
    let units = 0;
    let value = 0;
    for (const id of chosen) {
      const sell = Data.item(id).sell;
      // 安いものほど多く積む（余る量に合わせる）
      const base = sell >= 250 ? 2 : sell >= 80 ? 4 : sell >= 25 ? 8 : 12;
      const n = Math.max(2, Math.min(40, Math.round(base * scale * (0.8 + rng() * 0.4))));
      want[id] = n;
      units += n;
      value += sell * n;
    }
    // 積む量に合わせて出港まで待つ。量だけ増やして時間を据え置くと、ただの無理難題になる
    const ttl = Math.max(180_000, Math.min(360_000, 120_000 + units * 4_000));
    // **出港できない船は出さない。** 3分チャレンジの終わりぎわに来る船は、
    // どうやっても満載にならず、進まない進捗バーを見せるだけになる。
    // しかも積んだぶんは倉庫から引かれたまま時計が止まる＝**積むのが罰になる**。
    // ここで弾いておくと `expiresAt <= limit` が必ず成り立ち、
    // 「終わる前に必ず精算される」がタダで手に入る。
    if (timeLeft(state) < ttl) return null;
    return {
      id: state.orderSeq++,
      want,
      loaded: {},
      coins: Math.round(value * BOAT_BONUS),
      xp: Math.round(value / 7) + chosen.length * 5,
      createdAt: state.now,
      expiresAt: state.now + ttl,
      ttl
    };
  }

  const boatNeed = (boat, id) => Math.max(0, (boat.want[id] || 0) - (boat.loaded[id] || 0));
  const boatReady = (boat) => !!boat && Object.keys(boat.want).every((id) => boatNeed(boat, id) === 0);
  /** 積んだ割合（0..1）。表示と、期限切れの払い戻しに使う */
  const boatProgress = (boat) => {
    if (!boat) return 0;
    const want = Object.values(boat.want).reduce((a, b) => a + b, 0);
    const got = Object.keys(boat.want).reduce((a, id) => a + Math.min(boat.loaded[id] || 0, boat.want[id]), 0);
    return want ? got / want : 0;
  };

  /** 1種類だけ積む */
  function loadBoat(state, id, n = 1) {
    const boat = state.boat;
    if (!boat) return 0;
    const put = Math.min(n, boatNeed(boat, id), state.barn[id] || 0);
    if (put < 1) return 0;
    take(state, id, put);
    boat.loaded[id] = (boat.loaded[id] || 0) + put;
    return put;
  }

  /**
   * いま何個積めるか（ふつうの注文のぶんを残した上で）。
   * **ボタンの出し分けと、実際に積む処理は、必ずこの同じ関数を見る。**
   * 片方だけ「在庫があるか」で判定していて、押せるのに何も積めないボタンになっていた。
   */
  function boatLoadable(state) {
    if (!state.boat) return 0;
    const keep = reservedForOrders(state);
    let n = 0;
    for (const id of Object.keys(state.boat.want)) {
      const spare = Math.min((state.barn[id] || 0) - (keep[id] || 0), boatNeed(state.boat, id));
      if (spare > 0) n += spare;
    }
    return n;
  }

  /**
   * 積めるものを全部積む（1タップ）。
   * **ふつうの注文が欲しがっているぶんは残す。** ふなびんは期限が長く、
   * 先に短い注文を潰したほうが得なので、1タップのボタンが邪魔をしないようにする。
   */
  function loadBoatAll(state) {
    if (!state.boat) return 0;
    const keep = reservedForOrders(state);
    let put = 0;
    for (const id of Object.keys(state.boat.want)) {
      const spare = (state.barn[id] || 0) - (keep[id] || 0);
      if (spare > 0) put += loadBoat(state, id, spare);
    }
    return put;
  }

  /** 積みきった船を出す */
  function shipBoat(state) {
    const boat = state.boat;
    if (!boatReady(boat)) return null;
    earn(state, boat.coins, boat.xp, 'boat');
    state.boat = null;
    state.nextBoatAt = state.now + BOAT_GAP;
    state.stats.shipped++;
    event(state, 'ship', `ふなびん出港！ ${boat.coins}コイン`, { coins: boat.coins });
    return { coins: boat.coins, xp: boat.xp };
  }

  /**
   * 期限切れ。積んだぶんは**売値で払い戻す**（おまけが付かないだけで、損はしない）。
   * 大きな注文で丸損させると、積むこと自体が怖くなる。
   */
  /**
   * 期限切れ。**積んだものは売値で引き取る**——倉庫からは引かれているので、
   * 消すと積んだ人だけが丸損になる（`store()` と同じ考え）。
   */
  function expireBoat(state) {
    const boat = state.boat;
    if (!boat) return;
    let back = 0;
    for (const [id, n] of Object.entries(boat.loaded)) back += sellPrice(state, id, n);
    if (back > 0) earn(state, back, 0, 'boat');   // 引き取りも船から出たコイン
    state.boat = null;
    state.nextBoatAt = state.now + BOAT_GAP;
    state.stats.boatMissed++;
    event(state, 'boatgone', back > 0 ? `船が出てしまった…積んだぶん ${back}コインで引き取り` : '船が出てしまった…');
  }

  /* ------------------------------------------------------------ きょうの作物 */

  /** いま高く売れる作物（無ければ null） */
  const todayCrop = (state) => (state.today ? state.today.crop : null);

  /**
   * 売値。**その場で値段が決まる取引は、すべてここを通す**（店・船の引き取り）。
   * 直に `Data.item(id).sell` を読むと、きょうの作物の倍率が抜け落ちる。
   *
   * 注文とふなびんの報酬は**受けた時点で決まっている**ので倍率を掛けない。
   * カードに出ている額と、実際にもらえる額が食い違うほうが困る。
   */
  function sellPrice(state, id, n = 1) {
    return unitPrice(state, id) * n;
  }

  /** 1個ぶんの売値。きょうの作物は「もうけ」の部分だけが増える */
  function unitPrice(state, id) {
    const sell = Data.item(id).sell;
    if (id !== todayCrop(state)) return sell;
    const cost = (Data.crop(id) || {}).cost || 0;
    return cost + Math.round((sell - cost) * TODAY_BONUS);
  }

  /** 日数から作物を決めるための、状態を持たない撹拌 */
  function hash32(n) {
    let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    return h >>> 0;
  }

  /**
   * 日が変わったら、きょうの作物を引き直す。
   *
   * **ここでは共有の乱数（`rng`）を引かない。** 引くと注文の抽選がその分ずれるので、
   * 「手を動かす間隔だけを変えて比べる」ような計測が、条件ごとに違う作物を掴んでしまう
   * （実際、これで tempo の比較が 400ms だけ 3割落ちたように見えた）。
   * 日数から決めれば、何を比べても きょうの作物 は同じ動きをする。
   *
   * **同じ作物を2日つづけて出さない**（変わったことが分からないと意味がない）ので、
   * 前の作物から 1以上ずらした位置を取る。解放済みの作物からしか選ばない。
   */
  function rollToday(state) {
    const day = Math.floor(state.now / DAY_MS);
    if (state.today && state.today.day === day) return;
    const list = Data.cropsAt(state.level);
    if (!list.length) return;
    const at = Math.max(0, list.findIndex((c) => c.id === todayCrop(state)));
    const step = list.length > 1 ? 1 + (hash32(day) % (list.length - 1)) : 0;
    const c = list[(at + step) % list.length];
    state.today = { day, crop: c.id };
    event(state, 'today', `きょうは${Data.item(c.id).name}の日！`, { crop: c.id });
  }

  /* ---------------------------------------------------------------- 店 */

  function sell(state, id, n = 1) {
    const have = state.barn[id] || 0;
    const num = Math.min(n, have);
    if (num < 1) return 0;
    take(state, id, num);
    const coins = sellPrice(state, id, num);
    earn(state, coins, 0, 'sell');
    return coins;
  }

  /* ---------------------------------------------------------------- かざり */

  const ownsDecor = (state, id) => (state.decor || []).includes(id);

  /** 農園の見ばえ。かざりの合計。数えるだけで、何の能力にも効かない */
  const charm = (state) =>
    (state.decor || []).reduce((a, id) => a + ((Data.decor(id) || {}).charm || 0), 0);

  function buyDecor(state, id) {
    const def = Data.decor(id);
    if (!def || ownsDecor(state, id)) return false;
    if (state.level < def.level || state.coins < def.price) return false;
    state.coins -= def.price;
    state.decor.push(id);
    event(state, 'buy', `${def.emoji} ${def.name}をかざった！`);
    return true;
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

  /* -------------------------------------------------------------- 実績 */

  /** 実績の進み具合。数えるところを1か所にまとめる */
  function achieveCount(state, on) {
    if (on === 'level') return state.level;
    if (on === 'machines') return state.machines.length;
    if (on === 'fields') return state.fieldsOwned;
    if (on === 'bestCombo') return state.bestCombo;
    return state.stats[on] || 0;
  }

  /** まだ取っていない実績のうち、条件を満たしたものを取る */
  function checkAchievements(state) {
    const got = [];
    for (const a of Data.ACHIEVEMENTS) {
      if (state.achieved.includes(a.id)) continue;
      if (achieveCount(state, a.on) >= a.goal) {
        state.achieved.push(a.id);
        got.push(a);
        event(state, 'achieve', `${a.emoji} ${a.name}`, { achievement: a.id });
      }
    }
    return got;
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

    rollToday(state);

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

    if (state.orders.length < orderSlots(state) && state.now >= state.nextOrderAt) {
      state.orders.push(makeOrder(state));
      if (state.orders.length < orderSlots(state)) state.nextOrderAt = state.now + ORDER_REFILL_MS;
    }

    // ふなびん
    if (state.boat && state.boat.expiresAt <= state.now) expireBoat(state);
    if (!state.boat && state.level >= BOAT_LEVEL && state.now >= state.nextBoatAt) {
      state.boat = makeBoat(state);
      if (state.boat) event(state, 'boat', 'ふなびんが着いた🚢');
    }

    checkAchievements(state);
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
    orderSlots, COMBO_MAX, QUICK_RATIO, QUICK_BONUS,
    setRandom, create, normalize, tick,
    barnCap, barnUsed, barnFree, has, ownsMachine,
    canPlant, plant, sow, plantAll, isReady, harvest, harvestAll,
    canQueue, queue, collect, collectAll, workAll, reservedForOrders, machineDef,
    obtainable, capacity, makeOrder, canDeliver, deliver, dismiss, comboMul,
    BOAT_LEVEL, BOAT_TTL, BOAT_BONUS, makeBoat, boatNeed, boatReady, boatProgress,
    loadBoat, loadBoatAll, boatLoadable, shipBoat, expireBoat,
    DAY_MS, TODAY_BONUS, todayCrop, sellPrice, unitPrice, rollToday,
    sell, nextFieldPrice, buyField, buyBarn, buyMachine,
    ownsDecor, charm, buyDecor,
    rescue, timeLeft, score, store, take, event, achieveCount, checkAchievements
  };
})(typeof window !== 'undefined' ? window : globalThis);

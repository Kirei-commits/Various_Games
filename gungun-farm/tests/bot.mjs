/**
 * 農園を実際に経営する手順（方策）。
 *
 * ここにあるのは「上手ではないが、まともな人がやること」。
 * バランスを測るための基準であって、AI対戦のような賢さは要らない。
 * ゲーム側(js/)には入れない——プレイヤーの代わりに遊ぶ機能は作らないため。
 */

/** 開いている注文が欲しがっている数。加工に回してよいのは、これを超えた分だけ。 */
function reserved(state) {
  const want = {};
  for (const o of state.orders) {
    for (const [id, n] of Object.entries(o.want)) want[id] = (want[id] || 0) + n;
  }
  return want;
}

const surplus = (state, want, id) => (state.barn[id] || 0) - (want[id] || 0);

/** 畑を止めないために残しておくタネ代。これを割ったら在庫を売って戻す。 */
const seedReserve = (state) => 15 + state.fieldsOwned * 10;

/** 1手番ぶん。人が画面を見て一通り触る、くらいの粒度。 */
export function botStep(GF, state) {
  const { Engine, Data } = GF;
  if (state.over) return;

  const want = reserved(state);

  // 1. 実ったものを収穫して、その場に植え直す（主ボタン1タップ）
  const seed = chooseSeed(GF, state, want);
  if (seed) Engine.harvestAll(state, seed);

  // 2. 出来たものを取り出して、余った材料で仕込む（副ボタン1タップ）
  Engine.workAll(state);

  // 3. 届けられる注文は高い順に届ける
  for (const o of [...state.orders].sort((a, b) => b.coins - a.coins)) {
    if (Engine.canDeliver(state, o)) Engine.deliver(state, o.id);
  }

  // 4. 期限が近いのに手が届かない注文は捨てて、枠を空ける
  for (const o of [...state.orders]) {
    if (o.expiresAt - state.now > 8000) continue;
    if (!Engine.canDeliver(state, o)) Engine.dismiss(state, o.id);
  }

  // 5. 売る。理由は2つあって、どちらも欠かすと詰まる
  //    a) 倉庫があふれると収穫も取り出しもできなくなる
  //    b) タネ代が尽きると畑が止まる（在庫を抱えたまま破産する）
  const keep = seedReserve(state);
  const sellable = () => Object.keys(state.barn)
    .filter((id) => surplus(state, want, id) > 0)
    .sort((a, b) => Data.item(a).sell - Data.item(b).sell);
  if (Engine.barnFree(state) < 4) {
    for (const id of sellable()) {
      if (Engine.barnFree(state) >= Engine.barnCap(state) * 0.3) break;
      Engine.sell(state, id, Math.max(1, surplus(state, want, id)));
    }
  }
  if (state.coins < keep) {
    for (const id of sellable()) {
      if (state.coins >= keep) break;
      Engine.sell(state, id, Math.max(1, surplus(state, want, id)));
    }
  }

  // 6. 設備投資。倉庫 → 機械 → 畑の順に効く。
  //    タネ代（keep）を割ってまで買わない。畑が止まると立て直せなくなる。
  const affordable = (price) => state.coins - price >= keep;
  if (Engine.barnFree(state) < 6 && affordable(Data.barnPrice(state.barnUp))) Engine.buyBarn(state);
  for (const def of Data.machinesAt(state.level)) {
    if (def.price > 0 && !Engine.ownsMachine(state, def.id) && affordable(def.price * 1.4)) {
      Engine.buyMachine(state, def.id);
    }
  }
  const up = Engine.nextFieldPrice(state);
  if (up && state.level >= up.level && affordable(up.price * 1.5)) Engine.buyField(state);

  // 7. 空いている畑（買ったばかり・タネ代切れ）にまく
  if (seed) Engine.plantAll(state, seed);
}

/**
 * 何を植えるか。畑ぜんぶが同じタネになるので、選ぶのは1つだけ。
 *  a) 開いている注文が欲しがっている作物で、足りていないもの
 *  b) 持っている機械が食べる作物で、在庫が薄いもの
 *  c) それ以外は「1秒あたりの儲け」がいちばん大きい作物
 */
function chooseSeed(GF, state, want) {
  const { Engine, Data } = GF;
  const crops = Data.cropsAt(state.level);
  if (!crops.length) return null;

  const machineNeed = {};
  for (const m of state.machines) {
    for (const [id, n] of Object.entries(Engine.machineDef(m).recipe.in)) {
      if (Data.crop(id)) machineNeed[id] = (machineNeed[id] || 0) + n * 3;
    }
  }
  const stock = (id) => (state.barn[id] || 0) + growing(state, id);

  const ordered = crops.find((c) => (want[c.id] || 0) > stock(c.id));
  const needed = crops.find((c) => machineNeed[c.id] && stock(c.id) < machineNeed[c.id]);
  const best = crops.slice().sort((a, b) => {
    const rate = (c) => (Data.item(c.id).sell - c.cost) / c.sec;
    return rate(b) - rate(a);
  });
  const pick = [ordered, needed, ...best].find((c) => c && state.coins >= c.cost);
  return pick ? pick.id : best[best.length - 1].id;   // 買えなくても、いちばん安いものを指しておく
}

/** その作物が畑で育っている数 */
const growing = (state, id) => state.fields.filter((f) => f.crop === id).length;

/**
 * 農園を回して結果を返す。
 * @param {object} GF window.GF 相当
 * @param {object} opts minutes=遊ぶ分数 / stepMs=手を動かす間隔 / seed
 */
export function simulate(GF, opts = {}) {
  const { minutes = 10, stepMs = 400, seed = 1, mode = 'free', random } = opts;
  GF.Engine.setRandom(random || Math.random);
  const state = GF.Engine.create({ mode, limit: minutes * 60_000 });
  const total = minutes * 60_000;

  let stuckFor = 0;
  let worstStuck = 0;
  let prevProgress = -1;

  for (let t = 0; t <= total; t += stepMs) {
    GF.Engine.tick(state, t);
    if (state.over) break;
    botStep(GF, state);

    // 「何も起きていない時間」を測る。畑も機械も注文も動かない時間が続いたら詰み。
    const progress = state.stats.harvested + state.stats.crafted + state.stats.delivered;
    const busy = state.fields.some((f) => f.crop) || state.machines.some((m) => m.queue.length || m.done);
    if (progress === prevProgress && !busy) {
      stuckFor += stepMs;
      worstStuck = Math.max(worstStuck, stuckFor);
    } else {
      stuckFor = 0;
    }
    prevProgress = progress;
  }

  return {
    seed,
    minutes,
    level: state.level,
    coins: state.coins,
    earned: state.stats.coinsEarned,
    delivered: state.stats.delivered,
    expired: state.stats.expired,
    harvested: state.stats.harvested,
    crafted: state.stats.crafted,
    rescues: state.stats.rescues,
    bestCombo: state.bestCombo,
    machines: state.machines.length,
    fields: state.fieldsOwned,
    barn: GF.Engine.barnCap(state),
    worstStuckMs: worstStuck,
    state
  };
}

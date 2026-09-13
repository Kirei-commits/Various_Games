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

  // 3.5 ふなびん。余ったものを積んで、満載になったら出す
  if (state.boat) {
    Engine.loadBoatAll(state);
    if (Engine.boatReady(state.boat)) Engine.shipBoat(state);
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
 *  b) **ふなびんが待っている作物**（船は量を求めるので、畑ごと向ける値打ちがある）
 *  c) 持っている機械が食べる作物で、在庫が薄いもの
 *  d) それ以外は「1秒あたりの儲け」がいちばん大きい作物
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
  // 船が待っているもの。いちばん足りていない作物へ畑を向ける
  let boated = null;
  if (state.boat) {
    let worst = 0;
    for (const c of crops) {
      const need = Engine.boatNeed(state.boat, c.id) - stock(c.id);
      if (need > worst) { worst = need; boated = c; }
    }
  }
  const needed = crops.find((c) => machineNeed[c.id] && stock(c.id) < machineNeed[c.id]);
  // 値段は engine に聞く。**きょうの作物のもうけが、この並びに自然に効く**
  // （直に Data.item().sell を読むと、倍率が乗っていない順位で選んでしまう）
  const best = crops.slice().sort((a, b) => {
    const rate = (c) => (Engine.unitPrice(state, c.id) - c.cost) / c.sec;
    return rate(b) - rate(a);
  });
  const pick = [ordered, boated, needed, ...best].find((c) => c && state.coins >= c.cost);
  return pick ? pick.id : best[best.length - 1].id;   // 買えなくても、いちばん安いものを指しておく
}

/**
 * いま「進行を進める操作」があるか。
 * 収穫・植える・取り出す・仕込む・届ける のどれも無い瞬間を「待たされている」と数える。
 * 売り買いは家事なのでいつでもできる＝待ちの解消にはならないので、数えない。
 *
 * これがこのゲームの約束（待ち時間を限りなく0に）を測る指標。
 */
export function hasSomethingToDo(GF, s) {
  const { Engine, Data } = GF;
  const roomy = Engine.barnFree(s) > 0;
  for (let i = 0; i < s.fieldsOwned; i++) {
    if (roomy && Engine.isReady(s.fields[i], s.now)) return 'harvest';
    if (!s.fields[i].crop && Data.cropsAt(s.level).some((c) => s.coins >= c.cost)) return 'plant';
  }
  for (let i = 0; i < s.machines.length; i++) {
    if (roomy && s.machines[i].done > 0) return 'collect';
    if (Engine.canQueue(s, i)) return 'queue';
  }
  for (const o of s.orders) if (Engine.canDeliver(s, o)) return 'deliver';
  if (s.boat) {
    if (Engine.boatReady(s.boat)) return 'ship';
    for (const id of Object.keys(s.boat.want)) {
      if (Engine.boatNeed(s.boat, id) > 0 && (s.barn[id] || 0) > 0) return 'load';
    }
  }
  return null;
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
  let idleMs = 0;
  let idleRun = 0;
  let worstIdle = 0;
  let feltMs = 0;          // 1秒以上つづいた「待ち」だけを数えたもの

  // 待ち時間は bot の手を動かす間隔より細かく見る。
  // 400ms きざみで見ると 200ms の隙間が丸ごと見えず、実際より良い数字が出る。
  const SAMPLE = 100;
  const FELT = 1000;       // 人が「待った」と感じ始めるあたり

  for (let t = 0; t <= total; t += stepMs) {
    GF.Engine.tick(state, t);
    if (state.over) break;

    // 手を動かす前に「やることがあるか」を見る（あとで見ると自分で解消してしまう）
    for (let u = 0; u < stepMs; u += SAMPLE) {
      GF.Engine.tick(state, t + u);
      if (hasSomethingToDo(GF, state)) {
        if (idleRun >= FELT) feltMs += idleRun;
        idleRun = 0;
      } else {
        idleMs += SAMPLE;
        idleRun += SAMPLE;
        worstIdle = Math.max(worstIdle, idleRun);
      }
    }

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
    shipped: state.stats.shipped,
    boatMissed: state.stats.boatMissed,
    bestCombo: state.bestCombo,
    machines: state.machines.length,
    fields: state.fieldsOwned,
    barn: GF.Engine.barnCap(state),
    worstStuckMs: worstStuck,
    idlePct: Math.round((idleMs / total) * 1000) / 10,
    feltIdlePct: Math.round((feltMs / total) * 1000) / 10,
    worstIdleMs: worstIdle,
    state
  };
}

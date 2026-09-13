/**
 * ビルドを持たないプロジェクトのための最小の静的検査。依存パッケージ無しで動く。
 *  1. 全JSの構文チェック
 *  2. index.html が参照する css/js が実在するか（読み込み漏れも見る）
 *  3. 読み込み順（依存より先に依存元が来ていないか）
 *  4. データの整合。とくに **待ち時間が10秒を超えていないこと**
 *     ——これがこのゲームの存在理由なので、機械的に守る
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

// 1. 構文チェック
const jsDir = path.join(ROOT, 'js');
const jsFiles = fs.readdirSync(jsDir).filter((n) => n.endsWith('.js')).sort();
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', path.join(jsDir, f)], { stdio: 'pipe' });
  } catch (e) {
    problems.push(`構文エラー js/${f}: ${e.stderr?.toString().split('\n')[0]}`);
  }
}

// 2. 参照の実在確認
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|data:)([^"]+)"/g)].map((m) => m[1]);
for (const ref of refs) {
  if (!fs.existsSync(path.join(ROOT, ref))) problems.push(`参照先が存在しない: ${ref}`);
}
if (!refs.includes('css/style.css')) problems.push('index.html が css/style.css を読み込んでいない');

const order = [...html.matchAll(/<script src="js\/([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const f of jsFiles) if (!order.includes(f)) problems.push(`js/${f} が index.html から読み込まれていない`);

// 3. 読み込み順。ESモジュールを使わないので、この順序がそのまま依存関係になる
const need = [
  ['data.js', 'engine.js'], ['data.js', 'render.js'], ['data.js', 'main.js'],
  ['engine.js', 'render.js'], ['engine.js', 'main.js'],
  ['storage.js', 'main.js'], ['audio.js', 'main.js'], ['render.js', 'main.js']
];
for (const [before, after] of need) {
  const i = order.indexOf(before), j = order.indexOf(after);
  if (i === -1 || j === -1 || i > j) problems.push(`読み込み順が不正: ${before} は ${after} より前に必要`);
}

// 4. データの整合。実際に data.js を評価して中身を見る
const sandbox = { window: {}, Math, JSON, Object, Array, Number, String };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(jsDir, 'data.js'), 'utf8'), sandbox, { filename: 'data.js' });
const Data = sandbox.window.GF && sandbox.window.GF.Data;

if (!Data) {
  problems.push('data.js が window.GF.Data を公開していない');
} else {
  const { ITEMS, CROPS, MACHINES, MAX_SEC } = Data;

  const ids = new Set();
  for (const c of CROPS) {
    if (ids.has(c.id)) problems.push(`作物idの重複: ${c.id}`);
    ids.add(c.id);
    if (!ITEMS[c.id]) problems.push(`作物に対応する品物が無い: ${c.id}`);
    // ここがこのゲームの約束。破ったら他のどのテストより先に気づきたい
    if (c.sec > MAX_SEC) problems.push(`育つのに ${c.sec}秒 かかる（上限 ${MAX_SEC}秒）: ${c.id}`);
    if (c.sec <= 0) problems.push(`秒数が0以下: ${c.id}`);
    if (c.cost <= 0) problems.push(`タネ代が0以下: ${c.id}`);
    if (ITEMS[c.id] && ITEMS[c.id].sell <= c.cost) problems.push(`売値がタネ代以下で、育てるだけ損: ${c.id}`);
    if (c.level < 1) problems.push(`解放レベルが不正: ${c.id}`);
  }

  const mids = new Set();
  for (const m of MACHINES) {
    if (mids.has(m.id)) problems.push(`機械idの重複: ${m.id}`);
    mids.add(m.id);
    if (m.slots < 1) problems.push(`同時に仕込める数が0以下: ${m.id}`);
    if (m.price < 0) problems.push(`値段が負: ${m.id}`);
    const r = m.recipe;
    if (!r) { problems.push(`レシピが無い: ${m.id}`); continue; }
    if (r.sec > MAX_SEC) problems.push(`作るのに ${r.sec}秒 かかる（上限 ${MAX_SEC}秒）: ${m.id}`);
    if (r.sec <= 0) problems.push(`秒数が0以下: ${m.id}`);
    if (!ITEMS[r.out]) problems.push(`作る品物が未定義: ${m.id} -> ${r.out}`);
    if (!Object.keys(r.in).length) problems.push(`材料が空: ${m.id}`);

    let inValue = 0;
    for (const [id, n] of Object.entries(r.in)) {
      if (!ITEMS[id]) { problems.push(`材料が未定義: ${m.id} -> ${id}`); continue; }
      if (n <= 0) problems.push(`材料の数が0以下: ${m.id} -> ${id}`);
      inValue += ITEMS[id].sell * n;

      // 買った時点で使えないと、店に並んでいるのに動かせない機械になる
      const crop = CROPS.find((c) => c.id === id);
      if (crop && crop.level > m.level) problems.push(`${m.id}(Lv${m.level}) の材料 ${id} は Lv${crop.level} からしか作れない`);
      const src = MACHINES.find((x) => x.recipe && x.recipe.out === id);
      if (src && src.level > m.level) problems.push(`${m.id}(Lv${m.level}) の材料 ${id} は ${src.id}(Lv${src.level}) でしか作れない`);
    }
    if (ITEMS[r.out] && ITEMS[r.out].sell <= inValue) {
      problems.push(`加工すると損になる: ${m.id}（材料 ${inValue} → ${ITEMS[r.out].sell}）`);
    }
  }

  // 手に入れる道の無い品物は、注文に出てこないただの死にデータになる
  for (const id of Object.keys(ITEMS)) {
    const fromCrop = CROPS.some((c) => c.id === id);
    const fromMachine = MACHINES.some((m) => m.recipe && m.recipe.out === id);
    if (!fromCrop && !fromMachine) problems.push(`手に入れる方法が無い品物: ${id}`);
    if (ITEMS[id].sell <= 0) problems.push(`売値が0以下: ${id}`);
    if (!ITEMS[id].name || !ITEMS[id].emoji) problems.push(`名前か絵文字が空: ${id}`);
  }

  // タネ選びが「偽の選択」になっていないこと。
  //
  // 一度、1秒あたりの儲けも1枠の値打ちも**両方とも格上が勝つ**表になっていた
  // （こむぎ1.00 → メロン3.33、かつ売値も3 → 74）。解放された中でいちばん格上を
  // 選べば常に正解で、タネの一覧はただの飾りだった。
  // いまは取引になっている: **短いほど1秒あたりが良く、長いほど1枠の値打ちが高い**。
  //   → 手が空いているなら短いのを回す / 工房と注文に手を掛けたいなら長いのを植える
  const perSec = (c) => (ITEMS[c.id].sell - c.cost) / c.sec;
  const bySec = CROPS.slice().sort((a, b) => a.sec - b.sec || a.level - b.level);
  for (let i = 1; i < bySec.length; i++) {
    if (perSec(bySec[i]) > perSec(bySec[i - 1]) + 0.001) {
      problems.push(`長い作物のほうが1秒あたり儲かる: ${bySec[i - 1].id}(${perSec(bySec[i - 1]).toFixed(2)})` +
        ` → ${bySec[i].id}(${perSec(bySec[i]).toFixed(2)})。短い作物を選ぶ理由が消える`);
    }
  }
  const byLevel = CROPS.slice().sort((a, b) => a.level - b.level || a.sec - b.sec);
  for (let i = 1; i < byLevel.length; i++) {
    if (ITEMS[byLevel[i].id].sell <= ITEMS[byLevel[i - 1].id].sell) {
      problems.push(`後から解放される作物の1枠の値打ちが上がっていない: ` +
        `${byLevel[i - 1].id}(${ITEMS[byLevel[i - 1].id].sell}) → ${byLevel[i].id}(${ITEMS[byLevel[i].id].sell})`);
    }
  }
  // 取引が成立するだけの差があること（差が無いとどれを選んでも同じ＝やはり飾り）
  const fastest = bySec[0], slowest = bySec[bySec.length - 1];
  if (perSec(fastest) < perSec(slowest) * 1.5) {
    problems.push(`短い作物と長い作物で1秒あたりの差が小さい（${perSec(fastest).toFixed(2)} 対 ${perSec(slowest).toFixed(2)}）`);
  }
  if (ITEMS[slowest.id].sell < ITEMS[fastest.id].sell * 4) {
    problems.push(`短い作物と長い作物で1枠の値打ちの差が小さい（${ITEMS[fastest.id].sell} 対 ${ITEMS[slowest.id].sell}）`);
  }

  // どのレベルにも「新しく解放されるもの」があること。
  // 一度、レベル14〜20の**7レベル連続で何も解放されない**状態になっていた
  // （進行の後半3分の1が空っぽ）。「レベルに沿って増えていく」が売りなので機械で見張る。
  const dead = [];
  let run = [];
  for (let lv = 2; lv <= Data.MAX_LEVEL; lv++) {
    if (Data.unlockedAt(lv).length === 0) run.push(lv);
    else { if (run.length) dead.push(run); run = []; }
  }
  if (run.length) dead.push(run);
  for (const d of dead) {
    if (d.length >= 2) {
      problems.push(`何も解放されないレベルが ${d.length}連続: Lv${d[0]}〜Lv${d[d.length - 1]}（作物か施設を足す）`);
    }
  }

  // レベルは上がるほど遠くなること（途中で楽になると育ちの実感が壊れる）
  for (let lv = 1; lv < Data.MAX_LEVEL; lv++) {
    if (Data.xpFor(lv + 1) <= Data.xpFor(lv)) problems.push(`必要経験値が増えていない: Lv${lv} -> Lv${lv + 1}`);
  }

  // 最初から持っている機械は、最初のレベルで使えること
  const starter = MACHINES.find((m) => m.price === 0);
  if (!starter) problems.push('最初から持っている機械（price:0）が無い');
  else if (starter.level > 1) problems.push(`最初から持っている機械が Lv${starter.level} 解放になっている: ${starter.id}`);

  if (CROPS.length < 4 || MACHINES.length < 3) problems.push('データが読み取れていない');
}

if (problems.length) {
  console.error('lint 失敗:');
  for (const p of problems) console.error('  ✘ ' + p);
  process.exit(1);
}
console.log(`lint OK — JS ${jsFiles.length}件 / 参照 ${refs.length}件 / 読み込み順 ${order.length}件 / 作物 ${Data.CROPS.length}・機械 ${Data.MACHINES.length}・品物 ${Object.keys(Data.ITEMS).length}件`);

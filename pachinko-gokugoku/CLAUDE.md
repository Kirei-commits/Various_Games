# CLAUDE.md — 極極FEVER（pachinko-gokugoku）

単一HTMLで遊べるパチンコシミュレーター。**配るのは `index.html` 1枚（ビルド済み・実行時依存ゼロ）**、
編集するのは `src/`。`index.html` は `npm run build`（`tools/build.mjs`、依存なし）が生成する。直接編集しないこと。
CI はリポジトリ直下の `.github/workflows/ci.yml`。matrix にこのディレクトリが入っている。

## 構成

```
src/shell.html          HTML の骨組み（メニュー・設定パネルの DOM）。@STYLE / @SCRIPTS / @SOURCE_HASH に差し込む
src/style.css           見た目
src/pure/config.js      調整値すべて → <script id="pg-config">  PG.CONFIG（データだけ）
src/pure/spec.js        抽選と理論値 → <script id="pg-spec">     PG.Spec（純粋。乱数は引数でもらう）
src/pure/physics.js     盤面の物理   → <script id="pg-physics">  PG.createPhysics（純粋。乱数・入賞通知・開閉状態は引数でもらう）
src/game/NN-*.js        ブラウザ側（描画・音・ステート・入力・UI）。番号順につなげて1つの即時関数で包む → <script id="pg-game">
tools/build.mjs         src/ → index.html（--check で最新か確かめるだけ）
tools/measure.mjs       理論値と実測値を並べる（npm run measure）
tests/lint.mjs          ビルドが最新か / 構文 / script の並び / 外部参照 / id の実在 / 純粋さ
tests/logic/*.test.mjs  config（表の形・時刻の順）/ spec（確率・振り分け・信頼度）/ rush（継続率）/ physics（入賞率・止まり球）
tests/e2e/*.spec.mjs    Playwright（desktop + mobile）。fixtures.mjs の playUntil が判定・レバー・モード選択を実際の操作で進める
```

`src/game/` の各ファイルは同じスコープを共有する（`M`・`LCD`・`Sound` などを互いに参照してよい）。
新しいファイルは番号で順番を決める（定義より前で「実行」しないこと。関数の中から参照するのは順不同でよい）。

## 調整値と理論値

- 数値はまず `src/pure/config.js` を探す。確率・振り分けの表・演出の時刻・出玉・発射間隔・入力のしきい値・盤面の形・物理・目標値（targets）がある。
  見た目だけのアニメーション（座標・イージング）はコードに残してある。
- 当りは実機と同じく「乱数の範囲 65536 のうち何個が当りか」で決まる。1/319.6 は当り205個 = 実際は 1/319.69。
- RUSH の当りの個数は `spec.rush.targetContinuation`（81%）と `stSpins`（100回転）から逆算する。いまは 1/60.74・継続率 80.99%。
- `PG.Spec.theory()` が設定から理論値（確率・継続率・平均連チャン・期待出玉・各演出の信頼度）を計算する。
  ロジックテストは「実際の抽選を大量にまわした実測値が理論値と一致するか」を確かめるので、
  抽選の書き方を変えたら `theory()` も合わせること（片方だけ変えるとテストが落ちる）。
- 激熱演出（金テロップ以上・金カットイン以上・金タイトル・役物落下・金保留以上・ステップ5・7テン）は信頼度 `targets.hotReliability`（99%）以上がテストで保証される。
- テロップの文字色とカットインは 白→青→緑→赤→金→虹 の6段（0〜5）。上の色ほど信頼度が高い（テストで確認）。
- 図柄は3×3・5ライン（`PG.Spec.LINES`: 上段・中段・下段・右下がり・右上がり）。抽選が `h.lines`（テンパイラインと図柄）・`h.win`（揃うライン）・
  `h.cols`（左・中・右の列）・`h.lineUp`（ライン増加リーチの右リールの途中の列）を決め、リールはそれを表示するだけ。
- テンパイの決まりごと（`cfg.tenpai`）: 7テンは RUSH 直行の当りだけ（ハズレの重みは KM）、3・5テンは信頼度 `targets.tenpai35`（50〜70%）、
  奇数テンは偶数テンより高い、ダブル→トリプル→ライン増加の順に高い。どれも `tests/logic/spec.test.mjs` が確かめる。
- ゲーム内の 設定 → 「理論値と実測値」に、この台で実際に出た初当り確率・RUSH継続率・ヘソ入賞率が理論値と並んで出る。

## 物理の約束ごと

1. 1フレームを `physics.substeps` 回に分けて解く。最高速でも1回の移動量が 球半径+釘半径 より小さいこと。
2. 横並びの釘は `pinGap` 以上、壁・液晶からは `pinMargin` 以上離す。すき間が「球より狭いが0ではない」と球が挟まって止まる。
3. 道釘は見た目だけ釘を並べ、当たりは摩擦の小さい1本のレール（釘の谷間で球が止まるため）。
4. ヘソへの主な入賞ルートはワープ → ステージ落下。ヘソ入賞率は `warpRate` でいちばん大きく変わる。
5. 物理を変えたら `npm run measure` でヘソ入賞率・アタッカー/電チュー捕捉率・止まり球0を確かめる。

## 手元での確かめ方

```bash
npm ci
npm run build          # src/ を変えたら必ず
npm run lint
npm run test:logic     # 数秒
npm run measure        # 理論値と実測値
PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e   # ブラウザを取得できない環境（LOOP.md）
```

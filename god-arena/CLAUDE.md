# CLAUDE.md — GOD ARENA（神器大戦）

ゴッドフィールド風の属性バトル。**ビルド不要・実行時依存ゼロ**の単体Webアプリ。
`index.html` をブラウザで開けばそのまま動く。

## 構成

```
index.html          マークアップ。<script> の並び順が依存関係そのもの
css/style.css       テーマ・レイアウト・アニメーション
js/items.js         アイテム定義と抽選（純データ。他に依存しない）
js/engine.js        ルールと進行（純ロジック。items に依存）
js/ai.js            AI（期待ダメージの見積もり + 相手の防具読み）。items/engine に依存
js/storage.js       localStorage 永続化
js/audio.js         Web Audio API による効果音の合成
js/render.js        DOM 描画。items/engine/ai に依存
js/main.js          進行役とUIバインド。上記すべてに依存
tests/              テスト
```

## 開発コマンド

```bash
npm ci && npm test   # lint → ロジック → E2E
npm start            # http://127.0.0.1:8081/
```

CI はリポジトリ直下の `.github/workflows/ci.yml`（god-arena と gomoku-narabe の両方を回す）。
**サブディレクトリ配下の `.github/workflows/` は GitHub では実行されない**。

## 壊してはいけない設計上の制約

1. **実行時の依存パッケージをゼロに保つ。** ビルド工程を持ち込まない。
   Playwright は開発時のみの依存で、配信物には含めない。
2. **ESモジュールを使わない。** `file://` で直接開いた時に CORS で失敗するため、
   各ファイルは即時関数で `window.GA` 名前空間に公開するクラシックスクリプトにする。
   したがって **`index.html` の script の順序が依存関係**（`npm run lint` が検査する）。
3. **`localStorage` は必ず try/catch で包む。** 読み書きの両方が例外を投げうる。
4. **乱数を直接呼ばない。** `Engine.setRandom()` / `AI.setRandom()` を通す。
   テストと `?seed=` による再現のため。
5. **設定キーは必ず `Store.DEFAULTS.settings` に定義する。** 定義漏れのキーは
   `merge()` で捨てられ、保存しても復元されない。
6. **ルール判断は engine に集約する。** UI と AI は同じ関数（`availableActions` /
   `canPray` / `resolveDamage`）を見る。UI側で条件を書き直すと必ずずれる。
7. **主要な操作は手札の直上・ファーストビュー内に置く。**
   `tests/e2e/layout.spec.mjs` が「1画面に収まること」「44×44px 以上」を検査している。
8. **`[hidden] { display: none !important; }` を消さない。**
   `.abtn { display: flex }` が既定の `[hidden]` に勝ってしまい、
   隠したはずの防御ボタンが出たままになる（実際にこれで落とした）。

## ゲーム設計上、動かすと壊れるもの

- **武器を持っている間は祈れない**（`Engine.canPray`）。
  これを外すと、全員が「祈って引き直す」を選び続けて試合が終わらなくなる。
  実際に4人戦が600手で未決着になり、この制約を入れて解消した。
- **手札上限で祈ったとき、引いた分を捨ててはいけない。**
  価値の低い手札の方を捨てる（`Engine.give`）。逆にすると、防具と食料で手札が埋まった
  プレイヤーに永久に攻め手が来なくなる。
- **AIは相手の手札を見ない。** 見えているのは `state.log` に残った「何で防いだか」だけ。
  `AI.readDefenses()` はログからしか読まない。ここで手札を覗くと難易度が壊れる。

## テストの構成

| 種別 | 場所 | 実行 | 内容 |
| --- | --- | --- | --- |
| 静的検査 | `tests/lint.mjs` | 依存不要 | 全JSの構文、参照の実在、読み込み順、アイテム定義の整合 |
| ロジック | `tests/logic/*.test.mjs` | `node --test` | ダメージ計算、進行、AIの妥当性、難易度の序列、永続化 |
| ブラウザ | `tests/e2e/*.spec.mjs` | Playwright | 攻撃・防御・祈り・設定・レイアウト |

E2Eは `desktop`（マウス）と `mobile`（Pixel 5 / `hasTouch`）の2プロジェクトで走る。
端末差のある操作は `tests/e2e/fixtures.mjs` の `tap()` に閉じ込め、スペック本体に分岐を書かない。

### バランスを測るテストの決まり

- 難易度の序列は **120局・先後入れ替え** で測る。40局では運で逆転して
  フレーキーになる（実際に 23/39 で落ちた）。
- 閾値は実測値より十分下に置く（実測70% → 閾値62%）。
- `seededRandom` でシードを固定する。フレーキーなテストは無いテストより悪い。

## 過去の失敗と、繰り返さないためのルール

- **テスト結果は `0 failed` を明示的に確認する。** passed の件数だけを見て判断しない。
- **手で確認したことはテストとして残す。** 「一度動いた」より「壊れたら気づける」を優先する。
- **外部の識別子（Actionsのバージョン等）は記憶で書かない。**
  `git ls-remote --tags https://github.com/actions/checkout` のように実際に確かめる。

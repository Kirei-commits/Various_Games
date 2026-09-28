# CLAUDE.md — SwipeTalk（英会話フレーズ学習）

全40章・2000フレーズのスワイプ学習・テスト（英→日／日→英）・シャドーイングアプリ。詳しくは README.md。
CI はリポジトリ直下の `.github/workflows/ci.yml`（matrix に `eikaiwa-swipe` を登録済み）。

## 壊してはいけない約束

1. **`src/` を変えたら `npm run build` して `index.html` も一緒にコミットする。**
   `index.html` の source-hash を lint が検査するので、忘れると CI が落ちる。`index.html` を手で編集しない。
2. **`src/logic.js` は DOM・音声API・LocalStorage に触らない純粋関数だけにする。**
   「今日」や乱数は引数で受け取る。これにより lint とロジックテストが依存なしの Node だけで動く。
3. **教材は各章ちょうど50問、英語の重複なし。** ID は英語から作るので、英語を変えるとその問題の学習記録が消える。
   章を増やしたら `src/data/index.js` の import・配列・`PARTS` と、`tests/lint.mjs` の章数を更新する。
4. **保存データの形を変えるときは `restoreState` で旧形式を読めるようにする**（v1 → v2 の移行を参照）。
5. **クラウド保存は `src/cloud.js` の窓口だけを通す。** 画面から Firebase を直接呼ばない。
   `cloud-config.js` が null のときと Artifact 用ビルドでは、`tools/build.mjs` が Firebase SDK をスタブに差し替える。
   ログイン時の統合ルールは `logic.js` の `resolveLogin` / `mergeStates`（テストあり）。

## コマンド

```bash
npm ci && npm run build && npm test
```

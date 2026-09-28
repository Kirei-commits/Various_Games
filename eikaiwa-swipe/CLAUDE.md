# CLAUDE.md — SwipeTalk（英会話フレーズ学習）

全20章・1000フレーズのスワイプ学習＋テストアプリ。詳しくは README.md。
CI はリポジトリ直下の `.github/workflows/ci.yml`（matrix に `eikaiwa-swipe` を登録済み）。

## 壊してはいけない約束

1. **`src/` を変えたら `npm run build` して `index.html` も一緒にコミットする。**
   `index.html` の source-hash を lint が検査するので、忘れると CI が落ちる。`index.html` を手で編集しない。
2. **`src/logic.js` は DOM・音声API・LocalStorage に触らない純粋関数だけにする。**
   「今日」や乱数は引数で受け取る。これにより lint とロジックテストが依存なしの Node だけで動く。
3. **教材は各章ちょうど50問、英語の重複なし。** ID は英語から作るので、英語を変えるとその問題の学習記録が消える。
4. **保存データの形を変えるときは `restoreState` で旧形式を読めるようにする**（v1 → v2 の移行を参照）。

## コマンド

```bash
npm ci && npm run build && npm test
```

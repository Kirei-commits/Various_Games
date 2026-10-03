# CLAUDE.md — SwipeTalk（英会話フレーズ学習）

全110章・5500問（フレーズ50章・単語60章）のスワイプ学習・テスト（英→日／日→英）・シャドーイングアプリ。詳しくは README.md。
CI はリポジトリ直下の `.github/workflows/ci.yml`（`changes` ジョブの `ALL` に `eikaiwa-swipe` を登録済み。このディレクトリが変わったときだけ、このゲームの検査が走る）。

## 壊してはいけない約束

1. **`src/` を変えたら `npm run build` して `index.html` も一緒にコミットする。**
   `index.html` の source-hash を lint が検査するので、忘れると CI が落ちる。`index.html` を手で編集しない。
2. **`src/logic.js` は DOM・音声API・LocalStorage に触らない純粋関数だけにする。**
   「今日」や乱数は引数で受け取る。これにより lint とロジックテストが依存なしの Node だけで動く。
3. **教材は各章ちょうど50問、英語の重複なし。** 章を増やしたら `src/data/index.js` の import・配列・`PARTS` と、
   `tests/lint.mjs` の章数を更新する（単語の章は例文1行「A: 例文 | A: 訳」の形）。
   教材の英文を足したら `node tools/readings.mjs <cmudict.dict>` で読み方（ルビ）の発音データ `src/data/pron.js` も作り直す（cmudict は `pip download cmudict` の中）。章ID（chNN）はテスト記録のキーなので、既存の章の番号は変えず、新しい章は末尾に足す。
4. **利用者の学習記録を絶対に失わない。** アプリを改修しても進捗が引き継がれるよう、次を守る。
   - 問題IDは英語から作る。**英語を書き換えたら `src/data/id-changes.js` の `RENAMED` に「古いID: 新しいID」を、
     問題を消したら `RETIRED` に古いIDを書く。** 公開済みIDは `src/data/ids.lock.json`（ビルドが追記する。手で消さない）に
     記録されていて、書き忘れは lint が止める。
   - 保存データの形を変えるときは `logic.js` の `STATE_VERSION` を上げ、`MIGRATIONS` に移行を1つ足す（古い移行は消さない）。
   - `restoreState` は今の教材にない問題の記録も捨てずに残す。この挙動を変えない。
   - クラウドのデータがアプリより新しい版なら上書きしない（`resolveLogin` の `newerRemote`）。
5. **単語ガチャの記録（`state.gacha`）とバトルの記録（`state.battle`）も学習記録と同じく失わない。** カードは単語IDに結びついているので、上の ID のルールがそのまま効く。
   形を変えるときも STATE_VERSION と MIGRATIONS で移行する（v3 でガチャとバトルを追加、v4 でブースト・コード入力を追加しコインを廃止、v5 でお気に入り `state.favorites` と日記 `state.diary` を追加、v6 で冒険 `state.quest` を追加、v7 で冒険の装備7か所・プリセット、v8 で装備の強化 `quest.enhance`）。冒険の進行と数値は `src/quest.js` の純粋関数。日記の保存は `src/diary.js` の純粋関数（採点はしない）。バトルの進行は `src/battle.js` の純粋な関数で行う。抽選は `src/gacha.js` の純粋関数だけで行い、
   乱数は引数で受け取る。語源・豆知識を足すときは、チラ見せ（teaser）に答えの単語を書かない（テストが止める）。
6. **クラウド保存は `src/cloud.js` の窓口だけを通す。** 画面から Firebase を直接呼ばない。
   `cloud-config.js` が null のときと Artifact 用ビルドでは、`tools/build.mjs` が Firebase SDK をスタブに差し替える。
   ログイン時の統合ルールは `logic.js` の `resolveLogin` / `mergeStates`（テストあり）。

7. **画面に出す文字は `tr("日本語", "English")`（`src/i18n.js`）で両方書く。** 設定の「表示の言語」で切り替わる。モジュールの定数に置く名前は getter（`get name() { return tr(...) }`）にする。章を足したら `src/data/titles-en.js` に英語の章名も足す。

## コマンド

```bash
npm ci && npm run build && npm test
```

## 音声・画像の生成（Gemini API）

作業の引き継ぎと現状は `HANDOFF.md`。**API での生成はユーザーがはっきり指示したときだけ行う。**
録音は `tools/media/tts.py`（設定は `tts.config.json`、できるものは `audio/`）、絵は `tools/media/game_art.py`。
生成した音声・画像の変換は `tools/media/`（先に `tools/media/setup.sh` で ffmpeg と Pillow を入れる。コンテナには入っていない）。

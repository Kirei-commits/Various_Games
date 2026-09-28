# 引き継ぎメモ（SwipeTalk / eikaiwa-swipe）

新しいセッションで最初に読むためのメモ。2026-09-28 時点。

## 1. 基本情報

- リポジトリ: `Kirei-commits/Various_Games`、アプリは `eikaiwa-swipe/`
- 構成: React 18 + Tailwind + lucide-react 0.263.1 + esbuild。ビルド結果は `index.html` 1枚にまとめてインライン化
- 既定ブランチ: `claude/cyberpunk-gomoku-game-70crr8`（PR はここに向ける）
- 作業ブランチ: `claude/add-kirei-commits-various-games-qxesl0`
  - PR がマージ済みなら、既定ブランチの最新から作り直してから作業する
- PR はユーザーに頼まれたときだけ作る
- 詳しいルールは `eikaiwa-swipe/CLAUDE.md` と `README.md` を参照

### 必ず守ること

- `src/` を変えたら **`npm run build` を実行し、`index.html` もコミットする**
  - lint が `src/` などの source-hash と `index.html` を照合する
- テスト（すべて `eikaiwa-swipe/` で実行）:
  - `npm run lint`
  - `npm run test:logic`（node:test、現在 126 件）
  - `npm run test:e2e`（Playwright デスクトップ + モバイル、現在 136 件）
- CI は eikaiwa-swipe / gomoku-narabe / god-arena / tsuri-quest のマトリクス。今は全部緑
- 保存データの形を変えるときは `STATE_VERSION` と `MIGRATIONS` を更新する
  - 現在は 5。3 = ガチャ/バトル、4 = ブースト/コード、5 = お気に入り/日記
- 問題 ID のルールは CLAUDE.md を参照（`ids.lock.json` は手で消さない、削除したら `RETIRED` に書く）

## 2. 主なファイル

| ファイル | 中身 |
|---|---|
| `src/App.jsx`（約6300行） | 画面すべて（学習、テスト、ガチャ、図鑑、バトル、日記、設定など） |
| `src/logic.js` | 学習ロジック、状態、マイグレーション |
| `src/gacha.js` | ガチャ、チケット、交換、メダル、ショップ、マイ称号、コード、時間ポイント、ブースト |
| `src/battle.js` | バトル（難易度5段階、PACE、フリーズ/必殺、報酬、エンドレス） |
| `src/battle-art.jsx` | バトルの SVG 絵（`Monster` / `Dragon` / `Hero` / `BattleBackdrop`）。**Gemini 画像への置き換え対象** |
| `src/audio.js` | Web Audio で作る効果音と BGM（`SoundEngine`、`setBattleMusic` / `setStudyMusic`） |
| `src/voices.js` | ブラウザ読み上げ（speechSynthesis）の声の選び方 |
| `src/diary.js` | 日記（保存だけで、採点はなし） |
| `src/data/ch01.js`〜`ch110.js` | 問題データ（1行 = `英語 \| 訳 \| 会話例 \| 会話例の訳`）。全部で約5500問 |
| `src/data/gacha-data.js` | ガチャの単語カード |

- 読み上げは今はブラウザの `speechSynthesis` を使う。`App.jsx` の 374 行目付近の speak 処理がそれ
- 敵の絵は `monsterKindOf(id)` が単語 ID から種類を決めている

## 3. これまでにできたこと（PR #10、#11 はマージ済み）

**ガチャ**
- 引く演出、5連から大量連まで
- 通常の確率は N 93.9 / R 5 / SR 1 / SSR 0.1%。天井は 500 回（10連の確定枠はなし）
- レアチケットは 1/10/50/100 連、SR/SSR チケットは 1/10 連
- チケットはログインでもらえる（SR は毎日3枚、SSR は3日に1枚）。100枚で上のチケット1枚に交換できる
- 図鑑の交換コスト: N 200 / R 800 / SR 3000 / SSR 10000

**ポイントとアイテム**
- ポイントは学習時間で増える（600pt/分）
- 5倍ブースト
- ワードコード（開発用の "aaa" は無制限）
- ダブりはメダルになる。メダルショップ: ブースト 150、フリーズ 40、必殺 60

**バトル**
- BGM、SVG の絵とエフェクト
- 難易度5段階、範囲はタップで開く ScopePicker で選ぶ
- 倒した単語の復習、エンドレスのレベルボーナス
- 速さ（PACE）は遅めに調整済み

**その他**
- マイ称号: 持っている単語を3つまで組み合わせる。30個まで、装備と削除ができる。前からある称号は「実績」として図鑑に移動
- お気に入り⭐
- 進捗の章をタップすると「学習 / 一覧」を選べる
- 日記タブ（採点なし）
- 学習 BGM（lofi）。読み上げ中は音量を下げ、シャドーイング中は止まる
- 声の設定で、いろいろななまりを選べる。会話ごとに声の高さ・速さを変える
- ドーパミンモード
- テーマは設定から選ぶ（コインは廃止）

## 4. 次にやること: Gemini API で画像と音声を作る

### 準備（ユーザー側で済ませたこと）

- Google AI Studio で API キーを作成済み（キー名 `swipetalk`）
- 課金を設定する（前払い $5〜10 と、Spend 画面での月の上限）
- キーは環境変数 **`GEMINI_API_KEY`** として、クラウド環境の設定に登録する
  - キーをチャット・コード・コミットに書かないこと
- まず `echo ${GEMINI_API_KEY:+set}` でキーが入っているか確かめる
- API のホスト `generativelanguage.googleapis.com` にはこの環境から接続できる
  - キーなしだと 403 が返ることを確認済み
- 同じキーで画像モデルと TTS モデルの両方を使える

### 4-1. 音声（TTS）

- モデル: **Gemini 3.8 Flash TTS**（`gemini-3.8-flash-tts`）。安くしたいなら Flash-Lite TTS
- 公式ドキュメントの ai.google.dev はこの環境の WebFetch では開けない
  - 正しいモデル名と API の形は、WebSearch で調べるか、`models` 一覧 API で確かめる
- 進め方:
  1. **まず第1章（ch01、約50問）だけ**作る
  2. ユーザーに聞いてもらい、声と速さを決める
  3. 気に入ったら全章に広げる
- 読み上げる内容: 英語フレーズと会話例（A/B の2人。声を分けるとよい）
- **保存方法に注意**
  - 全部で約6.5時間ぶんの音声になり、`index.html` にインライン化できる大きさではない
  - `eikaiwa-swipe/audio/<章>/<問題ID>.<形式>` のような別ファイルにして、`index.html` から相対パスで読む形を考える
  - 形式は mp3 / opus など小さいもの。変換に ffmpeg が要るなら入っているか確認する
- アプリ側の変更:
  - 用意した音声があればそれを再生する
  - なければ今の `speechSynthesis` に戻す
  - 学習 BGM を下げる処理（読み上げ中は音量を下げる）も、音声ファイルの再生中に効くようにする
- 費用の目安（2026年9月時点で調べたもの）:

  | 項目 | 目安 |
  |---|---|
  | 全体の文字数 | 約28.6万字 |
  | 音声トークン | 25 トークン/秒 |
  | 3.8 Flash TTS | 音声 $9 / 100万トークン、全部で約 $5.3 |
  | Flash-Lite TTS | 約 $3.5 |
  | 第1章だけの試作 | 数十円 |

  - この価格は 2026-12-31 までのキャンペーン価格。2027-01-01 から Flash-Lite は2倍になる

### 4-2. 画像

- ユーザーの要望: 「色々画像がお粗末すぎるから全て書き換えたい」
- 対象:
  - バトルの敵（`MONSTER_ART` の種類）、ボスのドラゴン、主人公、背景
  - 必要ならアイコンや、ガチャ・図鑑の絵も
- 進め方:
  1. **まず敵を3枚ほど試しに作る**
  2. 今の SVG と見比べてもらう
  3. 絵柄を決めてから全部作る
- 背景を透明にして、サイズを小さくする（WebP など）
- 画像も別ファイルにするか、小さければ inline するかを、ファイルサイズで決める
- 置き換えたら、E2E テストとスクリーンショットで表示が崩れていないか確認する

## 5. 調べてわかったこと（メモ）

- Claude には音声合成の API がない
- TTS の料金比較:

  | サービス | 料金 |
  |---|---|
  | Google Cloud TTS | Standard / WaveNet $4、Neural2 $16、Chirp 3 HD $30（いずれも 100万字あたり） |
  | OpenAI | tts-1 $15、tts-1-hd $30（いずれも 100万字あたり）、gpt-4o-mini-tts は約 1.5¢/分 |
  | ElevenLabs | Flash $0.05、v2/v3 $0.10（いずれも 1000字あたり） |

  - 品質と値段のバランスで **Gemini 3.8 Flash TTS** を推奨した
- Jev（TypeSafe）: 判断だけをするモデルで、音声や画像は作れない
  - 公式にはテキストしか受け付けない
  - `jev-multimodal` は非公式のプロジェクトで、画像などを先に文字に変換しているだけ
  - 今回は使わない

## 6. 新しいセッションでの頼み方の例

> `eikaiwa-swipe/HANDOFF.md` を読んで。GEMINI_API_KEY を登録した。まず第1章の読み上げを Gemini 3.8 Flash TTS で試しに作って、あと敵キャラの画像を3枚試しに作って。

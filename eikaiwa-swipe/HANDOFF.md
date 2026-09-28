# 引き継ぎメモ（SwipeTalk / eikaiwa-swipe）

新しいセッションで最初に読むためのメモ。2026-09-28 時点。

## 1. 基本情報

- リポジトリ: `Kirei-commits/Various_Games`、アプリは `eikaiwa-swipe/`
- 構成: React 18 + Tailwind + lucide-react 0.263.1 + esbuild。ビルド結果は `index.html` 1枚にまとめてインライン化
- 既定ブランチ: `claude/cyberpunk-gomoku-game-70crr8`（PR はここに向ける）
- 作業ブランチ: **セッションごとに指定される名前を使う**（例: `claude/festive-curie-ub1gkl`）
  - 指定されたブランチの PR がマージ済みなら、既定ブランチの最新から作り直してから作業する
- PR はユーザーに頼まれたときだけ作る
- 詳しいルールは `CLAUDE.md` と `README.md` を参照

### 必ず守ること

- **Gemini API での生成（音声・画像）は、ユーザーがはっきり指示したときだけ行う。** 動作確認のための試し呼び出しも含む
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
| `src/battle-art.jsx` | バトルの絵（`Monster` / `Dragon` / `Hero` / `BattleBackdrop`）。画像は `src/assets/battle/*.webp`（Gemini で作成済み） |
| `src/audio.js` | Web Audio で作る効果音と BGM（`SoundEngine`、`setBattleMusic` / `setStudyMusic`） |
| `src/voices.js` | ブラウザ読み上げ（speechSynthesis）の声の選び方 |
| `src/diary.js` | 日記（保存だけで、採点はなし） |
| `src/data/ch01.js`〜`ch110.js` | 問題データ（1行 = `英語 \| 訳 \| 会話例 \| 会話例の訳`）。全部で約5500問 |
| `src/data/gacha-data.js` | ガチャの単語カード |
| `tools/media/` | 音声・画像の変換ツール（下の 4-0） |

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

### 4-0. 準備と確認済みのこと（2026-09-28）

- API キーは環境変数 **`GEMINI_API_KEY`** に登録済み。キーをチャット・コード・コミットに書かないこと
  - 入っているかは `echo ${GEMINI_API_KEY:+set}` で確かめる（生成はしない）
- キーで TTS と画像の生成が実際にできることを確認済み（課金も有効）
- `models` 一覧 API で確かめたモデル名:
  - TTS: `gemini-3.8-flash-tts`、`gemini-3.8-flash-lite-tts`
  - 画像: `gemini-3.1-flash-image`、`gemini-3.1-flash-lite-image`、`gemini-3-pro-image`
- **変換ツール（ffmpeg と Pillow）はコンテナに入っていない。** 使う前に毎回これを実行する（入っていれば何もしない）:

  ```bash
  eikaiwa-swipe/tools/media/setup.sh
  ```

  - ffmpeg は pip の `imageio-ffmpeg` に同梱されたものを使う（apt は不要）。バージョンは `tools/media/requirements.txt`
  - コンテナが作り直されると消える。毎回自動で入れたいなら、クラウド環境の設定の Setup script に
    `pip install imageio-ffmpeg==0.6.0 pillow==12.3.0` を足す
- 変換は `tools/media/media.py` で行う（API は呼ばない）:

  ```bash
  python3 tools/media/media.py extract res.json audio/ch01/xxx   # レスポンス JSON → .wav / .jpg など
  python3 tools/media/media.py audio in.wav out.opus             # 既定 24kbps（mp3 なら --bitrate 48k）
  python3 tools/media/media.py image in.jpg out.webp --size 256  # 白背景を透明にして WebP。ドット絵は --pixel
  ```

- **TTS のレスポンス**: `audio/wav`（24kHz・16bit・モノラル、ヘッダー付き）。そのまま ffmpeg に渡せる
  - WAV の末尾に `C2PA` チャンク（AI 生成を示すメタデータ）が付いている。音声ではないので、変換すると落ちる
  - 生の PCM（`audio/L16;rate=...`）で返ってきた場合も `extract` が WAV に包む
- **画像のレスポンス**: 白背景の JPEG（試した例では 1408×768）
  - `media.py image` がふちとつながった白だけを透明にする。キャラクターの中の白（目のハイライトなど）は残り、境目の白いにじみも消える
  - 白いキャラクターは背景と区別できないので、プロンプトで「単色の背景（白以外）」を指定するか、`--tolerance` を下げる
- 変換後の大きさの目安: 1.4秒の音声は WAV 75KB → opus 4KB / mp3 9KB。画像は JPEG 92KB → WebP 256px で 6KB

### 4-1. 音声（TTS）

- モデル: **`gemini-3.8-flash-tts`**。安くしたいなら `gemini-3.8-flash-lite-tts`
- 公式ドキュメントの ai.google.dev はこの環境の WebFetch では開けない。API の形は WebSearch で調べる
- 進め方（生成はユーザーの指示を受けてから）:
  1. **まず第1章（ch01、約50問）だけ**作る
  2. ユーザーに聞いてもらい、声と速さを決める
  3. 気に入ったら全章に広げる
- 読み上げる内容: 英語フレーズと会話例（A/B の2人。声を分けるとよい）
- **保存方法**
  - 全部で約6.5時間ぶんの音声になり、`index.html` にインライン化できる大きさではない
  - `eikaiwa-swipe/audio/<章>/<問題ID>.opus` のような別ファイルにして、`index.html` から相対パスで読む
  - opus（24kbps）なら全体で 70MB 前後の見込み。Safari の古い版で opus が鳴らないなら mp3 も検討する
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

**バトルの絵は置き換え済み（2026-09-28）。**
- 敵10種・ドラゴン・主人公（後ろ姿）・背景を `gemini-3.1-flash-image` で作り、`src/assets/battle/*.webp`（合計約280KB）に置いた
  - ビルドで data URL として JS に埋め込む（`tools/build.mjs` の `loader`）。GitHub Pages は `index.html` しか配らないので、別ファイルにはしていない
  - 作り方とプロンプトは `tools/media/battle_art.py`。スライムを先に作り、それを見本にして絵柄をそろえた
  - 白いキャラ（おばけ・どくろ）と灰色のゴーレムは緑の背景で描かせて抜いている
  - 作り直すとき: `python3 tools/media/battle_art.py ghost`（API を呼ぶ。原画は `tools/media/raw/`、コミットしない）
- 動きは画像全体の `bt-float` / `bt-squish` / `bt-flicker`。SVG のときの羽ばたきはなくなった
- 主人公が魔法を撃つときの光は、杖の玉の位置（絵の右上 80%, 26%）に重ねている。主人公の絵を作り直したら位置を合わせる
- まだの候補: アイコン、ガチャ・図鑑の絵

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

> `eikaiwa-swipe/HANDOFF.md` を読んで。第1章の音声を試しに作ってほしい

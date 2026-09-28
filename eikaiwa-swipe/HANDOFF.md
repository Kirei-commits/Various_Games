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
| `tools/media/` | 音声・画像の生成と変換のツール（下の 4-0〜4-2） |
| `src/recorded.js` | 録音（`audio/`）の再生。無ければ端末の声に戻す |

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

**仕組みは用意済み（2026-09-28）。録音はまだ1つも作っていない。** アプリは今もすべて端末の声（`speechSynthesis`）で読む。

目標: 英語を学ぶ人向けに、**アメリカ英語（General American）のネイティブの自然な速さ・抑揚・音の変化（リンキング、フラップT、弱形）** を聞けるお手本にする。
ゆっくり聞きたいときはアプリの「話す速さ」で再生速度を下げる（音の高さは変わらない）ので、録音は自然な速さで作る。

**設定**: `tools/media/tts.config.json`
- `model`（今は `gemini-3.8-flash-tts`）、役ごとの声（`roles.P` = 見出しのフレーズ、`A` / `B` = 会話）、話し方の指示（`style`）と役ごとの指示（`persona`）
- **指示は読む文に混ぜず、リクエストの `speechMetadata.style` で送る**（`contents[0].parts[0] = { text: 読む文, speechMetadata: { style } }`）
  - 2026-09-28 に確かめたこと: 指示を文の前に書くと、10声中5声で 34〜55 秒の音声になり、2声は同じ文を2回読んだ。短い1行の指示でも約14秒に伸びた
  - `systemInstruction` はこのモデルでは使えない（400 "Developer instruction is not enabled for this model"）
  - `speechMetadata.style` は効いている（"whisper very slowly" で 3.9秒→7.8秒、音量も約1/4 になった）。これにしてからは10声すべて 3.2〜4.3 秒で、文字起こしも一致
- 会話の2行目からは、直前の行を「読まない文脈」として渡している（返事らしい抑揚にするため）
- 声の候補は API の `GET /v1beta/voices` で見られる（2,089種類。General American は30種類）。`sampleVoices` に聞き比べの候補を入れてある

**スクリプト**: `tools/media/tts.py`（plan 以外は API を呼ぶ。頼まれたときだけ実行）

```bash
python3 tools/media/tts.py plan ch01            # 作る文の数・費用の目安・プロンプトの例（無料）
python3 tools/media/tts.py sample --text "How's it going?"   # 声の候補を聞き比べ（raw/tts/samples/）
python3 tools/media/tts.py generate ch01        # 通常の API ですぐ作る
python3 tools/media/tts.py submit ch01 ch02     # Batch API（半額・最大24時間）。--dry-run で送らずに中身を確認
python3 tools/media/tts.py status               # バッチの状態（無料）
python3 tools/media/tts.py collect              # 終わったバッチを取り込む
```

- 読む文は、アプリと同じ関数で取り出す（`tools/media/tts-lines.mjs`）。同じ「役|英文」は1回だけ作る。全章で 13,278 文（見出し 5,500・A 5,393・B 2,385）
- 目安: 全章で約8時間・出力 約72万トークン・通常 約$6.5 / Batch 約$3.2（音声の出力だけ。入力のプロンプト分は別）。opus 24kbps で約84MB
- **Batch API の送り方・結果の形は公式ページを読めないまま実装した**（ai.google.dev はこの環境から開けない）。最初に ch01 で出して確かめる。結果の形が読めなければ `raw/tts/<名前>.response.json` に保存して止まる
- 長さが不自然な録音（文を繰り返した、など）は取り込まずに警告する。`plan` で作り直しの対象に残る

**できるもの（コミットする）**
- `audio/clips/<hash>.opus`: 録音。hash は「役|英文」から `src/recorded.js` の `clipHash` で決まる（テストで値を固定している。変えると録音が全部見つからなくなる）
- `audio/index.json`: アプリが起動時に読む一覧 `{ clips: { hash: 版 } }`。作り直すと版が上がる
- `audio/manifest.json`: 記録（英文・章・問題ID・モデル・声・設定の署名・長さ・作った日）。設定を変えると署名が変わり、`plan` で作り直しの対象になる

**アプリ側**（`src/recorded.js`、`App.jsx` の `useSpeech`）
- 読む行すべてに録音があれば録音を再生する。1行でも欠けていれば、声が混ざらないよう全部を端末の声で読む。再生に失敗したときも端末の声に戻す
- 設定に「ネイティブ音声（録音）を使う」が出る（録音が1つ以上あるときだけ）。学習 BGM は録音の再生中も小さくなる
- E2E テストはふだん録音を使わない（`window.__swipetalkNoRecorded`）。録音の動きは `tests/e2e/recorded.spec.mjs` で確かめる
- GitHub Pages は `audio/` も配る（`.github/workflows/pages.yml`）

**決まったこと（2026-09-28）**
- 声: 見出し = Erinome（女性）、A = Achird（男性）、B = Callirrhoe（女性）。10声を聞き比べてユーザーが選んだ
- **Batch API は当面使わない**（ユーザーの判断）。`generate`（通常の API）で作る

**速さ（2026-09-28 に計測）**
- 1文あたり: API 約2〜3.5秒、opus への変換 約0.2秒（コンテナが起動した直後の最初の1回だけ ffmpeg の読み込みで 約4秒）
- `generate` と `sample` は `concurrency`（今は 8）件を同時に送り、保存・変換も並列に行う。終わった順に保存するので、途中で止めても続きから作れる
  - 10声の聞き比べ: 1本ずつなら約34秒 → 8.9秒
  - ch01（150文）の目安: 約1分。全章（13,278文）: 8並列で約1.5時間（429 が出なければ concurrency を上げるとさらに短くなる）
- 429（送りすぎ）は API が示す待ち時間に従って自動で再試行する。失敗した文は最後にまとめて表示し、次の `generate` で作り直す

**API の上限（Tier 1、AI Studio の表示・2026-09-28）**: 音声のモデルはどれも 1分10回・1分1万トークン、1日は 3.8 Flash / 2.5 Flash / 3.1 Flash / 3.8 Flash Lite が100回、2.5 Pro が50回。上限はモデルごと

**全章の作り方（2026-09-28 に設計。ユーザーの指示: 安くて早いモデルでよい・上のモデルから順に使う）**
- **モデルの順番**（`tts.config.json` の `models`）: 3.8 Flash TTS → 2.5 Flash TTS → 2.5 Pro TTS → 3.1 Flash TTS → 3.8 Flash Lite TTS。1日の上限に当たったら次へ。上限に当たったモデルは `raw/tts/quota.json` に戻る時刻を書き、それまでとばす
  - 2.5 は `speechMetadata` を使えない見込みなので、文だけ送る（`format: plain`）。3.x で 400 が返ったら、そのモデルは自動で plain にする
- **まとめて読ませる**: 見出しは20文（60語まで）、会話は10会話（25行まで）を1回のリクエストで読ませ、`tools/media/tts_pack.py` が無音で1文ずつに切る。約13,200回 → 約800回
  - 切るのは「長い順に n-1 個の無音が 0.6秒以上で、残りの無音より 1.35倍以上長い」ときだけ。はっきりしないときは推測で切らず、半分ずつにして作り直す（間違った切り方で保存しない）
  - 既存の録音で作った合成データで確かめた: 間が 1秒なら 80/80 正しく切れ、間違いは 0（短い間は失敗扱いになるだけ）
- **試し**: モデルごとに最初の1回は小さく（見出し5文・会話3会話）。切り分けと、文字起こし（3.5 Flash。上限は1日1万回）の一致 85% 以上を確かめてから本番の大きさにする。だめなら1文ずつにする
- 1文ごとに manifest を保存。モデルを変えても、できている録音は作り直さない（`--refresh` のときだけ）。manifest の `model` にどのモデルで作ったかが残る
- 偽の API での通しの試験: 1日目 約6,000文（約360回）、同じ日にもう一度動かすと 0 回で終わる、2日目に続きから作れる
- **費用の目安**: 全体の音声 約8.4時間（うち文のあいだの間 約3.7時間）＝ 約75万〜96万トークン、約¥1,100〜1,450。1日目 最大 約¥670（2.5 Pro は料金が2倍なので 50回で 約¥150〜190）

**進み具合**: ch01 の 49文（3.8 Flash TTS）ができている。残り 13,229文

### 4-2. 画像

**バトルの絵は置き換え済み（2026-09-28）。**
- 敵10種・ドラゴン・主人公（後ろ姿）・背景を `gemini-3.1-flash-image` で作り、`src/assets/battle/*.webp`（合計約280KB）に置いた
  - ビルドで data URL として JS に埋め込む（`tools/build.mjs` の `loader`）。GitHub Pages は `index.html` しか配らないので、別ファイルにはしていない
  - 作り方とプロンプトは `tools/media/game_art.py`（バトルもガチャもこれ）。スライムを先に作り、それを見本にして絵柄をそろえた
  - 白いキャラ（おばけ・どくろ）と灰色のゴーレムは緑の背景で描かせて抜いている
  - 作り直すとき: `python3 tools/media/game_art.py battle ghost`（API を呼ぶ。原画は `tools/media/raw/<組>/`、コミットしない）
- 動きは画像全体の `bt-float` / `bt-squish` / `bt-flicker`。SVG のときの羽ばたきはなくなった
- 主人公が魔法を撃つときの光は、杖の玉の位置（絵の右上 80%, 26%）に重ねている。主人公の絵を作り直したら位置を合わせる

**ガチャの絵も置き換え済み（2026-09-28）。** `src/assets/gacha/*.webp`（15枚・約185KB）、使う側は `src/gacha-art.jsx`
- ガチャの種類ごとの台（通常=カプセルの機械、レア/SR/SSR=宝箱）、引くときに揺れる宝箱、カードの裏の紋章
- 財布のアイコン6種、ショップの道具3種
- 単語カード（約3000枚）には絵を付けていない（枚数が多すぎるため）
- まだの候補: 図鑑・ホームなどのアイコン

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

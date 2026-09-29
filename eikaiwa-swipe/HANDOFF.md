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
- 声の設定: 端末の声は A役・B役を選んで固定（2026-09-29 に「会話ごとにいろいろな人の声」「いろいろな国の英語の声」の設定はなくした。録音があるため）
- ドーパミンモード
- テーマは設定から選ぶ（コインは廃止）

**2026-09-29 に足したもの**
- 話す速さのバー（`SpeedBar`・`RateContext`）を学習・シャドーイング・一覧・テストに置いた
- 進捗の画面をコンパクトに: 要約1行・小さな数字・続きから・コースは開くと章の番号のマス（章の成績は章を押したときの ChapterChooser に）
- 冒険: 装備7か所（`SLOTS`。古い保存の armor/charm は body/accessory へ）、SSR の特製の呪文（`SKILLS`）、敵のため→大こうげき（ぼうぎょで受けとめてはんげき）、演出と効果音（styles.css の qs-*、audio.js の warn/smash/block/heal/spell/appear）
- BGM が iPhone で聞こえない: 消音スイッチ（マナーモード）で Web Audio が鳴らないため。`src/audio.js` の unlock で `navigator.audioSession.type = "playback"`（古い iOS は無音の <audio> をループ）。マイクを使うあいだは `setMicActive` で play-and-record に切り替える
- バトル: 敵が出たとき（ボスの単語が変わったときも）に英単語を読み上げる（英語→意味のときだけ）
- バトル: 敵が出てくる間隔を短く（4択 4.5秒→2.4秒）、倒したらすぐ次が出る（`RESPAWN_EMPTY` 0.25秒・`RESPAWN_AFTER_KILL` 0.9秒）。近づく速さは変えていない
- ドーパミンモード: 画面のゆれ・光の輪・放射の光・絵文字の雨・虹色の文字。5連続ごとに節目の大きな演出と音、10連続からフィーバー（画面のふちが虹色）
- 日記: ガチャの単語を使う形をやめて、自由に書く日記に（英語でも日本語でも・気分・今日のお題）。保存の形は同じ（mood を足しただけ）
- 冒険（ドラクエ風モード）: テスト画面の「冒険」。ガチャの単語を装備にして塔を登る。`src/quest.js`（数値・戦闘）と `src/QuestScreen.jsx`。保存は `state.quest`（STATE_VERSION 6）
  - 装備の強さ・効果・属性の決め方は README の「冒険」。新しい絵は作っていない（バトルの絵を使う）

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
- ~~Batch API は当面使わない~~ → 2026-09-29 から **Batch API で作る**（下の「進み具合」）

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

**2026-09-28 の実行で分かって直したこと**
- 2声の会話でまとめると、3.8 Flash TTS は行の間が約0.5秒しか空かず切れなかった → 会話の行も役ごと（A だけ・B だけ）に1声でまとめる（`packing.dialogMode: roles`）
- 1文ずつに落ちたモデルのあと、次のモデルまで1文ずつになっていた → モデルが変わるたびに残りからまとまりを作り直す
- 2.5 Flash TTS（plain）の文の間は 0.4〜1.0秒 → 切り分けの条件を「無音がちょうど n-1 個」か「n-1 個が残りより 1.35倍長い（0.3秒以上）」に。合成データで間違い 0 のまま
- 2.5 Pro TTS は料金が2倍なのでとばす（ユーザーの指示）。1まとまり 120語まで
- 試しの結果は `raw/tts/models.json` に残し、動かし直しても試しをくり返さない
- 翌日の続きは、上限のリセット（00:00 UTC ごろ）のあとに自動で再開するよう予約してある

**合いの手（英語の声での応援）** — ユーザーの依頼「テストやバトルなどで すごい！おめでとう！などの声を」
- 文と声: `tools/media/cheers.json`（場面ごとに約90文。coach = Laomedeia / Puck、バトルは hype = Fenrir / Leda、まちがえたときは gentle = Sulafat / Achird。どの文も2声）
- 作り方: `python3 tools/media/tts.py cheers`（**Batch API** に出す。182本・約$0.03。`--dry-run` で送らずに確認）→ `collect` で Whisper の確認に通ったものだけ `audio/cheers/*.opus` と `audio/cheers.json` に入る。通らないものはもう一度 `cheers` で出し直す
  - 話し方は場面の style ＋ `cheers.json` の `once`（1回だけ・言い直さない）
- アプリ: `src/cheers.js`。効果音（`SoundEngine.play` の名前）に合わせて、場面の声からランダムに流す（場面ごとの確率つき・連続正解は5回ごと・読み上げ中や直前と同じ文は流さない）。設定「合いの手（英語の声で応援）」でオフにできる（声があるときだけ表示）
- テスト: `tests/logic/cheers.test.mjs`、`tests/e2e/cheers.spec.mjs`

**進み具合（2026-09-29 夕方）: 録音と合いの手はすべて完了**
- 録音: **13,278文すべて** 3.8 Flash TTS（Batch）で作り、Whisper で確認済み。ほかのモデルの録音は残っていない
- 合いの手: **182本すべて**（`audio/cheers/`・`audio/cheers.json`）。12場面・どの文も2声
- 5回とも Whisper の確認に通らず、そのまま残した8文（manifest に `check` が付いている）。多くは Whisper の聞き違いだが、耳で確かめるとよい:
  sweat / aisle seat / course / have a lot on my plate / considerate / Aisle seat, please. / I called to congratulate her. / A ferry crosses the strait every hour.
- 費用: この日の Batch は 3,571件・音声 約2時間で 約$0.8（見積もり。実際は AI Studio で）。前日までと合わせて 約¥1,350〜1,450
- 作り直すとき: 文や設定を変えたら `submit` → `collect`（Whisper で確かめて取り込む）。合いの手は `cheers.json` を変えて `tts.py cheers` → `collect`

**確認は Whisper（無料）で行う（2026-09-29 から）**
- `tts.config.json` の `batch.verify.engine: "whisper"`。faster-whisper の `small.en` をこのコンテナの CPU で動かす（1本 約0.7秒）。Gemini で確かめたいときは `engine: "gemini"`
- 入れ方: `tools/media/setup.sh --whisper`（`requirements-whisper.txt`）。モデルは初回に huggingface.co から落とす（ネットワーク設定で許可済み）
- Whisper は言い直しを消して「きれいな文」にしがちなので、言いよどみを含む `prompt` を渡している。これで頭を言い直した合成の録音を 24/24 見つけた（prompt なしは 15/24）。Gemini で通った録音は 100本中 98本が通った
- `compare_words` は分け書きの違い（key card / keycard）も同じとみなす
- 数の書き方（ten percent / 10%、seven fifty / $7.50、nine oh two one oh / 90210、first / 1st）と、アクセント記号（résumé / resume）の違いも同じとみなす。数字が出てきたときだけ、数のまとまりを比べない（語で書かれた数のくり返しは見つける）
- 1〜3語の見出しは、通らなければ prompt なしでもう一度聞く（prompt があると aisle seat → I'll see のように聞き違えやすい）
- 通らなかった録音の WAV は `raw/tts/wav/` に残る。確認のしかたを直したら、作り直さずにその WAV で判定し直せる（2026-09-29 に 27文を無料で取り込んだ）
- Whisper が文の頭に「Ugh」「You」などを足して通らないことが少しある。通らなかった文は出し直すだけなので（1文 約¥0.02）、そのままにしている

**Batch API で分かったこと**
- 1件（200文）が数分で終わる。通常の API の1日100回の上限とは別枠で、残り約1万文を一度に出せた
- 「自然な会話で」と指示すると、言い直し（くり返し）が混ざることがある → style に「1回だけ・言い直さない」を足し、取り込み時に安い Lite のモデルで文字起こしして語数を確かめる。2回失敗した文からは失敗の種類（くり返し／言い落とし）に合わせた指示を足して出し直す（最大5回）。失敗は `raw/tts/failures.jsonl`
- 確認中の録音は `raw/tts/staging/`（git の外）に置き、通ったものだけ `audio/clips/` に入れる。取り込むたびにコミット
- submit と collect を同時に動かしたら jobs.json が上書きされ、11件のジョブが一覧から消えた → Batch の一覧 API から取り戻し、jobs.json は書く前に読み直してまとめるようにした

### 4-2. 画像

**画像を作るときの決まり（2026-09-28 ユーザーの了承）**: 1枚 約¥10〜13（大きさに関係なく 1024px で作られるため）。
- 小さいアイコンなどは、1枚の画像に並べて描かせて切り分ける（9枚を1回で作れば 約¥100 → 約¥12）
- 敵やアイコンは小さい解像度（512px、1枚 約¥7）で足りる
- 作る前に枚数と金額を伝えて了承をもらう

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

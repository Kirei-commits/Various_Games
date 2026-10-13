# kyozai-quiz（教材登録・問題生成）

pptx 教材を登録し、図解を含む内容に沿った問題（4択・記述・正誤）を Gemini で生成するアプリです。
**ブラウザ版**（インストール不要）と **CLI 版**（Python）があります。

## ブラウザ版

https://kirei-commits.github.io/Various_Games/kyozai-quiz/

1. 「設定」で Gemini の API キーを入れる（[Google AI Studio](https://aistudio.google.com/apikey) で無料で発行できる）
2. pptx と、同じ pptx から書き出した PDF を選んで登録する（画面のサンプルでも試せる）
3. 「問題」タブで問題を作る。答え合わせ・出典ページへの移動・Markdown / JSON の書き出しができる

- pptx の解析（テキスト・ノート・図の判定）はブラウザ内の JavaScript で行い、Python 版と同じ結果になることをテストで確かめています
- ページ画像は PDF から作ります（LibreOffice の代わり）。PowerPoint が非表示スライドを PDF に出さない場合も対応づけます
- 教材・ページ画像・問題はそのブラウザの IndexedDB にだけ保存し、API キーもそのブラウザにだけ保存します。Gemini API へはブラウザから直接送ります
- 無料枠向けの動き（呼び出し間隔・1日の上限での未処理化・問題生成のまとめ呼び出し）は CLI 版と同じです

ソースは `web/`（ビルド不要の静的ファイル）。手元では `cd web && npm ci && npm start` で http://localhost:4173/ に開きます。
テストは `npm run test:logic`（Node）と `npm run test:e2e`（Playwright。Gemini は偽物に差し替え）です。
プロンプトは `web/js/prompts.js` と `kyozai_quiz/prompts.py` で同じ文面を持ちます（食い違うとテストが落ちます）。

## CLI 版

- 図の解析（VLM）は**登録時に一度だけ**行い、結果を SQLite に保存します。問題生成では保存済みデータを使うので、VLM を毎回呼びません。
- OCR は使いません。テキスト・発表者ノート・グラフの数値・表・SmartArt の文字は python-pptx でファイルから直接読みます。
- ページ画像は必ず保存するので、あとからモデルやプロンプトを変えて説明文・Mermaid を作り直せます。

## 準備（手元の PC で動かす）

必要なもの: Python 3.10 以上、[LibreOffice](https://ja.libreoffice.org/)（pptx → PDF 変換）、Node.js 18 以上（Mermaid の構文チェック。なくても簡易チェックで動きます）。

```bash
git clone https://github.com/Kirei-commits/Various_Games.git
cd Various_Games/kyozai-quiz
python -m venv .venv && source .venv/bin/activate   # Windows は .venv\Scripts\activate
pip install -e '.[dev]'
npm ci --prefix mermaid-validator
export GEMINI_API_KEY=...                           # Windows (PowerShell) は $env:GEMINI_API_KEY="..."
```

API キーは [Google AI Studio](https://aistudio.google.com/apikey) で無料で発行できます。
`soffice` にパスが通っていない場合は、`KYOZAI_SOFFICE` に場所を指定してください
（Mac: `/Applications/LibreOffice.app/Contents/MacOS/soffice`、Windows: `C:\Program Files\LibreOffice\program\soffice.exe`）。

## サンプル教材で試す

`samples/` に、サザンオールスターズと桑田佳祐をお題にした9ページの教材（図あり5ページ）と、実際に生成した問題があります。

```bash
kyozai register samples/southern_all_stars.pptx --id sas --title "サザンオールスターズと桑田佳祐"
kyozai show sas --page 4
kyozai generate sas --per-page 2
kyozai generate sas --figure-deep --per-page 1
kyozai questions sas --out questions.md
```

API の呼び出し回数は、登録で5回（図ページの数）、問題生成で2回（5ページずつまとめる）、図を深く問う問題で1回です。
`samples/build_southern_all_stars.js` は教材を作った pptxgenjs のスクリプトです。

## Gemini API の無料枠で使う

既定の設定は無料枠に収まるようにしてあります。

- 呼び出しは1分あたり4回まで（`KYOZAI_RPM`）、同時に1つずつ（`KYOZAI_WORKERS`）
- 分あたりの上限（429）に当たったら、API が指定する時間だけ待って再試行
- 1日あたりの上限に当たったら、残りのページは API を呼ばずに「未処理」として記録。上限が戻ったら（太平洋時間の0時＝日本時間16〜17時）`kyozai retry` で続きから
- 問題生成は5ページを1回の呼び出しにまとめる（`KYOZAI_PAGES_PER_CALL`）

無料枠の上限はプロジェクトごとに決まり、Google は現在の数値を公表していません（実測では gemini-3.6-flash で1日20回程度という報告があります）。
自分の上限は AI Studio のダッシュボードで確認できます。1日の回数を増やしたいときは、`KYOZAI_VLM_MODEL` / `KYOZAI_QUESTION_MODEL` に上限の大きい軽量モデル（`gemini-3.5-flash-lite` など）を指定する手もあります。

**注意**: 無料枠では、送った内容（教材のテキストや画像）が Google のサービス改善に使われることがあります。社外秘の教材には有料枠を使ってください。
有料枠では `KYOZAI_RPM=0`（制限なし）、`KYOZAI_WORKERS=4` などにすると速くなります。

## 使い方

```bash
kyozai register 講義資料.pptx --id lec01      # 登録（図ページだけ VLM で解析）
kyozai list                                   # 教材一覧（図あり・未処理・問題数）
kyozai show lec01 --page 3                    # ページの保存データ（--json も可）

kyozai generate lec01 --per-page 3            # 問題生成（全ページ・全形式）
kyozai generate lec01 --pages 2-5 --types mc,tf
kyozai generate lec01 --figure-deep           # 図の理解を深く問う（図ページのみ・ページ画像も渡す）
kyozai questions lec01 --format md --out q.md # 出典付きで書き出し（json も可）

kyozai retry [lec01]                          # 図の解析が「未処理」のページを再実行
kyozai meta                                   # 図の解析結果をモデル・プロンプト版ごとに集計
kyozai regenerate --model gemini-3.6-flash --prompt-version figure-v1 --dry-run
kyozai regenerate --material lec01            # 現在のモデル・プロンプトで作り直す
kyozai delete lec01
```

## 登録の流れ

1. pptx を LibreOffice で PDF に変換（非表示スライドも出力し、ページ番号＝スライド番号にそろえる）
2. PDF の各ページを PNG で保存（PyMuPDF）
3. python-pptx で各スライドのテキストと発表者ノートを抽出
4. 図を含むかを判定（画像・グラフ・SmartArt・図形/矢印・グループ）
   - スライド面積の 1% 未満の画像（ロゴ・アイコン）は図とみなさない
   - 表は図ではなく、マークダウン表としてテキストに含める
5. 図を含むページだけ、ページ画像を VLM に渡して説明文・Mermaid・マークダウン表を作る
6. 図を含まないページは抽出テキストのみで登録

## 保存データ

`$KYOZAI_DATA_DIR`（既定 `./data`）に保存します。

```
data/
  kyozai.db                  SQLite
  materials/<教材ID>/
    source.pptx, source.pdf
    pages/page_001.png ...
```

| テーブル | 内容 |
|---|---|
| `materials` | 教材ID・タイトル・元ファイル名・ページ数 |
| `pages` | 1ページ単位: 抽出テキスト、発表者ノート、図の有無と種類、図の説明文、Mermaid、表、ページ画像のパス、状態（`none`/`unprocessed`/`done`）、使用モデル名・プロンプトバージョン・生成日時、直近のエラー |
| `figure_analysis_log` | 図の解析の全履歴（失敗や作り直す前の結果も残る） |
| `questions` | 問題・選択肢・正解・解説・出典（教材ID・ページ番号）・図を問う問題か・画像を渡したか・モデル・プロンプト版・バッチID |

## エラー処理

- VLM の呼び出しは一時的なエラー（429・5xx・応答の形式不備）を再試行し、それでも失敗したページは `unprocessed`（未処理）として記録します。`kyozai retry` で再実行できます。
- 再生成（`regenerate`）で失敗したページは、前の説明文を残したままにします。メタ情報が変わらないので、同じ条件でもう一度実行できます。
- Mermaid は保存前に構文チェックし、エラーのものは捨てて説明文のみ保存します（捨てたコードとエラーは `mermaid_error` に残ります）。
- 図が未処理のページは、問題生成で既定では対象外です（`--include-unprocessed` で含められます）。

## 設定（環境変数）

| 変数 | 既定値 | 内容 |
|---|---|---|
| `GEMINI_API_KEY` | — | Gemini の API キー（`GOOGLE_API_KEY` でも可） |
| `KYOZAI_DATA_DIR` | `./data` | 保存先 |
| `KYOZAI_VLM_MODEL` | `gemini-3.6-flash` | 図の解析に使うモデル |
| `KYOZAI_QUESTION_MODEL` | `gemini-3.6-flash` | 問題生成に使うモデル |
| `KYOZAI_DPI` | `150` | ページ画像の解像度 |
| `KYOZAI_VLM_RETRIES` | `3` | API 呼び出しの再試行回数 |
| `KYOZAI_RPM` | `4` | 1分あたりの API 呼び出し回数の上限（`0` で制限なし） |
| `KYOZAI_WORKERS` | `1` | 同時に投げる API 呼び出しの数 |
| `KYOZAI_PAGES_PER_CALL` | `5` | 問題生成で1回の呼び出しにまとめるページ数 |
| `KYOZAI_MERMAID_VALIDATOR` | `auto` | `node`（mermaid.parse）/ `basic`（簡易）/ `off` / `auto` |
| `KYOZAI_MIN_PICTURE_AREA_RATIO` | `0.01` | これより小さい画像は図とみなさない |
| `KYOZAI_SOFFICE` | `soffice` | LibreOffice の実行ファイル |

## プロンプトのバージョン

プロンプトは `kyozai_quiz/prompts.py` にあります。文面を変えたら `FIGURE_PROMPT_VERSION` / `QUESTION_PROMPT_VERSION` を上げてください。
上げたあと `kyozai regenerate --prompt-version figure-v1`（古い版）で、古いプロンプトで作ったページだけを作り直せます。

## テスト

```bash
pytest -q
```

Gemini は呼ばず、偽のクライアントで登録 → 図の解析（失敗・再実行・再生成）→ 問題生成までを通します。LibreOffice がない環境では変換を伴うテストは飛ばされます。

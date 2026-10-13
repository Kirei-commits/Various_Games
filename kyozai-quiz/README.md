# kyozai-quiz（教材登録・問題生成）

pptx 教材を登録し、図解を含む内容に沿った問題（4択・記述・正誤）を Gemini で生成する CLI です。

- 図の解析（VLM）は**登録時に一度だけ**行い、結果を SQLite に保存します。問題生成では保存済みデータを使うので、VLM を毎回呼びません。
- OCR は使いません。テキスト・発表者ノート・グラフの数値・表・SmartArt の文字は python-pptx でファイルから直接読みます。
- ページ画像は必ず保存するので、あとからモデルやプロンプトを変えて説明文・Mermaid を作り直せます。

## 準備

```bash
cd kyozai-quiz
pip install -e '.[dev]'
npm ci --prefix mermaid-validator   # Mermaid の構文チェック用（本物の mermaid.parse を使う）
export GEMINI_API_KEY=...           # Google AI Studio の API キー
```

LibreOffice（`soffice`）が必要です（pptx → PDF 変換）。

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

- VLM の呼び出しは一時的なエラー（429・5xx・応答の形式不備）を指数バックオフで再試行し、それでも失敗したページは `unprocessed`（未処理）として記録します。`kyozai retry` で再実行できます。
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
| `KYOZAI_WORKERS` | `2` | 同時に投げる API 呼び出しの数 |
| `KYOZAI_MERMAID_VALIDATOR` | `auto` | `node`（mermaid.parse）/ `basic`（簡易）/ `off` / `auto` |
| `KYOZAI_MIN_PICTURE_AREA_RATIO` | `0.01` | これより小さい画像は図とみなさない |
| `KYOZAI_SOFFICE` | `soffice` | LibreOffice の実行ファイル |

## プロンプトのバージョン

プロンプトは `kyozai_quiz/prompts.py` にあります。文面を変えたら `FIGURE_PROMPT_VERSION` / `QUESTION_PROMPT_VERSION` を上げてください。
上げたあと `kyozai regenerate --prompt-version figure-v1` で、古いプロンプトで作ったページだけを作り直せます。

## テスト

```bash
pytest -q
```

Gemini は呼ばず、偽のクライアントで登録 → 図の解析（失敗・再実行・再生成）→ 問題生成までを通します。LibreOffice がない環境では変換を伴うテストは飛ばされます。

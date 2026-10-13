"""プロンプト。文面を変えたら必ずバージョンを上げる（保存データのメタ情報に記録され、再生成の絞り込みに使う）。"""

from __future__ import annotations

FIGURE_PROMPT_VERSION = "figure-v2"
QUESTION_PROMPT_VERSION = "question-v2"

FIGURE_PROMPT = """\
添付画像は教材スライド1ページ分の画像です。

この図は後で問題作成に使用する。図に含まれる要素、要素間の関係、矢印の向きと流れ、グループ構造、図から読み取れる結論を漏れなく記述せよ。推測は推測と明記すること。

# 出力する項目
- description: 上の指示に従った説明文（日本語）。スライドのタイトルや箇条書きの文章を書き写すのではなく、図そのものを中心に書く。
- mermaid: フロー図・構成図・シーケンス図・状態遷移図など、Mermaid で意味を損なわずに表せる図だけを Mermaid コードにしたもの（図1つにつき1要素、``` で囲まない）。
  - 配置自体に意味がある図（マトリクス上の位置、地図、写真、イラスト、グラフの形状など）は Mermaid にせず、説明文だけにする。その場合は空のリストにする。
  - 日本語や記号を含むラベルは必ず二重引用符で囲む（例: A["受付"] --> B["審査"]）。
  - 図の種類の宣言（flowchart LR など）とノード・矢印の定義は1つずつ改行で区切る。1行にまとめない。
- tables: 表形式の図（画像の表など）はマークダウン表にしたもの。表がなければ空のリスト。

# 参考: スライドファイルから取り出したテキスト（OCR ではない）
{slide_text}

# 参考: 発表者ノート
{notes}

# 参考: スライド内で検出した図の種類
{figure_kinds}
"""

QUESTION_TYPE_LABELS = {
    "multiple_choice": "4択問題（choices に選択肢を4つ、answer は正解の選択肢の文字列そのもの）",
    "short_answer": "記述・短答問題（choices は空、answer は模範解答）",
    "true_false": "正誤問題（choices は空、answer は「○」か「×」）",
}

QUESTION_PROMPT = """\
あなたは教材から確認問題を作る出題者です。下の教材の各ページについて、そのページの内容だけを根拠に問題を{count}問ずつ作ってください。
各問題の page_number には、根拠にしたページの番号を入れてください。

# 条件
- 問題形式: 次の中から偏りなく使う
{type_lines}
- 教材に書かれていないことを正解の根拠にしない。
- 図の説明文・Mermaid・表があるページでは、図の内容（流れの順序、要素間の関係、グループ構造、図から読み取れる結論）を問う問題を少なくとも1問含め、figure_based を true にする。
- 説明文中で「推測」とされている内容は、正解の根拠にしない。
- 色・線の種類・左右の位置といった図の見た目そのものは、それが内容上の意味（順序・分類・強調など）を表している場合を除いて問わない。問うのは学習内容の理解である。
- 4択問題の誤答は、もっともらしいが教材の内容から明確に誤りと判断できるものにする。
- explanation には、教材のどの記述・図のどの部分が根拠かを書く。
- 問題文に「このページ」「スライド」などの言葉を使わず、問題だけ読んで意味が通るようにする。
{deep_instruction}
# 教材（教材ID: {material_id}）
{pages}"""

PAGE_SECTION = """
## ページ {page_number}
### スライドのテキスト
{slide_text}

### 発表者ノート
{notes}
{figure_section}"""

DEEP_FIGURE_INSTRUCTION = """\
- 今回は図の理解を深く問う問題を作る。添付したページ画像（順に {image_pages}）と図の説明文を照らし合わせ、図を正しく読めていないと解けない問題（流れの順序や分岐、要素間の因果・包含関係、図から導ける結論など）を中心にする。すべて figure_based を true にする。
"""


def figure_prompt(slide_text: str, notes: str, figure_kinds: list[str]) -> str:
    return FIGURE_PROMPT.format(
        slide_text=slide_text or "（なし）",
        notes=notes or "（なし）",
        figure_kinds=", ".join(figure_kinds) or "（なし）",
    )


def page_section(
    *, page_number: int, slide_text: str, notes: str, description: str | None, mermaid: list[str] | None, tables: list[str] | None
) -> str:
    figure_section = ""
    if description:
        figure_section += f"\n### 図の説明文\n{description}\n"
    for i, code in enumerate(mermaid or [], start=1):
        figure_section += f"\n### 図の Mermaid ({i})\n```mermaid\n{code}\n```\n"
    for i, table in enumerate(tables or [], start=1):
        figure_section += f"\n### 図の表 ({i})\n{table}\n"
    return PAGE_SECTION.format(
        page_number=page_number,
        slide_text=slide_text or "（なし）",
        notes=notes or "（なし）",
        figure_section=figure_section,
    )


def question_prompt(
    *, material_id: str, pages: list[str], page_numbers: list[int], count: int, types: list[str], deep: bool
) -> str:
    return QUESTION_PROMPT.format(
        count=count,
        type_lines="\n".join(f"  - {t}: {QUESTION_TYPE_LABELS[t]}" for t in types),
        deep_instruction=DEEP_FIGURE_INSTRUCTION.format(image_pages=", ".join(f"p.{n}" for n in page_numbers)) if deep else "",
        material_id=material_id,
        pages="".join(pages),
    )

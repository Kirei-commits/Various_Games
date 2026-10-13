"""LLM に返させる JSON の形。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class FigureAnalysis(BaseModel):
    description: str = Field(description="図の要素・要素間の関係・矢印の向きと流れ・グループ構造・読み取れる結論を漏れなく記述した説明文")
    mermaid: list[str] = Field(
        default_factory=list,
        description="Mermaid に変換できる図のみ、図ごとの Mermaid コード（``` で囲まない）。変換できない図は含めない",
    )
    tables: list[str] = Field(default_factory=list, description="表形式の図をマークダウン表にしたもの")


QuestionType = Literal["multiple_choice", "short_answer", "true_false"]


class GeneratedQuestion(BaseModel):
    question_type: QuestionType
    question: str
    choices: list[str] = Field(default_factory=list, description="multiple_choice のときだけ4つ。それ以外は空")
    answer: str = Field(description="multiple_choice は正解の選択肢の文字列そのもの、true_false は「○」か「×」、short_answer は模範解答")
    explanation: str
    figure_based: bool = Field(description="図の内容（説明文・Mermaid・表・画像）を根拠にした問題なら true")


class QuestionSet(BaseModel):
    questions: list[GeneratedQuestion]

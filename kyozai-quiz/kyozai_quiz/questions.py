"""保存済みデータ（抽出テキスト・ノート・図の説明文・Mermaid・表）から問題を生成する。

通常は VLM を呼ばずテキストだけを渡す。deep=True（図の理解を深く問う）のときだけページ画像も渡す。
"""

from __future__ import annotations

import sqlite3
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from . import db
from .llm import LLMClient
from .prompts import QUESTION_PROMPT_VERSION, question_prompt
from .schemas import GeneratedQuestion, QuestionSet

ALL_TYPES = ["multiple_choice", "short_answer", "true_false"]
TYPE_ALIASES = {
    "mc": "multiple_choice", "multiple_choice": "multiple_choice", "4択": "multiple_choice",
    "short": "short_answer", "short_answer": "short_answer", "記述": "short_answer",
    "tf": "true_false", "true_false": "true_false", "正誤": "true_false",
}
TRUE_MARKS = {"○", "〇", "◯", "正", "正しい", "true", "True", "TRUE", "o", "O"}
FALSE_MARKS = {"×", "✕", "✗", "x", "X", "誤", "誤り", "false", "False", "FALSE"}


@dataclass
class PageResult:
    page_number: int
    saved: int = 0
    dropped: list[str] = field(default_factory=list)  # 形式不備で捨てた問題の理由
    error: str | None = None


@dataclass
class GenerationResult:
    batch_id: str
    pages: list[PageResult] = field(default_factory=list)
    skipped: dict[int, str] = field(default_factory=dict)  # ページ番号 → 対象外の理由

    @property
    def saved(self) -> int:
        return sum(p.saved for p in self.pages)


def parse_types(text: str | None) -> list[str]:
    if not text:
        return list(ALL_TYPES)
    result = []
    for part in text.split(","):
        key = part.strip()
        if key not in TYPE_ALIASES:
            raise ValueError(f"不明な問題形式: {key}（mc / short / tf のいずれか）")
        if TYPE_ALIASES[key] not in result:
            result.append(TYPE_ALIASES[key])
    return result


def select_pages(
    conn: sqlite3.Connection,
    material_id: str,
    pages: list[int] | None,
    *,
    deep: bool,
    include_unprocessed: bool,
) -> tuple[list[sqlite3.Row], dict[int, str]]:
    rows = conn.execute(
        "SELECT * FROM pages WHERE material_id = ? ORDER BY page_number", (material_id,)
    ).fetchall()
    if pages:
        wanted = set(pages)
        missing = wanted - {r["page_number"] for r in rows}
        if missing:
            raise ValueError(f"存在しないページ: {sorted(missing)}")
        rows = [r for r in rows if r["page_number"] in wanted]

    targets, skipped = [], {}
    for row in rows:
        n = row["page_number"]
        if deep and not row["has_figure"]:
            skipped[n] = "図なし（図を深く問うモードの対象外）"
        elif row["figure_status"] == db.STATUS_UNPROCESSED and not include_unprocessed:
            skipped[n] = "図が未処理（retry で処理するか --include-unprocessed を指定）"
        elif not (row["extracted_text"].strip() or row["speaker_notes"].strip() or row["figure_description"]) and not deep:
            skipped[n] = "材料になる内容がない"
        else:
            targets.append(row)
    return targets, skipped


def generate_questions(
    conn: sqlite3.Connection,
    data_dir: Path,
    client: LLMClient,
    material_id: str,
    *,
    pages: list[int] | None = None,
    per_page: int = 3,
    types: list[str] | None = None,
    deep: bool = False,
    include_unprocessed: bool = False,
    workers: int = 1,
    on_page: Callable[[PageResult], None] | None = None,
) -> GenerationResult:
    if not conn.execute("SELECT 1 FROM materials WHERE id = ?", (material_id,)).fetchone():
        raise ValueError(f"教材が見つかりません: {material_id}")
    if per_page < 1:
        raise ValueError("1ページあたりの問題数は1以上にしてください")
    types = types or list(ALL_TYPES)
    targets, skipped = select_pages(conn, material_id, pages, deep=deep, include_unprocessed=include_unprocessed)
    result = GenerationResult(batch_id=uuid.uuid4().hex[:12], skipped=skipped)

    def call(row):
        prompt = question_prompt(
            material_id=material_id,
            page_number=row["page_number"],
            slide_text=row["extracted_text"],
            notes=row["speaker_notes"],
            description=row["figure_description"],
            mermaid=db.loads(row["mermaid"]),
            tables=db.loads(row["tables_markdown"]),
            count=per_page,
            types=types,
            deep=deep,
        )
        images = [(data_dir / row["image_path"]).read_bytes()] if deep else None
        try:
            return row, client.generate_json(prompt, QuestionSet, images=images), None
        except Exception as e:
            return row, None, f"{type(e).__name__}: {e}"

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for row, qset, error in pool.map(call, targets):
            page_result = PageResult(row["page_number"], error=error)
            if qset is not None:
                now = db.now_iso()
                with conn:
                    for q in qset.questions:
                        normalized, reason = normalize_question(q, types)
                        if normalized is None:
                            page_result.dropped.append(reason)
                            continue
                        _insert(conn, material_id, row["page_number"], normalized, deep, client.model_name, result.batch_id, now)
                        page_result.saved += 1
            result.pages.append(page_result)
            if on_page:
                on_page(page_result)
    return result


def normalize_question(q: GeneratedQuestion, allowed_types: list[str]) -> tuple[GeneratedQuestion | None, str]:
    if q.question_type not in allowed_types:
        return None, f"指定外の形式: {q.question_type}"
    if not q.question.strip():
        return None, "問題文が空"
    answer = q.answer.strip()
    if q.question_type == "multiple_choice":
        choices = [c.strip() for c in q.choices]
        if len(choices) != 4 or len(set(choices)) != 4 or not all(choices):
            return None, f"選択肢が4つの異なる文字列ではない: {choices}"
        if answer not in choices:
            # 「A」「2」のように記号・番号で答えてきた場合は選択肢に引き直す
            index = _choice_index(answer)
            if index is None:
                return None, f"正解が選択肢にない: {answer}"
            answer = choices[index]
        return q.model_copy(update={"choices": choices, "answer": answer}), ""
    if q.question_type == "true_false":
        if answer in TRUE_MARKS:
            answer = "○"
        elif answer in FALSE_MARKS:
            answer = "×"
        else:
            return None, f"正誤問題の正解が○×でない: {answer}"
        return q.model_copy(update={"choices": [], "answer": answer}), ""
    if not answer:
        return None, "模範解答が空"
    return q.model_copy(update={"choices": [], "answer": answer}), ""


def _choice_index(answer: str) -> int | None:
    a = answer.strip().rstrip(".)）").lstrip("(（")
    for table in ("ABCD", "abcd", "1234", "１２３４", "アイウエ"):
        if len(a) == 1 and a in table:
            return table.index(a)
    return None


def _insert(conn, material_id, page_number, q: GeneratedQuestion, used_image, model_name, batch_id, now):
    conn.execute(
        """INSERT INTO questions (material_id, page_number, question_type, question, choices, answer, explanation,
               figure_based, used_page_image, model_name, prompt_version, batch_id, generated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            material_id,
            page_number,
            q.question_type,
            q.question.strip(),
            db.dumps(q.choices),
            q.answer,
            q.explanation.strip(),
            int(q.figure_based),
            int(used_image),
            model_name,
            QUESTION_PROMPT_VERSION,
            batch_id,
            now,
        ),
    )


def list_questions(conn, material_id: str, batch_id: str | None = None, pages: list[int] | None = None) -> list[dict]:
    sql = "SELECT * FROM questions WHERE material_id = ?"
    params: list = [material_id]
    if batch_id:
        sql += " AND batch_id = ?"
        params.append(batch_id)
    if pages:
        sql += f" AND page_number IN ({','.join('?' * len(pages))})"
        params.extend(pages)
    rows = conn.execute(sql + " ORDER BY page_number, id", params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["choices"] = db.loads(d["choices"])
        d["figure_based"] = bool(d["figure_based"])
        d["used_page_image"] = bool(d["used_page_image"])
        d["source"] = {"material_id": d["material_id"], "page_number": d["page_number"]}
        out.append(d)
    return out


TYPE_NAMES = {"multiple_choice": "4択", "short_answer": "記述", "true_false": "正誤"}


def to_markdown(questions: list[dict], title: str) -> str:
    lines = [f"# {title} 問題集", ""]
    for i, q in enumerate(questions, start=1):
        src = q["source"]
        lines.append(f"## 問{i}（{TYPE_NAMES[q['question_type']]}）")
        lines.append("")
        lines.append(q["question"])
        lines.append("")
        for label, choice in zip("ABCD", q["choices"]):
            lines.append(f"- {label}. {choice}")
        if q["choices"]:
            lines.append("")
        answer = q["answer"]
        if q["question_type"] == "multiple_choice" and answer in q["choices"]:
            answer = f"{'ABCD'[q['choices'].index(answer)]}. {answer}"
        lines.append(f"**正解**: {answer}")
        lines.append("")
        lines.append(f"**解説**: {q['explanation']}")
        lines.append("")
        lines.append(f"出典: 教材 `{src['material_id']}` p.{src['page_number']}" + ("（図）" if q["figure_based"] else ""))
        lines.append("")
    return "\n".join(lines)

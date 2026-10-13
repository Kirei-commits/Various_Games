"""図を含むページの解析（VLM）と保存。登録・未処理の再実行・再生成で共通に使う。"""

from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import db
from .llm import LLMClient
from .mermaid import MermaidValidator, strip_fences
from .prompts import FIGURE_PROMPT_VERSION, figure_prompt
from .schemas import FigureAnalysis


@dataclass
class Outcome:
    material_id: str
    page_number: int
    success: bool
    error: str | None = None
    mermaid_count: int = 0
    mermaid_rejected: int = 0


def analyze_pages(
    conn: sqlite3.Connection,
    data_dir: Path,
    client: LLMClient,
    validator: MermaidValidator,
    rows: list[sqlite3.Row],
    *,
    keep_previous_on_failure: bool = False,
    workers: int = 1,
    on_done: Callable[[Outcome], None] | None = None,
) -> list[Outcome]:
    """rows（pages テーブルの行）の各ページ画像を VLM に渡し、結果を保存する。

    keep_previous_on_failure=True（再生成）のときは、失敗しても既存の説明文を消さずに残す。
    メタ情報は変わらないので、同じ条件でもう一度再生成すれば再実行できる。
    """

    def call(row: sqlite3.Row) -> tuple[sqlite3.Row, FigureAnalysis | None, str | None]:
        try:
            image = (data_dir / row["image_path"]).read_bytes()
            prompt = figure_prompt(row["extracted_text"], row["speaker_notes"], db.loads(row["figure_kinds"]))
            return row, client.generate_json(prompt, FigureAnalysis, images=[image]), None
        except Exception as e:  # どんな失敗でも「未処理」として記録し、処理は続ける
            return row, None, f"{type(e).__name__}: {e}"

    outcomes = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        # DB への書き込みはこのスレッドだけで行う
        for row, analysis, error in pool.map(call, rows):
            if analysis is not None:
                outcome = _save_success(conn, validator, client.model_name, row, analysis)
            else:
                outcome = _save_failure(conn, client.model_name, row, error, keep_previous_on_failure)
            conn.commit()
            outcomes.append(outcome)
            if on_done:
                on_done(outcome)
    return outcomes


def _save_success(conn, validator, model_name, row, analysis: FigureAnalysis) -> Outcome:
    codes = [strip_fences(c) for c in analysis.mermaid if c and c.strip()]
    errors = validator.validate(codes)
    valid = [c for c, err in zip(codes, errors) if err is None]
    rejected = [(i, c, err) for i, (c, err) in enumerate(zip(codes, errors), start=1) if err is not None]
    mermaid_error = (
        "\n\n".join(f"[{i}] {err}\n--- 捨てたコード ---\n{code}" for i, code, err in rejected) if rejected else None
    )
    tables = [t.strip() for t in analysis.tables if t and t.strip()]
    now = db.now_iso()
    conn.execute(
        """UPDATE pages SET figure_status = ?, figure_description = ?, mermaid = ?, tables_markdown = ?,
               mermaid_error = ?, last_error = NULL, attempts = attempts + 1,
               model_name = ?, prompt_version = ?, generated_at = ?
           WHERE material_id = ? AND page_number = ?""",
        (
            db.STATUS_DONE,
            analysis.description.strip(),
            db.dumps(valid) if valid else None,
            db.dumps(tables) if tables else None,
            mermaid_error,
            model_name,
            FIGURE_PROMPT_VERSION,
            now,
            row["material_id"],
            row["page_number"],
        ),
    )
    _log(conn, row, True, model_name, now, analysis.description, valid or None, tables or None, mermaid_error, None)
    return Outcome(row["material_id"], row["page_number"], True, mermaid_count=len(valid), mermaid_rejected=len(rejected))


def _save_failure(conn, model_name, row, error, keep_previous) -> Outcome:
    now = db.now_iso()
    if keep_previous and row["figure_status"] == db.STATUS_DONE:
        conn.execute(
            "UPDATE pages SET last_error = ?, attempts = attempts + 1 WHERE material_id = ? AND page_number = ?",
            (error, row["material_id"], row["page_number"]),
        )
    else:
        conn.execute(
            """UPDATE pages SET figure_status = ?, last_error = ?, attempts = attempts + 1
               WHERE material_id = ? AND page_number = ?""",
            (db.STATUS_UNPROCESSED, error, row["material_id"], row["page_number"]),
        )
    _log(conn, row, False, model_name, now, None, None, None, None, error)
    return Outcome(row["material_id"], row["page_number"], False, error=error)


def _log(conn, row, success, model_name, now, description, mermaid, tables, mermaid_error, error):
    conn.execute(
        """INSERT INTO figure_analysis_log (material_id, page_number, success, figure_description, mermaid,
               tables_markdown, mermaid_error, error, model_name, prompt_version, generated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            row["material_id"],
            row["page_number"],
            int(success),
            description,
            db.dumps(mermaid),
            db.dumps(tables),
            mermaid_error,
            error,
            model_name,
            FIGURE_PROMPT_VERSION,
            now,
        ),
    )


def select_unprocessed(conn, material_id: str | None = None, pages: list[int] | None = None) -> list[sqlite3.Row]:
    sql = "SELECT * FROM pages WHERE figure_status = ?"
    params: list = [db.STATUS_UNPROCESSED]
    sql, params = _add_filters(sql, params, material_id, pages)
    return conn.execute(sql + " ORDER BY material_id, page_number", params).fetchall()


def select_for_regeneration(
    conn,
    *,
    material_id: str | None = None,
    pages: list[int] | None = None,
    model_name: str | None = None,
    prompt_version: str | None = None,
) -> list[sqlite3.Row]:
    """生成済み（done）の図ページのうち、メタ情報が条件に合うものを返す。"""
    sql = "SELECT * FROM pages WHERE figure_status = ?"
    params: list = [db.STATUS_DONE]
    if model_name is not None:
        sql += " AND model_name = ?"
        params.append(model_name)
    if prompt_version is not None:
        sql += " AND prompt_version = ?"
        params.append(prompt_version)
    sql, params = _add_filters(sql, params, material_id, pages)
    return conn.execute(sql + " ORDER BY material_id, page_number", params).fetchall()


def _add_filters(sql, params, material_id, pages):
    if material_id is not None:
        sql += " AND material_id = ?"
        params.append(material_id)
    if pages:
        sql += f" AND page_number IN ({','.join('?' * len(pages))})"
        params.extend(pages)
    return sql, params

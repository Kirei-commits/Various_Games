"""SQLite への保存。ページ画像・PDF はファイルとして保存し、ここにはパスだけを持つ。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

# figure_status の値
STATUS_NONE = "none"  # 図なし（抽出テキストのみで登録）
STATUS_UNPROCESSED = "unprocessed"  # 図ありだが VLM 未処理（失敗・スキップ含む）。retry の対象
STATUS_DONE = "done"  # 図の説明文を生成済み

SCHEMA = """
CREATE TABLE IF NOT EXISTS materials (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    source_filename TEXT NOT NULL,
    pptx_path       TEXT NOT NULL,
    pdf_path        TEXT NOT NULL,
    page_count      INTEGER NOT NULL,
    registered_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
    material_id        TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    page_number        INTEGER NOT NULL,
    extracted_text     TEXT NOT NULL DEFAULT '',
    speaker_notes      TEXT NOT NULL DEFAULT '',
    has_figure         INTEGER NOT NULL,
    figure_kinds       TEXT NOT NULL DEFAULT '[]',   -- JSON: ["picture", "chart", ...]
    hidden             INTEGER NOT NULL DEFAULT 0,
    image_path         TEXT NOT NULL,                -- data_dir からの相対パス
    figure_status      TEXT NOT NULL,
    figure_description TEXT,                         -- 図ありのみ
    mermaid            TEXT,                         -- JSON: ["flowchart LR ...", ...]。変換できた場合のみ
    tables_markdown    TEXT,                         -- JSON: ["| a | b |...", ...]。表形式の図のみ
    mermaid_error      TEXT,                         -- 構文エラーで捨てた Mermaid の情報
    last_error         TEXT,                         -- 直近の VLM 呼び出しエラー
    attempts           INTEGER NOT NULL DEFAULT 0,
    model_name         TEXT,                         -- 図の解析に使ったモデル
    prompt_version     TEXT,                         -- 図の解析に使ったプロンプトのバージョン
    generated_at       TEXT,                         -- 図の解析結果を生成した日時
    registered_at      TEXT NOT NULL,
    PRIMARY KEY (material_id, page_number)
);

-- 図の解析の全履歴（失敗・再生成前の結果も残す）
CREATE TABLE IF NOT EXISTS figure_analysis_log (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id        TEXT NOT NULL,
    page_number        INTEGER NOT NULL,
    success            INTEGER NOT NULL,
    figure_description TEXT,
    mermaid            TEXT,
    tables_markdown    TEXT,
    mermaid_error      TEXT,
    error              TEXT,
    model_name         TEXT NOT NULL,
    prompt_version     TEXT NOT NULL,
    generated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id       TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    page_number       INTEGER NOT NULL,              -- 出典ページ
    question_type     TEXT NOT NULL,                 -- multiple_choice | short_answer | true_false
    question          TEXT NOT NULL,
    choices           TEXT NOT NULL DEFAULT '[]',    -- JSON
    answer            TEXT NOT NULL,
    explanation       TEXT NOT NULL DEFAULT '',
    figure_based      INTEGER NOT NULL DEFAULT 0,    -- 図の内容を問う問題か
    used_page_image   INTEGER NOT NULL DEFAULT 0,    -- 生成時にページ画像を渡したか
    model_name        TEXT NOT NULL,
    prompt_version    TEXT NOT NULL,
    batch_id          TEXT NOT NULL,
    generated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_meta ON pages(model_name, prompt_version);
CREATE INDEX IF NOT EXISTS idx_questions_material ON questions(material_id, page_number);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def dumps(value) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False)


def loads(value: str | None):
    return None if value is None else json.loads(value)

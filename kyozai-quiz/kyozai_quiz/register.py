"""教材の登録: pptx → PDF → PNG、テキスト・ノート抽出、図の判定、図ページだけ VLM で解析。"""

from __future__ import annotations

import re
import shutil
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from . import db
from .config import Settings
from .convert import pdf_page_count, pdf_to_pngs, pptx_to_pdf
from .extract import extract_slides


class RegistrationError(RuntimeError):
    pass


@dataclass
class Registered:
    material_id: str
    page_count: int
    figure_pages: list[int]


def make_material_id(conn: sqlite3.Connection, stem: str) -> str:
    base = re.sub(r"[^\w\-]+", "_", stem, flags=re.UNICODE).strip("_") or "material"
    candidate, n = base, 2
    while conn.execute("SELECT 1 FROM materials WHERE id = ?", (candidate,)).fetchone():
        candidate = f"{base}-{n}"
        n += 1
    return candidate


def register_material(
    conn: sqlite3.Connection,
    settings: Settings,
    pptx_path: Path,
    *,
    material_id: str | None = None,
    title: str | None = None,
) -> Registered:
    """ファイル変換・抽出・DB 登録までを行う（VLM はまだ呼ばない）。図ページは「未処理」で登録される。"""
    pptx_path = Path(pptx_path)
    if not pptx_path.is_file():
        raise RegistrationError(f"ファイルがありません: {pptx_path}")
    if pptx_path.suffix.lower() != ".pptx":
        raise RegistrationError("pptx ファイルを指定してください")

    if material_id is None:
        material_id = make_material_id(conn, pptx_path.stem)
    elif not re.fullmatch(r"[\w\-]+", material_id):
        raise RegistrationError("教材IDに使えるのは英数字・日本語・_・- だけです")
    elif conn.execute("SELECT 1 FROM materials WHERE id = ?", (material_id,)).fetchone():
        raise RegistrationError(f"教材ID {material_id} はすでに登録されています")

    # 先に抽出しておけば、壊れたファイルを変換前に弾ける
    try:
        slides = extract_slides(pptx_path, settings.min_picture_area_ratio)
    except Exception as e:
        raise RegistrationError(f"pptx を読めませんでした: {e}") from e
    if not slides:
        raise RegistrationError("スライドが1枚もありません")

    material_dir = settings.materials_dir / material_id
    if material_dir.exists():
        raise RegistrationError(f"保存先がすでにあります: {material_dir}")
    try:
        material_dir.mkdir(parents=True)
        stored_pptx = material_dir / "source.pptx"
        shutil.copy2(pptx_path, stored_pptx)
        pdf_path = pptx_to_pdf(stored_pptx, material_dir / "source.pdf", settings.soffice)
        pages_in_pdf = pdf_page_count(pdf_path)
        if pages_in_pdf != len(slides):
            raise RegistrationError(
                f"PDF のページ数（{pages_in_pdf}）とスライド数（{len(slides)}）が一致しません"
            )
        images = pdf_to_pngs(pdf_path, material_dir / "pages", settings.dpi)
    except Exception:
        shutil.rmtree(material_dir, ignore_errors=True)
        raise

    now = db.now_iso()
    rel = lambda p: str(Path(p).relative_to(settings.data_dir))  # noqa: E731
    with conn:
        conn.execute(
            """INSERT INTO materials (id, title, source_filename, pptx_path, pdf_path, page_count, registered_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (material_id, title or pptx_path.stem, pptx_path.name, rel(stored_pptx), rel(pdf_path), len(slides), now),
        )
        for slide, image in zip(slides, images):
            conn.execute(
                """INSERT INTO pages (material_id, page_number, extracted_text, speaker_notes, has_figure,
                       figure_kinds, hidden, image_path, figure_status, registered_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    material_id,
                    slide.page_number,
                    slide.text,
                    slide.notes,
                    int(slide.has_figure),
                    db.dumps(slide.figure_kinds),
                    int(slide.hidden),
                    rel(image),
                    db.STATUS_UNPROCESSED if slide.has_figure else db.STATUS_NONE,
                    now,
                ),
            )
    return Registered(material_id, len(slides), [s.page_number for s in slides if s.has_figure])


def delete_material(conn: sqlite3.Connection, settings: Settings, material_id: str) -> bool:
    with conn:
        deleted = conn.execute("DELETE FROM materials WHERE id = ?", (material_id,)).rowcount
        conn.execute("DELETE FROM figure_analysis_log WHERE material_id = ?", (material_id,))
    shutil.rmtree(settings.materials_dir / material_id, ignore_errors=True)
    return bool(deleted)

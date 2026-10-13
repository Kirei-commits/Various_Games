"""pptx → PDF（LibreOffice）→ ページごとの PNG（PyMuPDF）。"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import pymupdf

# 非表示スライドも PDF に出す。出さないと PDF のページ番号とスライド番号がずれる
PDF_FILTER = 'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}'


class ConversionError(RuntimeError):
    pass


def pptx_to_pdf(pptx_path: Path, pdf_path: Path, soffice: str = "soffice", timeout: int = 600) -> Path:
    if shutil.which(soffice) is None:
        raise ConversionError(f"LibreOffice（{soffice}）が見つかりません。KYOZAI_SOFFICE で場所を指定してください")
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # 他で LibreOffice が起動していても衝突しないよう、使い捨てのプロファイルで動かす
        profile = (tmp_path / "profile").as_uri()
        cmd = [
            soffice,
            f"-env:UserInstallation={profile}",
            "--headless",
            "--norestore",
            "--convert-to",
            PDF_FILTER,
            "--outdir",
            str(tmp_path / "out"),
            str(pptx_path),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as e:
            raise ConversionError(f"PDF 変換がタイムアウトしました（{timeout}秒）") from e
        produced = tmp_path / "out" / (pptx_path.stem + ".pdf")
        if proc.returncode != 0 or not produced.exists():
            raise ConversionError(f"PDF 変換に失敗しました: {proc.stderr.strip() or proc.stdout.strip()}")
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(produced), pdf_path)
    return pdf_path


def pdf_page_count(pdf_path: Path) -> int:
    with pymupdf.open(pdf_path) as doc:
        return doc.page_count


def pdf_to_pngs(pdf_path: Path, out_dir: Path, dpi: int = 150) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    with pymupdf.open(pdf_path) as doc:
        for index, page in enumerate(doc, start=1):
            path = out_dir / f"page_{index:03d}.png"
            page.get_pixmap(dpi=dpi).save(path)
            paths.append(path)
    return paths

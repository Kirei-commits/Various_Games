"""ブラウザ版（index.html）が読み込む Python ファイルの一覧が、実際のパッケージと一致するか。"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_index_html_lists_every_module():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    block = re.search(r"const MODULES = \[(.*?)\];", html, re.S)
    assert block, "index.html に MODULES が見つかりません"
    listed = set(re.findall(r'"([^"]+\.py)"', block.group(1)))
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / "quant").rglob("*.py")}
    assert listed == actual

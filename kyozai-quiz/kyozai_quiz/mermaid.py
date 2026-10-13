"""Mermaid の構文チェック。

node: 同梱の mermaid-validator（本物の mermaid.parse）で調べる。最も確実。
basic: Node が使えないときの簡易チェック（図の種類の宣言・括弧の対応・空の矢印）。
off: 調べない。
auto: node が使えれば node、だめなら basic。
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

DIAGRAM_KEYWORDS = (
    "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2",
    "erDiagram", "journey", "gantt", "pie", "quadrantChart", "requirementDiagram", "gitGraph",
    "mindmap", "timeline", "sankey-beta", "xychart-beta", "block-beta", "C4Context", "C4Container",
    "C4Component", "C4Dynamic", "C4Deployment", "architecture-beta", "packet-beta", "kanban", "radar-beta",
)

PAIRS = {"(": ")", "[": "]", "{": "}"}


def strip_fences(code: str) -> str:
    code = code.strip()
    match = re.fullmatch(r"```(?:mermaid)?\s*\n(.*?)\n?```", code, flags=re.DOTALL)
    return (match.group(1) if match else code).strip()


class MermaidValidator:
    def __init__(self, mode: str = "auto", validator_dir: Path | None = None):
        self.validator_dir = validator_dir
        if mode == "auto":
            mode = "node" if self._node_available() else "basic"
            if mode == "basic":
                print(
                    "注意: Mermaid の構文チェックを簡易モードで行います（"
                    f"本格的に調べるには {validator_dir} で npm ci してください）",
                    file=sys.stderr,
                )
        elif mode == "node" and not self._node_available():
            raise RuntimeError(f"Node か {validator_dir}/node_modules が見つかりません（npm ci が必要です）")
        if mode not in ("node", "basic", "off"):
            raise ValueError(f"不明な Mermaid チェック方法: {mode}")
        self.mode = mode

    def _node_available(self) -> bool:
        return (
            shutil.which("node") is not None
            and self.validator_dir is not None
            and (self.validator_dir / "node_modules" / "mermaid").is_dir()
        )

    def validate(self, codes: list[str]) -> list[str | None]:
        """コードごとに、問題なければ None、構文エラーならその内容を返す。"""
        if not codes:
            return []
        if self.mode == "off":
            return [None] * len(codes)
        if self.mode == "basic":
            return [basic_check(c) for c in codes]
        return self._node_check(codes)

    def _node_check(self, codes: list[str]) -> list[str | None]:
        proc = subprocess.run(
            ["node", str(self.validator_dir / "validate.mjs")],
            input=json.dumps(codes),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Mermaid チェッカーが異常終了しました: {proc.stderr.strip()[:1000]}")
        return [None if r["ok"] else r["error"] for r in json.loads(proc.stdout)]


def basic_check(code: str) -> str | None:
    lines = [ln for ln in code.splitlines() if ln.strip() and not ln.strip().startswith("%%")]
    if not lines:
        return "空のコードです"
    first = lines[0].strip().split()[0]
    if first not in DIAGRAM_KEYWORDS:
        return f"図の種類の宣言が不正です: {first}"
    if len(lines) < 2:
        return "図の中身がありません"
    stack: list[str] = []
    in_quote = False
    for ch in code:
        if ch == '"':
            in_quote = not in_quote
        elif in_quote:
            continue
        elif ch in PAIRS:
            stack.append(PAIRS[ch])
        elif ch in PAIRS.values():
            if not stack or stack.pop() != ch:
                return f"括弧の対応がとれていません: {ch}"
    if in_quote:
        return "二重引用符が閉じていません"
    if stack:
        return "括弧が閉じていません"
    if first in ("flowchart", "graph"):
        for ln in lines[1:]:
            if re.search(r"(-->|---|==>|-\.->)\s*$", ln.strip()):
                return f"矢印の先がありません: {ln.strip()}"
    return None

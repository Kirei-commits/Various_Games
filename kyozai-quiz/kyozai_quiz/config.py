"""設定。すべて環境変数で上書きできる。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class Settings:
    data_dir: Path
    gemini_api_key: str | None
    # 図の解析（登録時・再生成時）に使うモデル
    vlm_model: str
    # 問題生成に使うモデル（図を深く問うときは画像も渡すので、画像入力ができるモデルにする）
    question_model: str
    # ページ画像の解像度
    dpi: int
    # API呼び出し1回あたりの再試行回数（これを超えたら「未処理」として記録）
    vlm_retries: int
    # 同時に投げるAPI呼び出しの数
    workers: int
    # Mermaid の構文チェック方法: auto | node | basic | off
    mermaid_validator: str
    mermaid_validator_dir: Path
    soffice: str
    # スライド面積に対してこれより小さい画像（ロゴ・アイコン等）は図とみなさない
    min_picture_area_ratio: float

    @property
    def db_path(self) -> Path:
        return self.data_dir / "kyozai.db"

    @property
    def materials_dir(self) -> Path:
        return self.data_dir / "materials"

    @classmethod
    def from_env(cls) -> "Settings":
        env = os.environ.get
        return cls(
            data_dir=Path(env("KYOZAI_DATA_DIR", "data")).resolve(),
            gemini_api_key=env("GEMINI_API_KEY") or env("GOOGLE_API_KEY"),
            vlm_model=env("KYOZAI_VLM_MODEL", "gemini-3.6-flash"),
            question_model=env("KYOZAI_QUESTION_MODEL", "gemini-3.6-flash"),
            dpi=int(env("KYOZAI_DPI", "150")),
            vlm_retries=int(env("KYOZAI_VLM_RETRIES", "3")),
            workers=int(env("KYOZAI_WORKERS", "2")),
            mermaid_validator=env("KYOZAI_MERMAID_VALIDATOR", "auto"),
            mermaid_validator_dir=Path(
                env("KYOZAI_MERMAID_VALIDATOR_DIR", str(PACKAGE_ROOT / "mermaid-validator"))
            ),
            soffice=env("KYOZAI_SOFFICE", "soffice"),
            min_picture_area_ratio=float(env("KYOZAI_MIN_PICTURE_AREA_RATIO", "0.01")),
        )

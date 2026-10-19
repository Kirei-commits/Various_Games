"""Data Ingestion Layer のインターフェースと共通前処理。"""

from __future__ import annotations

from abc import ABC, abstractmethod

import pandas as pd

from quant.domain.models import OHLCV_COLUMNS


class DataProvider(ABC):
    """OHLCV データ取得の抽象。実装は必ず normalize_ohlcv() 済みの DataFrame を返す。"""

    @abstractmethod
    def fetch_ohlcv(
        self,
        symbol: str,
        start: str | None = None,
        end: str | None = None,
        interval: str = "1d",
    ) -> pd.DataFrame:
        """index=UTC の DatetimeIndex, columns=open/high/low/close/volume。"""


def normalize_ohlcv(df: pd.DataFrame) -> pd.DataFrame:
    """列名・型・index を統一し、欠損と不整合を除去する。"""
    if df.empty:
        raise ValueError("OHLCV データが空です")

    out = df.copy()
    if isinstance(out.columns, pd.MultiIndex):  # yfinance の (field, ticker) 形式
        out.columns = out.columns.get_level_values(0)
    out.columns = [str(c).lower().replace(" ", "_") for c in out.columns]
    if "close" not in out.columns and "adj_close" in out.columns:
        out["close"] = out["adj_close"]
    if "volume" not in out.columns:
        out["volume"] = 0.0

    missing = set(OHLCV_COLUMNS) - set(out.columns)
    if missing:
        raise ValueError(f"必須列が不足しています: {sorted(missing)}")

    out = out.loc[:, list(OHLCV_COLUMNS)].astype(float)
    out.index = pd.DatetimeIndex(pd.to_datetime(out.index, utc=True), name="timestamp")
    out = out[~out.index.duplicated(keep="last")].sort_index()
    out = out.dropna(subset=["open", "high", "low", "close"])
    out["volume"] = out["volume"].fillna(0.0)

    # high/low が open/close を包含するよう補正（データ源の丸め誤差対策）
    out["high"] = out[["open", "high", "close"]].max(axis=1)
    out["low"] = out[["open", "low", "close"]].min(axis=1)
    if (out[["open", "high", "low", "close"]] <= 0).any().any():
        raise ValueError("価格に 0 以下の値が含まれています")
    return out


def infer_periods_per_year(index: pd.DatetimeIndex) -> float:
    """データの実密度から年間バー数を推定（株式日足≒252、暗号資産日足≒365）。"""
    if len(index) < 3:
        return 252.0
    years = (index[-1] - index[0]).total_seconds() / (365.25 * 24 * 3600)
    return (len(index) - 1) / years if years > 0 else 252.0

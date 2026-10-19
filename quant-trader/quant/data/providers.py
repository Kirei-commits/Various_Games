"""DataProvider の具体実装。

外部ライブラリ（yfinance / ccxt）は遅延 import し、未インストールでも
他のプロバイダーやバックテストは動くようにしている。
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from quant.data.base import DataProvider, normalize_ohlcv


class SyntheticDataProvider(DataProvider):
    """幾何ブラウン運動 (GBM) + レジーム切替で疑似 OHLCV を生成する（オフライン検証用）。"""

    def __init__(self, seed: int = 42, start_price: float = 100.0,
                 annual_drift: float = 0.08, annual_vol: float = 0.25,
                 periods: int = 1500) -> None:
        self.seed = seed
        self.start_price = start_price
        self.annual_drift = annual_drift
        self.annual_vol = annual_vol
        self.periods = periods

    def fetch_ohlcv(self, symbol: str, start: str | None = None,
                    end: str | None = None, interval: str = "1d") -> pd.DataFrame:
        rng = np.random.default_rng(self.seed)
        freq = {"1d": "B", "1h": "h", "4h": "4h", "15m": "15min"}.get(interval, "B")
        index = pd.date_range(start=start or "2019-01-01", periods=self.periods,
                              freq=freq, tz="UTC")
        if end is not None:
            index = index[index <= pd.Timestamp(end, tz="UTC")]
        n = len(index)

        dt = 1 / 252
        # トレンド局面を作るため、ドリフトを一定期間ごとに切り替える
        regime = np.repeat(rng.choice([-1.5, 0.5, 2.0], size=n // 120 + 1), 120)[:n]
        mu = self.annual_drift * regime
        shocks = rng.standard_normal(n)
        log_ret = (mu - 0.5 * self.annual_vol**2) * dt + self.annual_vol * np.sqrt(dt) * shocks
        close = self.start_price * np.exp(np.cumsum(log_ret))

        open_ = np.empty(n)
        open_[0] = self.start_price
        open_[1:] = close[:-1] * np.exp(rng.normal(0, 0.002, n - 1))  # 小さな窓開け
        intrabar = np.abs(rng.normal(0, self.annual_vol * np.sqrt(dt) * 0.6, n))
        high = np.maximum(open_, close) * (1 + intrabar)
        low = np.minimum(open_, close) * (1 - intrabar)
        volume = rng.lognormal(mean=12, sigma=0.4, size=n)

        df = pd.DataFrame({"open": open_, "high": high, "low": low,
                           "close": close, "volume": volume}, index=index)
        return normalize_ohlcv(df)


class CSVDataProvider(DataProvider):
    """ローカル CSV（または S3 から同期したファイル）を読む。ファイル名は {symbol}.csv。"""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def fetch_ohlcv(self, symbol: str, start: str | None = None,
                    end: str | None = None, interval: str = "1d") -> pd.DataFrame:
        path = self.directory / f"{symbol.replace('/', '_')}.csv"
        df = pd.read_csv(path, index_col=0, parse_dates=True)
        df = normalize_ohlcv(df)
        return df.loc[start:end] if (start or end) else df


class YFinanceDataProvider(DataProvider):
    """株式・FX・指数（Yahoo Finance）。"""

    def fetch_ohlcv(self, symbol: str, start: str | None = None,
                    end: str | None = None, interval: str = "1d") -> pd.DataFrame:
        try:
            import yfinance as yf
        except ImportError as exc:  # pragma: no cover
            raise ImportError("pip install yfinance が必要です") from exc
        raw = yf.download(symbol, start=start, end=end, interval=interval,
                          auto_adjust=True, progress=False)
        return normalize_ohlcv(raw)


class CCXTDataProvider(DataProvider):
    """暗号資産取引所（CCXT 経由）。limit 件ずつページングして取得する。"""

    def __init__(self, exchange_id: str = "binance", page_limit: int = 1000) -> None:
        try:
            import ccxt
        except ImportError as exc:  # pragma: no cover
            raise ImportError("pip install ccxt が必要です") from exc
        self.exchange = getattr(ccxt, exchange_id)({"enableRateLimit": True})
        self.page_limit = page_limit

    def fetch_ohlcv(self, symbol: str, start: str | None = None,
                    end: str | None = None, interval: str = "1d") -> pd.DataFrame:
        since = int(pd.Timestamp(start or "2020-01-01", tz="UTC").timestamp() * 1000)
        until = int(pd.Timestamp(end, tz="UTC").timestamp() * 1000) if end else None
        rows: list[list[float]] = []
        while True:
            batch = self.exchange.fetch_ohlcv(symbol, timeframe=interval,
                                              since=since, limit=self.page_limit)
            if not batch:
                break
            rows.extend(batch)
            since = batch[-1][0] + 1
            if len(batch) < self.page_limit or (until and since >= until):
                break
        df = pd.DataFrame(rows, columns=["ts", "open", "high", "low", "close", "volume"])
        df.index = pd.to_datetime(df.pop("ts"), unit="ms", utc=True)
        if until:
            df = df[df.index <= pd.Timestamp(until, unit="ms", tz="UTC")]
        return normalize_ohlcv(df)


def build_provider(source: str, **kwargs) -> DataProvider:
    """CLI / 設定ファイルからのファクトリ。"""
    if source == "synthetic":
        return SyntheticDataProvider(**kwargs)
    if source == "csv":
        return CSVDataProvider(kwargs.get("directory", "data"))
    if source == "yfinance":
        return YFinanceDataProvider()
    if source == "ccxt":
        return CCXTDataProvider(kwargs.get("exchange_id", "binance"))
    raise ValueError(f"未知のデータソース: {source}")

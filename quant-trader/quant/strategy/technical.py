"""テクニカル指標ベースの戦略実装。"""

from __future__ import annotations

import numpy as np
import pandas as pd

from quant.strategy import indicators as ind
from quant.strategy.base import Strategy, hold_between


class SmaCrossStrategy(Strategy):
    """短期 SMA が長期 SMA を上回ればロング、下回ればショート（またはフラット）。"""

    name = "sma_cross"

    def __init__(self, fast: int = 20, slow: int = 50, allow_short: bool = False) -> None:
        if fast >= slow:
            raise ValueError("fast は slow より小さくしてください")
        self.fast, self.slow, self.allow_short = fast, slow, allow_short

    def generate_signals(self, data: pd.DataFrame) -> pd.Series:
        fast, slow = ind.sma(data["close"], self.fast), ind.sma(data["close"], self.slow)
        down = -1 if self.allow_short else 0
        sig = np.where(fast > slow, 1, down)
        return pd.Series(sig, index=data.index).where(slow.notna(), 0)


class RsiMeanReversionStrategy(Strategy):
    """RSI が lower を割ったら買い、exit_level を超えたら手仕舞う逆張り戦略。"""

    name = "rsi_reversion"

    def __init__(self, period: int = 14, lower: float = 30, upper: float = 70,
                 exit_level: float = 55, allow_short: bool = False) -> None:
        self.period, self.lower, self.upper = period, lower, upper
        self.exit_level, self.allow_short = exit_level, allow_short

    def generate_signals(self, data: pd.DataFrame) -> pd.Series:
        r = ind.rsi(data["close"], self.period)
        long_state = hold_between(r < self.lower, r > self.exit_level, 1)
        if not self.allow_short:
            return long_state
        short_state = hold_between(r > self.upper, r < 100 - self.exit_level, -1)
        return long_state.where(long_state != 0, short_state)


class MacdStrategy(Strategy):
    """MACD ラインがシグナルラインを上回る間ロング。"""

    name = "macd"

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9,
                 allow_short: bool = False) -> None:
        self.fast, self.slow, self.signal, self.allow_short = fast, slow, signal, allow_short

    def generate_signals(self, data: pd.DataFrame) -> pd.Series:
        m = ind.macd(data["close"], self.fast, self.slow, self.signal)
        down = -1 if self.allow_short else 0
        sig = np.where(m["hist"] > 0, 1, down)
        return pd.Series(sig, index=data.index).where(m["signal"].notna(), 0)


STRATEGY_REGISTRY: dict[str, type[Strategy]] = {
    cls.name: cls for cls in (SmaCrossStrategy, RsiMeanReversionStrategy, MacdStrategy)
}


def build_strategy(name: str, **params) -> Strategy:
    try:
        return STRATEGY_REGISTRY[name](**params)
    except KeyError as exc:
        raise ValueError(f"未知の戦略: {name}（候補: {list(STRATEGY_REGISTRY)}）") from exc

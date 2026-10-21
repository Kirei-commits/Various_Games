"""Risk Management Layer: ポジションサイジング・損切り/利確・ドローダウン停止。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass

from quant.domain.models import Direction, ExitReason, RiskConfig, Trade


# --------------------------------------------------------------------------- #
# ポジションサイジング
# --------------------------------------------------------------------------- #


class PositionSizer(ABC):
    @abstractmethod
    def size(self, equity: float, price: float, stop_price: float | None,
             history: Sequence[Trade]) -> float:
        """発注数量（正の値）を返す。0 ならエントリーしない。"""


def _cap_by_leverage(qty: float, equity: float, price: float, max_leverage: float) -> float:
    return max(0.0, min(qty, equity * max_leverage / price))


@dataclass
class FixedFractionalSizer(PositionSizer):
    """1 トレードの損失（エントリー〜ストップ間）を資産の risk_per_trade に抑える。

    qty = equity * risk_per_trade / |entry - stop|
    ストップが無い場合は最大レバレッジ分の全額投入。
    """

    risk_per_trade: float = 0.01
    max_leverage: float = 1.0

    def size(self, equity, price, stop_price, history):
        if stop_price is None or stop_price == price:
            return _cap_by_leverage(float("inf"), equity, price, self.max_leverage)
        qty = equity * self.risk_per_trade / abs(price - stop_price)
        return _cap_by_leverage(qty, equity, price, self.max_leverage)


@dataclass
class KellySizer(PositionSizer):
    """過去トレードの勝率 W と損益比 R からケリー比率 f* = W - (1-W)/R を推定する。

    サンプル不足の間は default_fraction を使い、推定値には kelly_fraction を掛けて縮小する。
    """

    kelly_fraction: float = 0.5
    max_leverage: float = 1.0
    min_trades: int = 20
    default_fraction: float = 0.1

    def kelly(self, history: Sequence[Trade]) -> float:
        if len(history) < self.min_trades:
            return self.default_fraction
        wins = [t.return_pct for t in history if t.return_pct > 0]
        losses = [-t.return_pct for t in history if t.return_pct <= 0]
        if not wins:
            return 0.0
        if not losses:
            return self.max_leverage
        win_rate = len(wins) / len(history)
        payoff = (sum(wins) / len(wins)) / (sum(losses) / len(losses))
        return max(0.0, win_rate - (1 - win_rate) / payoff) * self.kelly_fraction

    def size(self, equity, price, stop_price, history):
        qty = equity * self.kelly(history) / price
        return _cap_by_leverage(qty, equity, price, self.max_leverage)


# --------------------------------------------------------------------------- #
# 損切り・利確
# --------------------------------------------------------------------------- #


@dataclass
class StopLossTakeProfit:
    stop_loss_pct: float | None = 0.05
    take_profit_pct: float | None = 0.10

    def levels(self, entry_price: float, direction: Direction) -> tuple[float | None, float | None]:
        d = int(direction)
        sl = entry_price * (1 - d * self.stop_loss_pct) if self.stop_loss_pct else None
        tp = entry_price * (1 + d * self.take_profit_pct) if self.take_profit_pct else None
        return sl, tp

    @staticmethod
    def check(direction: Direction, stop: float | None, take: float | None,
              bar_open: float, bar_high: float, bar_low: float) -> tuple[float, ExitReason] | None:
        """バー内で SL/TP に触れたかを判定し (約定価格, 理由) を返す。

        - 窓開けで既に水準を越えていれば始値で約定（不利な約定を正しく反映）。
        - 同一バーで SL と TP の両方に触れた場合は保守的に SL を優先する。
        """
        if direction is Direction.FLAT:
            return None
        is_long = direction is Direction.LONG
        if stop is not None:
            if (is_long and bar_open <= stop) or (not is_long and bar_open >= stop):
                return bar_open, ExitReason.STOP_LOSS
            if (is_long and bar_low <= stop) or (not is_long and bar_high >= stop):
                return stop, ExitReason.STOP_LOSS
        if take is not None:
            if (is_long and bar_open >= take) or (not is_long and bar_open <= take):
                return bar_open, ExitReason.TAKE_PROFIT
            if (is_long and bar_high >= take) or (not is_long and bar_low <= take):
                return take, ExitReason.TAKE_PROFIT
        return None


# --------------------------------------------------------------------------- #
# ファサード
# --------------------------------------------------------------------------- #


class RiskManager:
    """サイジング・SL/TP・ドローダウン停止をまとめてエンジンに提供する。"""

    def __init__(self, sizer: PositionSizer, exits: StopLossTakeProfit,
                 max_drawdown_halt: float | None = None) -> None:
        self.sizer = sizer
        self.exits = exits
        self.max_drawdown_halt = max_drawdown_halt
        self._peak_equity = 0.0
        self._halted = False

    @classmethod
    def from_config(cls, cfg: RiskConfig) -> RiskManager:
        sizer: PositionSizer
        if cfg.sizing == "kelly":
            sizer = KellySizer(kelly_fraction=cfg.kelly_fraction, max_leverage=cfg.max_leverage)
        elif cfg.sizing == "all_in":
            sizer = FixedFractionalSizer(risk_per_trade=1.0, max_leverage=cfg.max_leverage)
        else:
            sizer = FixedFractionalSizer(cfg.risk_per_trade, cfg.max_leverage)
        return cls(sizer, StopLossTakeProfit(cfg.stop_loss_pct, cfg.take_profit_pct),
                   cfg.max_drawdown_halt)

    def update_equity(self, equity: float) -> None:
        self._peak_equity = max(self._peak_equity, equity)

    @property
    def halted(self) -> bool:
        return self._halted

    def can_open(self, equity: float) -> bool:
        """DD 上限に達したら以降の新規エントリーを止める（ラッチ式のサーキットブレーカー）。"""
        if self.max_drawdown_halt is not None and self._peak_equity > 0:
            if equity / self._peak_equity - 1 <= -self.max_drawdown_halt:
                self._halted = True
        return not self._halted

    def entry_quantity(self, equity: float, price: float, direction: Direction,
                       history: Sequence[Trade]) -> tuple[float, float | None, float | None]:
        stop, take = self.exits.levels(price, direction)
        qty = self.sizer.size(equity, price, stop, history)
        return qty, stop, take

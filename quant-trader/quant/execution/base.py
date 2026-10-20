"""Execution Layer: ブローカー抽象とコストモデル。

バックテスト・ペーパートレード・本番は同じ Broker インターフェースを通して発注するため、
戦略やリスク管理のコードを一切変えずに実行先を差し替えられる。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from quant.domain.models import CostConfig, Fill, Order, Position, Side


@dataclass(frozen=True)
class CostModel:
    """手数料（約定代金比）とスリッページ（bps、常に不利方向）。"""

    fee_rate: float = 0.001
    slippage_bps: float = 5.0

    @classmethod
    def from_config(cls, cfg: CostConfig) -> CostModel:
        return cls(cfg.fee_rate, cfg.slippage_bps)

    def execution_price(self, side: Side, reference_price: float) -> float:
        slip = reference_price * self.slippage_bps / 10_000
        return reference_price + slip if side is Side.BUY else reference_price - slip

    def fee(self, notional: float) -> float:
        return abs(notional) * self.fee_rate


class Broker(ABC):
    @abstractmethod
    def submit_order(self, order: Order, reference_price: float) -> Fill:
        """成行注文を送信し約定を返す。reference_price はペーパー約定の基準価格。"""

    @abstractmethod
    def get_position(self, symbol: str) -> Position: ...

    @property
    @abstractmethod
    def cash(self) -> float: ...

    def equity(self, prices: dict[str, float]) -> float:
        return self.cash + sum(self.get_position(s).quantity * p for s, p in prices.items())

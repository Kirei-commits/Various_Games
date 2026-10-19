"""ドメインモデル（全レイヤーが共有する型定義）。

外側のレイヤー（データ取得・発注 API など）に依存しない、純粋な値オブジェクトのみを置く。
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, IntEnum

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, PositiveFloat

OHLCV_COLUMNS = ("open", "high", "low", "close", "volume")


class Direction(IntEnum):
    """戦略が出力する目標ポジションの向き。"""

    SHORT = -1
    FLAT = 0
    LONG = 1


class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"


class ExitReason(str, Enum):
    SIGNAL = "signal"
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    END_OF_DATA = "end_of_data"
    RISK_HALT = "risk_halt"


class Order(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    symbol: str
    side: Side
    quantity: PositiveFloat
    timestamp: pd.Timestamp
    order_type: str = "market"


class Fill(BaseModel):
    """約定結果。price はスリッページ込みの約定価格。"""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    order: Order
    price: float
    quantity: float
    fee: float
    slippage_cost: float
    timestamp: pd.Timestamp

    @property
    def signed_quantity(self) -> float:
        return self.quantity if self.order.side is Side.BUY else -self.quantity


@dataclass
class Position:
    """保有ポジション（数量は符号付き: ロング > 0, ショート < 0）。"""

    symbol: str
    quantity: float = 0.0
    avg_price: float = 0.0

    @property
    def direction(self) -> Direction:
        if self.quantity > 0:
            return Direction.LONG
        if self.quantity < 0:
            return Direction.SHORT
        return Direction.FLAT


class Trade(BaseModel):
    """エントリーからエグジットまでの 1 往復の取引記録。"""

    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)

    symbol: str
    direction: Direction
    entry_time: pd.Timestamp
    exit_time: pd.Timestamp
    entry_price: float
    exit_price: float
    quantity: float
    fees: float
    pnl: float
    return_pct: float
    exit_reason: ExitReason
    bars_held: int


class PerformanceReport(BaseModel):
    total_return: float
    cagr: float
    annual_volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    calmar_ratio: float
    num_trades: int
    win_rate: float
    profit_factor: float
    avg_trade_return: float
    exposure: float
    final_equity: float

    def to_table(self) -> str:
        pct = {"total_return", "cagr", "annual_volatility", "max_drawdown",
               "win_rate", "avg_trade_return", "exposure"}
        lines = []
        for key, value in self.model_dump().items():
            if key in pct:
                text = f"{value:>12.2%}"
            elif isinstance(value, int):
                text = f"{value:>12d}"
            else:
                text = f"{value:>12,.3f}"
            lines.append(f"{key:<20}{text}")
        return "\n".join(lines)


# --------------------------------------------------------------------------- #
# 設定（pydantic で検証される要件定義）
# --------------------------------------------------------------------------- #


class CostConfig(BaseModel):
    fee_rate: float = Field(0.001, ge=0, lt=0.1, description="約定代金に対する手数料率")
    slippage_bps: float = Field(5.0, ge=0, le=1000, description="不利方向への滑り（bps）")


class RiskConfig(BaseModel):
    sizing: str = Field("fixed_fractional", pattern="^(fixed_fractional|kelly|all_in)$")
    risk_per_trade: float = Field(0.01, gt=0, le=1, description="1 トレードで許容する資産比の損失")
    stop_loss_pct: float | None = Field(0.05, gt=0, lt=1)
    take_profit_pct: float | None = Field(0.10, gt=0)
    max_leverage: float = Field(1.0, gt=0, le=10)
    kelly_fraction: float = Field(0.5, gt=0, le=1, description="ハーフケリー等の縮小係数")
    max_drawdown_halt: float | None = Field(
        None, gt=0, lt=1, description="この DD を超えたら新規エントリーを停止"
    )


class BacktestConfig(BaseModel):
    symbol: str = "SYNTH"
    initial_capital: PositiveFloat = 100_000.0
    allow_short: bool = False
    risk_free_rate: float = 0.0
    periods_per_year: float | None = Field(None, gt=0, description="None なら index から推定")
    cost: CostConfig = CostConfig()
    risk: RiskConfig = RiskConfig()

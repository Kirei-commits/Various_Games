"""Backtesting Layer: イベント駆動（バー逐次）型のバックテストエンジン。

1 バーの処理順序（先読みバイアスを排除するための約束事）:
  1. 始値: 前バー終値で確定したシグナルに従い、ドテン/決済/新規を成行約定
  2. 足中: 高値・安値で損切り/利確の到達を判定し、到達水準（窓開けなら始値）で約定
  3. 終値: 時価評価して資産曲線に記録、このバーのシグナルを次バー用に確定
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from quant.backtest.metrics import compute_report
from quant.data.base import infer_periods_per_year
from quant.domain.models import (
    BacktestConfig, Direction, ExitReason, Order, PerformanceReport, Side, Trade,
)
from quant.execution.base import Broker, CostModel
from quant.execution.brokers import PaperBroker
from quant.risk.manager import RiskManager
from quant.strategy.base import Strategy


@dataclass
class _OpenTrade:
    direction: Direction
    entry_time: pd.Timestamp
    entry_bar: int
    entry_price: float
    quantity: float
    entry_fee: float
    stop: float | None
    take: float | None


@dataclass
class BacktestResult:
    strategy: str
    report: PerformanceReport
    equity_curve: pd.DataFrame
    trades: list[Trade]

    def trades_frame(self) -> pd.DataFrame:
        return pd.DataFrame([t.model_dump() for t in self.trades])


class BacktestEngine:
    def __init__(self, strategy: Strategy, config: BacktestConfig | None = None,
                 risk: RiskManager | None = None, broker: Broker | None = None) -> None:
        self.strategy = strategy
        self.config = config or BacktestConfig()
        self._risk = risk
        self._broker = broker

    def run(self, data: pd.DataFrame) -> BacktestResult:
        cfg = self.config
        symbol = cfg.symbol
        cost_model = CostModel.from_config(cfg.cost)
        broker = self._broker or PaperBroker(cfg.initial_capital, cost_model)
        risk = self._risk or RiskManager.from_config(cfg.risk)

        signals = self.strategy(data)
        if not cfg.allow_short:
            signals = signals.clip(lower=0)

        opens, highs = data["open"].to_numpy(), data["high"].to_numpy()
        lows, closes = data["low"].to_numpy(), data["close"].to_numpy()
        sig = signals.to_numpy()
        index = data.index

        trades: list[Trade] = []
        open_trade: _OpenTrade | None = None
        blocked: int | None = None  # SL/TP 後、シグナルが変わるまで同方向の再エントリーを禁止
        rows = []

        def close_trade(i: int, price: float, reason: ExitReason) -> None:
            nonlocal open_trade
            t = open_trade
            assert t is not None
            side = Side.SELL if t.direction is Direction.LONG else Side.BUY
            fill = broker.submit_order(
                Order(symbol=symbol, side=side, quantity=t.quantity, timestamp=index[i]), price)
            pnl = int(t.direction) * (fill.price - t.entry_price) * t.quantity \
                - t.entry_fee - fill.fee
            trades.append(Trade(
                symbol=symbol, direction=t.direction, entry_time=t.entry_time,
                exit_time=index[i], entry_price=t.entry_price, exit_price=fill.price,
                quantity=t.quantity, fees=t.entry_fee + fill.fee, pnl=pnl,
                return_pct=pnl / (t.entry_price * t.quantity), exit_reason=reason,
                bars_held=i - t.entry_bar,
            ))
            open_trade = None

        def open_new(i: int, direction: Direction) -> None:
            nonlocal open_trade
            equity = broker.equity({symbol: opens[i]})
            if not risk.can_open(equity):
                return
            side = Side.BUY if direction is Direction.LONG else Side.SELL
            est_price = cost_model.execution_price(side, opens[i])
            qty, _, _ = risk.entry_quantity(equity, est_price, direction, trades)
            if qty <= 0:
                return
            fill = broker.submit_order(
                Order(symbol=symbol, side=side, quantity=qty, timestamp=index[i]), opens[i])
            stop, take = risk.exits.levels(fill.price, direction)  # 実約定価格基準で再計算
            open_trade = _OpenTrade(direction, index[i], i, fill.price, qty, fill.fee, stop, take)

        for i in range(len(data)):
            # 1. 始値で前バーのシグナルを執行
            if i > 0:
                target = int(sig[i - 1])
                if blocked is not None and target != blocked:
                    blocked = None
                desired = 0 if (blocked is not None or risk.halted) else target
                current = int(open_trade.direction) if open_trade else 0
                if current != desired:
                    if open_trade:
                        reason = ExitReason.RISK_HALT if risk.halted else ExitReason.SIGNAL
                        close_trade(i, opens[i], reason)
                    if desired != 0:
                        open_new(i, Direction(desired))

            # 2. 足中の損切り/利確
            if open_trade is not None:
                hit = risk.exits.check(open_trade.direction, open_trade.stop, open_trade.take,
                                       opens[i], highs[i], lows[i])
                if hit is not None:
                    blocked = int(open_trade.direction)
                    close_trade(i, *hit)

            # 3. 終値で時価評価
            equity = broker.equity({symbol: closes[i]})
            risk.update_equity(equity)
            risk.can_open(equity)  # DD 停止条件の判定（ラッチ）
            rows.append((equity, broker.cash, broker.get_position(symbol).quantity))

        # データ終端で建玉を清算（評価を確定させるため）
        if open_trade is not None:
            close_trade(len(data) - 1, closes[-1], ExitReason.END_OF_DATA)
            rows[-1] = (broker.equity({symbol: closes[-1]}), broker.cash, 0.0)

        curve = pd.DataFrame(rows, index=index, columns=["equity", "cash", "position"])
        curve["close"] = data["close"]
        curve["signal"] = signals
        curve["drawdown"] = curve["equity"] / curve["equity"].cummax().clip(
            lower=cfg.initial_capital) - 1

        ppy = cfg.periods_per_year or infer_periods_per_year(index)
        report = compute_report(curve["equity"], trades, curve["position"],
                                cfg.initial_capital, ppy, cfg.risk_free_rate)
        return BacktestResult(self.strategy.name, report, curve, trades)

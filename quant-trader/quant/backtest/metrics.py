"""Performance Layer: 資産曲線とトレード履歴から評価指標を算出する。"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
import pandas as pd

from quant.domain.models import PerformanceReport, Trade


def equity_returns(equity: pd.Series, initial_capital: float) -> pd.Series:
    returns = equity.pct_change()
    returns.iloc[0] = equity.iloc[0] / initial_capital - 1
    return returns


def max_drawdown(equity: pd.Series) -> float:
    """最大ドローダウン（負の値。例: -0.25 = 25% 下落）。"""
    return float((equity / equity.cummax() - 1).min())


def sharpe_ratio(returns: pd.Series, periods_per_year: float, risk_free_rate: float = 0.0) -> float:
    std = returns.std(ddof=1)
    if not np.isfinite(std) or std == 0:
        return 0.0
    excess = returns - risk_free_rate / periods_per_year
    return float(excess.mean() / std * np.sqrt(periods_per_year))


def sortino_ratio(returns: pd.Series, periods_per_year: float, risk_free_rate: float = 0.0) -> float:
    excess = returns - risk_free_rate / periods_per_year
    downside = np.sqrt((np.minimum(excess, 0) ** 2).mean())
    if downside == 0:
        return 0.0
    return float(excess.mean() / downside * np.sqrt(periods_per_year))


def profit_factor(trades: Sequence[Trade]) -> float:
    gross_profit = sum(t.pnl for t in trades if t.pnl > 0)
    gross_loss = -sum(t.pnl for t in trades if t.pnl < 0)
    if gross_loss == 0:
        return float("inf") if gross_profit > 0 else 0.0
    return gross_profit / gross_loss


def compute_report(equity: pd.Series, trades: Sequence[Trade], position: pd.Series,
                   initial_capital: float, periods_per_year: float,
                   risk_free_rate: float = 0.0) -> PerformanceReport:
    returns = equity_returns(equity, initial_capital)
    final = float(equity.iloc[-1])
    total_return = final / initial_capital - 1
    years = len(equity) / periods_per_year
    cagr = (final / initial_capital) ** (1 / years) - 1 if years > 0 and final > 0 else -1.0
    mdd = max_drawdown(pd.concat([pd.Series([initial_capital]), equity.reset_index(drop=True)]))

    return PerformanceReport(
        total_return=total_return,
        cagr=cagr,
        annual_volatility=float(returns.std(ddof=1) * np.sqrt(periods_per_year)),
        sharpe_ratio=sharpe_ratio(returns, periods_per_year, risk_free_rate),
        sortino_ratio=sortino_ratio(returns, periods_per_year, risk_free_rate),
        max_drawdown=mdd,
        calmar_ratio=cagr / abs(mdd) if mdd < 0 else 0.0,
        num_trades=len(trades),
        win_rate=float(np.mean([t.pnl > 0 for t in trades])) if trades else 0.0,
        profit_factor=profit_factor(trades),
        avg_trade_return=float(np.mean([t.return_pct for t in trades])) if trades else 0.0,
        exposure=float((position != 0).mean()),
        final_equity=final,
    )

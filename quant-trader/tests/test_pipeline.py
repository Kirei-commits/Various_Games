import numpy as np
import pandas as pd
import pytest

from quant.backtest import BacktestEngine
from quant.backtest.metrics import max_drawdown, profit_factor
from quant.data import SyntheticDataProvider, normalize_ohlcv
from quant.domain import (
    BacktestConfig, CostConfig, Direction, ExitReason, Order, RiskConfig, Side,
)
from quant.execution import CostModel, PaperBroker
from quant.risk import FixedFractionalSizer, KellySizer, StopLossTakeProfit
from quant.strategy import STRATEGY_REGISTRY, Strategy, build_strategy
from quant.strategy.indicators import rsi, sma


@pytest.fixture(scope="module")
def data() -> pd.DataFrame:
    return SyntheticDataProvider(seed=7, periods=800).fetch_ohlcv("SYNTH")


def frame(closes, opens=None) -> pd.DataFrame:
    closes = np.asarray(closes, dtype=float)
    opens = closes if opens is None else np.asarray(opens, dtype=float)
    idx = pd.date_range("2024-01-01", periods=len(closes), freq="D", tz="UTC")
    return pd.DataFrame({"open": opens, "high": np.maximum(opens, closes),
                         "low": np.minimum(opens, closes), "close": closes,
                         "volume": 1.0}, index=idx)


class FixedSignal(Strategy):
    name = "fixed"

    def __init__(self, values):
        self.values = values

    def generate_signals(self, data):
        return pd.Series(self.values, index=data.index)


# --- data ---------------------------------------------------------------- #

def test_normalize_ohlcv_fixes_columns_and_order():
    raw = pd.DataFrame({"Open": [2, 1], "High": [2, 1], "Low": [2, 1], "Close": [2, 1]},
                       index=["2024-01-02", "2024-01-01"])
    df = normalize_ohlcv(raw)
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert df.index.is_monotonic_increasing and str(df.index.tz) == "UTC"


def test_synthetic_data_is_valid(data):
    assert (data["high"] >= data[["open", "close"]].max(axis=1)).all()
    assert (data["low"] <= data[["open", "close"]].min(axis=1)).all()


# --- indicators / strategies -------------------------------------------- #

def test_indicators():
    s = pd.Series(np.arange(1, 21, dtype=float))
    assert sma(s, 5).iloc[-1] == pytest.approx(18.0)
    assert rsi(s, 14).iloc[-1] == pytest.approx(100.0)
    r = rsi(pd.Series(np.random.default_rng(0).normal(size=300).cumsum() + 100))
    assert r.dropna().between(0, 100).all()


@pytest.mark.parametrize("name", list(STRATEGY_REGISTRY))
def test_strategies_have_no_lookahead(name, data):
    """未来のバーを削っても、過去のシグナルが変わらないこと。"""
    strat = build_strategy(name, allow_short=True)
    full = strat(data)
    partial = strat(data.iloc[:500])
    pd.testing.assert_series_equal(full.iloc[:500], partial)
    assert set(full.unique()) <= {-1, 0, 1}


# --- execution / risk ---------------------------------------------------- #

def test_cost_model_is_always_adverse():
    cm = CostModel(fee_rate=0.001, slippage_bps=10)
    assert cm.execution_price(Side.BUY, 100) == pytest.approx(100.1)
    assert cm.execution_price(Side.SELL, 100) == pytest.approx(99.9)
    assert cm.fee(10_000) == pytest.approx(10)


def test_paper_broker_round_trip_cash():
    broker = PaperBroker(1000, CostModel(0, 0))
    ts = pd.Timestamp("2024-01-01", tz="UTC")
    broker.submit_order(Order(symbol="X", side=Side.BUY, quantity=2, timestamp=ts), 100)
    assert broker.equity({"X": 110}) == pytest.approx(1020)
    broker.submit_order(Order(symbol="X", side=Side.SELL, quantity=2, timestamp=ts), 110)
    assert broker.cash == pytest.approx(1020) and broker.get_position("X").quantity == 0


def test_fixed_fractional_sizing():
    sizer = FixedFractionalSizer(risk_per_trade=0.01, max_leverage=1.0)
    assert sizer.size(100_000, 100, 95, []) == pytest.approx(200)  # 1000 / 5
    assert sizer.size(100_000, 100, 99.9, []) == pytest.approx(1000)  # レバレッジ上限


def test_kelly_uses_default_until_enough_history():
    assert KellySizer(default_fraction=0.1).kelly([]) == 0.1


def test_stop_loss_priority_and_gap():
    rule = StopLossTakeProfit(0.05, 0.10)
    sl, tp = rule.levels(100, Direction.LONG)
    assert (sl, tp) == pytest.approx((95, 110))
    assert rule.check(Direction.LONG, sl, tp, 100, 111, 94) == (95, ExitReason.STOP_LOSS)
    assert rule.check(Direction.LONG, sl, tp, 90, 92, 88) == (90, ExitReason.STOP_LOSS)
    sl_s, tp_s = rule.levels(100, Direction.SHORT)
    assert rule.check(Direction.SHORT, sl_s, tp_s, 100, 101, 89) == (90, ExitReason.TAKE_PROFIT)


# --- backtest ------------------------------------------------------------ #

def no_cost_config(**risk) -> BacktestConfig:
    risk = {"sizing": "all_in", "stop_loss_pct": None, "take_profit_pct": None, **risk}
    return BacktestConfig(initial_capital=1000, cost=CostConfig(fee_rate=0, slippage_bps=0),
                          risk=RiskConfig(**risk), periods_per_year=252)


def test_signal_executes_on_next_open():
    df = frame(closes=[10, 10, 20, 20], opens=[10, 10, 15, 20])
    result = BacktestEngine(FixedSignal([1, 1, 1, 1]), no_cost_config()).run(df)
    trade = result.trades[0]
    assert trade.entry_price == 10 and trade.entry_time == df.index[1]
    assert result.report.final_equity == pytest.approx(2000)


def test_stop_loss_blocks_reentry_until_signal_changes():
    df = frame(closes=[100, 100, 90, 90, 90, 90], opens=[100, 100, 100, 90, 90, 90])
    df.loc[df.index[2], "low"] = 85
    cfg = no_cost_config(stop_loss_pct=0.05)
    result = BacktestEngine(FixedSignal([1] * 6), cfg).run(df)
    assert len(result.trades) == 1
    assert result.trades[0].exit_reason is ExitReason.STOP_LOSS
    assert result.trades[0].exit_price == pytest.approx(95)


@pytest.mark.parametrize("name", list(STRATEGY_REGISTRY))
def test_pnl_reconciles_with_equity(name, data):
    cfg = BacktestConfig(allow_short=True, risk=RiskConfig(stop_loss_pct=0.03,
                                                           take_profit_pct=0.06))
    result = BacktestEngine(build_strategy(name, allow_short=True), cfg).run(data)
    total_pnl = sum(t.pnl for t in result.trades)
    assert total_pnl == pytest.approx(result.report.final_equity - cfg.initial_capital)
    assert result.equity_curve["position"].iloc[-1] == 0
    assert -1 <= result.report.max_drawdown <= 0


def test_metrics():
    eq = pd.Series([100, 120, 90, 130.0])
    assert max_drawdown(eq) == pytest.approx(-0.25)
    assert profit_factor([]) == 0.0

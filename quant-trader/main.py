"""データ取得 → バックテスト → 指標出力 の最小パイプライン。

例:
    python main.py                                   # 合成データ・全戦略を比較
    python main.py --strategy sma_cross --sl 0.03 --tp 0.08
    python main.py --source yfinance --symbol SPY --start 2015-01-01
    python main.py --source ccxt --symbol BTC/USDT --interval 4h --allow-short
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from quant.backtest import BacktestEngine, BacktestResult
from quant.data import build_provider
from quant.domain import BacktestConfig, CostConfig, RiskConfig
from quant.strategy import STRATEGY_REGISTRY, build_strategy

logger = logging.getLogger("quant")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Quant backtest pipeline")
    p.add_argument("--source", default="synthetic",
                   choices=["synthetic", "csv", "yfinance", "ccxt"])
    p.add_argument("--symbol", default="SYNTH")
    p.add_argument("--start", default=None)
    p.add_argument("--end", default=None)
    p.add_argument("--interval", default="1d")
    p.add_argument("--csv-dir", default="data")
    p.add_argument("--exchange", default="binance")
    p.add_argument("--seed", type=int, default=42, help="合成データの乱数シード")
    p.add_argument("--strategy", default="all", choices=["all", *STRATEGY_REGISTRY])
    p.add_argument("--capital", type=float, default=100_000)
    p.add_argument("--fee", type=float, default=0.001)
    p.add_argument("--slippage-bps", type=float, default=5.0)
    p.add_argument("--sizing", default="fixed_fractional",
                   choices=["fixed_fractional", "kelly", "all_in"])
    p.add_argument("--risk-per-trade", type=float, default=0.02)
    p.add_argument("--sl", type=float, default=0.05, help="損切り幅（0 で無効）")
    p.add_argument("--tp", type=float, default=0.15, help="利確幅（0 で無効）")
    p.add_argument("--max-leverage", type=float, default=1.0)
    p.add_argument("--dd-halt", type=float, default=None, help="この DD で新規停止（例 0.3）")
    p.add_argument("--allow-short", action="store_true")
    p.add_argument("--output", default=None, help="資産曲線・トレード CSV の出力先")
    return p.parse_args()


def build_config(args: argparse.Namespace) -> BacktestConfig:
    return BacktestConfig(
        symbol=args.symbol,
        initial_capital=args.capital,
        allow_short=args.allow_short,
        cost=CostConfig(fee_rate=args.fee, slippage_bps=args.slippage_bps),
        risk=RiskConfig(
            sizing=args.sizing,
            risk_per_trade=args.risk_per_trade,
            stop_loss_pct=args.sl or None,
            take_profit_pct=args.tp or None,
            max_leverage=args.max_leverage,
            max_drawdown_halt=args.dd_halt,
        ),
    )


def load_data(args: argparse.Namespace) -> pd.DataFrame:
    kwargs = {"synthetic": {"seed": args.seed}, "csv": {"directory": args.csv_dir},
              "ccxt": {"exchange_id": args.exchange}}.get(args.source, {})
    provider = build_provider(args.source, **kwargs)
    data = provider.fetch_ohlcv(args.symbol, args.start, args.end, args.interval)
    logger.info("loaded %d bars of %s (%s → %s)", len(data), args.symbol,
                data.index[0].date(), data.index[-1].date())
    return data


def buy_and_hold(data: pd.DataFrame) -> dict[str, float]:
    close = data["close"]
    return {"total_return": close.iloc[-1] / close.iloc[0] - 1,
            "max_drawdown": float((close / close.cummax() - 1).min())}


def save(result: BacktestResult, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    result.equity_curve.to_csv(out_dir / f"{result.strategy}_equity.csv")
    result.trades_frame().to_csv(out_dir / f"{result.strategy}_trades.csv", index=False)
    (out_dir / f"{result.strategy}_report.json").write_text(
        result.report.model_dump_json(indent=2))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    config = build_config(args)
    data = load_data(args)

    names = list(STRATEGY_REGISTRY) if args.strategy == "all" else [args.strategy]
    results = []
    for name in names:
        strategy = build_strategy(name, allow_short=args.allow_short)
        result = BacktestEngine(strategy, config).run(data)
        results.append(result)
        print(f"\n=== {strategy!r} ===")
        print(result.report.to_table())
        if args.output:
            save(result, Path(args.output))

    bh = buy_and_hold(data)
    print(f"\n=== Buy & Hold (benchmark) ===\n"
          f"{'total_return':<20}{bh['total_return']:>12.2%}\n"
          f"{'max_drawdown':<20}{bh['max_drawdown']:>12.2%}")

    if len(results) > 1:
        summary = pd.DataFrame({r.strategy: r.report.model_dump() for r in results}).T
        cols = ["total_return", "cagr", "sharpe_ratio", "max_drawdown",
                "win_rate", "profit_factor", "num_trades"]
        print("\n=== Summary ===")
        print(summary[cols].to_string(float_format=lambda v: f"{v:,.3f}"))


if __name__ == "__main__":
    main()

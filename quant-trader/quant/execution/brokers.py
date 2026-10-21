"""Broker の具体実装（ペーパー / 本番）。"""

from __future__ import annotations

import logging
import os

from quant.domain.models import Fill, Order, Position, Side
from quant.execution.base import Broker, CostModel

logger = logging.getLogger(__name__)


class PaperBroker(Broker):
    """インメモリの約定シミュレーター。バックテストとペーパートレードの両方で使う。

    数量は符号付きで管理し、ショートは「現金受け取り＋負の保有」として扱う
    （証拠金金利・借株料は未考慮）。
    """

    def __init__(self, initial_cash: float, cost_model: CostModel | None = None) -> None:
        self._cash = float(initial_cash)
        self.cost_model = cost_model or CostModel()
        self._positions: dict[str, Position] = {}
        self.fills: list[Fill] = []

    @property
    def cash(self) -> float:
        return self._cash

    def get_position(self, symbol: str) -> Position:
        return self._positions.setdefault(symbol, Position(symbol))

    def submit_order(self, order: Order, reference_price: float) -> Fill:
        price = self.cost_model.execution_price(order.side, reference_price)
        notional = price * order.quantity
        fee = self.cost_model.fee(notional)
        fill = Fill(order=order, price=price, quantity=order.quantity, fee=fee,
                    slippage_cost=abs(price - reference_price) * order.quantity,
                    timestamp=order.timestamp)

        signed = fill.signed_quantity
        self._cash -= signed * price + fee
        pos = self.get_position(order.symbol)
        new_qty = pos.quantity + signed
        if abs(new_qty) < 1e-12:
            pos.quantity, pos.avg_price = 0.0, 0.0
        elif pos.quantity == 0 or (pos.quantity > 0) != (new_qty > 0):
            pos.quantity, pos.avg_price = new_qty, price  # 新規 or ドテン
        elif abs(new_qty) > abs(pos.quantity):  # 買い増し / 売り増し
            pos.avg_price = (pos.avg_price * pos.quantity + price * signed) / new_qty
            pos.quantity = new_qty
        else:  # 部分決済
            pos.quantity = new_qty
        self.fills.append(fill)
        return fill


class CCXTLiveBroker(Broker):
    """CCXT 経由の本番発注アダプタ（雛形）。

    安全のため既定は dry_run=True（発注せずログのみ）。API キーは環境変数
    （AWS では Secrets Manager → ECS タスクの環境変数）から読み込み、コードに書かない。
    """

    def __init__(self, exchange_id: str = "binance", dry_run: bool = True,
                 quote_currency: str = "USDT") -> None:
        import ccxt  # 遅延 import

        self.dry_run = dry_run
        self.quote_currency = quote_currency
        self.exchange = getattr(ccxt, exchange_id)({
            "apiKey": os.environ.get("EXCHANGE_API_KEY"),
            "secret": os.environ.get("EXCHANGE_API_SECRET"),
            "enableRateLimit": True,
        })
        self._paper = PaperBroker(initial_cash=0.0)  # dry_run 時の記録用

    @property
    def cash(self) -> float:
        if self.dry_run:
            return self._paper.cash
        return float(self.exchange.fetch_balance()["free"].get(self.quote_currency, 0.0))

    def get_position(self, symbol: str) -> Position:
        if self.dry_run:
            return self._paper.get_position(symbol)
        base = symbol.split("/")[0]
        qty = float(self.exchange.fetch_balance()["total"].get(base, 0.0))
        return Position(symbol, quantity=qty)

    def submit_order(self, order: Order, reference_price: float) -> Fill:
        if self.dry_run:
            logger.info("[DRY-RUN] %s %s %.8f @~%.4f", order.side.value, order.symbol,
                        order.quantity, reference_price)
            return self._paper.submit_order(order, reference_price)
        res = self.exchange.create_order(order.symbol, "market", order.side.value,
                                         order.quantity)
        price = float(res.get("average") or res.get("price") or reference_price)
        fee = float((res.get("fee") or {}).get("cost") or 0.0)
        slip = (price - reference_price) * (1 if order.side is Side.BUY else -1)
        return Fill(order=order, price=price, quantity=float(res.get("filled") or order.quantity),
                    fee=fee, slippage_cost=slip * order.quantity, timestamp=order.timestamp)

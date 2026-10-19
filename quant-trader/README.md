# quant-trader — 自動トレード・定量分析パイプライン（プロトタイプ）

データ取得 → シグナル生成 → リスク管理 → 約定シミュレーション → 評価指標 を疎結合なレイヤーで構成した Python パイプラインです。
バックテスト・ペーパートレード・本番発注は同じ `Broker` インターフェースを通るため、戦略コードを変えずに実行先だけを差し替えられます。

## クイックスタート

```bash
cd quant-trader
pip install -r requirements.txt
python main.py                       # 合成データで 3 戦略 + Buy&Hold を比較（オフラインで動作）
python -m pytest -q                  # 単体テスト
```

```bash
# 主なオプション
python main.py --strategy sma_cross --sl 0.03 --tp 0.08 --sizing kelly --dd-halt 0.3
python main.py --source yfinance --symbol SPY --start 2015-01-01        # pip install yfinance
python main.py --source ccxt --symbol BTC/USDT --interval 4h --allow-short   # pip install ccxt
python main.py --output output/      # 資産曲線・トレード一覧・レポート JSON を保存
```

## ディレクトリ構成

```
quant-trader/
├── main.py                    # CLI: データ取得 → バックテスト → 指標出力
├── pyproject.toml / requirements.txt
├── quant/
│   ├── domain/models.py       # 共有型（Direction, Order, Fill, Trade, PerformanceReport）と pydantic 設定
│   ├── data/                  # ① Data Ingestion Layer
│   │   ├── base.py            #   DataProvider（抽象）, normalize_ohlcv, 年間バー数推定
│   │   └── providers.py       #   Synthetic / CSV / yfinance / CCXT 実装 + build_provider
│   ├── strategy/              # ② Strategy & Analysis Layer
│   │   ├── base.py            #   Strategy（抽象・先読み禁止の契約）
│   │   ├── indicators.py      #   SMA, EMA, RSI, MACD, ATR
│   │   └── technical.py       #   SmaCross / RsiMeanReversion / Macd + STRATEGY_REGISTRY
│   ├── backtest/              # ③ Backtesting & Performance Layer
│   │   ├── engine.py          #   イベント駆動バックテストエンジン
│   │   └── metrics.py         #   Sharpe, Sortino, MaxDD, Calmar, 勝率, PF ほか
│   ├── execution/             # ④ Execution Layer
│   │   ├── base.py            #   Broker（抽象）, CostModel（手数料・スリッページ）
│   │   └── brokers.py         #   PaperBroker（シミュレータ） / CCXTLiveBroker（本番, 既定 dry-run）
│   └── risk/manager.py        # ⑤ Risk Management Layer
│                              #   FixedFractional / Kelly サイザー, StopLossTakeProfit, RiskManager
└── tests/test_pipeline.py
```

依存の向きは常に `main.py → backtest → (strategy, risk, execution, data) → domain` の一方向で、`domain` は何にも依存しません。

## 主要インターフェース

| レイヤー | 抽象 | 責務 | 追加するには |
|---|---|---|---|
| Data | `DataProvider.fetch_ohlcv(symbol, start, end, interval) -> DataFrame` | 正規化済み OHLCV（UTC index）を返す | 継承して `build_provider` に登録 |
| Strategy | `Strategy.generate_signals(data) -> Series[-1/0/1]` | バー t の終値までの情報で目標ポジションを返す | 継承して `STRATEGY_REGISTRY` に登録 |
| Risk | `PositionSizer.size(equity, price, stop, history) -> qty` | 数量決定 | 継承して `RiskManager.from_config` に追加 |
| Execution | `Broker.submit_order(order, ref_price) -> Fill` | 約定・残高・建玉管理 | 取引所ごとにアダプタを実装 |
| Config | `BacktestConfig` / `RiskConfig` / `CostConfig`（pydantic） | パラメータの型・範囲を検証 | フィールドを追加 |

## バックテストの約束事（バイアス対策）

- **先読み防止**: バー t の終値で確定したシグナルは、バー t+1 の**始値**で約定します。テストで「未来のデータを削っても過去のシグナルが変わらない」ことを検証しています。
- **損切り/利確**: 足中の高値・安値で判定し、窓開けで水準を越えていたら始値で約定。同じバーで SL と TP の両方に触れたら**保守的に SL を優先**。
- **再エントリー制御**: SL/TP で手仕舞った後は、シグナルが一度変わるまで同方向に入り直しません。
- **コスト**: 手数料は約定代金比、スリッページは常に不利方向（bps）。
- **会計の整合性**: 全トレード損益の合計 = 最終資産 − 初期資産 をテストで確認しています。
- **未対応**: 部分約定、板の厚み、ショートの借株料/資金調達率、複数銘柄ポートフォリオ。

## AWS での本番運用（想定構成）

```
EventBridge Scheduler (バー確定ごと)
   └─▶ ECS Fargate タスク (このパッケージのコンテナ)
         ├─ DataProvider ─ 取引所 API / S3（ヒストリカル Parquet）
         ├─ Strategy → RiskManager → CCXTLiveBroker
         ├─ Secrets Manager: EXCHANGE_API_KEY / SECRET
         ├─ DynamoDB: 建玉・注文状態（冪等性キー）
         └─ CloudWatch Logs / Metrics → SNS アラート（DD 超過・発注失敗）
```

本番化の前に必要なもの: 発注の冪等性とリトライ、取引所側の建玉との突合、キルスイッチ、ペーパートレードでの一定期間の検証。

> ⚠️ このコードは研究・学習用のプロトタイプです。合成データの結果は実際の市場での成績を示しません。実資金で使う場合は自己責任で十分に検証してください。

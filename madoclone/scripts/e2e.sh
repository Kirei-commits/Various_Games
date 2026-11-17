#!/usr/bin/env bash
# 長期の通し検証（e2e）：本物の育成だけで、遊び手が何日で最終ボス（ランク50）を倒すか。
# 使い方：scripts/e2e.sh [1日の時間×10（既定10＝1時間）] [日数（既定365）]
# 途中で止まっても、同じコマンドをもう一度流せば、チェックポイント（out/e2e_<時間>.json）から続きを遊ぶ。
set -euo pipefail
cd "$(dirname "$0")/.."
H="${1:-10}"
DAYS="${2:-365}"
mkdir -p out
dotnet build tools/Mado.Sim -c Release -o out/simbuild -nologo -v quiet
dotnet out/simbuild/Mado.Sim.dll economy --real --days "$DAYS" --hours-x10 "$H" --every 10 --checkpoint "out/e2e_${H}.json"

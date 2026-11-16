#!/usr/bin/env bash
# テストのカバレッジを測る（Core と Data）。合計が下限を下回ったら失敗。
#   scripts/coverage.sh                 … ファイルごとの割合と合計
#   scripts/coverage.sh --lines Wallet  … 名前に Wallet を含むファイルの、通っていない行も出す
# 下限は「いまの値より少し下」。テストを足して上がったら、下限も上げる。
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf out/cov
dotnet test tests/Mado.Core.Tests --collect:"XPlat Code Coverage" --results-directory out/cov -v q -nologo | tail -1
python3 tools/bootstrap/coverage_report.py out/cov --min-line 96 --min-branch 91 "$@"

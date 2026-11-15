#!/usr/bin/env bash
# コミット前の関門（docs/02 6.10節）。一つでも失敗したら止まる。
set -euo pipefail
cd "$(dirname "$0")/.."

# データの検証。Mado.Sim（C#）ができたら dotnet の行に置き換える。
python3 tools/bootstrap/validate.py "$@"

# 乱数の期待値（C# のテストが使う）が、Python の参照実装と食い違っていないか。
python3 tools/bootstrap/rng_reference.py --check

# Core・Data のソースが、Unity への依存・System.Random・DateTime.Now・向きの違う参照を含んでいないか。
python3 tools/bootstrap/check_sources.py

# C# をコンパイルできない環境のための静的検査：括弧の釣り合い、C# の型と実データ（JSON）の突き合わせ。
python3 tools/bootstrap/check_csharp.py

if command -v dotnet >/dev/null 2>&1 && [ -d tests/Mado.Core.Tests ]; then
  dotnet test tests/Mado.Core.Tests
  if [ -d tools/Mado.Sim ]; then
    # C# 版の validate。Python 版と合否が食い違わないことも毎回確かめる（Python 版にしか無い検査が残っているので、Python 版も捨てない）。
    dotnet run --project tools/Mado.Sim -- validate "$@"
    python3 tools/bootstrap/compare_validate.py
    dotnet run --project tools/Mado.Sim -- golden
  fi
else
  echo "check: dotnet が無いので C# のテストは走らせていない（PC で dotnet を入れて、もう一度 check.sh を流す）"
fi

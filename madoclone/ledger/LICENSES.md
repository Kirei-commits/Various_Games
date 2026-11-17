# 素材のライセンス

このリポジトリの絵と音は、すべて自作（プログラムで生成）で、外部の素材は使っていない。クレジット表示が必要なものは無い。

- 絵：`tools/art/gen_art.py` が `Assets/Game/View/Resources/MadoArt/` に出力する（キャラのアイコン・立ち絵・戦闘用、通貨・属性のアイコン、背景）。
- 音：`tools/audio/gen_audio.py` が `Assets/Game/View/Resources/MadoAudio/` に出力する（効果音・BGM）。
- 台帳は `ledger/assets.json`（`python3 tools/bootstrap/check_assets.py` で検査。`scripts/check.sh` に入っている）。
- どちらも出力は決定的（同じコードから同じファイルができる）。ライセンスは CC0 として扱う。
- 差し替えるときは、同じ ID・同じパスにファイルを置き換えるだけでよい（コードとデータは変えない）。フリー素材に替えたら、台帳の origin を free にして source と author を書く。

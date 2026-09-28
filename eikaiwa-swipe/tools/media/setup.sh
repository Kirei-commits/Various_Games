#!/usr/bin/env bash
# 音声・画像の変換ツール（ffmpeg と Pillow）を入れる。入っていれば何もしない。
# クラウド環境ではコンテナが作り直されると消えるので、media.py を使う前に毎回実行する。
set -euo pipefail
cd "$(dirname "$0")"
if python3 -c "import imageio_ffmpeg, PIL" 2>/dev/null; then
  exit 0
fi
python3 -m pip install -q --disable-pip-version-check -r requirements.txt
python3 -c "import imageio_ffmpeg, PIL; print('media tools ready:', imageio_ffmpeg.get_ffmpeg_exe())"

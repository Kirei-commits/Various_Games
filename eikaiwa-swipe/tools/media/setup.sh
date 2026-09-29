#!/usr/bin/env bash
# 音声・画像の変換ツール（ffmpeg と Pillow）を入れる。入っていれば何もしない。
# クラウド環境ではコンテナが作り直されると消えるので、media.py を使う前に毎回実行する。
# --whisper を付けると、録音の確認に使う faster-whisper も入れる（tts.py の collect / verify で使う）。
set -euo pipefail
cd "$(dirname "$0")"
PIP="python3 -m pip install -q --disable-pip-version-check --root-user-action=ignore"
if ! python3 -c "import imageio_ffmpeg, PIL" 2>/dev/null; then
  $PIP -r requirements.txt
  python3 -c "import imageio_ffmpeg, PIL; print('media tools ready:', imageio_ffmpeg.get_ffmpeg_exe())"
fi
if [ "${1:-}" = "--whisper" ] && ! python3 -c "import faster_whisper" 2>/dev/null; then
  $PIP -r requirements-whisper.txt
  python3 -c "import faster_whisper; print('faster-whisper ready:', faster_whisper.__version__)"
fi

#!/usr/bin/env python3
"""Gemini で作った音声・画像を、アプリで使える小さいファイルに変換する。

API は呼ばない。保存済みのレスポンスやファイルを変換するだけ。
先に `tools/media/setup.sh` で ffmpeg（imageio-ffmpeg）と Pillow を入れておく。

  python3 tools/media/media.py extract res.json out/name     # レスポンス JSON から中身を取り出す
  python3 tools/media/media.py audio in.wav out.opus         # 音声を opus / mp3 に変換
  python3 tools/media/media.py image in.jpg out.webp         # 白背景を透明にして WebP に変換
"""
import argparse
import base64
import io
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

EXT_BY_MIME = {"audio/wav": ".wav", "audio/x-wav": ".wav", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


def pcm_to_wav(pcm, rate=24000):
    """ヘッダーなしの 16bit モノラル PCM を WAV にする。"""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def inline_parts(response):
    for cand in response.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            if "inlineData" in part:
                yield part["inlineData"]


def cmd_extract(args):
    response = json.loads(Path(args.response).read_text())
    if "error" in response:
        sys.exit(f"API エラーのレスポンスです: {response['error']}")
    parts = list(inline_parts(response))
    if not parts:
        sys.exit("inlineData がありません")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    for i, data in enumerate(parts):
        mime = data["mimeType"]
        body = base64.b64decode(data["data"])
        ext = EXT_BY_MIME.get(mime.split(";")[0])
        if mime.startswith("audio/") and not body.startswith(b"RIFF"):
            # 生の PCM（例: audio/L16;rate=24000）で返ってきたときは WAV に包む。
            # 今の gemini-3.8-flash-tts はヘッダー付きの WAV（audio/wav）を返すのでここは通らない
            rate = re.search(r"rate=(\d+)", mime)
            body, ext = pcm_to_wav(body, int(rate.group(1)) if rate else 24000), ".wav"
        if ext is None:
            sys.exit(f"知らない形式です: {mime}")
        path = out.with_name(out.name + (f"-{i}" if len(parts) > 1 else "") + ext)
        path.write_bytes(body)
        print(f"{path} ({mime}, {len(body)} bytes)")


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
    except ImportError:
        sys.exit("ffmpeg がありません。先に tools/media/setup.sh を実行してください")
    return imageio_ffmpeg.get_ffmpeg_exe()


def cmd_audio(args):
    out = Path(args.out)
    codec = {".opus": "libopus", ".ogg": "libopus", ".mp3": "libmp3lame"}.get(out.suffix)
    if codec is None:
        sys.exit("出力は .opus / .ogg / .mp3 のどれかにしてください")
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", args.input, "-ac", "1", "-c:a", codec, "-b:a", args.bitrate]
    if codec == "libopus":
        cmd += ["-application", "voip"]  # 声向けの設定（低ビットレートでも聞き取りやすい）
    subprocess.run(cmd + [str(out)], check=True)
    print(f"{out} ({out.stat().st_size} bytes)")


def remove_background(img, tolerance):
    """画像のふちとつながった白っぽい部分だけを透明にする。

    ふちから塗りつぶすので、キャラクターの中の白（目のハイライトなど）は残る。
    境目は白さに応じて半透明にして、白いふちどりが残らないようにする。
    """
    from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)  # 各ピクセルで一番暗いチャンネル
    limit = 255 - tolerance
    white = darkest.point(lambda v: 255 if v >= limit else 0)
    # まわりに 1px の白を足してから (0,0) を塗れば、ふちのどこから始まる白もひとつながりになる
    padded = ImageOps.expand(white, border=1, fill=255)
    ImageDraw.floodfill(padded, (0, 0), 128)
    background = padded.crop((1, 1, padded.width - 1, padded.height - 1)).point(lambda v: 255 if v == 128 else 0)

    # 背景に接するピクセルは、白に近いほど透明にする（JPEG のにじみ・アンチエイリアス対策）
    edge = ImageChops.subtract(background.filter(ImageFilter.MaxFilter(3)), background)
    soft = darkest.point(lambda v: 255 if v < limit - 64 else max(0, min(255, (limit - v) * 4)))
    alpha = ImageChops.invert(background)
    alpha.paste(soft, mask=edge)
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def cmd_image(args):
    from PIL import Image

    img = Image.open(args.input)
    img = img.convert("RGBA") if args.keep_background else remove_background(img, args.tolerance)
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        sys.exit("全部透明になりました。--tolerance を小さくしてください")
    img = img.crop(bbox)
    if args.size:
        # 縦横比を保って size×size の正方形に収め、まんなかに置く
        scale = args.size / max(img.size)
        resized = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))),
                             Image.NEAREST if args.pixel else Image.LANCZOS)
        img = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
        img.paste(resized, ((args.size - resized.width) // 2, (args.size - resized.height) // 2))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "WEBP", quality=args.quality, method=6)
    print(f"{out} ({img.width}x{img.height}, {out.stat().st_size} bytes)")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    e = sub.add_parser("extract", help="保存したレスポンス JSON から音声・画像を取り出す")
    e.add_argument("response")
    e.add_argument("out", help="拡張子なしの出力パス（拡張子は形式から決める）")
    e.set_defaults(func=cmd_extract)

    a = sub.add_parser("audio", help="WAV などを opus / mp3 に変換する")
    a.add_argument("input")
    a.add_argument("out")
    a.add_argument("--bitrate", default="24k", help="既定 24k（mp3 なら 48k くらいが目安）")
    a.set_defaults(func=cmd_audio)

    i = sub.add_parser("image", help="白背景を透明にして WebP にする")
    i.add_argument("input")
    i.add_argument("out")
    i.add_argument("--size", type=int, default=512, help="正方形の一辺（0 なら切り抜いたままの大きさ）")
    i.add_argument("--tolerance", type=int, default=24, help="白とみなす幅（0〜255）")
    i.add_argument("--quality", type=int, default=85)
    i.add_argument("--pixel", action="store_true", help="ドット絵用に最近傍で縮小する")
    i.add_argument("--keep-background", action="store_true", help="背景を抜かない（背景画像用）")
    i.set_defaults(func=cmd_image)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

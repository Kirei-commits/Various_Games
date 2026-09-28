#!/usr/bin/env python3
"""バトルの絵（敵10種・ボス・主人公・背景）を Gemini の画像モデルで作り、src/assets/battle/ に置く。

**Gemini API を呼んで料金がかかる。ユーザーに頼まれたときだけ実行する。**
環境変数 GEMINI_API_KEY が要る。先に tools/media/setup.sh を実行しておく。

  python3 tools/media/battle_art.py                  # 全部作る（src/assets/battle/*.webp を上書き）
  python3 tools/media/battle_art.py slime ghost      # 名前を指定したものだけ作り直す
  python3 tools/media/battle_art.py --convert-only   # API は呼ばず、保存済みの原画から変換だけやり直す

原画（API のレスポンスから取り出した画像）は tools/media/raw/battle/ に保存する（コミットしない）。
絵柄をそろえるため、最初の1枚（STYLE_REF）を作ってから、それを見本として残りを描かせる。
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
RAW = HERE / "raw" / "battle"
OUT = ROOT / "src" / "assets" / "battle"
MODEL = "gemini-3.1-flash-image"
API = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

STYLE = (
    "High quality 2D fantasy mobile RPG game sprite. Cute chibi proportions but a little mischievous, "
    "cel-shaded with soft highlights, clean bold dark outline, vivid saturated colors, "
    "full body, centered, facing the viewer, the whole character fits inside the frame with margin. "
    "No text, no shadow on the ground, no scenery. "
)
WHITE = "Plain flat pure white background (#FFFFFF), nothing else in the background."
GREEN = "Plain flat solid bright green background (#00FF00), nothing else in the background."

# 名前: (説明, 背景, 出力の一辺px, ドット絵か)
SPRITES = {
    "slime": ("a round green slime monster with big shiny eyes and a small smile, glossy jelly body", WHITE, 256),
    "bat": ("a purple bat monster with wide spread wings, yellow eyes and tiny fangs", WHITE, 256),
    "ghost": ("a white floating ghost with a wavy tail, small arms, dark eyes and pink cheeks", GREEN, 256),
    "mushroom": ("a walking mushroom monster with a red cap with white spots and an angry little face", WHITE, 256),
    "goblin": ("a small green goblin with pointy ears, yellow eyes and a wooden club, wearing a brown tunic", WHITE, 256),
    "skull": ("a floating white skull with glowing cyan eyes and a cracked forehead, no aura, no halo, no circle behind it", GREEN, 256),
    "eye": ("a floating purple eyeball monster with a green iris, small bat wings and three tentacles below", WHITE, 256),
    "fire": ("a living flame spirit, orange and yellow fire with a cute face", WHITE, 256),
    "golem": ("a stone golem with moss, glowing cyan eyes and a simple glowing cyan diamond-shaped crystal embedded in its chest", GREEN, 256),
    "imp": ("a small red imp demon with curved horns, bat wings and a pointed tail, grinning", WHITE, 256),
    "dragon": ("a big red boss dragon with spread wings, horns, golden belly and glowing yellow eyes, powerful and menacing", WHITE, 384),
    "hero": ("a young wizard hero seen from behind at a slight angle, blue robe with gold trim, pointed blue hat with stars, holding a wooden staff with a glowing blue orb at the top", WHITE, 256),
}
STYLE_REF = "slime"
BACKDROP = (
    "Background art for a vertical mobile RPG battle screen, no characters. "
    "Night fantasy battlefield: starry purple sky fading to an orange-pink horizon, a big pale moon at the upper right, "
    "distant mountains with a small castle silhouette with one lit window, a dark ground with a road leading into the distance from the bottom center. "
    "The lower half is darker and simple so characters and text stay readable. Painterly, same art style as the reference sprite. No text."
)


def call(parts, aspect):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY がありません")
    body = {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}}}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(2 ** (attempt + 2))
                continue
            sys.exit(f"API エラー {e.code}: {e.read().decode()[:500]}")


def image_part(path):
    mime = "image/png" if path.suffix == ".png" else "image/jpeg"
    return {"inlineData": {"mimeType": mime, "data": base64.b64encode(path.read_bytes()).decode()}}


def raw_path(name):
    found = sorted(RAW.glob(f"{name}.*"))
    found = [p for p in found if p.suffix != ".json"]
    return found[0] if found else None


def generate(name, prompt, aspect, ref=None):
    RAW.mkdir(parents=True, exist_ok=True)
    parts = ([image_part(ref), {"text": "Match the art style of this reference image exactly (line weight, shading, colors). "}] if ref else [])
    parts.append({"text": prompt})
    res = call(parts, aspect)
    (RAW / f"{name}.json").write_text(json.dumps(res))
    for old in RAW.glob(f"{name}.*"):
        if old.suffix != ".json":
            old.unlink()
    subprocess.run([sys.executable, HERE / "media.py", "extract", RAW / f"{name}.json", RAW / name], check=True)
    usage = res.get("usageMetadata", {})
    print(f"  {name}: 出力トークン {usage.get('candidatesTokenCount')}")


def convert(name):
    src = raw_path(name)
    if src is None:
        sys.exit(f"{name} の原画がありません（先に生成する）")
    OUT.mkdir(parents=True, exist_ok=True)
    if name == "backdrop":
        cmd = ["image", src, OUT / "backdrop.webp", "--keep-background", "--size", "0", "--quality", "78"]
    else:
        cmd = ["image", src, OUT / f"{name}.webp", "--size", str(SPRITES[name][2]), "--tolerance", "40"]
    subprocess.run([sys.executable, HERE / "media.py", *map(str, cmd)], check=True)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("names", nargs="*", help=f"作るもの（{', '.join([*SPRITES, 'backdrop'])}）。省略すると全部")
    p.add_argument("--convert-only", action="store_true", help="API を呼ばずに原画から変換だけする")
    args = p.parse_args()
    names = args.names or [*SPRITES, "backdrop"]
    for n in names:
        if n not in SPRITES and n != "backdrop":
            sys.exit(f"知らない名前です: {n}")

    if not args.convert_only:
        if STYLE_REF in names:
            desc, bg, _ = SPRITES[STYLE_REF]
            generate(STYLE_REF, STYLE + desc + ". " + bg, "1:1")
        ref = raw_path(STYLE_REF)
        for n in names:
            if n == STYLE_REF:
                continue
            if n == "backdrop":
                generate(n, BACKDROP, "2:3", ref)
            else:
                desc, bg, _ = SPRITES[n]
                generate(n, STYLE + desc + ". " + bg, "1:1", ref)
    for n in names:
        convert(n)


if __name__ == "__main__":
    main()

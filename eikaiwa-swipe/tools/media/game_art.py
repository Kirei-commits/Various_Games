#!/usr/bin/env python3
"""ゲームの絵（バトル・ガチャ）を Gemini の画像モデルで作り、src/assets/<組>/ に置く。

**Gemini API を呼んで料金がかかる。ユーザーに頼まれたときだけ実行する。**
環境変数 GEMINI_API_KEY が要る。先に tools/media/setup.sh を実行しておく。

  python3 tools/media/game_art.py battle                 # バトルの絵を全部作る（src/assets/battle/*.webp を上書き）
  python3 tools/media/game_art.py battle slime ghost     # 名前を指定したものだけ作り直す
  python3 tools/media/game_art.py gacha --convert-only   # API は呼ばず、保存済みの原画から変換だけやり直す

原画（API のレスポンスから取り出した画像）は tools/media/raw/<組>/ に保存する（コミットしない）。
絵柄をそろえるため、バトルのスライム（STYLE_REF）を最初に作り、それを見本として残りを描かせる。
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
MODEL = "gemini-3.1-flash-image"
API = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

STYLE = (
    "High quality 2D fantasy mobile RPG game sprite. Cute chibi proportions but a little mischievous, "
    "cel-shaded with soft highlights, clean bold dark outline, vivid saturated colors, "
    "full body, centered, facing the viewer, the whole character fits inside the frame with margin. "
    "No text, no shadow on the ground, no scenery. "
)
ITEM = (
    "High quality 2D fantasy mobile game item illustration. Cel-shaded with soft highlights, clean bold dark outline, "
    "vivid saturated colors, a single object, centered, slightly angled three-quarter view, the whole object fits inside the frame with margin. "
    "No text, no letters, no numbers, no shadow on the ground, no scenery. "
)
ICON = (
    "A single game UI icon, cel-shaded, clean bold dark outline, vivid saturated colors, simple readable silhouette that works at 24 pixels, "
    "centered, fills most of the frame. No text, no letters, no numbers. "
)
WHITE = "Plain flat pure white background (#FFFFFF), nothing else in the background."
GREEN = "Plain flat solid bright green background (#00FF00), nothing else in the background."

# 組 → 名前: (プロンプト, 出力の一辺px)。"backdrop" は背景画像として扱う（透明にしない）
SETS = {
    "battle": {
        "slime": (STYLE + "a round green slime monster with big shiny eyes and a small smile, glossy jelly body. " + WHITE, 256),
        "bat": (STYLE + "a purple bat monster with wide spread wings, yellow eyes and tiny fangs. " + WHITE, 256),
        "ghost": (STYLE + "a white floating ghost with a wavy tail, small arms, dark eyes and pink cheeks. " + GREEN, 256),
        "mushroom": (STYLE + "a walking mushroom monster with a red cap with white spots and an angry little face. " + WHITE, 256),
        "goblin": (STYLE + "a small green goblin with pointy ears, yellow eyes and a wooden club, wearing a brown tunic. " + WHITE, 256),
        "skull": (STYLE + "a floating white skull with glowing cyan eyes and a cracked forehead, no aura, no halo, no circle behind it. " + GREEN, 256),
        "eye": (STYLE + "a floating purple eyeball monster with a green iris, small bat wings and three tentacles below. " + WHITE, 256),
        "fire": (STYLE + "a living flame spirit, orange and yellow fire with a cute face. " + WHITE, 256),
        "golem": (STYLE + "a stone golem with moss, glowing cyan eyes and a simple glowing cyan diamond-shaped crystal embedded in its chest. " + GREEN, 256),
        "imp": (STYLE + "a small red imp demon with curved horns, bat wings and a pointed tail, grinning. " + WHITE, 256),
        "dragon": (STYLE + "a big red boss dragon with spread wings, horns, golden belly and glowing yellow eyes, powerful and menacing. " + WHITE, 384),
        "hero": (STYLE + "a young wizard hero seen from behind at a slight angle, blue robe with gold trim, pointed blue hat with stars, "
                 "holding a wooden staff with a glowing blue orb at the top. " + WHITE, 256),
        "backdrop": (
            "Background art for a vertical mobile RPG battle screen, no characters. "
            "Night fantasy battlefield: starry purple sky fading to an orange-pink horizon, a big pale moon at the upper right, "
            "distant mountains with a small castle silhouette with one lit window, a dark ground with a road leading into the distance from the bottom center. "
            "The lower half is darker and simple so characters and text stay readable. Painterly, same art style as the reference sprite. No text.",
            0,
        ),
    },
    "gacha": {
        # ガチャの種類ごとの台（GachaPanel の右上）
        "machine-points": (ITEM + "a magical capsule toy vending machine with a glass dome full of colorful glowing capsules, indigo and violet body with gold trim, a big crank handle. " + WHITE, 256),
        "machine-ticket": (ITEM + "a sturdy red and orange treasure chest with iron bands, slightly open with warm light and sparkles coming out. " + WHITE, 256),
        "machine-sr": (ITEM + "an ornate purple and magenta treasure chest with silver filigree and a glowing violet gem lock, slightly open with purple magical light. " + WHITE, 256),
        "machine-ssr": (ITEM + "a legendary golden treasure chest with rainbow gems, radiant golden light and sparkles bursting from the slightly open lid. " + WHITE, 256),
        # 引いたときの演出（光がたまる間に揺れる宝箱）
        "chest": (ITEM + "a closed magical treasure chest made of dark blue wood with gold corners and a glowing keyhole, faint magical sparkles around it. " + WHITE, 384),
        # カードの裏（色つきの背景の上に置く紋章）
        "card-back": (ICON + "an ornate golden magic emblem: a circular crest with a four-pointed star in the middle and small wings on both sides. " + GREEN, 160),
        # 財布のアイコン
        "icon-points": (ICON + "a shiny gold coin with a star engraved on it. " + WHITE, 96),
        "icon-ticket": (ICON + "a red and orange admission ticket with a star, slightly tilted. " + WHITE, 96),
        "icon-sr": (ICON + "a purple and silver admission ticket with a gem, slightly tilted. " + WHITE, 96),
        "icon-ssr": (ICON + "a golden admission ticket with rainbow gems and sparkles, slightly tilted. " + WHITE, 96),
        "icon-ex": (ICON + "a green emerald crystal token with two curved arrows around it meaning exchange. " + WHITE, 96),
        "icon-medal": (ICON + "a bronze and orange medal with a red ribbon. " + WHITE, 96),
        # ショップの道具
        "item-boost": (ICON + "a glowing yellow lightning bolt potion bottle. " + WHITE, 128),
        "item-freeze": (ICON + "a magical hourglass made of ice crystals with blue sand. " + WHITE, 128),
        "item-special": (ICON + "a flaming magic scroll with orange fire. " + WHITE, 128),
    },
}
STYLE_REF = ("battle", "slime")


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


def raw_dir(group):
    return HERE / "raw" / group


def raw_path(group, name):
    found = [p for p in sorted(raw_dir(group).glob(f"{name}.*")) if p.suffix != ".json"]
    return found[0] if found else None


def generate(group, name, ref=None):
    prompt, size = SETS[group][name]
    raw = raw_dir(group)
    raw.mkdir(parents=True, exist_ok=True)
    parts = [image_part(ref), {"text": "Match the art style of this reference image exactly (line weight, shading, colors). "}] if ref else []
    parts.append({"text": prompt})
    res = call(parts, "2:3" if size == 0 else "1:1")
    (raw / f"{name}.json").write_text(json.dumps(res))
    for old in raw.glob(f"{name}.*"):
        if old.suffix != ".json":
            old.unlink()
    subprocess.run([sys.executable, HERE / "media.py", "extract", raw / f"{name}.json", raw / name], check=True)
    print(f"  {group}/{name}: 出力トークン {res.get('usageMetadata', {}).get('candidatesTokenCount')}")


def convert(group, name):
    src = raw_path(group, name)
    if src is None:
        sys.exit(f"{group}/{name} の原画がありません（先に生成する）")
    out = ROOT / "src" / "assets" / group / f"{name}.webp"
    size = SETS[group][name][1]
    if size == 0:
        cmd = ["image", src, out, "--keep-background", "--size", "0", "--quality", "78"]
    else:
        cmd = ["image", src, out, "--size", str(size), "--tolerance", "40"]
    subprocess.run([sys.executable, HERE / "media.py", *map(str, cmd)], check=True)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("group", choices=list(SETS))
    p.add_argument("names", nargs="*", help="作るもの。省略するとその組を全部")
    p.add_argument("--convert-only", action="store_true", help="API を呼ばずに原画から変換だけする")
    args = p.parse_args()
    names = args.names or list(SETS[args.group])
    for n in names:
        if n not in SETS[args.group]:
            sys.exit(f"{args.group} に {n} はありません（{', '.join(SETS[args.group])}）")

    if not args.convert_only:
        if (args.group, STYLE_REF[1]) == STYLE_REF and STYLE_REF[1] in names:
            generate(*STYLE_REF)
        ref = raw_path(*STYLE_REF)
        if ref is None:
            sys.exit("見本の絵（battle/slime）がありません。先に `game_art.py battle slime` を実行する")
        for n in names:
            if (args.group, n) != STYLE_REF:
                generate(args.group, n, ref)
    for n in names:
        convert(args.group, n)


if __name__ == "__main__":
    main()

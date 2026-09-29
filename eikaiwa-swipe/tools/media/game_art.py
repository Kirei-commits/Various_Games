#!/usr/bin/env python3
"""ゲームの絵（バトル・ガチャ・冒険）を Gemini の画像モデルで作り、src/assets/<組>/ に置く。

**Gemini API を呼んで料金がかかる。ユーザーに頼まれたときだけ実行する。**
環境変数 GEMINI_API_KEY が要る。先に tools/media/setup.sh を実行しておく。

  python3 tools/media/game_art.py battle                 # バトルの絵を全部作る（src/assets/battle/*.webp を上書き）
  python3 tools/media/game_art.py battle slime ghost     # 名前を指定したものだけ作り直す
  python3 tools/media/game_art.py gacha --convert-only   # API は呼ばず、保存済みの原画から変換だけやり直す
  python3 tools/media/game_art.py quest sheet-gear       # 3×3 のまとめ絵を1枚だけ作り、9個に切り分ける

安く済ませるため、小さいアイコンやエフェクトは「3×3 のまとめ絵（SHEETS）」を1回で描かせて切り分ける（1回で9個）。
エフェクトは黒い背景で描かせ、明るさを透明度にして切り抜く（どんな背景の上でも光って見える）。

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
    "quest": {
        "backdrop": (
            "Background art for a vertical mobile RPG dungeon battle screen, no characters. "
            "Inside an ancient magical stone tower: tall stone pillars on both sides, glowing blue magic crystals and torches with warm light, "
            "a big arched window at the top showing a starry night sky, a stone floor with a faint glowing magic circle in the lower middle. "
            "The lower half is darker and simple so characters and text stay readable. Painterly, same art style as the reference sprite. No text.",
            0,
        ),
        "hero": (STYLE + "a young brave swordsman hero seen from behind at a slight angle, spiky brown hair, blue tunic, silver shoulder armor, red cape, "
                 "holding a sword up in the right hand and a round shield in the left hand, ready to fight. " + WHITE, 256),
    },
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
        # ガチャの台の後ろの飾り（背景画像）
        "panel": (
            "Wide decorative background for a mobile game gacha (lottery) panel, no characters, no machines, no text. "
            "A magical treasure vault: deep indigo and violet, soft golden light rays from the center, floating sparkles and small stars, "
            "a few glowing capsules and gold coins scattered softly at the bottom edges. The center is calm and a bit darker so UI stays readable. "
            "Painterly, same art style as the reference sprite.",
            -1,
        ),
    },
}

SHEET = (
    "A game asset sheet: exactly 9 separate items arranged in a strict 3 by 3 grid of equal square cells. "
    "Each item is centered in its own cell with a wide empty margin, no item touches or crosses a cell edge, no grid lines, no borders, no frames, no labels. "
    "All items share one consistent art style. No text, no letters, no numbers. "
)
GEAR = "Cel-shaded 2D fantasy mobile RPG item icons, clean bold dark outline, vivid saturated colors, soft highlights, simple readable silhouettes. "
FX = (
    "Glowing 2D anime game attack effects, bright luminous colors with white-hot cores, soft glow, dynamic shapes, each effect fills most of its cell. "
    "Plain flat pure black background (#000000) everywhere, nothing else. "
)

# まとめ絵: 名前 → (プロンプト, [左上から右へ9個の名前], 出力の一辺px, "white" か "black")
SHEETS = {
    "quest": {
        "sheet-gear": (
            SHEET + GEAR + "Row 1: a steel sword with a gold hilt; a round blue and gold shield; a knight helmet. "
            "Row 2: a blue and silver chest armor; a steel gauntlet; a pair of brown leather boots. "
            "Row 3: a gold ring with a red gem; a red fire flame emblem; a light blue ice crystal snowflake emblem. " + WHITE,
            ["weapon", "shield", "head", "body", "arms", "feet", "accessory", "elem-fire", "elem-ice"],
            128,
            "white",
        ),
        "sheet-magic": (
            SHEET + GEAR + "Row 1: a yellow lightning bolt emblem; a white and gold radiant holy star emblem; a purple dark crescent moon emblem with a dark aura. "
            "Row 2: a magic spell rune circle with a big orange fire explosion; a magic spell rune circle with a blue blizzard of ice shards; a magic spell rune circle with a yellow thunder strike. "
            "Row 3: a magic spell rune circle with golden holy light and a small green heart; a magic spell rune circle with a purple dark vortex; a magic spell rune circle with a flaming meteor. " + GREEN,
            ["elem-thunder", "elem-light", "elem-dark", "skill-fire", "skill-ice", "skill-thunder", "skill-light", "skill-dark", "skill-none"],
            128,
            "white",
        ),
        "sheet-fx": (
            SHEET + FX + "Row 1: a white sword slash arc; a round orange impact explosion burst with sparks; a big swirling fire blast. "
            "Row 2: a burst of sharp blue ice crystal shards; a jagged yellow lightning strike with sparks; a golden holy light pillar with sparkles. "
            "Row 3: a swirling purple dark vortex; a flaming meteor falling diagonally with a fire trail; a round translucent blue magic shield barrier bubble. ",
            ["fx-slash", "fx-burst", "fx-fire", "fx-ice", "fx-thunder", "fx-light", "fx-dark", "fx-meteor", "fx-shield"],
            256,
            "black",
        ),
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
    found = [p for p in sorted(raw_dir(group).glob(f"{name}.*")) if p.suffix != ".json" and not p.stem.endswith("-trimmed")]
    return found[0] if found else None


def generate(group, name, ref=None):
    prompt, size = SETS[group][name]
    raw = raw_dir(group)
    raw.mkdir(parents=True, exist_ok=True)
    parts = [image_part(ref), {"text": "Match the art style of this reference image exactly (line weight, shading, colors). "}] if ref else []
    parts.append({"text": prompt})
    res = call(parts, {0: "2:3", -1: "3:2"}.get(size, "1:1"))
    (raw / f"{name}.json").write_text(json.dumps(res))
    for old in raw.glob(f"{name}.*"):
        if old.suffix != ".json":
            old.unlink()
    subprocess.run([sys.executable, HERE / "media.py", "extract", raw / f"{name}.json", raw / name], check=True)
    print(f"  {group}/{name}: 出力トークン {res.get('usageMetadata', {}).get('candidatesTokenCount')}")


# 描かれた枠（角の丸いふち）を切り落とす背景画像: 名前 → 四辺から削る割合
TRIM = {("quest", "backdrop"): 0.035}


def convert(group, name):
    src = raw_path(group, name)
    if src is None:
        sys.exit(f"{group}/{name} の原画がありません（先に生成する）")
    if (group, name) in TRIM:
        from PIL import Image

        img = Image.open(src)
        t = TRIM[(group, name)]
        img = img.crop((round(img.width * t), round(img.height * t), round(img.width * (1 - t)), round(img.height * (1 - t))))
        src = raw_dir(group) / f"{name}-trimmed.png"
        img.save(src)
    out = ROOT / "src" / "assets" / group / f"{name}.webp"
    size = SETS[group][name][1]
    if size <= 0:
        cmd = ["image", src, out, "--keep-background", "--size", "0", "--quality", "78"]
    else:
        cmd = ["image", src, out, "--size", str(size), "--tolerance", "40"]
    subprocess.run([sys.executable, HERE / "media.py", *map(str, cmd)], check=True)


def generate_sheet(group, sheet, ref):
    prompt = SHEETS[group][sheet][0]
    raw = raw_dir(group)
    raw.mkdir(parents=True, exist_ok=True)
    parts = [image_part(ref), {"text": "Match the art style of this reference image (line weight, shading, colors), but draw the items described below. "}, {"text": prompt}]
    res = call(parts, "1:1")
    (raw / f"{sheet}.json").write_text(json.dumps(res))
    for old in raw.glob(f"{sheet}.*"):
        if old.suffix != ".json":
            old.unlink()
    subprocess.run([sys.executable, HERE / "media.py", "extract", raw / f"{sheet}.json", raw / sheet], check=True)
    print(f"  {group}/{sheet}: 出力トークン {res.get('usageMetadata', {}).get('candidatesTokenCount')}")


def glow_to_alpha(img):
    """黒い背景の光の絵を、明るさ＝透明度の画像にする（黒は透明、白い芯は不透明）。"""
    from PIL import Image, ImageChops

    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    alpha = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 0 if v < 14 else min(255, int((v - 14) * 1.12)))
    # 色は明るさで割り戻す（透明にした分だけ暗くならないように）
    out = Image.new("RGBA", rgb.size)
    px, ap, op = rgb.load(), alpha.load(), out.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            a = ap[x, y]
            if a:
                c = px[x, y]
                m = max(c) or 1
                op[x, y] = tuple(min(255, v * 255 // m) for v in c) + (a,)
    return out


# 輪の中など、ふちとつながっていない背景も抜く絵
HOLES = {"accessory"}


def touch_up(path, green, holes):
    """切り抜いたあとの仕上げ。緑の背景のにじみ（緑のふち）を消し、輪の中の白い背景も抜く。"""
    from PIL import Image, ImageFilter

    img = Image.open(path).convert("RGBA")
    px = img.load()
    # 緑を消すのは外側のふち（透明な所から 8px 以内）だけ。絵の中の緑（ハートなど）は残す
    rim = img.getchannel("A").point(lambda v: 255 if v < 250 else 0).filter(ImageFilter.MaxFilter(17)).load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if green and rim[x, y] and g > max(r, b) + 8:
                spill = g - max(r, b)
                a = max(0, a - spill * 2)  # 緑っぽいほど透明に
                g = max(r, b)
            if holes and min(r, g, b) >= 236:
                a = 0
            px[x, y] = (r, g, b, a)
    img.save(path, "WEBP", quality=85, method=6)


def split_sheet(group, sheet):
    """まとめ絵を 3×3 に切り分けて raw/<組>/<名前>.png にし、src/assets/<組>/ に変換する。"""
    from PIL import Image

    _, names, size, bg = SHEETS[group][sheet]
    src = raw_path(group, sheet)
    if src is None:
        sys.exit(f"{group}/{sheet} の原画がありません（先に生成する）")
    img = Image.open(src).convert("RGB")
    corner = img.getpixel((4, 4))
    green = corner[1] > 180 and corner[0] < 120 and corner[2] < 120
    cw, ch = img.width / 3, img.height / 3
    pad = 0.03  # 隣のマスのはみ出しを拾わないよう、ふちを少し削る
    for i, name in enumerate(names):
        x, y = i % 3, i // 3
        box = (round((x + pad) * cw), round((y + pad) * ch), round((x + 1 - pad) * cw), round((y + 1 - pad) * ch))
        cell = img.crop(box)
        out = ROOT / "src" / "assets" / group / f"{name}.webp"
        if bg == "black":
            glow = glow_to_alpha(cell)
            bbox = glow.getchannel("A").getbbox()
            glow = glow.crop(bbox) if bbox else glow
            scale = size / max(glow.size)
            glow = glow.resize((max(1, round(glow.width * scale)), max(1, round(glow.height * scale))), Image.LANCZOS)
            square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            square.paste(glow, ((size - glow.width) // 2, (size - glow.height) // 2))
            out.parent.mkdir(parents=True, exist_ok=True)
            square.save(out, "WEBP", quality=80, method=6)
            print(f"{out} ({size}x{size}, {out.stat().st_size} bytes)")
        else:
            cell_path = raw_dir(group) / f"{name}.png"
            cell.save(cell_path)
            subprocess.run([sys.executable, HERE / "media.py", "image", str(cell_path), str(out), "--size", str(size), "--tolerance", "40"], check=True)
            if green or name in HOLES:
                touch_up(out, green, name in HOLES)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("group", choices=sorted(set(SETS) | set(SHEETS)))
    p.add_argument("names", nargs="*", help="作るもの。省略するとその組を全部")
    p.add_argument("--convert-only", action="store_true", help="API を呼ばずに原画から変換だけする")
    args = p.parse_args()
    singles, sheets = SETS.get(args.group, {}), SHEETS.get(args.group, {})
    names = args.names or [*singles, *sheets]
    for n in names:
        if n not in singles and n not in sheets:
            sys.exit(f"{args.group} に {n} はありません（{', '.join([*singles, *sheets])}）")

    if not args.convert_only:
        if (args.group, STYLE_REF[1]) == STYLE_REF and STYLE_REF[1] in names:
            generate(*STYLE_REF)
        ref = raw_path(*STYLE_REF)
        if ref is None:
            sys.exit("見本の絵（battle/slime）がありません。先に `game_art.py battle slime` を実行する")
        for n in names:
            if n in sheets:
                generate_sheet(args.group, n, ref)
            elif (args.group, n) != STYLE_REF:
                generate(args.group, n, ref)
    for n in names:
        if n in sheets:
            split_sheet(args.group, n)
        else:
            convert(args.group, n)


if __name__ == "__main__":
    main()

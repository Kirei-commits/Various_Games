#!/usr/bin/env python3
"""
自作の絵（プログラム生成）を Assets/Game/View/Resources/MadoArt に出力する。外部素材・元作品の画像は使わない。
キャラ（characters.json の ID）ごとに、属性の色・格の枠・役割の模様・ID から決まる乱数で、アイコン・立ち絵・戦闘用の3点を作る。
通貨アイコン・属性アイコン・背景も作る。同じ入力から同じ画像ができる（決定的）。
使い方：python3 tools/art/gen_art.py
"""
import colorsys
import hashlib
import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "Assets", "Game", "Data", "Json")
OUT = os.path.join(ROOT, "Assets", "Game", "View", "Resources", "MadoArt")

ELEMENT = {"valor": (229, 84, 60), "skill": (60, 141, 229), "heart": (229, 107, 176), "wisdom": (79, 199, 122)}
TIER = {  # 枠の色（外側, 内側）
    "ten": ((140, 100, 60), (190, 150, 100)), "kou": ((150, 155, 165), (210, 215, 225)),
    "kyoku": ((40, 150, 150), (110, 220, 210)), "sai": ((200, 160, 30), (255, 225, 110)),
    "tou": ((110, 60, 170), (190, 140, 240)), "so": ((200, 60, 90), (255, 170, 120)), "lr": ((230, 230, 245), (255, 245, 190)),
}


def rng_for(key):
    return random.Random(int(hashlib.sha256(key.encode()).hexdigest()[:12], 16))


def lighten(c, k):
    return tuple(min(255, int(v + (255 - v) * k)) for v in c)


def darken(c, k):
    return tuple(int(v * (1 - k)) for v in c)


def gradient(w, h, top, bottom):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        col = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = col
    return img


def polygon(cx, cy, r, n, rot=0.0):
    return [(cx + r * math.cos(rot + 2 * math.pi * i / n), cy + r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]


def motif(d, role, cx, cy, r, col, rnd):
    """役割ごとの模様。"""
    if role == "melee":           # 剣：縦長のひし形を交差
        d.polygon([(cx, cy - r), (cx + r * 0.22, cy), (cx, cy + r), (cx - r * 0.22, cy)], fill=col)
        d.polygon([(cx - r * 0.7, cy - r * 0.1), (cx + r * 0.7, cy - r * 0.1), (cx + r * 0.7, cy + r * 0.05), (cx - r * 0.7, cy + r * 0.05)], fill=col)
    elif role == "ranged":        # 弓・星：多角の星
        pts = []
        for i in range(10):
            rr = r if i % 2 == 0 else r * 0.45
            a = -math.pi / 2 + i * math.pi / 5
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        d.polygon(pts, fill=col)
    elif role == "defense":       # 盾：六角形
        d.polygon(polygon(cx, cy, r, 6, math.pi / 6), fill=col)
        d.polygon(polygon(cx, cy, r * 0.55, 6, math.pi / 6), fill=darken(col, 0.35))
    elif role == "heal":          # 癒し：十字と円
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=max(2, int(r * 0.12)))
        w = r * 0.28
        d.rectangle([cx - w, cy - r * 0.65, cx + w, cy + r * 0.65], fill=col)
        d.rectangle([cx - r * 0.65, cy - w, cx + r * 0.65, cy + w], fill=col)
    else:                          # 妨害：渦（同心の弧）
        for k in range(4):
            rr = r * (1 - k * 0.22)
            a0 = rnd.randint(0, 90) + k * 40
            d.arc([cx - rr, cy - rr, cx + rr, cy + rr], a0, a0 + 250, fill=col, width=max(2, int(r * 0.13)))


def character(c, kind, size):
    w, h = size
    S = 2
    W, H = w * S, h * S
    rnd = rng_for(c["id"] + kind)
    base = ELEMENT[c["element"]]
    hue_shift = rnd.uniform(-0.04, 0.04)
    hh, ss, vv = colorsys.rgb_to_hsv(*[v / 255 for v in base])
    base = tuple(int(v * 255) for v in colorsys.hsv_to_rgb((hh + hue_shift) % 1.0, ss, vv))
    img = gradient(W, H, lighten(base, 0.35), darken(base, 0.45)).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    # 背景の飾り：ID から決まる半透明の円
    for _ in range(7):
        r = rnd.uniform(0.1, 0.35) * min(W, H)
        x, y = rnd.uniform(0, W), rnd.uniform(0, H)
        d.ellipse([x - r, y - r, x + r, y + r], fill=lighten(base, rnd.uniform(0.2, 0.6)) + (46,))
    cx, cy = W / 2, H * (0.46 if kind != "icon" else 0.5)
    r = min(W, H) * (0.3 if kind != "icon" else 0.32)
    if kind != "icon":   # 立ち姿：肩と頭
        d.ellipse([cx - r * 0.55, cy - r * 1.55, cx + r * 0.55, cy - r * 0.45], fill=lighten(base, 0.7) + (235,))
        d.rounded_rectangle([cx - r * 0.95, cy - r * 0.35, cx + r * 0.95, cy + r * 1.9], radius=r * 0.35, fill=darken(base, 0.25) + (245,))
        cy += r * 0.65
        r *= 0.6
    motif(d, c["role"], cx, cy, r, (255, 255, 255, 235), rnd)
    # 格の枠
    outer, inner = TIER[c["tier"]]
    bw = max(3, int(min(W, H) * 0.045))
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=int(min(W, H) * 0.1), outline=outer + (255,), width=bw)
    d.rounded_rectangle([bw, bw, W - 1 - bw, H - 1 - bw], radius=int(min(W, H) * 0.08), outline=inner + (255,), width=max(2, bw // 2))
    # 格の点（格が高いほど多い）
    order = ["ten", "kou", "kyoku", "sai", "tou", "so", "lr"]
    n = order.index(c["tier"]) + 1
    for i in range(n):
        x = bw * 2.2 + i * bw * 2.6
        d.ellipse([x, bw * 2.2, x + bw * 1.6, bw * 3.8], fill=inner + (255,))
    img = img.resize((w, h), Image.LANCZOS)
    # 角を丸く透明に
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=int(min(w, h) * 0.1), fill=255)
    img.putalpha(mask)
    return img


def currency_icon(cid, size=96):
    S = 3
    W = size * S
    rnd = rng_for("cur." + cid)
    hue = rnd.random()
    col = tuple(int(v * 255) for v in colorsys.hsv_to_rgb(hue, 0.65, 0.95))
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    c = W / 2
    shape = int(hashlib.sha256(cid.encode()).hexdigest()[:4], 16) % 5
    if shape == 0:
        d.ellipse([W * 0.1, W * 0.1, W * 0.9, W * 0.9], fill=col, outline=darken(col, 0.4), width=W // 18)
        d.ellipse([W * 0.28, W * 0.28, W * 0.72, W * 0.72], outline=lighten(col, 0.6), width=W // 22)
    elif shape == 1:
        d.polygon([(c, W * 0.06), (W * 0.9, c), (c, W * 0.94), (W * 0.1, c)], fill=col, outline=darken(col, 0.4))
        d.polygon([(c, W * 0.2), (W * 0.2, c), (c, W * 0.5)], fill=lighten(col, 0.5) + (170,))
    elif shape == 2:
        d.polygon(polygon(c, c, W * 0.42, 6, math.pi / 6), fill=col, outline=darken(col, 0.4))
        d.polygon(polygon(c, c, W * 0.22, 6, math.pi / 6), fill=lighten(col, 0.5))
    elif shape == 3:
        pts = []
        for i in range(10):
            rr = W * 0.44 if i % 2 == 0 else W * 0.2
            a = -math.pi / 2 + i * math.pi / 5
            pts.append((c + rr * math.cos(a), c + rr * math.sin(a)))
        d.polygon(pts, fill=col, outline=darken(col, 0.4))
    else:
        d.rounded_rectangle([W * 0.14, W * 0.14, W * 0.86, W * 0.86], radius=W // 6, fill=col, outline=darken(col, 0.4), width=W // 18)
        d.ellipse([W * 0.34, W * 0.34, W * 0.66, W * 0.66], fill=lighten(col, 0.55))
    return img.resize((size, size), Image.LANCZOS)


def element_icon(el, size=96):
    S = 3
    W = size * S
    col = ELEMENT[el]
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse([W * 0.06, W * 0.06, W * 0.94, W * 0.94], fill=darken(col, 0.3), outline=lighten(col, 0.4), width=W // 20)
    c = W / 2
    if el == "valor":      # 炎：上向きの三角を重ねる
        d.polygon([(c, W * 0.15), (W * 0.75, W * 0.78), (W * 0.25, W * 0.78)], fill=lighten(col, 0.3))
        d.polygon([(c, W * 0.38), (W * 0.62, W * 0.78), (W * 0.38, W * 0.78)], fill=(255, 240, 200, 255))
    elif el == "skill":    # 刃：斜めのひし形
        d.polygon([(W * 0.2, W * 0.8), (W * 0.62, W * 0.12), (W * 0.8, W * 0.2), (W * 0.38, W * 0.88)], fill=lighten(col, 0.5))
    elif el == "heart":    # ハート
        d.ellipse([W * 0.2, W * 0.22, W * 0.52, W * 0.54], fill=lighten(col, 0.4))
        d.ellipse([W * 0.48, W * 0.22, W * 0.8, W * 0.54], fill=lighten(col, 0.4))
        d.polygon([(W * 0.22, W * 0.44), (W * 0.78, W * 0.44), (c, W * 0.8)], fill=lighten(col, 0.4))
    else:                  # 知：本を思わせる二つの四角
        d.rounded_rectangle([W * 0.2, W * 0.25, W * 0.48, W * 0.75], radius=W // 24, fill=lighten(col, 0.5))
        d.rounded_rectangle([W * 0.52, W * 0.25, W * 0.8, W * 0.75], radius=W // 24, fill=lighten(col, 0.35))
    return img.resize((size, size), Image.LANCZOS)


def background(kind, size=(540, 960)):
    w, h = size
    rnd = rng_for("bg." + kind)
    top, bottom = ((34, 40, 72), (10, 12, 24)) if kind == "home" else ((70, 38, 52), (14, 10, 18))
    img = gradient(w, h, top, bottom).convert("RGBA")
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(60):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        r = rnd.uniform(1, 4)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, rnd.randint(40, 140)))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w * 0.1, h * 0.55, w * 0.9, h * 1.1], fill=(120, 140, 255, 70) if kind == "home" else (255, 120, 90, 70))
    return Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(60)))


def save(img, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, optimize=True)
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def main():
    chars = json.load(open(os.path.join(DATA, "characters.json"), encoding="utf-8"))["items"]
    currencies = json.load(open(os.path.join(DATA, "currencies.json"), encoding="utf-8"))["items"]
    ledger = []

    def add(aid, path, note):
        ledger.append({"id": aid, "type": "sprite", "path": path, "origin": "self", "license": "CC0", "source": None, "author": "自作（tools/art/gen_art.py で生成）", "note": note})

    for c in chars:
        for kind, size in (("icon", (128, 128)), ("portrait", (384, 576)), ("battle", (160, 224))):
            add("art.%s.%s" % (c["id"], kind), save(character(c, kind, size), "%s/%s.png" % (c["id"], kind)), "キャラの%s（属性色・格の枠・役割の模様）" % kind)
    for cur in currencies:
        cid = cur["id"]
        add(cur["assetId"], save(currency_icon(cid), "cur/%s.png" % cid), "通貨アイコン")
    for el in ELEMENT:
        add("art.el.%s" % el, save(element_icon(el), "el/%s.png" % el), "属性アイコン")
    for kind in ("home", "battle"):
        add("art.bg.%s" % kind, save(background(kind), "bg/%s.png" % kind), "背景")
    return ledger


if __name__ == "__main__":
    entries = main()
    path = os.path.join(ROOT, "ledger", "assets.json")
    existing = []
    if os.path.exists(path):
        existing = [e for e in json.load(open(path, encoding="utf-8")).get("assets", []) if not e["id"].startswith("art.")]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump({"schemaVersion": 1, "assets": existing + entries}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a").write("\n")
    print("絵 %d 点を出力しました" % len(entries))

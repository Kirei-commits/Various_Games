#!/usr/bin/env python3
"""
自作の効果音・BGM（プログラム合成）を Assets/Game/View/Resources/MadoAudio に出力する。外部素材・元作品の音は使わない。
波形（サイン・矩形・三角）を足して、エンベロープをかけただけの簡素な音。BGM は和音の進行とアルペジオを30秒ほど作り、ループできるように
最後を最初につなぐ。同じ入力から同じ音ができる（決定的）。
使い方：python3 tools/audio/gen_audio.py
"""
import json
import math
import os
import wave

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Assets", "Game", "View", "Resources", "MadoAudio")
SR = 22050


def note(n):          # MIDI 番号 → 周波数
    return 440.0 * 2 ** ((n - 69) / 12.0)


def osc(kind, f, dur, vol=1.0):
    t = np.arange(int(SR * dur)) / SR
    ph = 2 * np.pi * f * t
    if kind == "sine":
        w = np.sin(ph)
    elif kind == "square":
        w = np.sign(np.sin(ph)) * 0.6
    elif kind == "tri":
        w = 2 / np.pi * np.arcsin(np.sin(ph))
    else:             # saw
        w = 2 * ((f * t) % 1.0) - 1
    return w * vol


def env(w, a=0.005, d=0.05, s=0.6, r=0.08):
    n = len(w)
    e = np.ones(n)
    na, nd, nr = int(SR * a), int(SR * d), int(SR * r)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na) if na else 1
    nd = min(nd, n - na)
    if nd > 0:
        e[na:na + nd] = np.linspace(1, s, nd)
        e[na + nd:] = s
    nr = min(nr, n)
    if nr > 0:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return w * e


def tone(kind, n, dur, vol=0.5, **kw):
    return env(osc(kind, note(n), dur, vol), **kw)


def seq(parts, gap=0.0):
    out = []
    for p in parts:
        out.append(p)
        if gap:
            out.append(np.zeros(int(SR * gap)))
    return np.concatenate(out)


def mix(*waves):
    n = max(len(w) for w in waves)
    out = np.zeros(n)
    for w in waves:
        out[:len(w)] += w
    return out


def sweep(f0, f1, dur, vol=0.5, kind="sine"):
    t = np.arange(int(SR * dur)) / SR
    f = f0 + (f1 - f0) * t / dur
    ph = 2 * np.pi * np.cumsum(f) / SR
    w = np.sin(ph) if kind == "sine" else np.sign(np.sin(ph)) * 0.6
    return env(w * vol, a=0.003, d=0.02, s=0.7, r=0.05)


def noise(dur, vol=0.3, seed=1):
    rng = np.random.default_rng(seed)
    return env(rng.uniform(-1, 1, int(SR * dur)) * vol, a=0.001, d=0.03, s=0.4, r=0.05)


SE = {
    "tap": lambda: tone("sine", 84, 0.06, 0.4, a=0.002, d=0.02, s=0.5, r=0.03),
    "ok": lambda: seq([tone("square", 72, 0.07, 0.3), tone("square", 79, 0.1, 0.3)]),
    "cancel": lambda: seq([tone("square", 76, 0.06, 0.3), tone("square", 69, 0.1, 0.3)]),
    "error": lambda: seq([tone("saw", 52, 0.12, 0.3), tone("saw", 50, 0.16, 0.3)], 0.02),
    "coin": lambda: seq([tone("square", 83, 0.05, 0.3), tone("square", 88, 0.18, 0.3, r=0.15)]),
    "levelup": lambda: seq([tone("tri", n, 0.09, 0.45) for n in (72, 76, 79, 84)] + [tone("tri", 88, 0.3, 0.45, r=0.2)]),
    "win": lambda: seq([tone("square", n, 0.12, 0.3) for n in (67, 72, 76)] + [mix(tone("square", 79, 0.5, 0.3, r=0.3), tone("square", 72, 0.5, 0.2, r=0.3))]),
    "lose": lambda: seq([tone("tri", n, 0.2, 0.4) for n in (64, 62, 59)] + [tone("tri", 55, 0.5, 0.4, r=0.3)]),
    "hit": lambda: mix(noise(0.1, 0.35), sweep(220, 70, 0.1, 0.4)),
    "gacha": lambda: seq([sweep(300 + i * 60, 600 + i * 90, 0.06, 0.3) for i in range(8)]),
    "gacha_rare": lambda: mix(seq([tone("tri", n, 0.1, 0.4) for n in (76, 79, 83, 88, 91)] + [tone("tri", 95, 0.5, 0.4, r=0.35)]),
                              seq([np.zeros(int(SR * 0.1))] + [tone("sine", n + 12, 0.1, 0.2) for n in (76, 79, 83, 88, 91)] + [tone("sine", 107, 0.5, 0.15, r=0.35)])),
    "claim": lambda: seq([tone("square", 76, 0.06, 0.3), tone("square", 81, 0.06, 0.3), tone("square", 85, 0.15, 0.3)]),
}


def bgm(name, bpm, prog, lead_pattern, bass_oct, seed):
    """4 小節 × 繰り返し。prog は各小節のコード（MIDI のルート音と長短）。"""
    beat = 60.0 / bpm
    bars = []
    for bar, (root, minor) in enumerate(prog):
        third = 3 if minor else 4
        chord = [root, root + third, root + 7]
        n = int(SR * beat * 4)
        w = np.zeros(n)
        for step in range(8):                      # 8分音符のアルペジオ
            pos = int(SR * beat * 0.5 * step)
            nn = chord[lead_pattern[step % len(lead_pattern)] % 3] + 12
            t = tone("square", nn, beat * 0.5, 0.12, a=0.003, d=0.05, s=0.4, r=0.05)
            w[pos:pos + len(t)] += t[:n - pos]
        bass = tone("tri", root - bass_oct, beat * 2, 0.3, a=0.01, d=0.1, s=0.7, r=0.1)
        for k in range(2):
            pos = int(SR * beat * 2 * k)
            w[pos:pos + len(bass)] += bass[:n - pos]
        pad = mix(*[tone("sine", c, beat * 4, 0.06, a=0.1, d=0.2, s=0.8, r=0.2) for c in chord])
        w[:len(pad)] += pad[:n]
        bars.append(w)
    loop = np.concatenate(bars * 4)               # 16 小節
    fade = int(SR * 0.05)
    loop[:fade] *= np.linspace(0, 1, fade)
    loop[-fade:] *= np.linspace(1, 0, fade)
    return loop


BGM = {
    "home": lambda: bgm("home", 92, [(57, True), (53, False), (48, False), (55, False)], [0, 1, 2, 1, 0, 2, 1, 2], 24, 1),
    "battle": lambda: bgm("battle", 132, [(52, True), (48, False), (55, True), (50, False)], [0, 2, 1, 2, 0, 1, 2, 1], 24, 2),
}


def write(w, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    peak = max(1e-9, float(np.max(np.abs(w))))
    w = w / peak * 0.8 if peak > 0.8 else w
    pcm = (np.clip(w, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(pcm.tobytes())
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def main():
    ledger = []
    for name, fn in SE.items():
        ledger.append({"id": "audio.se.%s" % name, "type": "audio", "path": write(fn(), "se/%s.wav" % name), "origin": "self", "license": "CC0", "source": None,
                       "author": "自作（tools/audio/gen_audio.py で合成）", "note": "効果音"})
    for name, fn in BGM.items():
        ledger.append({"id": "audio.bgm.%s" % name, "type": "audio", "path": write(fn(), "bgm/%s.wav" % name), "origin": "self", "license": "CC0", "source": None,
                       "author": "自作（tools/audio/gen_audio.py で合成）", "note": "BGM（ループ）"})
    return ledger


if __name__ == "__main__":
    entries = main()
    path = os.path.join(ROOT, "ledger", "assets.json")
    existing = []
    if os.path.exists(path):
        existing = [e for e in json.load(open(path, encoding="utf-8")).get("assets", []) if not e["id"].startswith("audio.")]
    json.dump({"schemaVersion": 1, "assets": existing + entries}, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    open(path, "a").write("\n")
    print("音 %d 点を出力しました" % len(entries))

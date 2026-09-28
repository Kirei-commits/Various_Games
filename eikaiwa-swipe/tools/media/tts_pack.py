"""複数の文をまとめて1回で読ませた音声を、1文ずつに切り分ける（tools/media/tts.py から使う。API は呼ばない）。

1日のリクエスト数に上限があるので、見出しは20文、会話は10会話ぶんを1回のリクエストで読ませ、
文と文のあいだの無音で切る。切る場所は長い順に n-1 個の無音（ほかの無音よりはっきり長いときだけ）。
区切りがはっきりしないとき・長さが見込みと大きく違うときは、推測で切らずに失敗を返す（呼び出し側が小さく分けて作り直す）。
"""
import array
import io
import math
import wave

FRAME_MS = 10
MIN_GAP_S = 0.18  # これより短い無音は文の区切りの候補にしない
WORD_S = 0.253  # 1語あたりの発話の秒数（既存の録音49本から測った値）


def expected_speech(text):
    """1文の発話の長さの見込み（前後の無音は含まない）"""
    return 0.25 + len(text.split()) * WORD_S


def read_wav(body):
    with wave.open(io.BytesIO(body)) as w:
        params = (w.getnchannels(), w.getsampwidth(), w.getframerate())
        pcm = array.array("h", w.readframes(w.getnframes()))
    if params[0] != 1 or params[1] != 2:
        raise ValueError(f"モノラル16bit以外の WAV です: {params}")
    return pcm, params[2]


def to_wav(pcm, rate):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return buf.getvalue()


def frame_levels(pcm, rate):
    n = rate * FRAME_MS // 1000
    levels = []
    for i in range(0, len(pcm) - n + 1, n):
        seg = pcm[i:i + n:4]
        levels.append(math.sqrt(sum(x * x for x in seg) / len(seg)))
    return levels


def speech_mask(levels):
    loud = sorted(levels)[int(len(levels) * 0.95)] if levels else 0
    thr = max(80.0, loud * 0.02)
    return [v > thr for v in levels]


def silent_runs(mask):
    """発話の最初から最後までのあいだの無音 [(始まりのフレーム, 長さ)]"""
    idx = [i for i, m in enumerate(mask) if m]
    if not idx:
        return [], None, None
    first, last = idx[0], idx[-1]
    runs, start = [], None
    for i in range(first, last + 1):
        if not mask[i] and start is None:
            start = i
        elif mask[i] and start is not None:
            runs.append((start, i - start))
            start = None
    return runs, first, last + 1


def split_pack(body, texts):
    """body（WAV）を texts の数に切る。戻り値: (WAV の配列, None) か (None, 失敗の理由)"""
    pcm, rate = read_wav(body)
    levels = frame_levels(pcm, rate)
    mask = speech_mask(levels)
    runs, first, end = silent_runs(mask)
    n = len(texts)
    if first is None:
        return None, "無音しかない"
    fps = 1000 // FRAME_MS
    cands = [(s, ln) for s, ln in runs if ln >= MIN_GAP_S * fps]
    if len(cands) < n - 1:
        return None, f"区切りの無音が足りない（{len(cands)} 個、必要 {n - 1} 個）"

    exp = [expected_speech(t) for t in texts]
    if n == 1:
        return _finish(pcm, rate, levels, [(first, end)], exp, fps, clear=True)
    # 1) 長い順に n-1 個の無音が、残りの無音よりはっきり長ければ、そこで切る（文のあいだに約1秒の間を頼んでいる）
    ranked = sorted(cands, key=lambda c: -c[1])
    chosen, rest = ranked[: n - 1], ranked[n - 1:]
    shortest = min(ln for _, ln in chosen)
    # 区切りとみなせるのは、(a) 無音がちょうど n-1 個（ほかに間が無く、迷いようがない）か、
    # (b) 選んだ n-1 個が、残りの無音（文の中の間）より 1.35 倍以上長いとき。どちらも 0.3秒以上
    if shortest >= 0.3 * fps and (not rest or shortest >= 1.35 * rest[0][1]):
        chosen.sort()
        spans, prev = [], first
        for s0, ln in chosen:
            spans.append((prev, s0))
            prev = s0 + ln
        spans.append((prev, end))
        return _finish(pcm, rate, levels, spans, exp, fps, clear=True)
    # 2) はっきりしないときは推測で切らない（間違った切り方で保存するより、小さく分けて作り直すほうがよい）
    return None, f"区切りがはっきりしない（{n - 1}番目に長い無音 {shortest / fps:.2f}秒、次に長い無音 {(rest[0][1] / fps) if rest else 0:.2f}秒）"


def _finish(pcm, rate, levels, spans, exp, fps, clear):
    """spans（フレーム単位の [始まり, 終わり)）で切り出し、長さを確かめる"""
    n_per = rate * FRAME_MS // 1000
    pad = int(0.08 * fps)
    total = sum(e - s for s, e in spans) / fps
    k = total / sum(exp)
    lo_ok, hi_ok = (0.3, 3.2) if clear else (0.45, 2.2)  # 区切りがはっきりしているときは、長さの見込みは参考程度にする
    out, problems = [], []
    for i, (s, e) in enumerate(spans):
        ratio = ((e - s) / fps) / (k * exp[i])
        if not lo_ok <= ratio <= hi_ok:
            problems.append(f"{i + 1}文目の長さが見込みの {ratio:.2f} 倍")
        if i < len(spans) - 1 and spans[i + 1][0] - e < 0.3 * fps:
            problems.append(f"{i + 1}文目のあとの無音が短い（{(spans[i + 1][0] - e) / fps:.2f}秒）")
        lo, hi = max(0, s - pad) * n_per, min(len(levels), e + pad) * n_per
        out.append(to_wav(pcm[lo:hi], rate))
    if problems:
        return None, "・".join(problems[:4])
    return out, None

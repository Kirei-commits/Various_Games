#!/usr/bin/env python3
"""アプリで流す録音を Gemini TTS で作る。設定は tools/media/tts.config.json。

**plan 以外は Gemini API を呼んで料金がかかる。ユーザーに頼まれたときだけ実行する。**
環境変数 GEMINI_API_KEY が要る。先に tools/media/setup.sh を実行しておく（ffmpeg で opus に変換するため）。

  python3 tools/media/tts.py plan ch01               # 作る文の数・費用の目安・プロンプトの例（API は呼ばない）
  python3 tools/media/tts.py sample --text "..."     # 声の候補を聞き比べる（sampleVoices を全部。結果は raw/tts/samples/）
  python3 tools/media/tts.py generate ch01           # すぐに作る（通常料金。少ないときや試しに）
  python3 tools/media/tts.py submit ch01 ch02        # Batch API に出す（半額・最大24時間）。--dry-run で送らずに中身だけ保存
  python3 tools/media/tts.py status                  # 出したバッチの状態を見る（料金はかからない）
  python3 tools/media/tts.py collect                 # 終わったバッチの結果を取り込む

できるもの（コミットする）:
  audio/clips/<hash>.opus  録音。hash は「役|英文」から決まる（src/recorded.js の clipHash）
  audio/index.json         アプリが読む一覧 { clips: { hash: 版 } }（作り直すと版が上がり、ブラウザの古いキャッシュを使わない）
  audio/manifest.json      人とツール用の記録（英文・章・モデル・声・設定の署名・長さ）
作業用（コミットしない）: tools/media/raw/tts/（WAV・バッチの記録・試聴用）
"""
import argparse
import base64
import hashlib
import io
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tts_pack  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
AUDIO = ROOT / "audio"
RAW = HERE / "raw" / "tts"
JOBS = RAW / "jobs.json"
API = "https://generativelanguage.googleapis.com"


def load_config():
    cfg = json.loads((HERE / "tts.config.json").read_text())
    cfg["model"] = cfg["models"][0]["model"]  # sample・Batch API は一番上のモデルを使う
    return cfg


def lines_for(chapters):
    out = subprocess.run(["node", str(HERE / "tts-lines.mjs"), *chapters], cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(out.stderr.strip())
    return json.loads(out.stdout)


def style_for(cfg, clip):
    """声の出し方の指示（speechMetadata.style で送る。テキストには混ぜない）"""
    parts = [cfg["style"], cfg["roles"][clip["role"]]["persona"]]
    if clip.get("context"):
        parts.append(f'Replying to: "{clip["context"]}"')
    return " ".join(parts)


def request_for(cfg, clip):
    # テキストは読む文だけにする（指示を混ぜると、指示まで読んだり文を何度も繰り返したりした）
    return {
        "contents": [{"parts": [{"text": clip["text"], "speechMetadata": {"style": style_for(cfg, clip)}}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg["roles"][clip["role"]]["voice"]}}},
        },
    }


def signature(cfg, clip):
    """この文をどの設定で作るかの署名。設定（モデル・声・プロンプト）が変わると変わる"""
    # モデルは含めない（上限に当たると次のモデルに切り替えるので。どのモデルで作ったかは manifest の model に残す）
    src = json.dumps([cfg["roles"][clip["role"]]["voice"], clip["text"], style_for(cfg, clip), cfg["output"]], ensure_ascii=False)
    return hashlib.sha1(src.encode()).hexdigest()[:12]


def load_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def load_manifest():
    return load_json(AUDIO / "manifest.json", {"version": 1, "clips": {}})


def save_manifest(man):
    AUDIO.mkdir(parents=True, exist_ok=True)
    man["clips"] = dict(sorted(man["clips"].items()))
    (AUDIO / "manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1) + "\n")
    index = {"version": 1, "clips": {h: c["rev"] for h, c in man["clips"].items()}}
    (AUDIO / "index.json").write_text(json.dumps(index, separators=(",", ":")) + "\n")


def todo(cfg, clips, man, force=False, refresh=False):
    """作る文。ふだんは録音の無い文だけ（モデルや設定を変えても、できている録音は作り直さない）。
    refresh なら設定が今と違う録音も、force なら全部"""
    if force:
        return list(clips)
    if refresh:
        return [c for c in clips if man["clips"].get(c["hash"], {}).get("sig") != signature(cfg, c)]
    return [c for c in clips if c["hash"] not in man["clips"]]


def estimate_seconds(text):
    # 自然な速さで約 2.6 語/秒 ＋ 前後の無音
    return 0.6 + len(text.split()) / 2.6


def api(method, path, body=None, base=API, pacer=None, tokens=0):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY がありません")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    for attempt in range(6):
        if method == "POST":
            (pacer or PACER).wait(tokens)
        try:
            with urllib.request.urlopen(req, timeout=300) as res:
                raw = res.read()
                return raw if base != API else json.loads(raw)
        except urllib.error.HTTPError as e:
            detail = e.read().decode()
            if e.code == 429 and "PerDay" in detail:
                hours = retry_delay(e, detail, attempt) / 3600
                raise QuotaExhausted(f"1日の上限（{quota_value(detail)} リクエスト/日）に達しました。約{hours:.0f}時間後にリセットされます") from None
            if e.code in (429, 500, 502, 503, 504) and attempt < 5:
                wait = retry_delay(e, detail, attempt)
                # 何が起きているか見えるように、待つたびに表示する（429 の中身の最初の部分も）
                reason = detail.replace("\n", " ")[:160] if e.code == 429 else ""
                print(f"    [{time.strftime('%H:%M:%S')}] {e.code} → {wait:.0f}秒待って再試行 {reason}", file=sys.stderr, flush=True)
                time.sleep(wait)
                continue
            raise ApiError(f"API エラー {e.code} ({method} {path}): {detail[:800]}") from None
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 5:
                time.sleep(2 ** (attempt + 1))
                continue
            raise ApiError(f"通信エラー ({method} {path}): {e}") from None


class ApiError(Exception):
    pass


class QuotaExhausted(ApiError):
    """1日の上限に達した（待っても今日中には戻らないので、すぐに止める）"""


class Pacer:
    """リクエストを送る間隔をそろえる（1分あたりの上限を超えないように。スレッドから同時に呼んでよい）"""

    def __init__(self, per_minute, tokens_per_minute=0):
        # 上限ちょうどだと 429 になりやすいので 9割で使う
        self.interval = 60.0 / (per_minute * 0.9) if per_minute else 0
        self.token_s = 60.0 / (tokens_per_minute * 0.9) if tokens_per_minute else 0
        self.lock = threading.Lock()
        self.next = 0.0

    def wait(self, tokens=0):
        with self.lock:
            now = time.monotonic()
            at = max(now, self.next)
            self.next = at + max(self.interval, tokens * self.token_s)
        time.sleep(max(0.0, at - now))


PACER = Pacer(0)


def quota_value(detail):
    """429 の中身から上限の値を取り出す（読めなければ ?）"""
    try:
        for d in json.loads(detail)["error"].get("details", []):
            for v in d.get("violations", []):
                if "quotaValue" in v:
                    return v["quotaValue"]
    except (ValueError, KeyError, TypeError):
        pass
    return "?"


def retry_delay(err, detail, attempt):
    """待つ秒数。429 のときは API が示す待ち時間（Retry-After か retryDelay）に従う"""
    after = err.headers.get("Retry-After") if err.headers else None
    if after and after.isdigit():
        return int(after) + 1
    if '"retryDelay"' in detail:
        try:
            return float(detail.split('"retryDelay"')[1].split('"')[1].rstrip("s")) + 1
        except (IndexError, ValueError):
            pass
    return 2 ** (attempt + 1)


# ---------------------------------------------------------------------------
# 音声の保存
# ---------------------------------------------------------------------------

def audio_bytes(response):
    for cand in response.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = part.get("inlineData") or part.get("inline_data")
            if data:
                body = base64.b64decode(data["data"])
                mime = data.get("mimeType") or data.get("mime_type") or ""
                if not body.startswith(b"RIFF"):
                    rate = int(mime.split("rate=")[1].split(";")[0]) if "rate=" in mime else 24000
                    buf = io.BytesIO()
                    with wave.open(buf, "wb") as w:
                        w.setnchannels(1)
                        w.setsampwidth(2)
                        w.setframerate(rate)
                        w.writeframes(body)
                    body = buf.getvalue()
                return body
    return None


def ffmpeg():
    try:
        import imageio_ffmpeg
    except ImportError:
        sys.exit("ffmpeg がありません。先に tools/media/setup.sh を実行してください")
    return imageio_ffmpeg.get_ffmpeg_exe()


def encode(cfg, wav_path, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path), "-ac", "1"]
    if cfg["output"]["format"] == "opus":
        cmd += ["-c:a", "libopus", "-b:a", cfg["output"]["bitrate"], "-application", "voip", "-f", "ogg"]
    else:
        sys.exit("output.format は今は opus だけに対応")
    subprocess.run(cmd + [str(out_path)], check=True)


def save_audio(cfg, clip, response):
    """1文ぶんの音声を WAV と opus に保存する（ファイルは文ごとに別なので、並列に呼んでよい）。
    戻り値: (長さの秒数, None) か、取り込めないとき (None, 警告の文字列)"""
    body = audio_bytes(response) if response else None
    if body is None:
        return None, f"{clip['key']}: 音声が返ってこなかった ({json.dumps(response)[:200]})"
    return save_wav(cfg, clip, body)


def save_wav(cfg, clip, body):
    """1文ぶんの WAV（バイト列）を保存して opus にする。戻り値は save_audio と同じ"""
    wav_path = RAW / "wav" / f"{clip['hash']}.wav"
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    wav_path.write_bytes(body)
    with wave.open(str(wav_path)) as w:
        seconds = w.getnframes() / w.getframerate()
    # 文を繰り返した・指示まで読んだなど、長さが明らかにおかしいものは取り込まない（plan で作り直しの対象に残る）
    expected = estimate_seconds(clip["text"])
    if seconds > expected * 2 + 1.5 or seconds < expected * 0.25:
        return None, f"{clip['key']}: 長さが不自然なので取り込まなかった（{seconds:.1f}秒、目安 {expected:.1f}秒）。raw/tts/wav/{clip['hash']}.wav"
    encode(cfg, wav_path, AUDIO / cfg.get("_outdir", "clips") / f"{clip['hash']}.opus")
    return seconds, None


def record(cfg, man, clip, seconds, via, model=None):
    """manifest に1文ぶんを書き込む（メインのスレッドからだけ呼ぶ）"""
    old = man["clips"].get(clip["hash"], {})
    man["clips"][clip["hash"]] = {
        "key": clip["key"],
        "text": clip["text"],
        "role": clip["role"],
        "chapter": clip["chapter"],
        "id": clip["id"],
        "model": model or cfg["model"],
        "voice": cfg["roles"][clip["role"]]["voice"],
        "sig": signature(cfg, clip),
        "rev": old.get("rev", 0) + 1,
        "seconds": round(seconds, 2),
        "via": via,
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    }


def store(cfg, man, clip, response, via):
    """保存して manifest を更新する。問題があれば警告の文字列を返す"""
    seconds, warning = save_audio(cfg, clip, response)
    if warning:
        return warning
    record(cfg, man, clip, seconds, via)
    return None


# ---------------------------------------------------------------------------
# コマンド
# ---------------------------------------------------------------------------

def cmd_plan(args, cfg):
    clips = lines_for(args.chapters)
    man = load_manifest()
    need = todo(cfg, clips, man, args.force, args.refresh)
    secs = sum(estimate_seconds(c["text"]) for c in need)
    price = cfg["price"]
    tokens = secs * price["tokensPerSecond"]
    usd = tokens / 1e6 * price["audioPerMillionTokens"]
    by_role = {r: sum(1 for c in need if c["role"] == r) for r in "PAB"}
    print(f"対象の文: {len(clips)}（作る必要があるもの {len(need)}: 見出し {by_role['P']}・A {by_role['A']}・B {by_role['B']}）")
    print(f"モデル: {cfg['model']}  声: " + "・".join(f"{r}={cfg['roles'][r]['voice']}" for r in "PAB"))
    print(f"音声の長さの目安: {secs / 60:.0f}分  出力トークン {tokens:,.0f}")
    print(f"費用の目安（音声の出力だけ）: 通常 ${usd:.2f} / Batch ${usd * price['batchDiscount']:.2f}")
    print(f"opus {cfg['output']['bitrate']} でのファイルの大きさの目安: {secs * int(cfg['output']['bitrate'].rstrip('k')) / 8 / 1024:.1f}MB")
    if need:
        ex = next((c for c in need if c.get("context")), need[0])
        print(f"\n--- リクエストの例 ---\n読む文: {ex['text']}\nstyle: {style_for(cfg, ex)}")


def cmd_sample(args, cfg):
    voices = args.voices.split(",") if args.voices else cfg["sampleVoices"]["female"] + cfg["sampleVoices"]["male"]
    out = RAW / "samples"
    out.mkdir(parents=True, exist_ok=True)
    clip = {"role": args.role, "text": args.text, "context": args.context or "", "key": "sample", "hash": "sample"}

    def one(v):
        c = {**cfg, "roles": {**cfg["roles"], args.role: {**cfg["roles"][args.role], "voice": v}}}
        t = time.time()
        return v, api("POST", f"/v1beta/models/{cfg['model']}:generateContent", request_for(c, clip)), time.time() - t

    started = time.time()
    with ThreadPoolExecutor(max_workers=cfg["concurrency"]) as pool:
        results = sorted(pool.map(one, voices), key=lambda r: voices.index(r[0]))
    waited = sum(r[2] for r in results)
    for v, res, _ in results:
        body = audio_bytes(res)
        if not body:
            print(f"{v}: 音声なし {json.dumps(res)[:200]}")
            continue
        wav_path = out / f"{v}.wav"
        wav_path.write_bytes(body)
        encode(cfg, wav_path, out / f"{v}.opus")
        with wave.open(str(wav_path)) as w:
            seconds = w.getnframes() / w.getframerate()
        flag = "  ← 長さが不自然" if seconds > estimate_seconds(args.text) * 2 + 1.5 else ""
        print(f"{out / (v + '.opus')}  {seconds:.1f}秒{flag}")
    print(f"かかった時間 {time.time() - started:.1f}秒（1本ずつ送っていたら 約{waited:.0f}秒）")


# ---------------------------------------------------------------------------
# まとめて作る（generate）
# ---------------------------------------------------------------------------
QUOTA_FILE = RAW / "quota.json"  # 1日の上限に当たったモデルと、戻る時刻（次に動かすときに無駄に送らないため）
MODELS_FILE = RAW / "models.json"  # 試しの結果（まとめて読ませられるか・送り方）。同じモデルで試しをくり返さないため


def build_units(cfg, need, sizes):
    """作る文を「1回のリクエストで読むまとまり」に分ける。見出し（P）は1声、会話（A/B）は2声"""
    units, phrases, convs = [], [], []
    by_item = {}
    if sizes.get("dialogMode", "roles") == "roles":
        # 役（P・A・B）ごとに1声でまとめる。会話の行も1行ずつ別の文として読ませる
        for role in ("P", "A", "B"):
            cur = []
            for c in (x for x in need if x["role"] == role):
                words = sum(len(x["text"].split()) for x in cur)
                if cur and (len(cur) >= sizes["phrases"] or words + len(c["text"].split()) > sizes["maxWords"]):
                    units.append({"kind": role, "convs": [[x] for x in cur]})
                    cur = []
                cur.append(c)
            if cur:
                units.append({"kind": role, "convs": [[x] for x in cur]})
        units.sort(key=lambda u: (u["convs"][0][0]["chapter"], "PAB".index(u["kind"])))
        return units
    for c in need:
        if c["role"] == "P":
            phrases.append(c)
        else:
            k = (c["chapter"], c["id"])
            if k not in by_item:
                by_item[k] = []
                convs.append(by_item[k])
            by_item[k].append(c)
    cur = []
    for c in phrases:
        words = sum(len(x["text"].split()) for x in cur)
        if cur and (len(cur) >= sizes["phrases"] or words + len(c["text"].split()) > sizes["maxWords"]):
            units.append({"kind": "P", "convs": [[x] for x in cur]})
            cur = []
        cur.append(c)
    if cur:
        units.append({"kind": "P", "convs": [[x] for x in cur]})
    cur = []
    for conv in convs:
        lines = sum(len(x) for x in cur)
        if cur and (len(cur) >= sizes["dialogs"] or lines + len(conv) > sizes["dialogs"] * 2.5):
            units.append({"kind": "D", "convs": cur})
            cur = []
        cur.append(conv)
    if cur:
        units.append({"kind": "D", "convs": cur})
    # 章の順（見出しと会話を交互に）に並べ直す
    units.sort(key=lambda u: (u["convs"][0][0]["chapter"], u["kind"]))
    return units


def unit_clips(unit):
    return [c for conv in unit["convs"] for c in conv]


def halves(unit):
    """切り分けに失敗したまとまりを2つに分ける（会話1つだけなら1行ずつに）"""
    convs = unit["convs"]
    if len(convs) > 1:
        mid = len(convs) // 2
        return [{"kind": unit["kind"], "convs": convs[:mid]}, {"kind": unit["kind"], "convs": convs[mid:]}]
    return [{"kind": unit["kind"], "convs": [[c]]} for c in convs[0]]


def pack_request(cfg, unit, fmt):
    clips = unit_clips(unit)
    pause = cfg["packing"]["pause"]
    if len(clips) == 1:
        c = clips[0]
        part = {"text": c["text"]}
        if fmt == "metadata":
            part["speechMetadata"] = {"style": style_for(cfg, c)}
        return {
            "contents": [{"parts": [part]}],
            "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg["roles"][c["role"]]["voice"]}}}},
        }
    if unit["kind"] in ("P", "A", "B"):
        role = unit["kind"]
        voice = {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg["roles"][role]["voice"]}}}
        if fmt == "metadata":
            style = f'{cfg["style"]} {cfg["roles"][role]["persona"]} Each part is a separate line: say it once, as its own natural utterance. {pause}'
            parts = [{"text": c["text"], "speechMetadata": {"style": style}} for c in clips]
        else:
            parts = [{"text": "\n\n".join(c["text"] for c in clips)}]
        return {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": voice}}
    speakers = {
        "multiSpeakerVoiceConfig": {
            "speakerVoiceConfigs": [
                {"speaker": r, "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": cfg["roles"][r]["voice"]}}} for r in ("A", "B")
            ]
        }
    }
    if fmt == "metadata" and cfg["packing"]["dialogFormat"] == "parts":
        parts = [
            {"text": c["text"], "speechMetadata": {"speaker": c["role"], "style": f'{cfg["style"]} {cfg["roles"][c["role"]]["persona"]} {pause}'}}
            for c in clips
        ]
    else:
        text = "\n\n".join("\n".join(f'{c["role"]}: {c["text"]}' for c in conv) for conv in unit["convs"])
        parts = [{"text": text}]
    return {"contents": [{"parts": parts}], "generationConfig": {"responseModalities": ["AUDIO"], "speechConfig": speakers}}


def unit_tokens(unit):
    """音声の出力トークンの見込み（1分あたりの上限を守るため。32トークン/秒・文のあとに約1秒の間）"""
    return int(sum(estimate_seconds(c["text"]) + 1.0 for c in unit_clips(unit)) * 32)


def load_quota():
    q = load_json(QUOTA_FILE, {})
    now = time.time()
    return {m: t for m, t in q.items() if t > now}


def save_quota(q):
    RAW.mkdir(parents=True, exist_ok=True)
    QUOTA_FILE.write_text(json.dumps(q, indent=1))


def transcribe(cfg, body):
    """確認用の文字起こし（Gemini のテキストのモデル。音声のモデルとは上限が別）"""
    wav = RAW / "verify.wav"
    wav.write_bytes(body)
    opus = RAW / "verify.opus"
    encode(cfg, wav, opus)
    req = {"contents": [{"parts": [{"inlineData": {"mimeType": "audio/ogg", "data": base64.b64encode(opus.read_bytes()).decode()}},
                                   {"text": "Transcribe this audio verbatim, word for word. Output only the transcript."}]}]}
    res = api("POST", f"/v1beta/models/{cfg['packing']['verifyModel']}:generateContent", req, pacer=Pacer(0))
    return res["candidates"][0]["content"]["parts"][0]["text"]


def words_of(text):
    import re
    return re.sub(r"[^a-z0-9' ]", " ", text.lower().replace("’", "'")).split()


def run_unit(cfg, unit, model, fmt, pacer):
    """1つのまとまりを作る。戻り値: {"status": ok|split|format|quota|error, ...}"""
    clips = unit_clips(unit)
    try:
        res = api("POST", f"/v1beta/models/{model}:generateContent", pack_request(cfg, unit, fmt), pacer=pacer, tokens=unit_tokens(unit))
    except QuotaExhausted as e:
        return {"status": "quota", "message": str(e)}
    except ApiError as e:
        if " 400 " in str(e) and fmt == "metadata":
            return {"status": "format", "message": str(e)}
        return {"status": "error", "message": str(e)}
    body = audio_bytes(res)
    if body is None:
        return {"status": "error", "message": f"音声が返ってこなかった: {json.dumps(res)[:200]}"}
    if len(clips) == 1:
        seconds, warning = save_wav(cfg, clips[0], body)
        return {"status": "ok" if warning is None else "error", "saved": [(clips[0], seconds)] if warning is None else [], "message": warning, "body": body}
    segs, why = tts_pack.split_pack(body, [c["text"] for c in clips])
    if segs is None:
        name = f"{clips[0]['hash']}-{len(clips)}.wav"
        (RAW / "packs").mkdir(parents=True, exist_ok=True)
        (RAW / "packs" / name).write_bytes(body)
        return {"status": "split", "message": f"{why}（raw/tts/packs/{name}）"}
    saved, problems = [], []
    for c, seg in zip(clips, segs):
        seconds, warning = save_wav(cfg, c, seg)
        if warning:
            problems.append(warning)
        else:
            saved.append((c, seconds))
    return {"status": "ok", "saved": saved, "message": "・".join(problems) or None, "body": body}


def cmd_generate(args, cfg):
    clips = lines_for(args.chapters)
    man = load_manifest()
    need = todo(cfg, clips, man, args.force, args.refresh)
    if not need:
        print("作る必要のある文はありません")
        return
    sizes = cfg["packing"] if not args.single else {"phrases": 1, "dialogs": 1, "maxWords": 0, "dialogMode": "roles"}
    queue = build_units(cfg, need, sizes)
    if args.single:
        queue = [h for u in queue for h in ([u] if len(unit_clips(u)) == 1 else [{"kind": u["kind"], "convs": [[c]]} for c in unit_clips(u)])]
    quota = load_quota()
    models = [dict(m) for m in cfg["models"] if m["model"] not in quota]
    skipped = [m["model"] for m in cfg["models"] if m["model"] in quota]
    print(f"{len(need)} 文を {len(queue)} 回のリクエストで作ります（見出し {cfg['packing']['phrases']}文・会話 {cfg['packing']['dialogs']}会話ずつ）", flush=True)
    if skipped:
        print("  今日の上限に達しているモデル（とばす）: " + "・".join(skipped))
    started, done, requests, warnings = time.time(), 0, 0, []
    for m in models:
        # モデルが変わるたびに、まだ無い文からまとまりを作り直す（前のモデルで1文ずつにした分を引きずらない）
        remaining = [c for c in need if c["hash"] not in man["clips"]]
        if not remaining:
            break
        if not args.single:
            # 設定を読み直す（動かしたまま、まとまりの大きさなどを調整できるように）
            fresh = load_config()
            cfg["packing"] = fresh["packing"]
            sizes = cfg["packing"]
        queue = build_units(cfg, remaining, sizes)
        model, fmt = m["model"], m["format"]
        pacer = Pacer(m["rpm"], m["tpm"])
        print(f"\n== {model}（{fmt}・1分に {m['rpm']} 回・1日 {m['rpd']} 回まで）", flush=True)
        # 1) 試し: 小さいまとまりで、切り分けと文字起こしを確かめる（--single のときはしない）
        packing = not args.single
        known = load_json(MODELS_FILE, {}).get(model)
        if packing and known:
            fmt, packing = known["format"], known["packing"]
            print(f"  試し済み: {'まとめて読ませる' if packing else '1文ずつ'}（{fmt}）", flush=True)
        elif packing:
            probe_sizes = cfg["packing"]["probe"]
            head = queue.pop(0)
            n = probe_sizes["dialogs"] if head["kind"] == "D" else probe_sizes["phrases"]
            probe, rest = {"kind": head["kind"], "convs": head["convs"][:n]}, head["convs"][n:]
            if rest:
                queue.insert(0, {"kind": head["kind"], "convs": rest})
            r = run_unit(cfg, probe, model, fmt, pacer)
            requests += 1
            if r["status"] == "format":
                print(f"  speechMetadata が使えない → 文だけで送る（{r['message'][:120]}）")
                fmt = "plain"
                r = run_unit(cfg, probe, model, fmt, pacer)
                requests += 1
            if r["status"] == "quota":
                print(f"  {r['message']}")
                quota[model] = time.time() + 3600 * max(0.5, float(r["message"].split("約")[-1].split("時間")[0] or 1))
                save_quota(quota)
                queue.insert(0, probe)
                continue
            ok = r["status"] == "ok" and not r.get("message")
            if ok and len(unit_clips(probe)) > 1:
                heard = words_of(transcribe(cfg, r["body"]))
                want = [w for c in unit_clips(probe) for w in words_of(c["text"])]
                same = sum(1 for a, b in zip(heard, want) if a == b) / max(len(want), 1)
                print(f"  試し {len(unit_clips(probe))}文: 切り分けOK・文字起こしの一致 {same:.0%}", flush=True)
                ok = same >= 0.85 and abs(len(heard) - len(want)) <= max(2, len(want) * 0.1)
            else:
                print(f"  試し {len(unit_clips(probe))}文: {r['status']} {r.get('message') or ''}", flush=True)
            for c, sec in r.get("saved", []) if ok else []:
                record(cfg, man, c, sec, "pack", model)
                done += 1
            save_manifest(man)
            if not ok:
                # まとめて読ませるとうまくいかないモデルは、1文ずつにする（ほかのモデルに回す手もあるが、止めずに進める）
                print("  → このモデルは1文ずつ作ります")
                packing = False
                queue.insert(0, probe)
            results = load_json(MODELS_FILE, {})
            results[model] = {"format": fmt, "packing": packing, "at": datetime.now(timezone.utc).isoformat()}
            MODELS_FILE.write_text(json.dumps(results, indent=1))
        if not packing:
            queue = [h for u in queue for h in ([u] if len(unit_clips(u)) == 1 else [{"kind": u["kind"], "convs": [[c]]} for c in unit_clips(u)])]
        # 2) 本番: 上限に当たるまで並列に作る
        exhausted = threading.Event()
        pending = []
        with ThreadPoolExecutor(max_workers=cfg["concurrency"]) as pool:
            futs = {}
            def feed():
                while queue and len(futs) < cfg["concurrency"] and not exhausted.is_set():
                    u = queue.pop(0)
                    futs[pool.submit(run_unit, cfg, u, model, fmt, pacer)] = u
            feed()
            while futs:
                fut = next(as_completed(futs))
                u = futs.pop(fut)
                r = fut.result()
                requests += 1
                if r["status"] == "quota":
                    if not exhausted.is_set():
                        print(f"  {r['message']}", flush=True)
                        quota[model] = time.time() + 3600 * max(0.5, float(r["message"].split("約")[-1].split("時間")[0] or 1))
                        save_quota(quota)
                    exhausted.set()
                    pending.append(u)
                elif r["status"] == "split":
                    queue[0:0] = halves(u)
                    warnings.append(f"{model}: 切り分けに失敗 → 小さく分けて作り直し（{r['message']}）")
                elif r["status"] in ("error", "format"):
                    warnings.append(f"{model}: {r['message']}")
                else:
                    for c, sec in r["saved"]:
                        record(cfg, man, c, sec, "pack" if len(unit_clips(u)) > 1 else "sync", model)
                        done += 1
                    if r.get("message"):
                        warnings.append(r["message"])
                    save_manifest(man)
                if requests % 10 == 0:
                    print(f"  {done}/{len(need)} 文  {time.time() - started:.0f}秒・リクエスト {requests} 回", flush=True)
                feed()
        queue[0:0] = pending
    report(warnings)
    left = len(need) - done
    print(f"\n今回作ったもの {done} 文（リクエスト {requests} 回・{time.time() - started:.0f}秒）・残り {left} 文")
    if left:
        print("残りは、同じコマンドで続きから作れます（上限に達したモデルは、戻るまでとばします）")


def cmd_cheers(args, cfg):
    """合いの手の声を作る（元の文は tools/media/cheers.json、できるものは audio/cheers/ と audio/cheers.json）"""
    src = json.loads((HERE / "cheers.json").read_text())
    out_path = AUDIO / "cheers.json"
    have = load_json(out_path, {"version": 1, "events": {}})
    made = {c["key"]: c for ev in have["events"].values() for c in ev.get("clips", [])}
    todo_by_voice = {}
    plan = {}
    for name, ev in src["events"].items():
        group = src["voices"][ev["voice"]]
        plan[name] = []
        for text in ev["lines"]:
            for voice in group["voices"]:
                key = f"{voice}|{text}"
                h = hashlib.sha1(key.encode()).hexdigest()[:14]
                sig = hashlib.sha1(json.dumps([voice, text, group["style"]]).encode()).hexdigest()[:12]
                clip = {"hash": h, "key": key, "role": "P", "text": text, "chapter": "cheers", "id": name, "context": "", "voice": voice, "sig": sig, "style": group["style"]}
                plan[name].append(clip)
                if made.get(key, {}).get("sig") != sig:
                    todo_by_voice.setdefault((voice, group["style"]), []).append(clip)
    need = sum(len(v) for v in todo_by_voice.values())
    print(f"合いの手 {sum(len(v) for v in plan.values())} 本（作るもの {need} 本）")
    quota = load_quota()
    known = load_json(MODELS_FILE, {})
    # 合いの手は気持ちの込め方が大事なので、話し方を指定できる（metadata の）モデルを先に使う
    models = sorted((m for m in cfg["models"] if m["model"] not in quota), key=lambda m: known.get(m["model"], {}).get("format", m["format"]) != "metadata")
    for (voice, style), clips in todo_by_voice.items():
        c2 = {**cfg, "style": style, "roles": {"P": {"voice": voice, "persona": ""}}, "_outdir": "cheers"}
        units = build_units(c2, clips, {**cfg["packing"], "dialogMode": "roles"})
        while units and models:
            m = models[0]
            info = known.get(m["model"])
            if info is None:
                print(f"  {m['model']} はまだ試していないので使わない（generate で試してから）")
                models.pop(0)
                continue
            u = units.pop(0)
            if not info["packing"] and len(unit_clips(u)) > 1:
                units[0:0] = [{"kind": "P", "convs": [[c]]} for c in unit_clips(u)]
                continue
            r = run_unit(c2, u, m["model"], info["format"], Pacer(m["rpm"], m["tpm"]))
            if r["status"] == "quota":
                print(f"  {m['model']}: {r['message']}")
                quota[m["model"]] = time.time() + 3600 * max(0.5, float(r["message"].split("約")[-1].split("時間")[0] or 1))
                save_quota(quota)
                models.pop(0)
                units.insert(0, u)
            elif r["status"] == "split":
                units[0:0] = halves(u)
            elif r["status"] != "ok":
                print(f"  {voice}: {r['message']}")
            else:
                for c, sec in r["saved"]:
                    old = made.get(c["key"], {})
                    made[c["key"]] = {"key": c["key"], "text": c["text"], "voice": voice, "file": f"cheers/{c['hash']}.opus?v={old.get('rev', 0) + 1}",
                                      "rev": old.get("rev", 0) + 1, "sig": c["sig"], "model": m["model"], "seconds": round(sec, 2)}
                print(f"  {voice}: {len(r['saved'])} 本（{m['model']}）", flush=True)
        if units:
            print("  使えるモデルがなくなったので、残りは次に回します")
            break
    events = {}
    for name, ev in src["events"].items():
        clips = [made[c["key"]] for c in plan[name] if c["key"] in made]
        events[name] = {"chance": ev["chance"], "clips": clips}
    AUDIO.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"version": 1, "events": events}, ensure_ascii=False, indent=1) + "\n")
    print(f"audio/cheers.json: {sum(len(e['clips']) for e in events.values())} 本")


def cmd_submit(args, cfg):
    clips = lines_for(args.chapters)
    man = load_manifest()
    need = todo(cfg, clips, man, args.force)
    pending = {h for j in load_json(JOBS, []) if not j.get("collected") for h in j["clips"]}
    need = [c for c in need if c["hash"] not in pending]  # 結果待ちのものは出し直さない
    if args.limit:
        need = need[: args.limit]
    if not need:
        print("作る必要のある文はありません")
        return
    chunk = cfg["batch"]["chunk"]
    jobs = load_json(JOBS, [])
    RAW.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(need), chunk):
        part = need[start:start + chunk]
        name = f"swipetalk-{part[0]['chapter']}-{start // chunk + 1}"
        body = {
            "batch": {
                "displayName": name,
                "inputConfig": {"requests": {"requests": [{"request": request_for(cfg, c), "metadata": {"key": c["hash"]}} for c in part]}},
            }
        }
        if args.dry_run:
            path = RAW / f"{name}.request.json"
            path.write_text(json.dumps(body, ensure_ascii=False, indent=1))
            print(f"送らずに保存: {path}（{len(part)} 文）")
            continue
        res = api("POST", f"/v1beta/models/{cfg['model']}:batchGenerateContent", body)
        job_name = res.get("name") or res.get("metadata", {}).get("name")
        if not job_name:
            sys.exit(f"バッチの名前が返ってこなかった: {json.dumps(res)[:500]}")
        jobs.append({"name": job_name, "display": name, "submitted": datetime.now(timezone.utc).isoformat(), "clips": {c["hash"]: c for c in part}})
        JOBS.write_text(json.dumps(jobs, ensure_ascii=False, indent=1))
        print(f"出しました: {job_name}（{len(part)} 文）")


def job_state(res):
    state = res.get("state") or res.get("metadata", {}).get("state") or ("DONE" if res.get("done") else "UNKNOWN")
    return state.rsplit("_", 1)[-1] if "_STATE_" in state else state  # BATCH_STATE_SUCCEEDED / JOB_STATE_SUCCEEDED → SUCCEEDED


def cmd_status(args, cfg):
    jobs = load_json(JOBS, [])
    if not jobs:
        print("出したバッチはありません")
    for j in jobs:
        if j.get("collected"):
            print(f"{j['display']}: 取り込み済み")
            continue
        res = api("GET", f"/v1beta/{j['name']}")
        print(f"{j['display']} ({j['name']}): {job_state(res)}（{len(j['clips'])} 文）")


def find_key(obj, key):
    """レスポンスの中から key の値を探す（入れ子の形が変わっても読めるように）"""
    if isinstance(obj, dict):
        if key in obj:
            return obj[key]
        for v in obj.values():
            found = find_key(v, key)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = find_key(v, key)
            if found is not None:
                return found
    return None


def batch_results(res):
    """終わったバッチから [(key, response or None, error)] を取り出す"""
    inlined = find_key(res, "inlinedResponses") or find_key(res, "inlined_responses")
    if isinstance(inlined, dict):
        inlined = inlined.get("inlinedResponses") or inlined.get("inlined_responses")
    if inlined:
        return [((r.get("metadata") or {}).get("key"), r.get("response"), r.get("error")) for r in inlined]
    file_name = find_key(res, "responsesFile") or find_key(res, "responses_file")
    if file_name:
        text = api("GET", f"/download/v1beta/{file_name}:download?alt=media", base=API).decode()
        rows = [json.loads(line) for line in text.splitlines() if line.strip()]
        return [(r.get("key") or (r.get("metadata") or {}).get("key"), r.get("response"), r.get("error")) for r in rows]
    return None


ATTEMPTS = RAW / "attempts.json"  # 確認で捨てた回数（文ごと）


def check_clip(cfg, clip):
    """録音を文字起こしして、元の文と語数が合うか確かめる。戻り値: (合っているか, 聞こえた文)"""
    body = base64.b64encode((AUDIO / "clips" / f"{clip['hash']}.opus").read_bytes()).decode()
    req = {"contents": [{"parts": [{"inlineData": {"mimeType": "audio/ogg", "data": body}},
                                   {"text": "Transcribe this audio verbatim, word for word, including any repeated words or false starts. Output only the transcript."}]}]}
    res = api("POST", f"/v1beta/models/{cfg['batch']['verify']['model']}:generateContent", req, pacer=Pacer(0))
    heard = res["candidates"][0]["content"]["parts"][0]["text"].strip()
    a, b = words_of(clip["text"]), words_of(heard)
    # くり返し・言い落としは語数が変わる。語数が同じで1語（長い文は1割）までの違いは、聞き取りの揺れとみなす
    ok = len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= max(1, len(a) // 10)
    return ok, heard


def cmd_collect(args, cfg):
    jobs = load_json(JOBS, [])
    man = load_manifest()
    warnings = []
    attempts = load_json(ATTEMPTS, {})
    verify = cfg["batch"].get("verify")
    for j in jobs:
        if j.get("collected"):
            continue
        res = api("GET", f"/v1beta/{j['name']}")
        state = job_state(res)
        if state not in ("SUCCEEDED", "DONE"):
            print(f"{j['display']}: {state}（まだ取り込めません）")
            if state in ("FAILED", "CANCELLED", "EXPIRED"):
                j["collected"] = state
            continue
        results = batch_results(res)
        if results is None:
            (RAW / f"{j['display']}.response.json").write_text(json.dumps(res)[:2_000_000])
            sys.exit(f"{j['display']}: 結果の形が読めません。raw/tts/{j['display']}.response.json を確認してください")
        order = list(j["clips"])
        done = 0
        saved = []
        for i, (key, response, error) in enumerate(results):
            clip = j["clips"].get(key) or (j["clips"][order[i]] if i < len(order) else None)
            if clip is None:
                warnings.append(f"知らない key の結果: {key}")
                continue
            if error:
                warnings.append(f"{clip['key']}: エラー {json.dumps(error)[:200]}")
                continue
            seconds, w = save_audio(cfg, clip, response)
            if w:
                warnings.append(w)
                continue
            saved.append((clip, seconds))
        # 文字起こしで確かめる（並列）。合わないものは捨てて、次の submit で出し直す
        checks = {}
        if verify and saved:
            with ThreadPoolExecutor(max_workers=8) as pool:
                for (clip, _), r in zip(saved, pool.map(lambda x: check_clip(cfg, x[0]), saved)):
                    checks[clip["hash"]] = r
        redo = 0
        for clip, seconds in saved:
            ok, heard = checks.get(clip["hash"], (True, None))
            if not ok:
                attempts[clip["hash"]] = attempts.get(clip["hash"], 0) + 1
                if attempts[clip["hash"]] < verify["maxAttempts"]:
                    (AUDIO / "clips" / f"{clip['hash']}.opus").unlink(missing_ok=True)
                    redo += 1
                    continue
                warnings.append(f"{clip['key']}: {verify['maxAttempts']}回とも文字起こしが合わないので残した（聞こえた文: {heard}）")
            record(cfg, man, clip, seconds, "batch")
            if not ok:
                man["clips"][clip["hash"]]["check"] = heard
            done += 1
        ATTEMPTS.write_text(json.dumps(attempts, indent=1))
        if redo:
            print(f"  くり返し・言い落としで捨てた {redo} 文（次の submit で出し直す）")
        j["collected"] = datetime.now(timezone.utc).isoformat()
        save_manifest(man)
        JOBS.write_text(json.dumps(jobs, ensure_ascii=False, indent=1))
        print(f"{j['display']}: {done}/{len(j['clips'])} 文を取り込みました")
    report(warnings)


def report(warnings):
    if warnings:
        print("\n注意:")
        for w in warnings:
            print("  " + w)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name, func, help_ in [("plan", cmd_plan, "作る文の数と費用の目安（API は呼ばない）"), ("generate", cmd_generate, "通常の API ですぐ作る"), ("submit", cmd_submit, "Batch API に出す")]:
        s = sub.add_parser(name, help=help_)
        s.add_argument("chapters", nargs="+", help="章（ch01 など）または all")
        s.add_argument("--force", action="store_true", help="設定が同じでも作り直す")
        s.set_defaults(func=func)
        if name == "generate":
            s.add_argument("--single", action="store_true", help="まとめずに1文ずつ作る")
        if name in ("generate", "plan"):
            s.add_argument("--refresh", action="store_true", help="設定（声・話し方）が今と違う録音も作り直す")
        if name == "submit":
            s.add_argument("--dry-run", action="store_true", help="送らずにリクエストを raw/tts/ に保存する")
            s.add_argument("--limit", type=int, help="出す文の数の上限（試しに少しだけ出すとき）")
    s = sub.add_parser("sample", help="声の候補を聞き比べる")
    s.add_argument("--text", required=True)
    s.add_argument("--role", default="P", choices=["P", "A", "B"])
    s.add_argument("--context", default="")
    s.add_argument("--voices", help="カンマ区切り（省略すると sampleVoices を全部）")
    s.set_defaults(func=cmd_sample)
    sub.add_parser("status", help="出したバッチの状態").set_defaults(func=cmd_status)
    sub.add_parser("cheers", help="合いの手の声を作る（tools/media/cheers.json）").set_defaults(func=cmd_cheers)
    sub.add_parser("collect", help="終わったバッチの結果を取り込む").set_defaults(func=cmd_collect)
    args = p.parse_args()
    try:
        args.func(args, load_config())
    except ApiError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()

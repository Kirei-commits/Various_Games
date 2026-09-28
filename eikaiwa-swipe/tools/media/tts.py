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

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
AUDIO = ROOT / "audio"
RAW = HERE / "raw" / "tts"
JOBS = RAW / "jobs.json"
API = "https://generativelanguage.googleapis.com"


def load_config():
    return json.loads((HERE / "tts.config.json").read_text())


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
    src = json.dumps([cfg["model"], cfg["roles"][clip["role"]]["voice"], clip["text"], style_for(cfg, clip), cfg["output"]], ensure_ascii=False)
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


def todo(cfg, clips, man, force=False):
    return [c for c in clips if force or man["clips"].get(c["hash"], {}).get("sig") != signature(cfg, c)]


def estimate_seconds(text):
    # 自然な速さで約 2.6 語/秒 ＋ 前後の無音
    return 0.6 + len(text.split()) / 2.6


def api(method, path, body=None, base=API):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY がありません")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    for attempt in range(6):
        if method == "POST":
            PACER.wait()
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

    def __init__(self, per_minute):
        self.interval = 60.0 / per_minute if per_minute else 0
        self.lock = threading.Lock()
        self.next = 0.0

    def wait(self):
        with self.lock:
            now = time.monotonic()
            at = max(now, self.next)
            self.next = at + self.interval
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
    wav_path = RAW / "wav" / f"{clip['hash']}.wav"
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    wav_path.write_bytes(body)
    with wave.open(str(wav_path)) as w:
        seconds = w.getnframes() / w.getframerate()
    # 文を繰り返した・指示まで読んだなど、長さが明らかにおかしいものは取り込まない（plan で作り直しの対象に残る）
    expected = estimate_seconds(clip["text"])
    if seconds > expected * 2 + 1.5 or seconds < expected * 0.25:
        return None, f"{clip['key']}: 長さが不自然なので取り込まなかった（{seconds:.1f}秒、目安 {expected:.1f}秒）。raw/tts/wav/{clip['hash']}.wav"
    encode(cfg, wav_path, AUDIO / "clips" / f"{clip['hash']}.opus")
    return seconds, None


def record(cfg, man, clip, seconds, via):
    """manifest に1文ぶんを書き込む（メインのスレッドからだけ呼ぶ）"""
    old = man["clips"].get(clip["hash"], {})
    man["clips"][clip["hash"]] = {
        "key": clip["key"],
        "text": clip["text"],
        "role": clip["role"],
        "chapter": clip["chapter"],
        "id": clip["id"],
        "model": cfg["model"],
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
    need = todo(cfg, clips, man, args.force)
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


def cmd_generate(args, cfg):
    clips = lines_for(args.chapters)
    man = load_manifest()
    need = todo(cfg, clips, man, args.force)
    workers = args.workers or cfg["concurrency"]
    rpm = cfg.get("requestsPerMinute", 0)
    global PACER
    PACER = Pacer(rpm)
    print(f"{len(need)} 文を通常の API で作ります（{cfg['model']}、同時に {workers} 件・1分に {rpm or '制限なし'} 件まで）", flush=True)

    stop = threading.Event()

    def one(clip):
        # API を呼んで、保存・opus への変換まで並列に行う（manifest の更新だけはメインのスレッドで）
        if stop.is_set():
            return clip, None, None
        try:
            res = api("POST", f"/v1beta/models/{cfg['model']}:generateContent", request_for(cfg, clip))
        except QuotaExhausted as e:
            stop.set()
            return clip, None, f"QUOTA:{e}"
        except ApiError as e:
            return clip, None, f"{clip['key']}: {e}"
        return (clip, *save_audio(cfg, clip, res))

    warnings = []
    quota = None
    done = 0
    started = time.time()
    # 終わった順に保存する（遅い1件に全体が待たされないように）。途中で止めても、保存済みの分は plan で作り直しの対象から外れる
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, c) for c in need]
        for i, fut in enumerate(as_completed(futures), 1):
            clip, seconds, warning = fut.result()
            if warning and warning.startswith("QUOTA:"):
                quota = warning[len("QUOTA:"):]
            elif warning:
                warnings.append(warning)
            elif seconds is not None:
                record(cfg, man, clip, seconds, "sync")
                done += 1
                save_manifest(man)  # 1文ごとに保存する（途中で止まっても作った分を失わない）
            if (i % 10 == 0 or i == len(need)) and not stop.is_set():
                elapsed = time.time() - started
                print(f"  {i}/{len(need)}  {elapsed:.0f}秒（残り 約{elapsed / i * (len(need) - i):.0f}秒）", flush=True)
    report(warnings)
    left = len(need) - done
    if quota:
        print(f"\n止めました: {quota}\n今回作ったもの {done} 文・残り {left} 文（同じコマンドで続きから作れます）")
    elif left:
        print(f"\n残り {left} 文（同じコマンドで作り直せます）")


def cmd_submit(args, cfg):
    clips = lines_for(args.chapters)
    man = load_manifest()
    need = todo(cfg, clips, man, args.force)
    pending = {h for j in load_json(JOBS, []) if not j.get("collected") for h in j["clips"]}
    need = [c for c in need if c["hash"] not in pending]  # 結果待ちのものは出し直さない
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


def cmd_collect(args, cfg):
    jobs = load_json(JOBS, [])
    man = load_manifest()
    warnings = []
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
        for i, (key, response, error) in enumerate(results):
            clip = j["clips"].get(key) or (j["clips"][order[i]] if i < len(order) else None)
            if clip is None:
                warnings.append(f"知らない key の結果: {key}")
                continue
            if error:
                warnings.append(f"{clip['key']}: エラー {json.dumps(error)[:200]}")
                continue
            w = store(cfg, man, clip, response, "batch")
            if w:
                warnings.append(w)
            done += 1
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
            s.add_argument("--workers", type=int, help="同時に送る数（省略すると設定の concurrency）")
        if name == "submit":
            s.add_argument("--dry-run", action="store_true", help="送らずにリクエストを raw/tts/ に保存する")
    s = sub.add_parser("sample", help="声の候補を聞き比べる")
    s.add_argument("--text", required=True)
    s.add_argument("--role", default="P", choices=["P", "A", "B"])
    s.add_argument("--context", default="")
    s.add_argument("--voices", help="カンマ区切り（省略すると sampleVoices を全部）")
    s.set_defaults(func=cmd_sample)
    sub.add_parser("status", help="出したバッチの状態").set_defaults(func=cmd_status)
    sub.add_parser("collect", help="終わったバッチの結果を取り込む").set_defaults(func=cmd_collect)
    args = p.parse_args()
    try:
        args.func(args, load_config())
    except ApiError as e:
        sys.exit(str(e))


if __name__ == "__main__":
    main()

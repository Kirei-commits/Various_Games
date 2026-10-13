"""LLM / VLM の呼び出し。いまは Gemini のみ。テストでは同じ形の偽物に差し替える。

無料枠で回せるように:
- 呼び出しの間隔を空ける（KYOZAI_RPM。既定は毎分4回）
- 429（分あたりの上限）は、API が返す retryDelay だけ待って再試行する
- 1日あたりの上限に達したら、それ以降の呼び出しは API に投げずにすぐ失敗させる
  （失敗したページは「未処理」として記録され、上限が戻ってから retry で再実行できる）
"""

from __future__ import annotations

import re
import threading
import time
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

MAX_WAIT_SECONDS = 120  # retryDelay がこれより長ければ待たずに諦める


class LLMError(RuntimeError):
    pass


class DailyQuotaExceeded(LLMError):
    pass


class LLMClient(Protocol):
    model_name: str

    def generate_json(self, prompt: str, schema: type[T], images: list[bytes] | None = None) -> T: ...


class RateLimiter:
    """スレッドをまたいで、呼び出しの間隔を 60/rpm 秒以上空ける。rpm <= 0 なら制限しない。"""

    def __init__(self, rpm: float):
        self.interval = 60.0 / rpm if rpm > 0 else 0.0
        self._lock = threading.Lock()
        self._next = 0.0

    def wait(self) -> None:
        if not self.interval:
            return
        with self._lock:
            now = time.monotonic()
            start = max(now, self._next)
            self._next = start + self.interval
        if start > now:
            time.sleep(start - now)


class GeminiClient:
    def __init__(self, api_key: str | None, model_name: str, retries: int = 3, rpm: float = 4, backoff: float = 2.0):
        if not api_key:
            raise LLMError("GEMINI_API_KEY が設定されていません")
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self.model_name = model_name
        self.retries = retries
        self.backoff = backoff
        self.limiter = RateLimiter(rpm)
        self.daily_quota_exceeded = False

    def generate_json(self, prompt: str, schema: type[T], images: list[bytes] | None = None) -> T:
        from google.genai import errors, types

        if self.daily_quota_exceeded:
            raise DailyQuotaExceeded(DAILY_QUOTA_MESSAGE)

        contents: list = [types.Part.from_bytes(data=img, mime_type="image/png") for img in images or []]
        contents.append(prompt)
        config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema)

        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            wait = self.backoff * (2**attempt)
            self.limiter.wait()
            try:
                response = self._client.models.generate_content(model=self.model_name, contents=contents, config=config)
                if isinstance(response.parsed, schema):
                    return response.parsed
                if not response.text:
                    raise LLMError(f"空の応答です（finish_reason: {_finish_reason(response)}）")
                return schema.model_validate_json(response.text)
            except errors.ClientError as e:
                if e.code != 429:
                    # 認証エラーやモデル名の誤りは何度やっても同じなので打ち切る
                    raise LLMError(f"Gemini API エラー {e.code}: {e.message}") from e
                if is_daily_quota(e.details):
                    self.daily_quota_exceeded = True
                    raise DailyQuotaExceeded(DAILY_QUOTA_MESSAGE) from e
                delay = retry_delay(e.details)
                if delay is not None:
                    if delay > MAX_WAIT_SECONDS:
                        raise LLMError(f"レート制限: {delay:.0f}秒待つよう指示されたため中断しました") from e
                    wait = delay + 1
                last_error = e
            except (errors.APIError, LLMError, ValidationError, ValueError) as e:
                last_error = e
            except Exception as e:  # 通信エラーなど
                last_error = e
            if attempt < self.retries:
                time.sleep(wait)
        raise LLMError(f"{self.retries + 1}回試しても失敗しました: {type(last_error).__name__}: {last_error}")


DAILY_QUOTA_MESSAGE = (
    "Gemini API の1日あたりの上限に達しました。上限は太平洋時間の0時（日本時間の16時または17時）に戻ります。"
    "戻ったら `kyozai retry` で再実行してください"
)


def _error_details(details) -> list[dict]:
    if isinstance(details, dict):
        return details.get("error", {}).get("details", []) or []
    return []


def is_daily_quota(details) -> bool:
    for d in _error_details(details):
        for v in d.get("violations", []) or []:
            if "PerDay" in str(v.get("quotaId", "")):
                return True
    return False


def retry_delay(details) -> float | None:
    for d in _error_details(details):
        if str(d.get("@type", "")).endswith("RetryInfo"):
            match = re.fullmatch(r"([\d.]+)s", str(d.get("retryDelay", "")))
            if match:
                return float(match.group(1))
    return None


def _finish_reason(response) -> str:
    try:
        return str(response.candidates[0].finish_reason)
    except Exception:
        return "不明"

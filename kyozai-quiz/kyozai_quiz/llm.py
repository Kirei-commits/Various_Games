"""LLM / VLM の呼び出し。いまは Gemini のみ。テストでは同じ形の偽物に差し替える。"""

from __future__ import annotations

import time
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    model_name: str

    def generate_json(self, prompt: str, schema: type[T], images: list[bytes] | None = None) -> T: ...


class GeminiClient:
    def __init__(self, api_key: str | None, model_name: str, retries: int = 3, backoff: float = 2.0):
        if not api_key:
            raise LLMError("GEMINI_API_KEY が設定されていません")
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self.model_name = model_name
        self.retries = retries
        self.backoff = backoff

    def generate_json(self, prompt: str, schema: type[T], images: list[bytes] | None = None) -> T:
        from google.genai import errors, types

        contents: list = [types.Part.from_bytes(data=img, mime_type="image/png") for img in images or []]
        contents.append(prompt)
        config = types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema)

        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                response = self._client.models.generate_content(model=self.model_name, contents=contents, config=config)
                if isinstance(response.parsed, schema):
                    return response.parsed
                if not response.text:
                    raise LLMError(f"空の応答です（finish_reason 等: {_finish_reason(response)}）")
                return schema.model_validate_json(response.text)
            except errors.ClientError as e:
                # 認証エラーやモデル名の誤りは何度やっても同じなので、レート制限（429）以外は打ち切る
                if e.code != 429:
                    raise LLMError(f"Gemini API エラー {e.code}: {e.message}") from e
                last_error = e
            except (errors.APIError, LLMError, ValidationError, ValueError) as e:
                last_error = e
            except Exception as e:  # 通信エラーなど
                last_error = e
            if attempt < self.retries:
                time.sleep(self.backoff * (2**attempt))
        raise LLMError(f"{self.retries + 1}回試しても失敗しました: {type(last_error).__name__}: {last_error}")


def _finish_reason(response) -> str:
    try:
        return str(response.candidates[0].finish_reason)
    except Exception:
        return "不明"

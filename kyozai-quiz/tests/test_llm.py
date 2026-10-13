import time

from kyozai_quiz.llm import RateLimiter, is_daily_quota, retry_delay


def _details(*items):
    return {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "details": list(items)}}


def test_parse_quota_errors():
    per_minute = _details(
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
         "violations": [{"quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}]},
        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "37s"},
    )
    per_day = _details(
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
         "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
    )
    assert not is_daily_quota(per_minute) and retry_delay(per_minute) == 37
    assert is_daily_quota(per_day) and retry_delay(per_day) is None
    assert not is_daily_quota("unexpected") and retry_delay(None) is None


def test_rate_limiter_spaces_calls():
    limiter = RateLimiter(rpm=600)  # 0.1秒間隔
    start = time.monotonic()
    for _ in range(3):
        limiter.wait()
    assert time.monotonic() - start >= 0.19
    RateLimiter(rpm=0).wait()  # 制限なし

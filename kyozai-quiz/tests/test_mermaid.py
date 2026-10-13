import pytest

from kyozai_quiz.config import Settings
from kyozai_quiz.mermaid import MermaidValidator, basic_check, strip_fences


def test_strip_fences():
    assert strip_fences("```mermaid\nflowchart LR\n A-->B\n```") == "flowchart LR\n A-->B"
    assert strip_fences("graph TD\n A-->B") == "graph TD\n A-->B"


@pytest.mark.parametrize(
    "code,ok",
    [
        ('flowchart LR\n  A["検知"] --> B["封じ込め"]', True),
        ("sequenceDiagram\n  A->>B: hi", True),
        ("flowchart LR\n  A[検知 --> B", False),
        ("flowchart LR\n  A -->", False),
        ("これは図です\n A-->B", False),
        ("flowchart LR", False),
    ],
)
def test_basic_check(code, ok):
    assert (basic_check(code) is None) is ok


def test_node_validator_uses_real_mermaid():
    settings = Settings.from_env()
    validator = MermaidValidator("auto", settings.mermaid_validator_dir)
    if validator.mode != "node":
        pytest.skip("mermaid-validator の npm ci が済んでいない")
    errors = validator.validate(['flowchart LR\n  A["検知"] --> B["封じ込め"]', "flowchart LR\n  A -->", "sequenceDiagram\n  A->>B: hi"])
    assert errors[0] is None and errors[2] is None
    assert errors[1] and "Parse error" in errors[1]

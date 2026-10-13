import json

import pymupdf
import pytest
from typer.testing import CliRunner

from kyozai_quiz import cli, db
from kyozai_quiz.figures import analyze_pages, select_for_regeneration, select_unprocessed
from kyozai_quiz.mermaid import MermaidValidator
from kyozai_quiz.prompts import FIGURE_PROMPT_VERSION, QUESTION_PROMPT_VERSION
from kyozai_quiz.questions import generate_questions, list_questions, to_markdown
from kyozai_quiz.register import RegistrationError, register_material

from .conftest import FakeClient, needs_soffice

pytestmark = needs_soffice


@pytest.fixture
def registered(conn, settings, sample_pptx):
    return register_material(conn, settings, sample_pptx)


def pages(conn, material_id):
    return {r["page_number"]: r for r in conn.execute("SELECT * FROM pages WHERE material_id = ?", (material_id,))}


def analyze(conn, settings, client, rows, **kw):
    return analyze_pages(conn, settings.data_dir, client, MermaidValidator("basic"), rows, **kw)


def test_register_converts_and_stores_pages(conn, settings, registered):
    assert registered.material_id == "セキュリティ入門"
    assert registered.page_count == 6  # 非表示スライドも PDF に含める
    assert registered.figure_pages == [2, 3, 4]

    material_dir = settings.materials_dir / registered.material_id
    assert (material_dir / "source.pptx").exists()
    with pymupdf.open(material_dir / "source.pdf") as doc:
        assert doc.page_count == 6

    rows = pages(conn, registered.material_id)
    for n, row in rows.items():
        assert (settings.data_dir / row["image_path"]).read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
        assert row["figure_status"] == (db.STATUS_UNPROCESSED if n in (2, 3, 4) else db.STATUS_NONE)
    assert rows[1]["speaker_notes"] == "CIA と呼ばれることを補足する"
    assert rows[1]["figure_description"] is None


def test_duplicate_id_and_bad_file(conn, settings, sample_pptx, registered, tmp_path):
    with pytest.raises(RegistrationError):
        register_material(conn, settings, sample_pptx, material_id=registered.material_id)
    again = register_material(conn, settings, sample_pptx)
    assert again.material_id == "セキュリティ入門-2"
    broken = tmp_path / "broken.pptx"
    broken.write_bytes(b"not a pptx")
    with pytest.raises(RegistrationError):
        register_material(conn, settings, broken)


def test_figure_analysis_failure_and_retry(conn, settings, registered):
    mid = registered.material_id
    client = FakeClient(fail_if=lambda prompt: "chart" in prompt)  # p.4（グラフ）だけ失敗させる
    outcomes = analyze(conn, settings, client, select_unprocessed(conn, mid))
    assert [o.success for o in outcomes] == [True, True, False]
    assert all(call["images"] for call in client.calls)  # 図の解析にはページ画像を渡す

    rows = pages(conn, mid)
    assert rows[2]["figure_status"] == db.STATUS_DONE
    assert rows[2]["figure_description"].startswith("「検知」")
    assert json.loads(rows[2]["mermaid"]) == ['flowchart LR\n  A["検知"] --> B["封じ込め"]']
    assert json.loads(rows[2]["tables_markdown"])[0].startswith("| a | b |")
    assert rows[2]["model_name"] == "fake-vlm-1" and rows[2]["prompt_version"] == FIGURE_PROMPT_VERSION
    assert rows[2]["generated_at"]
    assert rows[4]["figure_status"] == db.STATUS_UNPROCESSED
    assert "503" in rows[4]["last_error"]
    assert rows[1]["model_name"] is None  # 図なしページは VLM を呼ばない

    # 再実行すると未処理のページだけが処理される
    retry_client = FakeClient()
    targets = select_unprocessed(conn, mid)
    assert [r["page_number"] for r in targets] == [4]
    analyze(conn, settings, retry_client, targets)
    assert pages(conn, mid)[4]["figure_status"] == db.STATUS_DONE
    assert pages(conn, mid)[4]["attempts"] == 2
    log = conn.execute("SELECT success FROM figure_analysis_log WHERE page_number = 4 ORDER BY id").fetchall()
    assert [r["success"] for r in log] == [0, 1]


def test_invalid_mermaid_keeps_description_only(conn, settings, registered):
    client = FakeClient(mermaid=["flowchart LR\n  A[検知 --> B"])
    outcomes = analyze(conn, settings, client, select_unprocessed(conn, registered.material_id, [2]))
    assert outcomes[0].success and outcomes[0].mermaid_rejected == 1
    row = pages(conn, registered.material_id)[2]
    assert row["figure_status"] == db.STATUS_DONE
    assert row["figure_description"]
    assert row["mermaid"] is None
    assert "捨てたコード" in row["mermaid_error"]


def test_regenerate_only_matching_meta(conn, settings, registered):
    mid = registered.material_id
    analyze(conn, settings, FakeClient(model_name="old-model"), select_unprocessed(conn, mid, [2, 3]))
    analyze(conn, settings, FakeClient(model_name="other-model"), select_unprocessed(conn, mid, [4]))

    targets = select_for_regeneration(conn, model_name="old-model", prompt_version=FIGURE_PROMPT_VERSION)
    assert [r["page_number"] for r in targets] == [2, 3]
    assert select_for_regeneration(conn, prompt_version="figure-v0") == []

    # 再生成が失敗しても既存の説明文は残り、同じ条件でもう一度選べる
    analyze(conn, settings, FakeClient(model_name="new-model", fail_if=lambda p: True), targets, keep_previous_on_failure=True)
    assert pages(conn, mid)[2]["figure_status"] == db.STATUS_DONE
    assert pages(conn, mid)[2]["model_name"] == "old-model"
    assert len(select_for_regeneration(conn, model_name="old-model")) == 2

    analyze(conn, settings, FakeClient(model_name="new-model"), targets, keep_previous_on_failure=True)
    rows = pages(conn, mid)
    assert rows[2]["model_name"] == rows[3]["model_name"] == "new-model"
    assert rows[4]["model_name"] == "other-model"


def test_generate_questions_normal_and_deep(conn, settings, registered):
    mid = registered.material_id
    analyze(conn, settings, FakeClient(), select_unprocessed(conn, mid, [2, 3]))

    client = FakeClient(model_name="fake-q")
    result = generate_questions(conn, settings.data_dir, client, mid, per_page=3)
    # p.4 は未処理なので飛ばす。p.6 は非表示だが内容があるので対象
    assert sorted(p.page_number for p in result.pages) == [1, 2, 3, 5, 6]
    assert 4 in result.skipped
    assert all(not call["images"] for call in client.calls)  # 通常は画像を渡さない
    prompt_p2 = next(c["prompt"] for c in client.calls if "ページ: 2" in c["prompt"])
    assert "図の説明文" in prompt_p2 and "```mermaid" in prompt_p2 and "| a | b |" in prompt_p2
    assert all(p.saved == 3 and len(p.dropped) == 1 for p in result.pages)  # 選択肢2つの問題は捨てる

    qs = list_questions(conn, mid, result.batch_id, [2])
    assert [q["source"] for q in qs] == [{"material_id": mid, "page_number": 2}] * 3
    mc = next(q for q in qs if q["question_type"] == "multiple_choice")
    assert mc["answer"] == "検知"  # 「A」を選択肢の文字列に直す
    tf = next(q for q in qs if q["question_type"] == "true_false")
    assert tf["answer"] == "×"
    assert all(q["model_name"] == "fake-q" and q["prompt_version"] == QUESTION_PROMPT_VERSION for q in qs)
    assert "出典: 教材 `セキュリティ入門` p.2" in to_markdown(qs, "セキュリティ入門")

    deep_client = FakeClient(model_name="fake-q")
    deep = generate_questions(conn, settings.data_dir, deep_client, mid, deep=True, include_unprocessed=True)
    assert sorted(p.page_number for p in deep.pages) == [2, 3, 4]  # 図ページのみ
    assert all(len(call["images"]) == 1 for call in deep_client.calls)  # 図を深く問うときだけ画像を渡す
    assert all(q["used_page_image"] for q in list_questions(conn, mid, deep.batch_id))


def test_cli_end_to_end(settings, sample_pptx, monkeypatch, tmp_path):
    monkeypatch.setenv("KYOZAI_DATA_DIR", str(settings.data_dir))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("KYOZAI_MERMAID_VALIDATOR", "basic")
    fake = FakeClient(fail_if=lambda p: "chart" in p and "図の種類" in p)
    monkeypatch.setattr(cli, "client_factory", lambda s, model: fake)
    runner = CliRunner()

    r = runner.invoke(cli.app, ["register", str(sample_pptx), "--id", "sec"])
    assert r.exit_code == 0, r.output
    assert "図あり 3ページ" in r.output and "失敗 1" in r.output

    r = runner.invoke(cli.app, ["list"])
    assert "未処理 1" in r.output

    fake.fail_if = lambda p: False
    r = runner.invoke(cli.app, ["retry", "sec"])
    assert r.exit_code == 0 and "成功 1 / 失敗 0" in r.output

    r = runner.invoke(cli.app, ["regenerate", "--model", "fake-vlm-1", "--dry-run"])
    assert r.exit_code == 0 and "対象 3ページ" in r.output
    r = runner.invoke(cli.app, ["regenerate"])
    assert r.exit_code == 1

    r = runner.invoke(cli.app, ["generate", "sec", "--pages", "2-3", "--per-page", "3", "--types", "mc,tf,short"])
    assert r.exit_code == 0, r.output
    out = tmp_path / "q.json"
    r = runner.invoke(cli.app, ["questions", "sec", "--format", "json", "--out", str(out)])
    assert r.exit_code == 0
    data = json.loads(out.read_text())
    assert len(data) == 6 and {q["page_number"] for q in data} == {2, 3}

    r = runner.invoke(cli.app, ["show", "sec", "--page", "2", "--json"])
    assert json.loads(r.output)[0]["mermaid"]

    r = runner.invoke(cli.app, ["delete", "sec", "--yes"])
    assert r.exit_code == 0 and not (settings.materials_dir / "sec").exists()

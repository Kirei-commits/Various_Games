"""コマンドライン: kyozai <コマンド>。"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Optional

import typer

from . import db
from .config import Settings
from .figures import Outcome, analyze_pages, select_for_regeneration, select_unprocessed
from .llm import DAILY_QUOTA_MESSAGE, GeminiClient, LLMClient
from .mermaid import MermaidValidator
from .prompts import FIGURE_PROMPT_VERSION
from .questions import generate_questions, list_questions, parse_types, to_markdown
from .register import RegistrationError, delete_material, register_material

app = typer.Typer(help="pptx 教材の登録と問題生成", no_args_is_help=True, add_completion=False)

# テストから差し替えられるようにしておく
client_factory = lambda settings, model: GeminiClient(  # noqa: E731
    settings.gemini_api_key, model, settings.vlm_retries, settings.rpm
)


def _settings() -> Settings:
    return Settings.from_env()


def _conn(settings: Settings) -> sqlite3.Connection:
    return db.connect(settings.db_path)


def _fail(message: str) -> None:
    typer.secho(message, fg=typer.colors.RED, err=True)
    raise typer.Exit(1)


def parse_pages(text: Optional[str]) -> Optional[list[int]]:
    """「1,3-5」→ [1, 3, 4, 5]"""
    if not text:
        return None
    pages: list[int] = []
    for part in text.split(","):
        part = part.strip()
        try:
            if "-" in part:
                start, end = (int(x) for x in part.split("-", 1))
                pages.extend(range(start, end + 1))
            else:
                pages.append(int(part))
        except ValueError:
            raise typer.BadParameter(f"ページの指定が不正です: {part}（例: 1,3-5）")
    return sorted(set(pages))


def _require_material(conn, material_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM materials WHERE id = ?", (material_id,)).fetchone()
    if row is None:
        _fail(f"教材が見つかりません: {material_id}")
    return row


def _report(outcome: Outcome) -> None:
    where = f"{outcome.material_id} p.{outcome.page_number}"
    if outcome.success:
        extra = f"（Mermaid {outcome.mermaid_count}件"
        extra += f"、構文エラーで {outcome.mermaid_rejected}件を破棄）" if outcome.mermaid_rejected else "）"
        typer.echo(f"  ✓ {where} 図の説明文を保存{extra}")
    elif outcome.error and outcome.error.startswith("DailyQuotaExceeded"):
        typer.secho(f"  ✗ {where} 未処理として記録: 1日の上限に達したため API を呼んでいません", fg=typer.colors.YELLOW)
    else:
        typer.secho(f"  ✗ {where} 未処理として記録: {outcome.error}", fg=typer.colors.YELLOW)


def _run_analysis(settings, conn, rows, *, keep_previous_on_failure=False) -> list[Outcome]:
    client: LLMClient = client_factory(settings, settings.vlm_model)
    validator = MermaidValidator(settings.mermaid_validator, settings.mermaid_validator_dir)
    typer.echo(
        f"図の解析: {len(rows)}ページ（API 呼び出し {len(rows)}回〜 / モデル {client.model_name} / プロンプト {FIGURE_PROMPT_VERSION}）"
    )
    return analyze_pages(
        conn, settings.data_dir, client, validator, rows,
        keep_previous_on_failure=keep_previous_on_failure, workers=settings.workers, on_done=_report,
    )


def _summarize(outcomes: list[Outcome]) -> None:
    failed = [o for o in outcomes if not o.success]
    typer.echo(f"成功 {len(outcomes) - len(failed)} / 失敗 {len(failed)}")
    if any(o.error and o.error.startswith("DailyQuotaExceeded") for o in failed):
        typer.secho(DAILY_QUOTA_MESSAGE, fg=typer.colors.YELLOW)
    elif failed:
        typer.echo("失敗したページは `kyozai retry` で再実行できます。")


@app.command()
def register(
    pptx: Path = typer.Argument(..., help="登録する pptx ファイル"),
    material_id: Optional[str] = typer.Option(None, "--id", help="教材ID（省略時はファイル名から作る）"),
    title: Optional[str] = typer.Option(None, help="教材のタイトル"),
    skip_vlm: bool = typer.Option(False, "--skip-vlm", help="図の解析をせずに登録だけする（図ページは未処理になる）"),
):
    """pptx を登録する。図を含むページだけ VLM で説明文・Mermaid を作る。"""
    settings = _settings()
    conn = _conn(settings)
    try:
        result = register_material(conn, settings, pptx, material_id=material_id, title=title)
    except RegistrationError as e:
        _fail(str(e))
    except Exception as e:
        _fail(f"登録に失敗しました: {type(e).__name__}: {e}")
    typer.echo(
        f"登録しました: 教材ID {result.material_id}（{result.page_count}ページ、図あり {len(result.figure_pages)}ページ）"
    )
    if not result.figure_pages:
        return
    if skip_vlm:
        typer.echo("図の解析はスキップしました。`kyozai retry " + result.material_id + "` で実行できます。")
        return
    if not settings.gemini_api_key:
        typer.secho("GEMINI_API_KEY が未設定のため図の解析をスキップしました（図ページは未処理）。", fg=typer.colors.YELLOW)
        typer.echo("キーを設定してから `kyozai retry " + result.material_id + "` を実行してください。")
        return
    rows = select_unprocessed(conn, result.material_id)
    _summarize(_run_analysis(settings, conn, rows))


@app.command()
def retry(
    material_id: Optional[str] = typer.Argument(None, help="教材ID（省略時はすべての教材）"),
    pages: Optional[str] = typer.Option(None, help="ページ（例: 1,3-5）"),
):
    """図の解析が「未処理」のページを再実行する。"""
    settings = _settings()
    conn = _conn(settings)
    if material_id:
        _require_material(conn, material_id)
    rows = select_unprocessed(conn, material_id, parse_pages(pages))
    if not rows:
        typer.echo("未処理のページはありません。")
        return
    _summarize(_run_analysis(settings, conn, rows))


@app.command()
def regenerate(
    material_id: Optional[str] = typer.Option(None, "--material", help="教材ID"),
    pages: Optional[str] = typer.Option(None, help="ページ（例: 1,3-5）"),
    model: Optional[str] = typer.Option(None, help="このモデルで生成したデータだけを対象にする"),
    prompt_version: Optional[str] = typer.Option(None, help="このプロンプトバージョンで生成したデータだけを対象にする"),
    all_: bool = typer.Option(False, "--all", help="条件なしで、生成済みの図ページすべてを対象にする"),
    dry_run: bool = typer.Option(False, "--dry-run", help="対象ページを表示するだけ"),
):
    """保存済みのページ画像から、図の説明文・Mermaid を現在のモデル・プロンプトで作り直す。"""
    if not (material_id or model or prompt_version or all_):
        _fail("対象を --material / --model / --prompt-version で絞るか、--all を指定してください")
    settings = _settings()
    conn = _conn(settings)
    rows = select_for_regeneration(
        conn, material_id=material_id, pages=parse_pages(pages), model_name=model, prompt_version=prompt_version
    )
    if not rows:
        typer.echo("条件に合う生成済みページはありません。")
        return
    typer.echo(f"対象 {len(rows)}ページ → 新しい設定: モデル {settings.vlm_model} / プロンプト {FIGURE_PROMPT_VERSION}")
    for r in rows:
        typer.echo(f"  {r['material_id']} p.{r['page_number']}（現在: {r['model_name']} / {r['prompt_version']} / {r['generated_at']}）")
    if dry_run:
        return
    _summarize(_run_analysis(settings, conn, rows, keep_previous_on_failure=True))


@app.command("list")
def list_materials():
    """登録済みの教材を一覧する。"""
    conn = _conn(_settings())
    rows = conn.execute(
        """SELECT m.id, m.title, m.page_count, m.registered_at,
                  SUM(p.has_figure) AS figures,
                  SUM(p.figure_status = 'unprocessed') AS unprocessed,
                  (SELECT COUNT(*) FROM questions q WHERE q.material_id = m.id) AS questions
           FROM materials m JOIN pages p ON p.material_id = m.id
           GROUP BY m.id ORDER BY m.registered_at"""
    ).fetchall()
    if not rows:
        typer.echo("教材はまだ登録されていません。")
        return
    for r in rows:
        typer.echo(
            f"{r['id']}  「{r['title']}」 {r['page_count']}ページ / 図あり {r['figures']} / 未処理 {r['unprocessed']}"
            f" / 問題 {r['questions']}問  ({r['registered_at']})"
        )


@app.command()
def show(
    material_id: str,
    page: Optional[int] = typer.Option(None, help="このページだけ表示"),
    as_json: bool = typer.Option(False, "--json", help="JSON で出力"),
):
    """教材のページごとの保存データを表示する。"""
    settings = _settings()
    conn = _conn(settings)
    _require_material(conn, material_id)
    sql, params = "SELECT * FROM pages WHERE material_id = ?", [material_id]
    if page is not None:
        sql += " AND page_number = ?"
        params.append(page)
    rows = conn.execute(sql + " ORDER BY page_number", params).fetchall()
    if not rows:
        _fail("該当するページがありません")
    data = []
    for r in rows:
        d = dict(r)
        for key in ("figure_kinds", "mermaid", "tables_markdown"):
            d[key] = db.loads(d[key])
        d["has_figure"] = bool(d["has_figure"])
        d["hidden"] = bool(d["hidden"])
        d["image_path"] = str(settings.data_dir / d["image_path"])
        data.append(d)
    if as_json:
        typer.echo(json.dumps(data, ensure_ascii=False, indent=2))
        return
    for d in data:
        typer.secho(f"=== p.{d['page_number']} ===", bold=True)
        typer.echo(f"図: {'あり ' + ', '.join(d['figure_kinds']) if d['has_figure'] else 'なし'}  状態: {d['figure_status']}"
                   + ("  (非表示スライド)" if d["hidden"] else ""))
        typer.echo(f"画像: {d['image_path']}")
        if d["model_name"]:
            typer.echo(f"生成: {d['model_name']} / {d['prompt_version']} / {d['generated_at']}")
        typer.echo(f"--- テキスト ---\n{d['extracted_text'] or '（なし）'}")
        if d["speaker_notes"]:
            typer.echo(f"--- ノート ---\n{d['speaker_notes']}")
        if d["figure_description"]:
            typer.echo(f"--- 図の説明文 ---\n{d['figure_description']}")
        for code in d["mermaid"] or []:
            typer.echo(f"--- Mermaid ---\n{code}")
        for table in d["tables_markdown"] or []:
            typer.echo(f"--- 表 ---\n{table}")
        if d["mermaid_error"]:
            typer.secho(f"--- 破棄した Mermaid ---\n{d['mermaid_error']}", fg=typer.colors.YELLOW)
        if d["last_error"]:
            typer.secho(f"--- 直近のエラー ---\n{d['last_error']}", fg=typer.colors.YELLOW)
        typer.echo("")


@app.command()
def meta():
    """図の解析結果を、モデル・プロンプトバージョン・状態ごとに集計する（再生成の対象選びに使う）。"""
    conn = _conn(_settings())
    rows = conn.execute(
        """SELECT figure_status, model_name, prompt_version, COUNT(*) AS n
           FROM pages WHERE has_figure = 1
           GROUP BY figure_status, model_name, prompt_version ORDER BY figure_status, model_name"""
    ).fetchall()
    if not rows:
        typer.echo("図を含むページはありません。")
    for r in rows:
        typer.echo(f"{r['figure_status']:12} {r['model_name'] or '-':28} {r['prompt_version'] or '-':12} {r['n']}ページ")


@app.command()
def generate(
    material_id: str,
    pages: Optional[str] = typer.Option(None, help="ページ（例: 1,3-5）。省略時は全ページ"),
    per_page: int = typer.Option(3, "--per-page", help="1ページあたりの問題数"),
    types: Optional[str] = typer.Option(None, help="問題形式（mc,short,tf のカンマ区切り。省略時は全部）"),
    figure_deep: bool = typer.Option(
        False, "--figure-deep", help="図の理解を深く問う問題を作る（図ページのみ。ページ画像も VLM に渡す）"
    ),
    include_unprocessed: bool = typer.Option(
        False, "--include-unprocessed", help="図の解析が未処理のページも対象にする"
    ),
):
    """保存済みデータから問題を生成する。各問題には出典（教材ID・ページ番号）が紐づく。"""
    settings = _settings()
    conn = _conn(settings)
    _require_material(conn, material_id)
    try:
        type_list = parse_types(types)
    except ValueError as e:
        raise typer.BadParameter(str(e))
    client = client_factory(settings, settings.question_model)
    typer.echo(f"問題生成: モデル {client.model_name}" + (" / ページ画像あり（図を深く問う）" if figure_deep else ""))

    def report(p):
        if p.error:
            typer.secho(f"  ✗ p.{p.page_number} 失敗: {p.error}", fg=typer.colors.YELLOW)
        else:
            dropped = f"（形式不備で {len(p.dropped)}問を破棄）" if p.dropped else ""
            typer.echo(f"  ✓ p.{p.page_number} {p.saved}問{dropped}")

    try:
        result = generate_questions(
            conn, settings.data_dir, client, material_id,
            pages=parse_pages(pages), per_page=per_page, types=type_list, deep=figure_deep,
            include_unprocessed=include_unprocessed, pages_per_call=settings.pages_per_call,
            workers=settings.workers, on_page=report,
        )
    except ValueError as e:
        _fail(str(e))
    for page_number, reason in sorted(result.skipped.items()):
        typer.echo(f"  - p.{page_number} 対象外: {reason}")
    typer.echo(f"保存 {result.saved}問（バッチID {result.batch_id}）。`kyozai questions {material_id} --batch {result.batch_id}` で表示できます。")
    if any(p.error for p in result.pages):
        raise typer.Exit(1)


@app.command()
def questions(
    material_id: str,
    batch: Optional[str] = typer.Option(None, help="このバッチIDの問題だけ"),
    pages: Optional[str] = typer.Option(None, help="ページ（例: 1,3-5）"),
    fmt: str = typer.Option("md", "--format", help="md か json"),
    out: Optional[Path] = typer.Option(None, help="出力先ファイル（省略時は標準出力）"),
):
    """生成済みの問題を出典付きで書き出す。"""
    conn = _conn(_settings())
    material = _require_material(conn, material_id)
    items = list_questions(conn, material_id, batch, parse_pages(pages))
    if fmt == "json":
        text = json.dumps(items, ensure_ascii=False, indent=2)
    elif fmt == "md":
        text = to_markdown(items, material["title"])
    else:
        raise typer.BadParameter("--format は md か json です")
    if out:
        out.write_text(text, encoding="utf-8")
        typer.echo(f"{len(items)}問を書き出しました: {out}")
    else:
        sys.stdout.write(text + "\n")


@app.command()
def delete(material_id: str, yes: bool = typer.Option(False, "--yes", help="確認せずに削除する")):
    """教材と、そのページ画像・問題をすべて削除する。"""
    settings = _settings()
    conn = _conn(settings)
    _require_material(conn, material_id)
    if not yes and not typer.confirm(f"教材 {material_id} を削除しますか？（画像・問題も消えます）"):
        raise typer.Abort()
    delete_material(conn, settings, material_id)
    typer.echo(f"削除しました: {material_id}")


if __name__ == "__main__":
    app()

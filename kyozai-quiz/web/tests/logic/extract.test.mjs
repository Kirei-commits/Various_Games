import "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { extractSlides } from "../../js/extract.js";

const sample = new URL("../../../samples/southern_all_stars.pptx", import.meta.url);

test("サンプル教材: テキスト・ノート・図の判定", async () => {
  const slides = await extractSlides(await readFile(sample));
  assert.equal(slides.length, 9);
  assert.deepEqual(slides.filter((s) => s.figureKinds.length).map((s) => s.pageNumber), [3, 4, 5, 6, 8]);
  assert.match(slides[0].text, /サザンオールスターズと桑田佳祐/);
  assert.match(slides[0].notes, /メンバー構成図/);
  assert.deepEqual(slides[3].figureKinds, ["shape"]);
  assert.match(slides[5].text, /系列「オリジナルアルバム数」: 2, 6, 5, 1, 1, 1/);
  assert.match(slides[6].text, /\| TSUNAMI \| 2000 \|/);
  assert.equal(slides[6].figureKinds.length, 0); // 表は図ではなくテキストとして扱う
});

// Python 版（python-pptx）と同じ結果になるか。Python と kyozai_quiz が使えるときだけ
test("Python 版の抽出結果と一致する", async (t) => {
  const py = spawnSync("python3", ["-c", `
import json, sys
from kyozai_quiz.extract import extract_slides
print(json.dumps([dict(page_number=s.page_number, text=s.text, notes=s.notes, figure_kinds=s.figure_kinds, hidden=s.hidden) for s in extract_slides(sys.argv[1])], ensure_ascii=False))
`, new URL(sample).pathname], { cwd: new URL("../../..", import.meta.url).pathname, encoding: "utf8" });
  if (py.status !== 0) return t.skip("Python 版が使えない");
  const expected = JSON.parse(py.stdout);
  const slides = await extractSlides(await readFile(sample));
  assert.deepEqual(
    slides.map((s) => ({ page_number: s.pageNumber, text: s.text, notes: s.notes, figure_kinds: s.figureKinds, hidden: s.hidden })),
    expected,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as js from "../../js/prompts.js";

// プロンプトの文面とバージョンが Python 版と食い違っていないか
test("プロンプトが Python 版と同じ", (t) => {
  const names = ["FIGURE_PROMPT_VERSION", "QUESTION_PROMPT_VERSION", "FIGURE_PROMPT", "QUESTION_PROMPT", "PAGE_SECTION", "DEEP_FIGURE_INSTRUCTION", "QUESTION_TYPE_LABELS"];
  const py = spawnSync("python3", ["-c", `import json; from kyozai_quiz import prompts as p; print(json.dumps({n: getattr(p, n) for n in ${JSON.stringify(names)}}, ensure_ascii=False))`], {
    cwd: new URL("../../..", import.meta.url).pathname, encoding: "utf8",
  });
  if (py.status !== 0) return t.skip("Python 版が使えない");
  const expected = JSON.parse(py.stdout);
  for (const n of names) assert.deepEqual(js[n], expected[n], n);
});

test("問題生成のプロンプトに各ページが入る", () => {
  const pages = [1, 2].map((n) => js.pageSection({ pageNumber: n, slideText: `本文${n}`, notes: "", description: n === 2 ? "図の説明" : null, mermaid: n === 2 ? ["flowchart LR\n A-->B"] : null, tables: null }));
  const prompt = js.questionPrompt({ materialId: "m", pages, pageNumbers: [1, 2], count: 3, types: ["true_false"], deep: true });
  assert.match(prompt, /## ページ 1\n### スライドのテキスト\n本文1/);
  assert.match(prompt, /### 図の説明文\n図の説明/);
  assert.match(prompt, /```mermaid\nflowchart LR/);
  assert.match(prompt, /添付したページ画像（順に p\.1, p\.2）/);
  assert.match(prompt, /問題を3問ずつ/);
  assert.doesNotMatch(prompt, /\{\w+\}/);
});

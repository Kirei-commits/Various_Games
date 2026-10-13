// プロンプト。Python 版 kyozai_quiz/prompts.py と同じ文面にする（tests/logic/prompts.test.mjs で一致を確かめる）。
// 文面を変えたら両方を直し、バージョンを上げる。

export const FIGURE_PROMPT_VERSION = "figure-v2";

export const QUESTION_PROMPT_VERSION = "question-v2";

export const FIGURE_PROMPT = "添付画像は教材スライド1ページ分の画像です。\n\nこの図は後で問題作成に使用する。図に含まれる要素、要素間の関係、矢印の向きと流れ、グループ構造、図から読み取れる結論を漏れなく記述せよ。推測は推測と明記すること。\n\n# 出力する項目\n- description: 上の指示に従った説明文（日本語）。スライドのタイトルや箇条書きの文章を書き写すのではなく、図そのものを中心に書く。\n- mermaid: フロー図・構成図・シーケンス図・状態遷移図など、Mermaid で意味を損なわずに表せる図だけを Mermaid コードにしたもの（図1つにつき1要素、``` で囲まない）。\n  - 配置自体に意味がある図（マトリクス上の位置、地図、写真、イラスト、グラフの形状など）は Mermaid にせず、説明文だけにする。その場合は空のリストにする。\n  - 日本語や記号を含むラベルは必ず二重引用符で囲む（例: A[\"受付\"] --> B[\"審査\"]）。\n  - 図の種類の宣言（flowchart LR など）とノード・矢印の定義は1つずつ改行で区切る。1行にまとめない。\n- tables: 表形式の図（画像の表など）はマークダウン表にしたもの。表がなければ空のリスト。\n\n# 参考: スライドファイルから取り出したテキスト（OCR ではない）\n{slide_text}\n\n# 参考: 発表者ノート\n{notes}\n\n# 参考: スライド内で検出した図の種類\n{figure_kinds}\n";

export const QUESTION_PROMPT = "あなたは教材から確認問題を作る出題者です。下の教材の各ページについて、そのページの内容だけを根拠に問題を{count}問ずつ作ってください。\n各問題の page_number には、根拠にしたページの番号を入れてください。\n\n# 条件\n- 問題形式: 次の中から偏りなく使う\n{type_lines}\n- 教材に書かれていないことを正解の根拠にしない。\n- 図の説明文・Mermaid・表があるページでは、図の内容（流れの順序、要素間の関係、グループ構造、図から読み取れる結論）を問う問題を少なくとも1問含め、figure_based を true にする。\n- 説明文中で「推測」とされている内容は、正解の根拠にしない。\n- 色・線の種類・左右の位置といった図の見た目そのものは、それが内容上の意味（順序・分類・強調など）を表している場合を除いて問わない。問うのは学習内容の理解である。\n- 4択問題の誤答は、もっともらしいが教材の内容から明確に誤りと判断できるものにする。\n- explanation には、教材のどの記述・図のどの部分が根拠かを書く。\n- 問題文に「このページ」「スライド」などの言葉を使わず、問題だけ読んで意味が通るようにする。\n{deep_instruction}\n# 教材（教材ID: {material_id}）\n{pages}";

export const PAGE_SECTION = "\n## ページ {page_number}\n### スライドのテキスト\n{slide_text}\n\n### 発表者ノート\n{notes}\n{figure_section}";

export const DEEP_FIGURE_INSTRUCTION = "- 今回は図の理解を深く問う問題を作る。添付したページ画像（順に {image_pages}）と図の説明文を照らし合わせ、図を正しく読めていないと解けない問題（流れの順序や分岐、要素間の因果・包含関係、図から導ける結論など）を中心にする。すべて figure_based を true にする。\n";

export const QUESTION_TYPE_LABELS = {
  "multiple_choice": "4択問題（choices に選択肢を4つ、answer は正解の選択肢の文字列そのもの）",
  "short_answer": "記述・短答問題（choices は空、answer は模範解答）",
  "true_false": "正誤問題（choices は空、answer は「○」か「×」）"
};

// Python の str.format と同じく {name} を置き換える
const format = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));

export function figurePrompt(slideText, notes, figureKinds) {
  return format(FIGURE_PROMPT, {
    slide_text: slideText || "（なし）",
    notes: notes || "（なし）",
    figure_kinds: figureKinds.join(", ") || "（なし）",
  });
}

export function pageSection({ pageNumber, slideText, notes, description, mermaid, tables }) {
  let figureSection = "";
  if (description) figureSection += `\n### 図の説明文\n${description}\n`;
  (mermaid || []).forEach((code, i) => {
    figureSection += `\n### 図の Mermaid (${i + 1})\n\`\`\`mermaid\n${code}\n\`\`\`\n`;
  });
  (tables || []).forEach((table, i) => {
    figureSection += `\n### 図の表 (${i + 1})\n${table}\n`;
  });
  return format(PAGE_SECTION, {
    page_number: pageNumber,
    slide_text: slideText || "（なし）",
    notes: notes || "（なし）",
    figure_section: figureSection,
  });
}

export function questionPrompt({ materialId, pages, pageNumbers, count, types, deep }) {
  return format(QUESTION_PROMPT, {
    count,
    type_lines: types.map((t) => `  - ${t}: ${QUESTION_TYPE_LABELS[t]}`).join("\n"),
    deep_instruction: deep ? format(DEEP_FIGURE_INSTRUCTION, { image_pages: pageNumbers.map((n) => `p.${n}`).join(", ") }) : "",
    material_id: materialId,
    pages: pages.join(""),
  });
}

// Gemini に返させる JSON の形（kyozai_quiz/schemas.py と同じ項目）
export const FIGURE_SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { type: "STRING", description: "図の要素・要素間の関係・矢印の向きと流れ・グループ構造・読み取れる結論を漏れなく記述した説明文" },
    mermaid: { type: "ARRAY", items: { type: "STRING" }, description: "Mermaid に変換できる図のみ、図ごとの Mermaid コード（``` で囲まない）。変換できない図は含めない" },
    tables: { type: "ARRAY", items: { type: "STRING" }, description: "表形式の図をマークダウン表にしたもの" },
  },
  required: ["description", "mermaid", "tables"],
  propertyOrdering: ["description", "mermaid", "tables"],
};

export const QUESTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          page_number: { type: "INTEGER", description: "この問題の根拠にした教材のページ番号（出典）" },
          question_type: { type: "STRING", enum: ["multiple_choice", "short_answer", "true_false"] },
          question: { type: "STRING" },
          choices: { type: "ARRAY", items: { type: "STRING" }, description: "multiple_choice のときだけ4つ。それ以外は空" },
          answer: { type: "STRING", description: "multiple_choice は正解の選択肢の文字列そのもの、true_false は「○」か「×」、short_answer は模範解答" },
          explanation: { type: "STRING" },
          figure_based: { type: "BOOLEAN", description: "図の内容（説明文・Mermaid・表・画像）を根拠にした問題なら true" },
        },
        required: ["page_number", "question_type", "question", "choices", "answer", "explanation", "figure_based"],
        propertyOrdering: ["page_number", "question_type", "question", "choices", "answer", "explanation", "figure_based"],
      },
    },
  },
  required: ["questions"],
};

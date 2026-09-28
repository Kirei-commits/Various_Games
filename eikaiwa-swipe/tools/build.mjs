/**
 * src/ を1枚の index.html にまとめる（CSS と JS をすべてインライン化）。
 * 出来上がった index.html はサーバー不要で、ブラウザで直接開けば動く。
 *
 *   node tools/build.mjs                      → index.html を更新（src/data/ids.lock.json に新しい問題IDも追記）
 *   node tools/build.mjs --artifact out.html  → Claude の Artifact 用（<html>/<head> なし）も出力
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import * as esbuild from "esbuild";
import { ROOT, sourceHash } from "./source-hash.mjs";
import { updateLock } from "./id-lock.mjs";

const require = createRequire(import.meta.url);

function buildCss() {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "swipetalk-")), "out.css");
  const cli = require.resolve("tailwindcss/lib/cli.js");
  const res = spawnSync(
    process.execPath,
    [cli, "-c", "tailwind.config.cjs", "-i", "src/styles.css", "-o", out, "--minify"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (res.status !== 0) throw new Error(`tailwindcss failed:\n${res.stderr}`);
  return fs.readFileSync(out, "utf8").trim();
}

// Firebase を使わない版では cloud-firebase.js をスタブに差し替え、SDK を丸ごと外す
const stubFirebase = {
  name: "stub-firebase",
  setup(build) {
    build.onResolve({ filter: /[\\/]cloud-firebase\.js$/ }, () => ({ path: path.join(ROOT, "src/cloud-firebase-stub.js") }));
  },
};

async function buildJs({ withCloud }) {
  const result = await esbuild.build({
    plugins: withCloud ? [] : [stubFirebase],
    entryPoints: [path.join(ROOT, "src/main.jsx")],
    bundle: true,
    minify: true,
    write: false,
    format: "iife",
    target: "es2019",
    jsx: "automatic",
    legalComments: "none",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  // インライン <script> を途中で閉じさせない
  return result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").trim();
}

const { default: cloudConfig } = await import(pathToFileURL(path.join(ROOT, "src/cloud-config.js")).href);

// 公開する問題IDを一覧に追記する（source-hash の計算より前に行う）
const { default: rawChapters, RENAMED } = await import(pathToFileURL(path.join(ROOT, "src/data/index.js")).href);
const { buildLibrary } = await import(pathToFileURL(path.join(ROOT, "src/logic.js")).href);
if (updateLock(buildLibrary(rawChapters, { renamed: RENAMED }))) console.log("ids.lock.json に新しい問題IDを追記しました");
const css = buildCss();
const js = await buildJs({ withCloud: cloudConfig != null });
const hash = sourceHash();
const base = "html,body,#root{height:100%;margin:0}body{background:#f1f5f9;color:#0f172a}";

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#4f46e5">
<title>SwipeTalk</title>
<!-- source-hash: ${hash} -->
<!-- このファイルは tools/build.mjs が生成します。直接編集せず src/ を編集して npm run build してください。 -->
<style>${base}${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "index.html"), page);
console.log(`index.html (${(page.length / 1024).toFixed(0)} KB, source-hash ${hash}, クラウド保存: ${cloudConfig ? "あり" : "未設定"})`);

const i = process.argv.indexOf("--artifact");
if (i > 0 && process.argv[i + 1]) {
  // Artifact の外枠が :root を安全領域ぶん余白で囲むので、100dvh ではなく親の高さに合わせる
  // Artifact の中からは外部サービスに接続できないので、常に Firebase なしで出力する
  const artifactJs = cloudConfig != null ? await buildJs({ withCloud: false }) : js;
  const artifact = `<title>SwipeTalk</title>
<style>${base}#root>div{height:100%!important}#root nav{padding-bottom:0!important}${css}</style>
<div id="root"></div>
<script>${artifactJs}</script>
`;
  fs.writeFileSync(path.resolve(process.argv[i + 1]), artifact);
  console.log(`artifact → ${process.argv[i + 1]}`);
}

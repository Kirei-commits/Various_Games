/**
 * Cloudflare に置くファイルだけを .cf-site/ に集める（index.html・audio/・_headers）。
 * 開発用のもの（src/・tests/・node_modules/）を公開しないため、公開する物をここで決める。
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./source-hash.mjs";

const out = path.join(ROOT, ".cf-site");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.copyFileSync(path.join(ROOT, "index.html"), path.join(out, "index.html"));
fs.copyFileSync(path.join(ROOT, "cloudflare/_headers"), path.join(out, "_headers"));
fs.cpSync(path.join(ROOT, "audio"), path.join(out, "audio"), { recursive: true });
fs.writeFileSync(path.join(out, "404.html"), '<!doctype html><meta charset="utf-8"><title>SwipeTalk</title><p>ページが見つかりません。<a href="/">SwipeTalk を開く</a></p>\n');

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
const files = count(out);
console.log(`.cf-site: ${files} ファイル`);
// Cloudflare の無料枠は1回の公開で 20,000 ファイルまで。近づいたら録音を R2 へ移す
if (files > 19000) {
  console.error("ファイル数が Cloudflare の上限（20,000）に近すぎます");
  process.exit(1);
}

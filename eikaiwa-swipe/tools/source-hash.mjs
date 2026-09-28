/**
 * ビルドの入力（src/ と設定・ビルドスクリプト）から決まるハッシュ。
 * build.mjs が index.html に埋め込み、lint.mjs が「index.html が古くないか」を
 * Node の標準機能だけで確かめるのに使う。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INPUTS = ["src", "tailwind.config.cjs", "tools/build.mjs", "tools/source-hash.mjs", "package-lock.json"];

// 画像などはバイト列のままハッシュする（文字として読むと壊れたバイトが同じ文字になり、変更に気づけない）
const BINARY = /\.(webp|png|jpe?g|opus|mp3)$/i;

function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).isDirectory()) {
    return fs
      .readdirSync(abs)
      .sort()
      .flatMap((name) => walk(path.posix.join(rel, name)));
  }
  return [rel];
}

export function sourceHash() {
  const h = crypto.createHash("sha256");
  for (const rel of INPUTS.flatMap(walk)) {
    h.update(rel);
    h.update("\0");
    const abs = path.join(ROOT, rel);
    if (BINARY.test(rel)) h.update(fs.readFileSync(abs));
    // 改行コードの違い（Windows の autocrlf）でハッシュが変わらないようにする
    else h.update(fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

export const HASH_MARKER = /<!-- source-hash: ([0-9a-f]+) -->/;

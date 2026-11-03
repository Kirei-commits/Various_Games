/** index.html に埋め込んだ物理エンジン（<script id="engine">）を Node で読み込む */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function engineSource() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html に <script id="engine"> が無い');
  return m[1];
}

export function loadEngine() {
  const ctx = vm.createContext({});
  vm.runInContext(engineSource(), ctx, { filename: 'index.html#engine' });
  return ctx.CosmoEngine;
}

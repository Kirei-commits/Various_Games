/**
 * src/ を1枚の index.html にまとめる。出来上がりはサーバー不要・ブラウザで直接開いて動く。
 *
 *   node tools/build.mjs          → Vite でビルドし、JS と CSS を埋めこんだ index.html を作る（npm ci が要る）
 *   node tools/build.mjs --check  → index.html が今の src/ から作られたものかを確かめるだけ
 *                                    （依存パッケージなしで動く。合わなければ終了コード1）
 *
 * index.html には src/ の中身から作ったハッシュを埋めてある。src/ を変えたのに
 * ビルドし直していないと、--check（npm run lint）が見つける。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');
const META = /<meta name="react-source-hash" content="([0-9a-f]+)">/;

function listFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full) : [full];
    })
    .sort();
}

/** src/ とビルド設定の中身から作るハッシュ */
export function sourceHash() {
  const h = crypto.createHash('sha256');
  for (const file of [...listFiles(SRC), path.join(ROOT, 'vite.config.ts')]) {
    h.update(path.relative(ROOT, file).split(path.sep).join('/') + '\0');
    h.update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 16);
}

async function build() {
  const hash = sourceHash();
  const { build: viteBuild } = await import('vite');
  await viteBuild({ root: SRC, configFile: path.join(ROOT, 'vite.config.ts'), logLevel: 'warn' });

  const dist = path.join(ROOT, 'dist');
  let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const asset = (ref) => fs.readFileSync(path.join(dist, ref), 'utf8');
  let scripts = 0;
  let styles = 0;
  // 別ファイルの JS と CSS を、ページの中に埋めこむ（file:// で開いても動くようにするため）
  html = html.replace(/<script type="module"[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g, (_, ref) => {
    scripts++;
    return `<script type="module">\n${asset(ref).replace(/<\/script/gi, '<\\/script')}\n</script>`;
  });
  html = html.replace(/<link rel="stylesheet"[^>]*\shref="([^"]+)"[^>]*>/g, (_, ref) => {
    styles++;
    return `<style>\n${asset(ref)}\n</style>`;
  });
  if (scripts !== 1 || styles !== 1) throw new Error(`埋めこみに失敗（script ${scripts}個, style ${styles}個）`);
  if (/\s(?:src|href)="\.\/assets\//.test(html)) throw new Error('埋めこまれていないファイルが残っている');
  html = html.replace(
    '<meta charset="UTF-8" />',
    () =>
      `<meta charset="UTF-8" />\n    <meta name="react-source-hash" content="${hash}">\n    <!-- このファイルは tools/build.mjs が src/ から生成する。直接編集しないこと -->`,
  );
  if (!META.test(html)) throw new Error('ハッシュを埋めこめなかった');
  fs.writeFileSync(OUT, html);
  fs.rmSync(dist, { recursive: true, force: true });
  console.log(`index.html を生成しました（${hash}, ${(html.length / 1024).toFixed(0)}KB）`);
}

function check() {
  const want = sourceHash();
  const have = fs.existsSync(OUT) ? META.exec(fs.readFileSync(OUT, 'utf8'))?.[1] : undefined;
  if (have !== want) {
    console.error(`index.html が src/ と一致しません（index.html: ${have ?? 'なし'}, src: ${want}）。npm run build を実行してコミットしてください`);
    process.exit(1);
  }
  console.log(`index.html は最新です（${want}）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check();
  else await build();
}

/**
 * ZIP の展開。docx / pptx / xlsx はどれも ZIP なので、これが読めれば中身に手が届く。
 *
 * ライブラリは使わない。展開は `DecompressionStream('deflate-raw')` に任せる
 * （2023年以降のブラウザと Node 18+ に標準で入っている）。
 * 自前で DEFLATE を書くより速く、正しく、短い。
 */

const te = new TextDecoder('utf-8');

/** 末尾から End of Central Directory を探す。コメント付きでも見つかるよう後ろから走査する。 */
function findEOCD(view, bytes) {
  const max = Math.min(bytes.length, 0xffff + 22);
  for (let i = 22; i <= max; i++) {
    const at = bytes.length - i;
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  return -1;
}

/**
 * ZIP のエントリ一覧を返す（中身はまだ展開しない）。
 * @returns {Promise<Array<{name:string, size:number, method:number, read:()=>Promise<Uint8Array>}>>}
 */
export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eocd = findEOCD(view, bytes);
  if (eocd < 0) throw new Error('ZIP として読めません（末尾の目録が見つかりません）');

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries = [];

  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = te.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;

    entries.push({
      name, size, method,
      read: () => inflateAt(bytes, view, localAt, method, compressed)
    });
  }
  return entries;
}

/** ローカルヘッダの位置から1ファイルぶんを取り出す */
async function inflateAt(bytes, view, localAt, method, compressed) {
  if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error('ZIP の見出しが壊れています');
  const nameLen = view.getUint16(localAt + 26, true);
  const extraLen = view.getUint16(localAt + 28, true);
  const start = localAt + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + compressed);

  if (method === 0) return raw.slice();                   // 無圧縮
  if (method !== 8) throw new Error(`未対応の圧縮方式です（method=${method}）`);
  return inflateRaw(raw);
}

/** DEFLATE（生）を展開する */
export async function inflateRaw(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** zlib ヘッダつきの DEFLATE（PDF の FlateDecode がこれ） */
export async function inflateZlib(raw) {
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 名前でエントリを引いて、文字列として返す */
export async function readZipText(entries, name) {
  const e = entries.find((x) => x.name === name);
  if (!e) return null;
  return te.decode(await e.read());
}

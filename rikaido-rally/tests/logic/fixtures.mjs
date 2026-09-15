/**
 * テスト用の ZIP / docx / pptx / xlsx をその場で組み立てる。
 * バイナリをリポジトリに置かずに、実物の構造で読み取りを試せるようにするため。
 */
import zlib from 'node:zlib';

const te = new TextEncoder();

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/**
 * ZIP を1つ作る。
 * @param {Array<{name:string, data:string|Uint8Array, store?:boolean}>} files
 *   store:true で無圧縮（method 0）。既定は deflate（method 8）。両方を読めることを確かめたい。
 */
export function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  const push = (arr) => { chunks.push(arr); offset += arr.length; };
  const u16 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  const cat = (...parts) => {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  };

  for (const f of files) {
    const raw = typeof f.data === 'string' ? te.encode(f.data) : f.data;
    const method = f.store ? 0 : 8;
    const body = method === 0 ? raw : new Uint8Array(zlib.deflateRawSync(raw));
    const name = te.encode(f.name);
    const localAt = offset;

    push(cat(u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc32(raw)), u32(body.length), u32(raw.length), u16(name.length), u16(0), name, body));

    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc32(raw)), u32(body.length), u32(raw.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(localAt), name));
  }

  const cdStart = offset;
  for (const c of central) push(c);
  const cdSize = offset - cdStart;
  push(cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdSize), u32(cdStart), u16(0)));

  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}

const wp = (...runs) => `<w:p>${runs.map((t) => `<w:r><w:t>${t}</w:t></w:r>`).join('')}</w:p>`;

export const makeDocx = (paragraphs) => makeZip([
  { name: '[Content_Types].xml', data: '<Types/>' },
  { name: 'word/document.xml', data: `<?xml version="1.0"?><w:document><w:body>${paragraphs.map((p) => wp(p)).join('')}</w:body></w:document>` }
]);

export const makePptx = (slides) => makeZip([
  { name: '[Content_Types].xml', data: '<Types/>' },
  ...slides.map((lines, i) => ({
    name: `ppt/slides/slide${i + 1}.xml`,
    data: `<p:sld><p:cSld><p:spTree>${lines.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:spTree></p:cSld></p:sld>`
  }))
]);

/** 共有文字列表つきの xlsx（実物と同じく、セルは共有表の添字を持つ） */
export function makeXlsx(rows) {
  const shared = [...new Set(rows.flat())];
  const si = shared.map((s) => `<si><t>${s}</t></si>`).join('');
  const sheet = rows.map((row, r) =>
    `<row r="${r + 1}">${row.map((cell, c) =>
      `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="s"><v>${shared.indexOf(cell)}</v></c>`).join('')}</row>`).join('');
  return makeZip([
    { name: '[Content_Types].xml', data: '<Types/>' },
    { name: 'xl/sharedStrings.xml', data: `<sst>${si}</sst>` },
    { name: 'xl/worksheets/sheet1.xml', data: `<worksheet><sheetData>${sheet}</sheetData></worksheet>` }
  ]);
}

/** 任意の文字コードでバイト列を作る（Shift_JIS の資料を読めるかの確認に使う） */
export function encodeIn(label, text) {
  return new Uint8Array(Buffer.from(text, label)).buffer;
}

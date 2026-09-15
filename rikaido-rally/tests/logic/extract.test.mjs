import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, decodeText, garbledRatio, tidy } from '../../js/author/extract.js';
import { readZip } from '../../js/author/unzip.js';
import { makeZip, makeDocx, makePptx, makeXlsx } from './fixtures.mjs';

const utf8 = (s) => new TextEncoder().encode(s).buffer;

test('テキストと Markdown は行の切れ目を保ったまま読む', async () => {
  const got = await extract('a.md', utf8('# 見出し\n\n本文です。\n\n\n\n次の段落。'));
  assert.equal(got.kind, 'markdown');
  assert.equal(got.text, '# 見出し\n\n本文です。\n\n次の段落。');
});

test('HTML はタグを落とし、実体参照を戻す', async () => {
  const got = await extract('a.html', utf8('<h1>題</h1><p>本文&amp;続き</p><script>alert(1)</script>'));
  assert.ok(got.text.includes('本文&続き'));
  assert.ok(!got.text.includes('alert'));
  assert.ok(!got.text.includes('<'));
});

test('JSON は文字列と数値を、キーを添えて拾う', async () => {
  const got = await extract('a.json', utf8('{"用語":"equals","説明":"中身の比較","回数":3}'));
  assert.ok(got.text.includes('用語: equals'));
  assert.ok(got.text.includes('回数: 3'));
});

test('JSON Lines も読める（丸ごとは壊れていても1行ずつ試す）', async () => {
  const got = await extract('a.jsonl', utf8('{"a":"いち"}\n{"a":"に"}'));
  assert.ok(got.text.includes('いち') && got.text.includes('に'));
});

test('CSV と TSV は1行を1文にまとめる', async () => {
  const csv = await extract('a.csv', utf8('用語,意味\nequals,中身の比較'));
  assert.ok(csv.text.includes('equals / 中身の比較'));
  const tsv = await extract('a.tsv', utf8('用語\t意味\nequals\t中身の比較'));
  assert.ok(tsv.text.includes('equals / 中身の比較'));
});

test('Shift_JIS と EUC-JP の資料も読める（文字コードを当てにいく）', async () => {
  // Node の Buffer は sjis / euc-jp を書き出せないので、
  // 「これは日本語の資料です。」のバイト列をそのまま置いている
  const samples = {
    shift_jis: [0x82, 0xb1, 0x82, 0xea, 0x82, 0xcd, 0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea,
      0x82, 0xcc, 0x8e, 0x91, 0x97, 0xbf, 0x82, 0xc5, 0x82, 0xb7, 0x81, 0x42],
    'euc-jp': [0xa4, 0xb3, 0xa4, 0xec, 0xa4, 0xcf, 0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec,
      0xa4, 0xce, 0xbb, 0xf1, 0xce, 0xc1, 0xa4, 0xc7, 0xa4, 0xb9, 0xa1, 0xa3]
  };
  for (const [label, bytes] of Object.entries(samples)) {
    const got = await extract('a.txt', new Uint8Array(bytes).buffer);
    assert.equal(got.text, 'これは日本語の資料です。', `${label} が読めていない`);
    assert.equal(got.encoding, label);
  }
});

test('UTF-8 の BOM は落とす', async () => {
  const got = await extract('a.txt', utf8('﻿ほんぶん'));
  assert.equal(got.text, 'ほんぶん');
});

test('ZIP は無圧縮と deflate の両方を展開できる', async () => {
  const zip = makeZip([
    { name: 'stored.txt', data: 'ちいさい', store: true },
    { name: 'deflated.txt', data: 'おおきい'.repeat(200) }
  ]);
  const entries = await readZip(zip);
  assert.equal(entries.length, 2);
  assert.equal(new TextDecoder().decode(await entries[0].read()), 'ちいさい');
  assert.equal((await entries[1].read()).length, 'おおきい'.repeat(200).length * 3);
});

test('docx は段落ごとに改行して読む（全部が一文につながらない）', async () => {
  const got = await extract('a.docx', makeDocx(['第1章 概要', '本文の一段落目。', '二段落目。']));
  assert.equal(got.kind, 'docx');
  assert.equal(got.text, '第1章 概要\n本文の一段落目。\n二段落目。');
});

test('pptx はスライドの順にテキストを拾う', async () => {
  const got = await extract('a.pptx', makePptx([['表紙', 'サブタイトル'], ['2枚目の見出し']]));
  assert.ok(got.text.includes('表紙'));
  assert.ok(got.text.indexOf('表紙') < got.text.indexOf('2枚目の見出し'));
});

test('xlsx は共有文字列表を引いて、行ごとにまとめる', async () => {
  const got = await extract('a.xlsx', makeXlsx([['用語', '意味'], ['equals', '中身の比較']]));
  assert.ok(got.text.includes('用語 / 意味'));
  assert.ok(got.text.includes('equals / 中身の比較'));
});

test('ZIP にまとめた資料は、読めるものを全部つなげる', async () => {
  const zip = makeZip([
    { name: 'a.md', data: '# 一つ目\n中身A' },
    { name: 'b.txt', data: '中身B' },
    { name: 'c.bin', data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) }
  ]);
  const got = await extract('pack.zip', zip);
  assert.ok(got.text.includes('中身A') && got.text.includes('中身B'));
  assert.ok(got.warnings.some((w) => w.includes('c.bin')), '読めなかったものが警告に出ていない');
});

test('読めないファイルは、黙って空にせず理由を投げる', async () => {
  const binary = new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 7)).buffer;
  await assert.rejects(() => extract('mystery.bin', binary), /読めません|取り出せません/);
});

test('空のファイルは読めたことにしない', async () => {
  await assert.rejects(() => extract('empty.txt', utf8('   \n  ')), /取り出せません/);
});

test('化けの割合と正規化のふるまい', () => {
  assert.equal(garbledRatio(''), 1);
  assert.ok(garbledRatio('\uFFFD\uFFFDああ') > 0.4);
  assert.equal(garbledRatio('ふつうの文'), 0);
  assert.equal(tidy('  a  b  \n\n\n\n c '), 'a b\n\nc');
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x42, 0x00])).encoding, 'utf-16le');
});

test('PDF はテキストを拾えたら返し、拾えなければ理由を警告に残す', async () => {
  // 非圧縮のテキスト描画だけを持つ、最小の PDF
  const pdf = '%PDF-1.4\n1 0 obj<</Length 44>>stream\nBT /F1 12 Tf (Hello PDF world) Tj ET\nendstream endobj\n%%EOF';
  const got = await extract('a.pdf', utf8(pdf));
  assert.ok(got.text.includes('Hello PDF world'));

  await assert.rejects(() => extract('blank.pdf', utf8('%PDF-1.4\n%%EOF')), /取り出せません/);
});

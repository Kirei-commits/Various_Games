import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGA } from './helpers.mjs';

/** 例外を投げる localStorage（プライベートモードの再現） */
function hostileStorage() {
  return {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); }
  };
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    _map: map
  };
}

test('保存できない環境でも既定値で動く', () => {
  const GA = loadGA(['storage.js'], { localStorage: hostileStorage() });
  const data = GA.Store.load();
  assert.equal(data.settings.level, 'normal');
  assert.equal(GA.Store.save({ settings: { level: 'hard' } }).settings.level, 'hard');
});

test('保存した設定が復元される', () => {
  const ls = memoryStorage();
  const a = loadGA(['storage.js'], { localStorage: ls });
  a.Store.save({ settings: { level: 'hard', opponents: 5 } });
  const b = loadGA(['storage.js'], { localStorage: ls });
  const loaded = b.Store.load();
  assert.equal(loaded.settings.level, 'hard');
  assert.equal(loaded.settings.opponents, 5);
});

test('DEFAULTS に無いキーは捨てられる（定義漏れに気づけるように）', () => {
  const ls = memoryStorage();
  ls.setItem('god-arena/v1', JSON.stringify({ settings: { level: 'hard', unknown: 1 } }));
  const GA = loadGA(['storage.js'], { localStorage: ls });
  const loaded = GA.Store.load();
  assert.equal(loaded.settings.level, 'hard');
  assert.equal(loaded.settings.unknown, undefined);
});

test('壊れたJSONが入っていても落ちない', () => {
  const ls = memoryStorage();
  ls.setItem('god-arena/v1', '{壊れている');
  const GA = loadGA(['storage.js'], { localStorage: ls });
  assert.equal(GA.Store.load().settings.opponents, 3);
});

test('型が違う値は既定値に戻す', () => {
  const ls = memoryStorage();
  ls.setItem('god-arena/v1', JSON.stringify({ settings: { opponents: 'たくさん', sound: 'yes' } }));
  const GA = loadGA(['storage.js'], { localStorage: ls });
  const st = GA.Store.load().settings;
  assert.equal(st.opponents, 3);
  assert.equal(st.sound, true);
});

test('UIで選べる設定値はすべて DEFAULTS に定義されている', () => {
  const GA = loadGA(['storage.js'], { localStorage: memoryStorage() });
  for (const key of ['level', 'opponents', 'sound', 'speed', 'autoDefend']) {
    assert.ok(key in GA.Store.DEFAULTS.settings, `${key} が DEFAULTS に無い`);
  }
});

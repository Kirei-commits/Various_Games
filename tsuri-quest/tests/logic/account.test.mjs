import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFQ, fakeStorage, seededRandom } from './helpers.mjs';

const FILES = ['fish.js', 'progress.js', 'angler.js', 'world.js', 'gear.js', 'parts.js',
  'boost.js', 'bonus.js', 'achievements.js', 'storage.js', 'account.js'];
const load = (extra) => loadFQ(FILES, extra === undefined ? { localStorage: fakeStorage() } : extra);
const rnd = () => ({ random: seededRandom(11) });

test('名前とパスワードの検証', () => {
  const { Account } = load();
  assert.ok(Account.validate('', 'password'), '空の名前が通ってしまう');
  assert.ok(Account.validate('   ', 'password'), '空白だけの名前が通ってしまう');
  assert.ok(Account.validate('a'.repeat(17), 'password'), '長すぎる名前が通ってしまう');
  assert.ok(Account.validate('つり', 'abc'), '短いパスワードが通ってしまう');
  assert.ok(Account.validate('つり', 'a'.repeat(33)), '長すぎるパスワードが通ってしまう');
  assert.equal(Account.validate('つり', 'abcd'), null, '正しい入力が弾かれる');
});

test('新規作成するとログイン状態になり、同じ名前は二度作れない', () => {
  const { Account } = load();
  const r = Account.create('たろう', 'himitsu', rnd());
  assert.equal(r.ok, true);
  assert.equal(Account.current(), 'たろう');
  assert.equal(Account.exists('たろう'), true);
  assert.equal(Account.exists('タロウ'), false, '別の表記まで既存扱いになっている');
  assert.equal(Account.exists('TAROU'), false);

  const dup = Account.create('たろう', 'betsu', rnd());
  assert.equal(dup.ok, false);
});

test('名前の大文字小文字と前後の空白は同じものとして扱う', () => {
  const { Account } = load();
  Account.create('  Angler  ', 'himitsu', rnd());
  assert.equal(Account.current(), 'Angler', '前後の空白が落ちていない');
  assert.equal(Account.login('angler', 'himitsu').ok, true, '大文字小文字でログインできない');
  assert.equal(Account.create('ANGLER', 'x1234', rnd()).ok, false, '同じ名前が二重に作れる');
});

test('正しいパスワードでだけログインでき、間違いは弾かれる', () => {
  const { Account } = load();
  Account.create('たろう', 'himitsu', rnd());
  Account.logout();
  assert.equal(Account.current(), null);

  assert.equal(Account.login('たろう', 'chigau').ok, false);
  assert.equal(Account.current(), null, '失敗したのにログインしている');
  assert.equal(Account.login('いない人', 'himitsu').ok, false);

  const ok = Account.login('たろう', 'himitsu');
  assert.equal(ok.ok, true);
  assert.equal(Account.current(), 'たろう');
});

test('パスワードは平文で保存されない', () => {
  const localStorage = fakeStorage();
  const { Account } = load({ localStorage });
  Account.create('たろう', 'ThisIsMyPassword', rnd());
  let dump = '';
  localStorage._map.forEach((v) => { dump += v; });
  assert.ok(dump.length > 0, '何も保存されていない');
  assert.equal(dump.includes('ThisIsMyPassword'), false, 'パスワードがそのまま保存されている');
});

test('同じパスワードでも利用者ごとにハッシュが変わる（ソルトが効いている）', () => {
  const localStorage = fakeStorage();
  const { Account } = load({ localStorage });
  Account.create('あ', 'samepass', { random: seededRandom(1) });
  Account.create('い', 'samepass', { random: seededRandom(2) });
  const data = JSON.parse(localStorage._map.get('tsuri-quest/accounts/v1'));
  assert.notEqual(data.users['あ'].hash, data.users['い'].hash);
});

test('セーブはアカウントごとに分かれる', () => {
  const { Account, Store } = load();
  Account.create('A', 'passA', rnd());
  const a = Store.defaults();
  a.xp = 1000;
  Account.save(a);

  Account.create('B', 'passB', rnd());
  assert.equal(Account.load(), null, '新しいアカウントに他人のデータが見えている');
  const b = Store.defaults();
  b.xp = 5;
  Account.save(b);

  Account.login('A', 'passA');
  assert.equal(Store.fromSaved(Account.load()).xp, 1000);
  Account.login('B', 'passB');
  assert.equal(Store.fromSaved(Account.load()).xp, 5);
});

test('保存したデータは読み直しても残る', () => {
  const localStorage = fakeStorage();
  const first = load({ localStorage });
  first.Account.create('たろう', 'himitsu', rnd());
  const st = first.Store.defaults();
  st.xp = 777;
  st.dex.aji = { count: 1, maxSize: 20, bestPoints: 10, firstAt: 1 };
  first.Account.save(st);

  // 別のモジュール読み込み＝ページを開き直した状態
  const second = load({ localStorage });
  assert.equal(second.Account.current(), 'たろう', 'ログイン状態が続いていない');
  const back = second.Store.fromSaved(second.Account.load());
  assert.equal(back.xp, 777);
  assert.equal(back.dex.aji.count, 1);
});

test('バックアップコードで別の環境へ持ち出せる', () => {
  const source = load();
  source.Account.create('たろう', 'himitsu', rnd());
  const st = source.Store.defaults();
  st.xp = 4242;
  st.coins = 99;
  source.Account.save(st);
  const code = source.Account.backupCode();
  assert.ok(code && code.length > 20);

  // まったく別の端末（別の localStorage）
  const other = load();
  assert.equal(other.Account.exists('たろう'), false);
  const r = other.Account.restore(code);
  assert.equal(r.ok, true);
  assert.equal(other.Account.current(), 'たろう');
  assert.equal(other.Store.fromSaved(other.Account.load()).xp, 4242);
  // 元のパスワードがそのまま使える
  other.Account.logout();
  assert.equal(other.Account.login('たろう', 'himitsu').ok, true);
});

test('日本語や記号を含む名前でもバックアップコードが壊れない', () => {
  const source = load();
  source.Account.create('海の主🐟', 'ぱすわーど', rnd());
  const st = source.Store.defaults();
  st.xp = 12;
  source.Account.save(st);
  const other = load();
  const r = other.Account.restore(source.Account.backupCode());
  assert.equal(r.ok, true);
  assert.equal(other.Account.current(), '海の主🐟');
  assert.equal(other.Account.login('海の主🐟', 'ぱすわーど').ok, true);
});

test('既存の名前へ復元するには上書きの明示が要る', () => {
  const source = load();
  source.Account.create('たろう', 'himitsu', rnd());
  const code = source.Account.backupCode();

  const other = load();
  other.Account.create('たろう', 'betsupass', rnd());
  const blocked = other.Account.restore(code);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, 'exists');

  const forced = other.Account.restore(code, { overwrite: true });
  assert.equal(forced.ok, true);
  assert.equal(other.Account.login('たろう', 'himitsu').ok, true, '上書き後は元のパスワードになる');
});

test('壊れたバックアップコードは読み取れないと返す（例外を投げない）', () => {
  const { Account } = load();
  for (const bad of ['', 'これはコードではない', 'YWJj', '!!!!']) {
    const r = Account.restore(bad);
    assert.equal(r.ok, false, `${bad} が通ってしまう`);
    assert.ok(r.error);
  }
});

test('localStorage が使えなくてもアカウントは作れる（閉じると消える）', () => {
  const { Account, Store } = load({ localStorage: fakeStorage(['get', 'set', 'remove']) });
  const r = Account.create('たろう', 'himitsu', rnd());
  assert.equal(r.ok, true, '保存できない環境で作成が失敗している');
  assert.equal(Account.current(), 'たろう');
  assert.equal(Account.persistent(), false, '保存できないことを申告していない');
  const st = Store.defaults();
  st.xp = 5;
  Account.save(st);
  assert.equal(Store.fromSaved(Account.load()).xp, 5, 'その場では続きが遊べない');
});

test('データの削除にはパスワードが要る', () => {
  const { Account } = load();
  Account.create('たろう', 'himitsu', rnd());
  assert.equal(Account.remove('たろう', 'chigau').ok, false);
  assert.equal(Account.exists('たろう'), true);
  assert.equal(Account.remove('たろう', 'himitsu').ok, true);
  assert.equal(Account.exists('たろう'), false);
  assert.equal(Account.current(), null);
});

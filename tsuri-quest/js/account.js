/**
 * セーブデータのアカウント管理（名前＋パスワードでスロットを分ける）。
 *
 * ⚠ これは「暗号による保護」ではない。
 *   データは端末の localStorage にあり、パスワードは**セーブスロットの取り違えを
 *   防ぐための鍵**でしかない。開発者ツールを開けば中身は読める。
 *   本当に守る必要があるものをここに入れないこと。
 *
 * また、保存先が端末である以上、**別の端末やブラウザにはデータは移らない**。
 * そのためにバックアップコード（エクスポート／インポート）を用意している。
 * 新規作成の直後に、名前・パスワード・バックアップコードを控えてもらう。
 */
(function (global) {
  'use strict';

  var KEY = 'tsuri-quest/accounts/v1';
  var NAME_MAX = 16;
  var PASS_MIN = 4;
  var PASS_MAX = 32;

  // localStorage が使えない環境（プライベートモード等）でもゲームは動かす。
  // その場合はこのメモリ上の入れ物に置くだけで、閉じると消える。
  var memory = null;
  var storageOk = true;

  function read() {
    if (memory) return memory;
    var raw = null;
    try {
      raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
      if (!global.localStorage) storageOk = false;
    } catch (e) { storageOk = false; raw = null; }
    var data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
    if (!data || typeof data !== 'object' || !data.users) {
      data = { version: 1, users: {}, current: null };
    }
    memory = data;
    return data;
  }

  function write() {
    var data = read();
    try {
      if (!global.localStorage) { storageOk = false; return false; }
      global.localStorage.setItem(KEY, JSON.stringify(data));
      storageOk = true;
      return true;
    } catch (e) { storageOk = false; return false; }
  }

  function keyOf(name) { return String(name == null ? '' : name).trim().toLowerCase(); }

  /**
   * ソルト付きの簡易ハッシュ。暗号強度はない（上のコメントのとおり）。
   * 外部ライブラリも SubtleCrypto も使わないのは、file:// で直接開いた場合に
   * crypto.subtle が使えない（セキュアコンテキストでない）ため。
   */
  function hash(password, salt) {
    var s = salt + '|' + password + '|' + salt;
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var round = 0; round < 64; round++) {
      for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i) + round;
        h1 = (h1 ^ c) >>> 0;
        h1 = Math.imul(h1, 16777619) >>> 0;
        h2 = (h2 + Math.imul(h1 ^ c, 2654435761)) >>> 0;
      }
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  function makeSalt(rng) {
    var r = rng || Math.random;
    var out = '';
    for (var i = 0; i < 4; i++) out += ('0000' + Math.floor(r() * 65536).toString(16)).slice(-4);
    return out;
  }

  // ── バックアップコード用の base64（btoa に依存しない自前実装）
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xc0 | c >> 6, 0x80 | c & 63); }
      else if (c >= 0xd800 && c < 0xdc00) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(0xf0 | cp >> 18, 0x80 | cp >> 12 & 63, 0x80 | cp >> 6 & 63, 0x80 | cp & 63);
      } else { out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63); }
    }
    return out;
  }

  function bytesToStr(bytes) {
    var out = '', i = 0;
    while (i < bytes.length) {
      var b = bytes[i++];
      if (b < 0x80) out += String.fromCharCode(b);
      else if (b < 0xe0) out += String.fromCharCode((b & 31) << 6 | bytes[i++] & 63);
      else if (b < 0xf0) out += String.fromCharCode((b & 15) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63);
      else {
        var cp = (b & 7) << 18 | (bytes[i++] & 63) << 12 | (bytes[i++] & 63) << 6 | bytes[i++] & 63;
        cp -= 0x10000;
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
      }
    }
    return out;
  }

  function encode(obj) {
    var b = utf8Bytes(JSON.stringify(obj)), out = '';
    for (var i = 0; i < b.length; i += 3) {
      var n = b[i] << 16 | (b[i + 1] || 0) << 8 | (b[i + 2] || 0);
      out += B64[n >> 18 & 63] + B64[n >> 12 & 63] +
        (i + 1 < b.length ? B64[n >> 6 & 63] : '=') +
        (i + 2 < b.length ? B64[n & 63] : '=');
    }
    return out;
  }

  function decode(code) {
    var s = String(code || '').replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
    if (!s) return null;
    var bytes = [];
    for (var i = 0; i < s.length; i += 4) {
      var n = 0, take = 0;
      for (var j = 0; j < 4; j++) {
        var idx = i + j < s.length ? B64.indexOf(s[i + j]) : -1;
        n = n << 6 | (idx < 0 ? 0 : idx);
        if (idx >= 0) take++;
      }
      bytes.push(n >> 16 & 255);
      if (take > 2) bytes.push(n >> 8 & 255);
      if (take > 3) bytes.push(n & 255);
    }
    try { return JSON.parse(bytesToStr(bytes)); } catch (e) { return null; }
  }

  // ── 公開API

  function validate(name, password) {
    var n = String(name == null ? '' : name).trim();
    if (!n) return '名前を入れてください';
    if (n.length > NAME_MAX) return '名前は' + NAME_MAX + '文字までです';
    var p = String(password == null ? '' : password);
    if (p.length < PASS_MIN) return 'パスワードは' + PASS_MIN + '文字以上にしてください';
    if (p.length > PASS_MAX) return 'パスワードは' + PASS_MAX + '文字までです';
    return null;
  }

  function list() {
    var users = read().users, out = [];
    for (var k in users) out.push({ name: users[k].name, createdAt: users[k].createdAt });
    out.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return out;
  }

  function exists(name) { return !!read().users[keyOf(name)]; }

  function create(name, password, opts) {
    var err = validate(name, password);
    if (err) return { ok: false, error: err };
    var k = keyOf(name);
    if (read().users[k]) return { ok: false, error: 'その名前はすでに使われています' };
    var salt = makeSalt(opts && opts.random);
    var data = read();
    data.users[k] = {
      name: String(name).trim(),
      salt: salt,
      hash: hash(password, salt),
      createdAt: (opts && opts.now) || Date.now(),
      save: null
    };
    data.current = k;
    write();
    return { ok: true, name: data.users[k].name };
  }

  function login(name, password) {
    var err = validate(name, password);
    if (err) return { ok: false, error: err };
    var data = read();
    var u = data.users[keyOf(name)];
    if (!u) return { ok: false, error: 'その名前のデータがありません' };
    if (hash(password, u.salt) !== u.hash) return { ok: false, error: 'パスワードが違います' };
    data.current = keyOf(name);
    write();
    return { ok: true, name: u.name };
  }

  function current() {
    var data = read();
    var u = data.current && data.users[data.current];
    return u ? u.name : null;
  }

  function logout() {
    var data = read();
    data.current = null;
    write();
  }

  function saveState(state) {
    var data = read();
    var u = data.current && data.users[data.current];
    if (!u) return false;
    u.save = state;
    return write();
  }

  function loadState() {
    var data = read();
    var u = data.current && data.users[data.current];
    return u ? u.save : null;
  }

  function remove(name, password) {
    var r = login(name, password);
    if (!r.ok) return r;
    var data = read();
    delete data.users[keyOf(name)];
    data.current = null;
    write();
    return { ok: true };
  }

  /** 現在のアカウントを丸ごと文字列にする。別の端末やブラウザへ持ち出す用。 */
  function backupCode() {
    var data = read();
    var u = data.current && data.users[data.current];
    if (!u) return null;
    return encode({ v: 1, n: u.name, s: u.salt, h: u.hash, d: u.save });
  }

  /**
   * バックアップコードから復元する。同じ名前があれば上書きするか尋ねる必要があるので、
   * overwrite を明示的に渡させる。パスワードは元のものがそのまま使える。
   */
  function restore(code, opts) {
    var obj = decode(code);
    if (!obj || obj.v !== 1 || !obj.n || !obj.s || !obj.h) {
      return { ok: false, error: 'バックアップコードを読み取れません' };
    }
    var data = read();
    var k = keyOf(obj.n);
    if (data.users[k] && !(opts && opts.overwrite)) {
      return { ok: false, error: 'exists', name: obj.n };
    }
    data.users[k] = {
      name: obj.n, salt: obj.s, hash: obj.h,
      createdAt: Date.now(), save: obj.d || null
    };
    data.current = k;
    write();
    return { ok: true, name: obj.n };
  }

  global.FQ = global.FQ || {};
  global.FQ.Account = {
    NAME_MAX: NAME_MAX, PASS_MIN: PASS_MIN, PASS_MAX: PASS_MAX,
    validate: validate,
    list: list, exists: exists,
    create: create, login: login, logout: logout, current: current, remove: remove,
    save: saveState, load: loadState,
    backupCode: backupCode, restore: restore,
    persistent: function () { read(); return storageOk; },
    /** テスト用: メモリ上のキャッシュを捨てて読み直す。 */
    _reset: function () { memory = null; storageOk = true; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

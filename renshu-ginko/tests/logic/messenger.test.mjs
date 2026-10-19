// メッセンジャー: 部屋・発言の種類・ルールの返事（決まった結果）・LLM への頼み方とグループの返事の読み方・せりふの中身
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const M = RGA.messenger;
const H = RGA.hack;
const INTENTS = ['open', 'greet', 'thanks', 'sorry', 'tired', 'food', 'hobby', 'tech', 'work', 'praise', 'question', 'default'];
const names = { player: 'テスト新人' };

test('話せる登場人物には全員、全部の種類のせりふがある。{名前} は登場人物の id だけ', () => {
  const st = RGA.store.defaultState();
  st.work = { ...RGA.work.emptyProgress(), week: 24 };
  const dms = M.roomsFor(st).filter((r) => r.kind === 'dm');
  assert.ok(dms.length >= 30);
  for (const r of dms) {
    const lines = M.LINES[r.char];
    assert.ok(lines, r.char + ' のせりふがない');
    for (const k of INTENTS) {
      assert.ok(Array.isArray(lines[k]) && lines[k].length, r.char + ' の ' + k);
      for (const line of lines[k]) {
        assert.equal(typeof line, 'string');
        assert.ok(line.trim().length > 0 && line.length <= 200, r.char + ' ' + k + ': ' + line);
        for (const m of line.matchAll(/\{(\w+)\}/g)) assert.ok(H.CAST_BY_ID[m[1]], r.char + ' の不明な名前 ' + m[0]);
        assert.doesNotMatch(line, /恋愛|ライバル|パスワード|API ?キー/, r.char + ': ' + line);
      }
    }
  }
  // 上司は「くん」付けで呼ぶ
  for (const id of ['shiraishi', 'kumagai']) {
    const all = Object.values(M.LINES[id]).flat().join('\n');
    assert.doesNotMatch(all, /\{player\}(?!くん)/, id);
  }
});

test('部屋: グループと個別。新井さんは配属先の第18週から。関係者（stake）とは話せない', () => {
  const st = RGA.store.defaultState();
  const rooms = M.roomsFor(st);
  assert.ok(rooms.some((r) => r.id === 'g-daily' && r.members.join() === 'kujo,himuro,kasuga,onizuka'));
  assert.ok(!rooms.some((r) => r.id === 'dm-arai'));
  assert.ok(!M.roomOf(st, 'g-work').members.includes('arai'));
  assert.ok(!rooms.some((r) => r.id === 'dm-legal' || r.id === 'dm-player'));
  st.work = { ...RGA.work.emptyProgress(), week: 18 };
  assert.ok(M.roomOf(st, 'dm-arai'));
  assert.ok(M.roomOf(st, 'g-work').members.includes('arai'));
  assert.equal(M.roomOf(st, 'nope'), null);
  assert.equal(M.roomName(M.roomOf(st, 'dm-rio'), { rio: '仮名 太郎' }), '仮名 太郎');
  for (const gr of M.GROUPS) for (const id of gr.members) assert.ok(H.CAST_BY_ID[id], gr.id + ' ' + id);
});

test('発言の種類を言葉から見分ける（英字は単語の一部に反応しない）', () => {
  assert.equal(M.intentOf('おはよう！'), 'greet');
  assert.equal(M.intentOf('昨日はありがとう'), 'thanks');
  assert.equal(M.intentOf('遅れてごめん'), 'sorry');
  assert.equal(M.intentOf('今日はもう疲れた…'), 'tired');
  assert.equal(M.intentOf('ラーメン行かない？'), 'food');
  assert.equal(M.intentOf('週末なにしてた'), 'hobby');
  assert.equal(M.intentOf('React の useEffect が分からない'), 'tech');
  assert.equal(M.intentOf('見積もりの相談'), 'work');
  assert.equal(M.intentOf('さすがだね'), 'praise');
  assert.equal(M.intentOf('最近どう？'), 'question');
  assert.equal(M.intentOf('へえ'), 'default');
  assert.equal(M.intentOf('maybe'), 'default');
  assert.equal(M.intentOf('AI って'), 'tech');
});

test('ルールの返事は同じ発言・同じ回数なら同じ。グループは名前を呼ばれた人が答える', () => {
  const st = RGA.store.defaultState();
  const dm = M.roomOf(st, 'dm-kasuga');
  const a = M.ruleReplies(dm, '今日飲みに行こう', 3, names);
  assert.deepEqual(a, M.ruleReplies(dm, '今日飲みに行こう', 3, names));
  assert.equal(a[0].who, 'kasuga');
  assert.ok(M.LINES.kasuga.food.includes(a[0].text));
  const gr = M.roomOf(st, 'g-daily');
  const r = M.ruleReplies(gr, '氷室、これどう思う？', 1, names);
  assert.equal(r[0].who, 'himuro');
  assert.deepEqual(M.mentioned(gr, '九条と鬼塚いる？', names), ['kujo', 'onizuka']);
  // 呼ばれなければ1〜2人。重ならない
  for (let n = 0; n < 20; n++) {
    const rs = M.ruleReplies(gr, 'みんな元気？', n, names);
    assert.ok(rs.length >= 1 && rs.length <= 2);
    assert.equal(new Set(rs.map((x) => x.who)).size, rs.length);
    for (const x of rs) assert.ok(gr.members.includes(x.who));
  }
  // せりふのない人は決まった返事
  assert.ok(M.ruleReply('nobody', 'へえ', 0).length > 0);
});

test('保存の形: はじめて開くと相手のひとことが入る。100件まで。送った数を数える', () => {
  const st = RGA.store.defaultState();
  const dm = M.roomOf(st, 'dm-rio');
  let mp = M.ensureOpened(undefined, dm, 1);
  assert.equal(M.logOf(mp, 'dm-rio')[0].who, 'rio');
  assert.equal(M.ensureOpened(mp, dm, 2), mp);
  const gr = M.roomOf(st, 'g-team');
  mp = M.ensureOpened(mp, gr, 3);
  assert.equal(M.logOf(mp, 'g-team').length, 2);
  for (let i = 0; i < 120; i++) mp = M.append(mp, 'dm-rio', [{ who: 'player', text: 'x' + i }], i);
  assert.equal(M.logOf(mp, 'dm-rio').length, M.MAX_LOG);
  assert.equal(M.sentCount(mp, 'dm-rio'), 100);
  assert.equal(M.totalSent(mp), 100);
  assert.equal(M.totalSent(undefined), 0);
});

test('LLM への頼み方: 個別は人物のプロンプト＋会話（user から、同じ役は1つにまとめる）。グループは JSON の配列で頼む', () => {
  const st = RGA.store.defaultState();
  const dm = M.roomOf(st, 'dm-mizuno');
  const log = [{ who: 'mizuno', text: 'どうした？' }, { who: 'player', text: 'あの' }, { who: 'player', text: '設計の相談です' }];
  const req = M.llmRequest(dm, log, names, H.SPRINTS[0]);
  assert.match(req.system, /水野/);
  assert.match(req.system, /配属先/);
  assert.match(req.system, /LINE/);
  assert.deepEqual(req.messages, [{ role: 'user', content: 'あの\n設計の相談です' }]);
  const boss = M.llmRequest(M.roomOf(st, 'dm-shiraishi'), [{ who: 'player', text: 'こんにちは' }, { who: 'shiraishi', text: '{player}くん、どうしたの？' }, { who: 'player', text: '相談が' }], names, null);
  assert.equal(boss.messages[1].content, 'テスト新人くん、どうしたの？');
  assert.doesNotMatch(boss.system, /配属先（スマホ/);
  const gr = M.roomOf(st, 'g-daily');
  const greq = M.llmRequest(gr, [{ who: 'kasuga', text: 'お昼どうする？' }, { who: 'player', text: '{kujo}も行く？' }], names, null);
  assert.match(greq.system, /JSON の配列/);
  assert.match(greq.system, /- himuro: 氷室 蓮/);
  assert.match(greq.system, /恋愛やライバル/);
  assert.equal(greq.messages.length, 1);
  assert.match(greq.messages[0].content, /春日 ゆず（kasuga）: お昼どうする？\nテスト新人: 九条 学も行く？/);
  const withSprint = M.llmRequest(gr, [{ who: 'player', text: 'やあ' }], names, H.SPRINTS[0]);
  assert.match(withSprint.system, /スプリント1/);
});

test('グループの返事を読む: 前後の文やコードの囲みがあっても読む。参加者以外・空の発言は捨てる。読めなければ null', () => {
  const members = ['kujo', 'himuro'];
  assert.deepEqual(M.parseGroupReply('はい\n```json\n[{"who":"kujo","text":" 行く！ "},{"who":"rio","text":"x"},{"who":"himuro","text":""}]\n```', members), [{ who: 'kujo', text: '行く！' }]);
  assert.equal(M.parseGroupReply('ふつうの文', members), null);
  assert.equal(M.parseGroupReply('[こわれた', members), null);
  assert.equal(M.parseGroupReply('[1, 2]', members), null);
  assert.equal(M.parseGroupReply('{"a": [1]}', members), null);
  assert.equal(M.parseGroupReply('[{"who":"kujo","text":"' + 'あ'.repeat(500) + '"}]', members)[0].text.length, 400);
  const many = JSON.stringify(Array.from({ length: 6 }, () => ({ who: 'kujo', text: 'a' })));
  assert.equal(M.parseGroupReply(many, members).length, 4);
});

test('個別の部屋で話すと絆が深まり、20回話しかけると称号「話し好き」', () => {
  const st = RGA.store.defaultState();
  const before = RGA.bonds.bondPoints(st, 'kasuga');
  let mp = M.empty();
  for (let i = 0; i < 20; i++) mp = M.append(mp, 'dm-kasuga', [{ who: 'player', text: 'やあ' + i }], i);
  st.messenger = mp;
  assert.equal(RGA.bonds.bondPoints(st, 'kasuga'), before + 5);
  assert.ok(RGA.journey.earnedTitles(st, '2026-10-19').includes('chatter'));
});

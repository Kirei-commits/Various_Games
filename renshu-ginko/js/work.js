/*
 * 配属先モード（実案件）: 練習銀行のスマホアプリを運用しながら、開発チームを運営する。1ターン = 1週間、全24週。
 * ハッカソン（開発を学ぶ）と同時並行で、ここでは「仕事の進め方」を学ぶ。ゲームオーバーはなく、結果は数字で返ってくる。
 * 純粋。乱数は使わず、週の番号から決まる値で障害の有無を決める（同じ選び方なら同じ結果）。
 *
 * 週       { no, title, skill, briefing: [[話し手, せりふ]], task: 問題, retro: [[話し手, せりふ]], incident?: 問題 }
 *            skill は学ぶ「仕事の進め方」（報連相・ヒアリング・見積もり・会議 など）。incident は台本で決まった障害
 * 障害     問題（fix の code をログにして原因の行と対処を選ぶ／order で対応の順番／talk）。INCIDENTS は抽選で起きる障害
 * 問題の形と採点はハッカソン（js/hackathon.js）と同じ。order（順番に並べる）も使える
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const H = RGA.hack;

  const TOTAL_WEEKS = 24;
  const CAPACITY = 10; // チームが1週間に使える力（ポイント）
  const ALLOC = [
    { id: 'feature', name: '新機能', icon: '✨', desc: '利用者が増える。負債もたまる' },
    { id: 'quality', name: '品質・負債の返済', icon: '🧹', desc: '評価が上がり、負債が減る' },
    { id: 'ops', name: '運用・監視の改善', icon: '📡', desc: '障害が起きにくくなり、費用も下がる' },
    { id: 'care', name: '休息・育成', icon: '☕', desc: 'チームの体力が戻る' },
  ];
  const METRICS = [
    { id: 'users', name: '利用者数', unit: '人' },
    { id: 'rating', name: 'アプリの評価', unit: '★' },
    { id: 'debt', name: '技術的負債', unit: '' },
    { id: 'stamina', name: 'チームの体力', unit: '' },
    { id: 'trust', name: '社内の信頼', unit: '' },
    { id: 'cost', name: '運用費', unit: '万円/月' },
  ];
  const START = { users: 50000, rating: 3.6, debt: 30, stamina: 80, trust: 50, cost: 100 };

  const WEEKS = [];
  const INCIDENTS = [];
  function addWeeks(list) {
    for (const w of list) {
      const i = WEEKS.findIndex((x) => x.no === w.no);
      if (i >= 0) WEEKS[i] = w;
      else WEEKS.push(w);
    }
    WEEKS.sort((a, b) => a.no - b.no);
  }
  function addIncidents(list) { for (const p of list) INCIDENTS.push(p); }
  const weekOf = (no) => WEEKS.find((w) => w.no === no) || null;
  function findProblem(id) {
    for (const w of WEEKS) for (const p of [w.task, w.incident].filter(Boolean)) if (p.id === id) return { week: w, problem: p };
    const p = INCIDENTS.find((x) => x.id === id);
    return p ? { week: null, problem: p } : null;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round1 = (v) => Math.round(v * 10) / 10;
  // 文字列から 0〜1 の決まった値を作る（FNV-1a）
  function hash01(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return (h % 10000) / 10000;
  }

  function emptyProgress() {
    return { week: 1, phase: 'plan', metrics: { ...START }, alloc: { feature: 4, quality: 3, ops: 2, care: 1 }, history: [], solved: {}, work: {}, incident: null, event: null };
  }
  function validAlloc(a) {
    const vals = ALLOC.map((x) => a && a[x.id]);
    return vals.every((v) => Number.isInteger(v) && v >= 0) && vals.reduce((s, v) => s + v, 0) === CAPACITY;
  }

  // 障害の起きやすさ: 負債が多いほど高く、運用・監視に力を入れるほど低い。体力が落ちるとミスが増える
  function incidentRisk(m, a) {
    return clamp(0.05 + m.debt / 150 - a.ops * 0.04 + (m.stamina < 40 ? 0.1 : 0), 0.02, 0.6);
  }
  // その週に起きる障害（台本の障害が優先。なければ週の番号から決まる値で抽選）
  function rollIncident(no, m, a) {
    const w = weekOf(no);
    if (w && w.incident) return w.incident.id;
    if (!INCIDENTS.length) return null;
    if (hash01('incident-' + no) >= incidentRisk(m, a)) return null;
    return INCIDENTS[Math.floor(hash01('pick-' + no) * INCIDENTS.length)].id;
  }

  /**
   * 1週間を進める。outcome: { event: 'self' | 'revealed', incident: null | 'self' | 'revealed' }
   * 戻り値: { metrics, deltas, notes }
   */
  function simulateWeek(m, a, outcome) {
    const o = outcome || {};
    const notes = [];
    const tired = m.stamina < 30;
    const eff = tired ? 0.6 : 1;
    if (tired) notes.push('チームの体力が落ちていて、思うように進みませんでした（新機能の効果 6割）');
    const n = { ...m };
    const inc = o.incident;
    n.users = Math.round(m.users + a.feature * 350 * eff * (m.rating / 4) - (inc === 'revealed' ? 1500 : inc === 'self' ? 400 : 0));
    n.rating = round1(clamp(m.rating + 0.02 * a.feature * eff + 0.03 * a.quality - (m.debt > 60 ? 0.05 : 0) - (inc === 'revealed' ? 0.15 : inc === 'self' ? 0.05 : 0), 1, 5));
    n.debt = Math.round(clamp(m.debt + a.feature * 1.6 - a.quality * 3 - a.ops * 0.5, 0, 100));
    n.stamina = Math.round(clamp(m.stamina + a.care * 5 - (a.feature + a.quality + a.ops) * 1.5 - (inc ? 5 : 0), 0, 100));
    n.trust = Math.round(clamp(m.trust + (o.event === 'self' ? 4 : o.event === 'revealed' ? 1 : 0) + (inc === 'self' ? 3 : inc === 'revealed' ? -2 : 0), 0, 100));
    n.cost = Math.round(clamp(m.cost + a.feature * 0.8 - a.ops * 1.2, 60, 200));
    if (m.debt > 60) notes.push('負債が多く、アプリの評価がじわじわ下がっています');
    if (inc === 'self') notes.push('障害を自分たちで素早く突き止め、影響を小さく抑えました');
    if (inc === 'revealed') notes.push('障害の原因の特定に時間がかかり、お客さまへの影響が広がりました');
    const deltas = Object.fromEntries(Object.keys(n).map((k) => [k, round1(n[k] - m[k])]));
    return { metrics: n, deltas, notes };
  }

  // 週の終わりの上司のひとこと（数字を見て、いちばん大事なことを1つだけ）
  function bossComment(m, deltas, a) {
    if (m.stamina < 30) return ['kumagai', 'みんな疲れてるねぇ。来週は「休息・育成」に厚めに振ろう。人が倒れたら、アプリも守れないからさ〜。'];
    if (m.debt > 60) return ['shiraishi', '負債がかなりたまってきたね。新機能を止めてでも返す週を作ろう。説明は私も一緒にするから、{player}くんから提案してみて。'];
    if (deltas.rating < 0) return ['shiraishi', '評価が下がったね。数字は責めるためじゃなくて、次に何をするか決めるためにあるの。原因を一緒に見よう。'];
    if (a.care === 0 && m.stamina < 60) return ['kumagai', '休みのない週が続いてるよ〜。真面目なのはいいけど、走り続けると転ぶからね。'];
    if (deltas.users > 1500) return ['kumagai', '利用者がぐっと伸びたねぇ！ いい週だった。こういうときほど、障害に備えておこう。'];
    return ['shiraishi', '安定した1週間だったね。地味だけど、それがいちばん大事なこと。おつかれさま、{player}くん。'];
  }

  // 1年目の評価（24週を終えたとき）
  function annualReview(p) {
    const m = p.metrics;
    const self = Object.values(p.solved).filter((x) => !x.revealed).length;
    const total = Object.keys(p.solved).length;
    const score = (m.users - START.users) / 1000 + (m.rating - START.rating) * 20 + (m.trust - START.trust) / 2 + (60 - m.debt) / 4 + (m.stamina - 50) / 5;
    const grade = score >= 40 ? 'S' : score >= 25 ? 'A' : score >= 10 ? 'B' : 'C';
    return { grade, score: Math.round(score), self, total };
  }

  RGA.work = { TOTAL_WEEKS, CAPACITY, ALLOC, METRICS, START, WEEKS, INCIDENTS, addWeeks, addIncidents, weekOf, findProblem, hash01, emptyProgress, validAlloc, incidentRisk, rollIncident, simulateWeek, bossComment, annualReview, grade: (p, w) => H.grade(p, w), answerWork: (p) => H.answerWork(p) };
})(globalThis);

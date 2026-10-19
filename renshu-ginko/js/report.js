/*
 * メンター用の学習レポート（FR-140 の静的版）。
 * 学習データはブラウザの中だけにあるので（Q-12）、学習者が自分でレポートを書き出し、メンターに渡す。
 * メンターは受け取ったファイルを読み込んで見る（自分の学習データには混ぜない）。
 * 入れるのは進み具合の数と状態だけ。会話・振り返りの本文・AI とのやりとり・API キーは入れない。純粋。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const FORMAT = 'renshu-ginko-report';
  const VERSION = 1;

  function buildReport(state, time) {
    const H = RGA.hack;
    const T = RGA.texts;
    const W = RGA.work;
    const C = RGA.challenge;
    const units = Object.values(state.enrollments || {});
    const hp = state.hack || H.emptyProgress();
    const solved = Object.values(hp.solved || {});
    const tp = state.texts || T.emptyProgress();
    const wp = state.work || W.emptyProgress();
    const rec = state.challenge || C.emptyRecords();
    const today = new Date(time).toISOString().slice(0, 10);
    return {
      format: FORMAT,
      version: VERSION,
      generatedAt: new Date(time).toISOString(),
      learner: (state.user && state.user.name) || '',
      units: {
        done: units.filter((e) => e.status === 'done').map((e) => e.unitId).sort(),
        inProgress: units.filter((e) => e.status !== 'done').map((e) => e.unitId).sort(),
        gateFirstTry: units.filter((e) => e.gate && e.gate.passed && e.gate.firstTry).length,
      },
      hackathon: {
        sprint: H.unlockedUpTo(hp),
        total: H.TOTAL_SPRINTS,
        released: H.released(hp),
        solvedSelf: solved.filter((x) => !x.revealed).length,
        solvedRevealed: solved.filter((x) => x.revealed).length,
        consulted: Object.values(hp.consulted || {}).filter(Boolean).length,
      },
      texts: T.COURSES.map((c) => {
        const st = T.courseStatus(tp, c);
        const badges = c.chapters.map((ch) => T.badgeOf(tp, ch)).filter(Boolean);
        return { id: c.id, name: c.name, chapters: st.chapters, chapterCount: st.count, solved: st.done, total: st.total, gold: badges.filter((b) => b.gold).length };
      }),
      work: {
        week: wp.week,
        total: W.TOTAL_WEEKS,
        done: wp.phase === 'done',
        metrics: { ...wp.metrics },
        incidentsSelf: (wp.history || []).filter((h) => h.incident && h.outcome.incident === 'self').length,
        incidents: (wp.history || []).filter((h) => h.incident).length,
        grade: wp.phase === 'done' ? W.annualReview(wp).grade : null,
      },
      challenge: { bestAll: (rec.best || {}).all || 0, dailyStreak: C.dailyStreak(rec, today) },
      titles: Object.keys(state.titles || {}).sort(),
      retryCount: (state.retry || []).length,
    };
  }

  // 受け取ったファイルが、このアプリのレポートとして読めるかを確かめる
  function parseReport(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'JSON として読めません' }; }
    if (!data || data.format !== FORMAT) return { error: '練習銀行アカデミーの学習レポートではありません' };
    if (data.version !== VERSION) return { error: 'レポートの版が違います（' + data.version + '）' };
    for (const k of ['units', 'hackathon', 'texts', 'work', 'challenge', 'titles']) if (!(k in data)) return { error: k + ' がありません' };
    if (!Array.isArray(data.texts) || !Array.isArray(data.titles)) return { error: 'レポートの形が違います' };
    return { report: data };
  }

  RGA.report = { FORMAT, VERSION, buildReport, parseReport };
})(globalThis);

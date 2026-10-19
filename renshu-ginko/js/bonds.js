/*
 * 絆とエピソード: 登場人物と一緒に過ごすほど絆が深まり、その人のエピソード（短い物語）が読めるようになる。
 * 仕事の上の関係性を描く（ライバル関係・衝突と和解・恋愛の要素は入れない）。
 * 純粋。絆は保存せず、状態（終えたスプリント・聞きに行った相談・話した回数・配属先の週）から毎回数える。
 *
 * エピソード { char, level: 1 | 2, title, lines: [[話し手, せりふ]] }
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const H = RGA.hack;

  const LEVELS = [3, 8]; // Lv1・Lv2 に必要な絆
  const EPISODES = [];
  function addEpisodes(list) { for (const e of list) EPISODES.push(e); }
  const episodeKey = (e) => e.char + '-' + e.level;
  const charsWithEpisodes = () => [...new Set(EPISODES.map((e) => e.char))];

  const speakers = (lines) => new Set((lines || []).map((l) => l[0]));
  // 絆の内訳: 一緒に終えたスプリント +1、聞きに行った相談 +2、話した回数 +1（5回まで）、配属先で一緒の週 +1
  function bondPoints(state, charId) {
    const hp = state.hack || H.emptyProgress();
    let pts = 0;
    for (const s of H.SPRINTS) {
      if (!H.sprintStatus(hp, s).complete) continue;
      const talk = H.smallTalkOf(s.no);
      if ([s.briefing, s.retro, talk && talk.lines].some((ls) => speakers(ls).has(charId))) pts += 1;
    }
    for (const [key, open] of Object.entries(hp.consulted || {})) {
      if (!open) continue;
      const [no, i] = key.split('-').map(Number);
      const c = H.consultsOf(no)[i];
      if (c && c.who === charId) pts += 2;
    }
    // 話した回数（ハッカソンの会話とチャットの個別の部屋。合わせて5点まで）
    const talked = ((hp.chat || {})[charId] || []).filter((m) => m.role === 'user').length;
    pts += Math.min(5, talked + (RGA.messenger ? RGA.messenger.sentCount(state.messenger, 'dm-' + charId) : 0));
    if (RGA.work && state.work) {
      for (const h of state.work.history || []) {
        const w = RGA.work.weekOf(h.no);
        if (w && (speakers(w.briefing).has(charId) || speakers(w.retro).has(charId))) pts += 1;
      }
    }
    return pts;
  }
  function bondLevel(points) {
    return LEVELS.filter((n) => points >= n).length;
  }
  function nextLevelAt(points) {
    return LEVELS.find((n) => points < n) || null;
  }
  // その人のエピソードと、読めるかどうか
  function episodesOf(state, charId) {
    const lv = bondLevel(bondPoints(state, charId));
    const read = ((state.hack || {}).episodes) || {};
    return EPISODES.filter((e) => e.char === charId).sort((a, b) => a.level - b.level)
      .map((e) => ({ ...e, key: episodeKey(e), unlocked: lv >= e.level, read: !!read[episodeKey(e)] }));
  }
  // 読めるようになったのに、まだ読んでいないエピソード
  function unreadEpisodes(state) {
    return charsWithEpisodes().flatMap((id) => episodesOf(state, id).filter((e) => e.unlocked && !e.read));
  }

  RGA.bonds = { LEVELS, EPISODES, addEpisodes, episodeKey, charsWithEpisodes, bondPoints, bondLevel, nextLevelAt, episodesOf, unreadEpisodes };
})(globalThis);

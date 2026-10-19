/*
 * ハッカソン・レビューモード（研修のハッカソン: 6人のアジャイルチームで「AIお金相談チャット」を24スプリントでリリースする）
 * 書けなくても「読める・レビューできる」ことに特化した読解問題だけ。コードは動かさない。
 * 純粋。登場人物・採点・進み具合の計算だけを持ち、スプリントの中身は hack-sprints-*.js が addSprints で足す。
 *
 * 問題の形（すべて hints は3〜5段階。全部開けると「答えを見る」が出る）
 *   共通    { id, type, title, by, lang, story, hints[], why, points }
 *   review  { file, code, defects: [{ line, kind, why }] }             … 行を選んで種類を付ける
 *   fix     { file, code, bugLine, fixes: [コード], answer }           … 自分のコードのバグの行 → 正しい直し方
 *   conflict{ file, context, conflict, options: [解決後のコード], answer } … コンフリクトの解決
 *   predict { code, q, choices, answer }                                 … 出力・動きの予想
 *   comment { file, code, focus: [行], prompt, checks: [{ label, any }], min, sample } … レビューコメントを書く
 *   talk    { from, text, options: [{ text, best, reply: [[話し手, せりふ]], note }] } … 関係者の割り込みへの対応
 *
 * スプリント { no, title, goal, knowledge: [], briefing: [[話し手, せりふ]], problems: [], event: talk, retro: [[話し手, せりふ]] }
 * せりふの中の {player} {madoka} などは、設定で変えられる名前に置き換える。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const { includesAny } = RGA.core;

  const TOTAL_SPRINTS = 24;

  // ---- 登場人物（名前は仮。設定で変えられる。ペルソナは学習者の回答で詰めていく） ----
  const CAST = [
    { id: 'player', name: 'あなた', icon: '🧑‍💻', group: 'team', role: '新卒1年目（研修中）', persona: '主人公。新卒1年目で研修中。書くのはまだ苦手でも、読んでレビューする力を伸ばしている。' },
    { id: 'madoka', name: '早瀬 まどか', icon: '👩‍💼', group: 'team', role: '同期・まとめ役', persona: '同期。段取りとマネジメントが得意で、タスクの抜け漏れにすぐ気づく。話し方は落ち着いていて的確。', topics: [
      { q: 'タスクの切り方のコツは？', a: '「1日で終わって、終わったと言える」大きさにするの。終わりが見えないタスクは、だいたい2つ以上の仕事が混ざってるよ。' },
      { q: 'レビューで気をつけていることは？', a: 'PRの説明を先に読む。何を変えたかったのかが分からないまま差分を見ると、好みの指摘ばかりになっちゃうから。' },
      { q: '最近どう？', a: 'バーンダウンがきれいに下がってると、ちょっとうれしい。{player}のレビュー、最近すごく具体的になったよね。' },
    ] },
    { id: 'hikari', name: '陽野 ひかり', icon: '👩‍🎤', group: 'team', role: '同期・ムードメーカー', persona: '同期。チームの空気を明るくする。困っている人に真っ先に声をかける。言葉は軽やかでポジティブ、絵文字も使う。', topics: [
      { q: '落ち込んだときどうしてる？', a: '「今日わかったこと」を1個だけ書く！ 1個でもあれば前進してるって思えるよ〜✨' },
      { q: 'レビューの言い方が難しい…', a: '「〜した方がいいかも？ 理由は〜」って、理由をセットにすると角が立たないよ。あと良いところも1個書く！' },
      { q: '最近どう？', a: 'みんなでデモする日が楽しみすぎる！ {player}、今日のおやつ何にする？🍪' },
    ] },
    { id: 'rio', name: '神崎 理央', icon: '🧑‍🔬', group: 'team', role: '同期・情報系の院卒', persona: '同期。情報科学の大学院卒。アルゴリズムや計算量、型に強い。説明は理屈から入りがちだが、聞けば丁寧に教えてくれる。', topics: [
      { q: '計算量ってレビューで見る？', a: '見る。件数が増えたときに困るかどうか、だけでいい。ループの中でループや通信をしていたら、まず疑う。' },
      { q: '型って何がうれしいの？', a: '「この値は何者か」をコードに書いておけること。読む人の頭の中の推測を減らせる。' },
      { q: '最近どう？', a: '研究のときより、人に読まれるコードを書く難しさを感じてる。{player}の質問、本質的で助かるよ。' },
    ] },
    { id: 'daichi', name: '小森 大地', icon: '🧑‍🎓', group: 'team', role: '同期・未経験から挑戦中', persona: '同期。プログラミング未経験で入社。素直で、分からないことを分からないと言える。失敗も多いが、伸びがいちばん大きい。', topics: [
      { q: '分からないとき、どうしてる？', a: '15分調べてダメなら聞く、って決めた！ 聞くときは「何をして、何が起きて、何を期待したか」を書くようにしてる。' },
      { q: '自分のコードをレビューされるのは怖い？', a: '最初は怖かった…。でも指摘はコードへのもので、僕へのものじゃないって白石さんに言われて楽になったよ。' },
      { q: '最近どう？', a: 'この前のPR、一発で通ったんだ！ {player}がレビューしてくれたおかげ！' },
    ] },
    { id: 'osamu', name: '真壁 修', icon: '🧔', group: 'team', role: '同期・中途の経験者', persona: '同期（中途入社）。前職で長く開発をしていた経験者。本番障害の怖さを知っていて、運用・障害対応の目線で指摘する。口数は少ないが面倒見がよい。', topics: [
      { q: '本番で怖いことは？', a: 'タイムアウトとリトライの設定漏れ。落ちるより、ずっと待たされる方が被害が広がる。' },
      { q: 'レビューで最初に見るところは？', a: '失敗したときに何が起きるか。成功するときの道は、たいてい書いた本人が一番よく見てる。' },
      { q: '最近どう？', a: '若い人と組むのは新鮮だ。{player}は質問のしかたがいい。' },
    ] },
    { id: 'amano', name: '天野 晴', icon: '🌞', group: 'po', role: 'プロダクトオーナー', persona: 'プロダクトオーナー。とても優秀で尊敬されるエンジニア出身。いつも明るく、価値と優先順位をはっきり語る。決めるのが早い。', topics: [
      { q: '優先順位はどう決めてる？', a: '「誰の、どんな困りごとが、どれだけ減るか」！ 声の大きさじゃなくて、ユーザーの困りごとの大きさで決めるよ！' },
      { q: 'POから見たいいレビューって？', a: '「この変更でユーザーに何が起きるか」まで書いてあるレビュー。技術の話がユーザーの話につながると最高！' },
      { q: '最近どう？', a: 'リリースに向けてワクワクしてる！ {player}たちのチーム、ほんとにいいチームになってきたね！' },
    ] },
    { id: 'hosoya', name: '細谷 慎', icon: '🧐', group: 'user', role: 'ユーザー代表', persona: 'ユーザー代表。非常に細かく、ボタンを正確に、ときに連打して確かめる。速さと正確さの両方を求める。悪気はないが妥協しない。', topics: [
      { q: 'アプリに一番求めることは？', a: '速さと正確さです。どちらか片方では困ります。1円でもずれたら、もう使いません。' },
      { q: 'どうやって試しているんですか？', a: '同じボタンを10回押します。速く押したり、途中で戻ったりもします。実際の利用者はそうしますから。' },
      { q: '最近どう？', a: '前回の版では、送信ボタンの連打で二重に送られました。今回は直っていることを期待しています。' },
    ] },
    { id: 'kiryu', name: '桐生 拓', icon: '🧑‍🔧', group: 'user', role: '技術ユーザー', persona: '技術に詳しいユーザー。エンジニア目線で「AIの返答はどう送るの？」「プロンプトキャッシュは使ってる？」「サーバーに送る前にセキュアにしてる？」と鋭く聞く。ときどき仕様をひっくり返すが、なぜか憎めない。', topics: [
      { q: 'AIアプリで一番気にすることは？', a: '送る前に何を消しているか、だね。個人情報や鍵がプロンプトに乗ったら、もう取り返せないから。' },
      { q: 'プロンプトキャッシュって？', a: '毎回同じ前置き（システムプロンプトなど）を先頭に固定して、使い回してもらう仕組み。変わる部分は後ろに置くのがコツ。' },
      { q: '最近どう？', a: 'ごめん、また仕様をひっくり返したくなってる（笑）。でもユーザーのためになるなら言うべきだと思ってさ。' },
    ] },
    { id: 'shiraishi', name: '白石 結衣', icon: '👩‍🏫', group: 'boss', role: 'OJTリーダー（上司）', persona: 'OJTリーダー。いつも理解があり共感してくれる、優しくてとても仕事ができる理想の上司。だめなことはだめとはっきり言い、ときに厳しい助言もする。', topics: [
      { q: '成長するコツは？', a: '「読んだコードの数」は裏切らないよ。書けない日も、読むことはできる。読めるようになれば、書けるようになるから。' },
      { q: '指摘されて落ち込みました', a: 'うん、悔しいよね。でもその指摘は、あなたのコードが読まれた証拠。次に同じ指摘をされなければ、それで十分成長してる。' },
      { q: '最近どう？', a: '{player}さんのレビューコメント、根拠が書けるようになってきたね。そこは自信を持っていいよ。ただ、言い切れないときは「確認させてください」でいいからね。' },
    ] },
    { id: 'kumagai', name: '熊谷 大吾', icon: '🐻', group: 'boss', role: '上司', persona: '上司。部下のことを本当に大事に思い、いつも方向性を示してくれる。仕事にはとても厳しいが、ふだんは優しくゆるい口調で、真面目で面白い。こういう上司になりたいと思わせる人。', topics: [
      { q: '仕事で一番大事なことは？', a: 'お客さんのお金を預かってるってことだなぁ。だからテストもレビューも手を抜かない。そこだけは厳しくいくよ〜。' },
      { q: 'いいエンジニアってどんな人？', a: '「分からない」を早く言える人かな。分からないまま3日たつより、3分で聞いた方がチームは速いんだ。' },
      { q: '最近どう？', a: '最近、腰が痛くてねぇ…立って仕事する机を買ったら、立ってるのに疲れて座ってる（笑）。{player}、いい顔になってきたね。' },
    ] },
    { id: 'legal', name: '堅田 法務', icon: '⚖️', group: 'stake', role: '法務部（関係者）', persona: '法務部の担当者。金融商品取引法や個人情報保護の観点から、表現と同意取得に厳しい。' },
    { id: 'sales', name: '押野 部長', icon: '📣', group: 'stake', role: '営業部長（関係者）', persona: '営業部長。お客さまの声を持ってきては、急な機能追加を求める。悪い人ではない。' },
    { id: 'sec', name: '守屋 セキュリティ室', icon: '🛡️', group: 'stake', role: 'セキュリティ室（関係者）', persona: 'セキュリティ室の担当者。ログ・鍵・個人情報の扱いを厳しく確認する。' },
    { id: 'exec', name: '大門 役員', icon: '🏢', group: 'stake', role: '担当役員（関係者）', persona: '担当役員。リリース日と費用を気にする。思いつきで方針を変えることがある。' },
  ];
  const CAST_BY_ID = Object.fromEntries(CAST.map((c) => [c.id, c]));
  // スクラムマスターは毎スプリント交代（チームの6人で回す）
  const SM_ORDER = ['madoka', 'rio', 'hikari', 'osamu', 'daichi', 'player'];
  function scrumMaster(no) {
    return SM_ORDER[(no - 1) % SM_ORDER.length];
  }

  const REVIEW_KINDS = [
    { id: 'bug', name: 'バグ' },
    { id: 'security', name: 'セキュリティ' },
    { id: 'spec', name: '仕様とずれ' },
    { id: 'perf', name: '性能' },
    { id: 'readability', name: '読みやすさ' },
  ];
  const LANGS = { js: 'JavaScript', react: 'React', python: 'Python', java: 'Java', text: '文章' };
  // レビューコメントで避けたい言い方（人ではなくコードについて、理由とともに書く）
  const NG_WORDS = ['ダメ', 'だめ', '意味不明', 'ありえない', '最悪', 'センスない', 'なんでこんな', '素人', '常識'];

  const SPRINTS = [];
  function addSprints(list) {
    for (const s of list) {
      const i = SPRINTS.findIndex((x) => x.no === s.no);
      const sprint = { ...s, sm: s.sm || scrumMaster(s.no) };
      if (i >= 0) SPRINTS[i] = sprint;
      else SPRINTS.push(sprint);
    }
    SPRINTS.sort((a, b) => a.no - b.no);
  }
  const problemsOf = (sprint) => [...sprint.problems, ...(sprint.event ? [sprint.event] : [])];
  function findProblem(id) {
    for (const s of SPRINTS) for (const p of problemsOf(s)) if (p.id === id) return { sprint: s, problem: p };
    return null;
  }

  // ---- 名前の置き換え ----
  function nameOf(id, names) {
    if (names && names[id]) return names[id];
    return CAST_BY_ID[id] ? CAST_BY_ID[id].name : id;
  }
  function fill(text, names) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, id) => (CAST_BY_ID[id] ? nameOf(id, names) : m));
  }

  // ---- 採点 ----
  function gradeReview(p, marks) {
    const m = marks || {};
    const hits = [];
    const wrongKind = [];
    const missed = [];
    for (const d of p.defects) {
      const k = m[d.line];
      if (!k) missed.push(d.line);
      else if (k === d.kind) hits.push(d.line);
      else wrongKind.push(d.line);
    }
    const defectLines = new Set(p.defects.map((d) => d.line));
    const extra = Object.keys(m).map(Number).filter((l) => m[l] && !defectLines.has(l));
    // 見当違いの指摘は1つまでなら許す（レビューでは「気になる」を言うことも大事）
    return { pass: !missed.length && !wrongKind.length && extra.length <= 1, hits, wrongKind, missed, extra };
  }
  function gradeFix(p, line, choice) {
    const lineOk = line === p.bugLine;
    const fixOk = choice === p.answer;
    return { pass: lineOk && fixOk, lineOk, fixOk };
  }
  function gradeChoice(p, choice) {
    return { pass: choice === p.answer };
  }
  function gradeComment(p, text) {
    const t = String(text || '');
    const ng = NG_WORDS.filter((w) => t.includes(w));
    const matched = [];
    const missing = [];
    for (const pt of p.checks) (includesAny(t, pt.any) ? matched : missing).push(pt.label);
    const tooShort = t.trim().length < 20;
    const need = p.min || p.checks.length;
    return { pass: !ng.length && !tooShort && matched.length >= need, matched, missing, ng, tooShort, need };
  }
  function gradeTalk(p, choice) {
    const opt = p.options[choice];
    return { pass: !!(opt && opt.best), option: opt || null };
  }
  // work: 画面での入力 { marks, line, choice, text }
  function grade(p, work) {
    const w = work || {};
    if (p.type === 'review') return gradeReview(p, w.marks);
    if (p.type === 'fix') return gradeFix(p, w.line, w.choice);
    if (p.type === 'comment') return gradeComment(p, w.text);
    if (p.type === 'talk') return gradeTalk(p, w.choice);
    return gradeChoice(p, w.choice);
  }
  // 答えを見たときに、その答えを入力欄に入れた状態
  function answerWork(p) {
    if (p.type === 'review') return { marks: Object.fromEntries(p.defects.map((d) => [d.line, d.kind])) };
    if (p.type === 'fix') return { line: p.bugLine, choice: p.answer };
    if (p.type === 'comment') return { text: p.sample };
    if (p.type === 'talk') return { choice: p.options.findIndex((o) => o.best) };
    return { choice: p.answer };
  }

  // ---- 進み具合 ----
  function emptyProgress() {
    return { solved: {}, work: {}, chat: {}, choices: {}, briefed: {} };
  }
  function sprintStatus(progress, sprint) {
    const solved = (progress && progress.solved) || {};
    const list = problemsOf(sprint);
    const done = list.filter((p) => solved[p.id]).length;
    const points = list.reduce((a, p) => a + (solved[p.id] ? (solved[p.id].revealed ? Math.ceil((p.points || 1) / 2) : (p.points || 1)) : 0), 0);
    const total = list.reduce((a, p) => a + (p.points || 1), 0);
    return { done, count: list.length, complete: done === list.length, points, total };
  }
  // いま遊べるスプリント（前のスプリントを全部終えたら次が開く）
  function unlockedUpTo(progress) {
    let n = 1;
    for (const s of SPRINTS) {
      if (s.no !== n) break;
      if (!sprintStatus(progress, s).complete) return n;
      n += 1;
    }
    return Math.min(n, SPRINTS.length ? SPRINTS[SPRINTS.length - 1].no : 1);
  }
  function released(progress) {
    return SPRINTS.length === TOTAL_SPRINTS && SPRINTS.every((s) => sprintStatus(progress, s).complete);
  }
  function velocity(progress) {
    return SPRINTS.map((s) => ({ no: s.no, ...sprintStatus(progress, s) }));
  }
  function solve(progress, p, revealed, time) {
    const prev = progress.solved[p.id];
    // 一度自力で解いた問題は、あとで答えを見ても「自力」のまま
    const rev = prev && !prev.revealed ? false : !!revealed;
    return { ...progress, solved: { ...progress.solved, [p.id]: { revealed: rev, at: time } } };
  }

  // ---- 自由チャット（Claude API キーがあるときだけ）のシステムプロンプト ----
  function personaPrompt(charId, names, sprint) {
    const c = CAST_BY_ID[charId];
    const team = CAST.filter((x) => x.group === 'team' && x.id !== 'player').map((x) => nameOf(x.id, names) + '（' + x.role + '）').join('、');
    return [
      'あなたは研修用の学習アプリ「練習銀行アカデミー」に登場する架空の人物「' + nameOf(charId, names) + '」（' + c.role + '）として話します。',
      '人物像: ' + fill(c.persona, names),
      '舞台: 架空の「練習銀行」の新人研修ハッカソン。6人のアジャイルチーム（' + team + '、そして新卒1年目の' + nameOf('player', names) + '）が、24スプリントで「AIお金相談チャット」をリリースする。',
      sprint ? '今はスプリント' + sprint.no + '「' + sprint.title + '」。スプリントゴール: ' + sprint.goal : '',
      '話し相手は' + nameOf('player', names) + '（新卒1年目・研修中）。',
      '守ること: 人物になりきって日本語で短め（3〜6文）に話す。実在の人物・企業・顧客情報には触れない。パスワードや API キーなどの秘密は聞かない・言わない。',
      '問題の答えそのものは言わず、考え方やヒントで導く。投資や税金の具体的な助言はしない（架空の研修の話にとどめる）。',
    ].filter(Boolean).join('\n');
  }

  RGA.hack = {
    TOTAL_SPRINTS, CAST, CAST_BY_ID, SM_ORDER, REVIEW_KINDS, LANGS, NG_WORDS, SPRINTS,
    addSprints, problemsOf, findProblem, scrumMaster, nameOf, fill,
    gradeReview, gradeFix, gradeChoice, gradeComment, gradeTalk, grade, answerWork,
    emptyProgress, sprintStatus, unlockedUpTo, released, velocity, solve, personaPrompt,
  };
})(globalThis);

/*
 * メッセンジャー: 登場人物との個別チャットとグループチャット（ただ話すための場所）。純粋。
 *   部屋（ROOMS）: 個別は話せる登場人物ごと（dm-<id>）、グループは顔ぶれごと（g-…）
 *   返事: API キーがあれば LLM（llmRequest で組み立て、グループは JSON の配列で受け取る）、なければルールのせりふ
 *   ルールの返事は、発言の種類（intentOf）と、発言・回数のハッシュで決まる（乱数を使わない）
 *   せりふの中身は chat-lines-a/b.js が addLines で足す。保存は state.messenger = { rooms: { 部屋: [{ who, text, at }] } }
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const H = RGA.hack;
  const MAX_LOG = 100;
  const DM_GROUPS = ['team', 'po', 'user', 'boss', 'friend', 'outside', 'senpai', 'work'];
  const LINES = {};

  const GROUPS = [
    { id: 'g-team', name: 'ハッカソンのチーム', icon: '🧑‍💻', members: ['madoka', 'hikari', 'rio', 'daichi', 'osamu'],
      open: [['madoka', '{player}、グループ作っておいたよ。スプリントの連絡はここでしよう。'], ['hikari', 'やった〜！雑談もここでしていいよね？😆']] },
    { id: 'g-daily', name: 'いつもの同期', icon: '☕', members: ['kujo', 'himuro', 'kasuga', 'onizuka'],
      open: [['kasuga', 'いつもの4人＋{player}のグループだよ〜！今日のお昼どうする？'], ['onizuka', 'またそれかよ。……まあ、行くけど。']] },
    { id: 'g-douki', name: '同期みんな', icon: '🌸', members: ['madoka', 'hikari', 'rio', 'daichi', 'osamu', 'kujo', 'himuro', 'kasuga', 'onizuka', 'seto', 'yuzuki', 'hanaoka', 'saionji', 'kurokawa'],
      open: [['hikari', '同期みんなのグループです！部署が分かれても、ここで話そうね🌸'], ['seto', '作ってくれてありがとう。みんな、よろしくね。']] },
    { id: 'g-nomi', name: '同期の飲み会', icon: '🍻', members: ['kasuga', 'hikari', 'hanaoka', 'kujo'],
      open: [['kasuga', '飲み会の相談はここで！次いつにする？🍺'], ['hanaoka', 'ゆず、まだ前の飲み会から3日しか経ってないよ（笑）']] },
    { id: 'g-senpai', name: '研修でお世話になった先輩', icon: '🎓', members: ['fukamachi', 'kazami', 'saotome', 'miyamoto'],
      open: [['saotome', '研修おつかれさま〜。困ったことがあったら、いつでもここに書いてね。'], ['miyamoto', 'どんな小さなことでもいいからね。']] },
    { id: 'g-work', name: '配属先チーム', icon: '🏢', members: ['mizuno', 'mikami', 'ohashi'], late: { arai: 18 },
      open: [['mikami', '{player}さん、チームのグループに入ってもらいました。連絡はここに流します。'], ['ohashi', '障害のときもまずここ。落ち着いて書けば大丈夫だよ。']] },
  ];

  // 後から来る人（新井さんは配属先の第18週から）
  function joined(state, id) {
    if (id !== 'arai') return true;
    return (((state.work || {}).week) || 1) >= 18;
  }

  function roomsFor(state) {
    const dms = H.CAST.filter((c) => DM_GROUPS.includes(c.group) && c.id !== 'player' && joined(state, c.id))
      .map((c) => ({ id: 'dm-' + c.id, kind: 'dm', icon: c.icon, members: [c.id], char: c.id }));
    const groups = GROUPS.map((gr) => ({ id: gr.id, kind: 'group', name: gr.name, icon: gr.icon,
      members: [...gr.members, ...Object.keys(gr.late || {}).filter((id) => joined(state, id))] }));
    return [...groups, ...dms];
  }
  function roomOf(state, roomId) {
    return roomsFor(state).find((r) => r.id === roomId) || null;
  }
  function roomName(room, names) {
    return room.kind === 'dm' ? H.nameOf(room.char, names) : room.name;
  }

  function addLines(map) {
    for (const [id, lines] of Object.entries(map)) LINES[id] = lines;
  }

  // ---- 発言の種類 ----
  const INTENTS = [
    ['sorry', ['ごめん', 'すみません', 'すいません', '申し訳']],
    ['thanks', ['ありがと', '感謝', '助かった', '助かる', 'サンキュ']],
    ['greet', ['おはよ', 'こんにちは', 'こんばんは', 'お疲れ', 'おつかれ', 'はじめまして', 'やっほ', 'ただいま', 'よろしく']],
    ['tired', ['疲れ', 'つかれ', '眠', 'ねむ', 'しんど', 'つらい', '辛い', 'だるい', '限界', 'へとへと', '落ち込']],
    ['praise', ['すごい', 'すげ', 'さすが', '天才', '尊敬', 'かっこいい', '頼りに']],
    ['tech', ['react', 'java', 'python', 'javascript', 'sql', 'api', 'git', 'バグ', 'エラー', 'コード', '設計', 'テスト', 'セキュリティ', 'ai', 'llm', 'ネットワーク', '正規表現', '非同期', 'プログラ', '実装', '型']],
    ['work', ['仕事', '研修', 'レビュー', '見積', '会議', '報告', '相談', 'タスク', 'スプリント', '締め切', '障害', 'ハッカソン', '配属', '残業']],
    ['food', ['ごはん', 'ご飯', 'ランチ', 'お昼', '飲み', 'ビール', 'ラーメン', 'カフェ', 'コーヒー', 'お腹', '腹減', '食べ', '居酒屋', 'お酒']],
    ['hobby', ['休み', '週末', '土日', '休日', '趣味', 'ゲーム', '旅行', '映画', '野球', 'ドライブ', '遊び']],
  ];
  function intentOf(text) {
    const t = String(text || '').toLowerCase();
    for (const [id, words] of INTENTS) {
      // 英字の言葉は単語の一部（「maybe」の ai など）に反応しないよう、前後が英字でないときだけ
      if (words.some((w) => (/^[a-z]+$/.test(w) ? new RegExp('(^|[^a-z])' + w + '([^a-z]|$)').test(t) : t.includes(w)))) return id;
    }
    return /[？?]\s*$/.test(t) ? 'question' : 'default';
  }

  function hash(text) {
    let x = 2166136261;
    for (let i = 0; i < text.length; i++) { x ^= text.charCodeAt(i); x = Math.imul(x, 16777619); }
    return x >>> 0;
  }

  const FALLBACK = { open: ['{player}、どうしたの？'], default: ['なるほどね。もう少し聞かせて？', 'うんうん。それで、{player}はどう思ってるの？'] };
  function linesOf(id) {
    return LINES[id] || FALLBACK;
  }
  function ruleReply(charId, text, n) {
    const lines = linesOf(charId);
    const pool = lines[intentOf(text)] || lines.default || FALLBACK.default;
    return pool[hash(charId + '|' + text + '|' + n) % pool.length];
  }

  // グループで名前を呼ばれた人（姓か名、または設定で変えた名前）
  function mentioned(room, text, names) {
    return room.members.filter((id) => H.nameOf(id, names).split(/[\s　]+/).some((part) => part.length >= 2 && text.includes(part)));
  }
  function ruleReplies(room, text, n, names) {
    if (room.kind === 'dm') return [{ who: room.char, text: ruleReply(room.char, text, n) }];
    let who = mentioned(room, text, names).slice(0, 2);
    if (!who.length) {
      const k = hash(room.id + '|' + text + '|' + n);
      const count = Math.min(room.members.length, 1 + (k % 2));
      for (let i = 0; i < count; i++) who.push(room.members[(k + i * 3) % room.members.length]);
      who = [...new Set(who)];
    }
    return who.map((id, i) => ({ who: id, text: ruleReply(id, text, n + i) }));
  }

  function openerOf(room) {
    if (room.kind === 'dm') return [{ who: room.char, text: (linesOf(room.char).open || FALLBACK.open)[0] }];
    const gr = GROUPS.find((x) => x.id === room.id);
    return gr.open.map(([who, text]) => ({ who, text }));
  }

  // ---- 保存の形 ----
  function empty() {
    return { rooms: {} };
  }
  function logOf(mp, roomId) {
    return ((mp || empty()).rooms || {})[roomId] || [];
  }
  function append(mp, roomId, msgs, time) {
    const base = mp || empty();
    const log = [...logOf(base, roomId), ...msgs.map((m) => ({ who: m.who, text: m.text, at: time }))].slice(-MAX_LOG);
    return { ...base, rooms: { ...base.rooms, [roomId]: log } };
  }
  // はじめて開いた部屋には、相手からのひとことを置く
  function ensureOpened(mp, room, time) {
    return logOf(mp, room.id).length ? (mp || empty()) : append(mp, room.id, openerOf(room), time);
  }
  function sentCount(mp, roomId) {
    return logOf(mp, roomId).filter((m) => m.who === 'player').length;
  }
  function totalSent(mp) {
    return Object.keys((mp || empty()).rooms).reduce((n, id) => n + sentCount(mp, id), 0);
  }

  // ---- LLM への頼み方 ----
  // チャットは仕事の場ではなく、ただの雑談の場。ハッカソンの自由チャット（hack.personaPrompt）とは別の頼み方にして、
  // スプリントの状況は渡さない（渡すと、どの人物も仕事の話に引っぱられた）
  const CHAT_STYLE = [
    'ここはスマホのメッセージアプリ（LINE のようなチャット）。仕事の場ではなく、仲のいい人どうしのふだんの雑談。',
    '部署・得意分野・仕事ぶりは人物の背景として知っておくだけ。相手が仕事・研修・技術の話を振らない限り、それらの話題は自分から持ち出さない（ハッカソン・要件・レビュー・コードの話に戻さない）。',
    'ごはん・休日・趣味・最近あったこと・ちょっとした冗談など、相手の話題にそのまま乗る。相手の言葉の意味が分からなければ、推測して乗るか、軽く聞き返す。',
    '返事は1〜3文の短い話し言葉。見出し・箇条書き・コードは使わない。キャラクターの持ちネタは、たまに出す程度にして毎回は言わない。',
  ].join('\n');
  const RULES = '守ること: 恋愛やライバル関係の話にしない。実在の人物・企業・顧客情報には触れない。パスワードや API キーなどの秘密は聞かない・言わない。投資や税金の具体的な助言はしない。';
  function playerLine(names) {
    return '話し相手は' + H.nameOf('player', names) + '（新卒1年目。情報系の大学院を出ていて同期より少し年上。一人称は俺。真面目さとゆるさが同居していて、積極的）。上司は「' + H.nameOf('player', names) + 'くん」と呼ぶ。';
  }
  function personOf(id, names) {
    const c = H.CAST_BY_ID[id];
    return H.nameOf(id, names) + '（' + c.role + '）。' + H.fill(c.persona, names);
  }
  function llmRequest(room, log, names) {
    if (room.kind === 'dm') {
      const system = [
        'あなたは研修用の学習アプリ「練習銀行アカデミー」に登場する架空の人物として、主人公とチャットで雑談します。',
        'あなた: ' + personOf(room.char, names),
        playerLine(names),
        CHAT_STYLE,
        RULES,
      ].join('\n');
      const messages = [];
      for (const m of log.slice(-12)) {
        const role = m.who === 'player' ? 'user' : 'assistant';
        const text = H.fill(m.text, names);
        const last = messages[messages.length - 1];
        if (last && last.role === role) last.content += '\n' + text;
        else messages.push({ role, content: text });
      }
      while (messages.length && messages[0].role !== 'user') messages.shift();
      return { system, messages, maxTokens: 400 };
    }
    const system = [
      'あなたは研修用の学習アプリ「練習銀行アカデミー」のグループチャット「' + room.name + '」で、次の架空の人物たちを演じ分けます。',
      room.members.map((id) => '- ' + id + ': ' + personOf(id, names)).join('\n'),
      playerLine(names),
      CHAT_STYLE,
      'これまでの会話を読み、' + H.nameOf('player', names) + 'の最後の発言に、参加者のうち話の流れに合う1〜3人が返事をする。名前を呼ばれた人は必ず返事をする。参加者どうしで軽くつっこみ合うのはよいが、話の中心は' + H.nameOf('player', names) + 'の話題にする。',
      '出力は JSON の配列だけにする。形: [{"who": "参加者の id", "text": "発言"}]',
      RULES,
    ].join('\n');
    const transcript = log.slice(-16).map((m) => (m.who === 'player' ? H.nameOf('player', names) : H.nameOf(m.who, names) + '（' + m.who + '）') + ': ' + H.fill(m.text, names)).join('\n');
    return { system, messages: [{ role: 'user', content: 'これまでの会話:\n' + transcript }], maxTokens: 700 };
  }
  // グループの返事（JSON の配列）を読む。読めなければ null（ルールの返事に切り替える）
  function parseGroupReply(text, members) {
    const s = String(text || '');
    const start = s.indexOf('[');
    const end = s.lastIndexOf(']');
    if (start < 0 || end <= start) return null;
    let data;
    try { data = JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
    if (!Array.isArray(data)) return null;
    const out = data.filter((m) => m && members.includes(m.who) && typeof m.text === 'string' && m.text.trim())
      .slice(0, 4).map((m) => ({ who: m.who, text: m.text.trim().slice(0, 400) }));
    return out.length ? out : null;
  }

  RGA.messenger = { GROUPS, DM_GROUPS, MAX_LOG, LINES, addLines, roomsFor, roomOf, roomName, intentOf, ruleReply, ruleReplies, mentioned, openerOf, empty, logOf, append, ensureOpened, sentCount, totalSent, llmRequest, parseGroupReply };
})(globalThis);

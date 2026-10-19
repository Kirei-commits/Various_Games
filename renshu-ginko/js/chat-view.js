/*
 * メッセンジャーの画面（#/chat … 部屋の一覧、#/chat/<部屋> … 会話）。ブラウザ専用。
 * API キーがあれば LLM が返事をする（送る前の検査・AI 利用ログ・利用料はハッカソンの自由チャットと同じ）。なければルールのせりふ。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const M = RGA.messenger;
  const H = RGA.hack;
  const drafts = {}; // 部屋ごとの書きかけ（保存しない）
  let sending = null; // 返事を待っている部屋

  const QUICK = ['おはよう！', 'お疲れさま〜', 'ちょっと相談していい？', '今日のお昼どうする？'];

  function messengerOf(ui) {
    const state = ui.state();
    if (!state.messenger) state.messenger = M.empty();
    return state.messenger;
  }
  const namesOf = (state) => RGA.hackView.namesOf(state);

  function view(ui, args) {
    const state = ui.state();
    const room = args[0] ? M.roomOf(state, decodeURIComponent(args[0])) : null;
    return room ? viewRoom(ui, room) : viewList(ui);
  }

  function viewList(ui) {
    const h = ui.h;
    const state = ui.state();
    const names = namesOf(state);
    const mp = state.messenger || M.empty();
    const item = (room) => {
      const log = M.logOf(mp, room.id);
      const last = log[log.length - 1];
      const sub = last ? (last.who === 'player' ? 'あなた: ' : room.kind === 'group' ? H.nameOf(last.who, names) + ': ' : '') + H.fill(last.text, names)
        : room.kind === 'group' ? room.members.map((id) => H.nameOf(id, names)).join('・') : H.CAST_BY_ID[room.char].role;
      return h('li', null, h('a', { class: 'room-item', href: '#/chat/' + room.id, id: 'chat-room-' + room.id },
        h('span', { class: 'avatar' }, room.icon),
        h('span', { class: 'room-text' }, h('strong', null, M.roomName(room, names) + (room.kind === 'group' ? '（' + (room.members.length + 1) + '）' : '')), h('span', { class: 'muted small room-sub' }, sub))));
    };
    const rooms = M.roomsFor(state);
    return h('div', { class: 'page' },
      h('h1', null, 'チャット'),
      h('p', { class: 'muted' }, '同期や先輩、チームの人たちと、ただ話すための場所です。' + (RGA.tutor.hasAI(state.settings) ? '返事は設定の AI（' + providerName(state) + '）が、その人になりきって書きます。' : '返事は一人ひとりのせりふから選ばれます。設定で Claude か Gemini の API キーを入れると、自由な返事になります。')),
      h('section', { class: 'card' }, h('h2', null, 'グループ'), h('ul', { class: 'room-list' }, rooms.filter((r) => r.kind === 'group').map(item))),
      h('section', { class: 'card' }, h('h2', null, '個別'), h('ul', { class: 'room-list' }, rooms.filter((r) => r.kind === 'dm').map(item))),
      h('section', { class: 'card' }, h('h2', null, 'リセット'),
        h('p', { class: 'muted small' }, '会話を消すと、相手（AI）もそれまでの会話を覚えていない状態に戻ります。部屋ごとに消すときは、その部屋の下にある「この部屋の会話を消す」を使ってください。ほかの学習の記録は消えません。'),
        h('button', { class: 'btn danger', id: 'chat-reset-all', disabled: !Object.values(mp.rooms || {}).some((l) => l.length), onclick: () => {
          if (!window.confirm('すべての部屋の会話を消しますか？（元に戻せません）')) return;
          ui.update(() => { state.messenger = M.empty(); });
          ui.toast('チャットの会話をすべて消しました', 'ok');
          ui.render();
        } }, 'チャットの会話をすべて消す')));
  }
  const providerName = (state) => (RGA.tutor.providerOf(state.settings) === 'gemini' ? 'Gemini' : 'Claude');

  function viewRoom(ui, room) {
    const h = ui.h;
    const state = ui.state();
    const names = namesOf(state);
    if (!M.logOf(state.messenger, room.id).length) ui.update(() => { state.messenger = M.ensureOpened(messengerOf(ui), room, ui.now()); });
    const log = M.logOf(state.messenger, room.id);
    const ai = RGA.tutor.hasAI(state.settings);
    const busy = sending === room.id;
    const iconOf = (who) => (who === 'player' ? '🧑‍💻' : H.CAST_BY_ID[who].icon);
    const logEl = h('div', { class: 'talk chat-log', id: 'chat-log', 'aria-live': 'polite' },
      log.map((m) => h('div', { class: 'bubble-row' + (m.who === 'player' ? ' me' : '') },
        h('span', { class: 'avatar' }, iconOf(m.who)),
        h('div', { class: 'bubble' }, room.kind === 'group' && m.who !== 'player' ? h('strong', null, H.nameOf(m.who, names)) : null, h('p', null, H.fill(m.text, names))))),
      busy ? h('p', { class: 'muted small', id: 'chat-typing' }, '入力中…') : null);
    requestAnimationFrame(() => { if (logEl.lastElementChild) logEl.lastElementChild.scrollIntoView({ block: 'nearest' }); });
    const c = room.kind === 'dm' ? H.CAST_BY_ID[room.char] : null;
    return h('div', { class: 'page chat-page' },
      h('p', null, h('a', { href: '#/chat', id: 'chat-back' }, '← チャットの一覧')),
      h('div', { class: 'row' }, h('span', { class: 'avatar big' }, room.icon),
        h('div', null, h('h1', null, M.roomName(room, names)),
          h('p', { class: 'muted small' }, c ? c.role : 'メンバー: あなた・' + room.members.map((id) => H.nameOf(id, names)).join('・')))),
      h('section', { class: 'card' },
        logEl,
        h('div', { class: 'row wrap', role: 'group', 'aria-label': 'よく使うひとこと' }, QUICK.map((q, i) => h('button', { class: 'btn tiny', id: 'chat-quick-' + i, disabled: busy, onclick: () => send(ui, room, q) }, q))),
        h('label', { class: 'field' }, h('span', { class: 'sr-only' }, 'メッセージ'),
          h('textarea', { id: 'chat-input', rows: '2', maxlength: '400', value: drafts[room.id] || '', placeholder: '個人情報や API キーは書かないでください',
            oninput: (e) => { drafts[room.id] = e.target.value; },
            onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(ui, room, drafts[room.id] || ''); } } })),
        h('div', { class: 'row between' },
          h('span', { class: 'muted tiny' }, ai ? providerName(state) + ' が返事をします（Ctrl+Enter でも送れます）' : 'ルールの返事です（設定で API キーを入れると自由な返事に）'),
          h('button', { class: 'btn primary', id: 'chat-send', disabled: busy, onclick: () => send(ui, room, drafts[room.id] || '') }, busy ? '返事を待っています…' : '送る')),
        log.length > 1 ? h('button', { class: 'btn tiny ghost', id: 'chat-clear', disabled: busy, onclick: () => {
          if (!window.confirm('この部屋の会話を消して、最初からにしますか？（相手もこれまでの会話を覚えていない状態に戻ります）')) return;
          ui.update(() => { state.messenger = { ...messengerOf(ui), rooms: { ...messengerOf(ui).rooms, [room.id]: [] } }; });
          ui.render();
        } }, 'この部屋の会話を消す') : null));
  }

  async function send(ui, room, raw) {
    const text = String(raw).trim().slice(0, 400);
    if (!text || sending) return;
    const state = ui.state();
    const R = RGA.rules;
    const T = RGA.tutor;
    const mask = R.detectSensitive(text);
    if (mask.blocked) {
      ui.logAi({ unitId: 'chat', kind: 'chat', input: R.redact(text), output: '（送信を止めました）', masking: { blocked: true, labels: mask.labels }, source: 'blocked' });
      ui.toast(mask.labels.join('・') + ' らしき内容があるので、送信を止めました', 'warn');
      return;
    }
    drafts[room.id] = '';
    ui.update(() => { state.messenger = M.append(messengerOf(ui), room.id, [{ who: 'player', text }], ui.now()); });
    sending = room.id;
    ui.render();
    const n = M.sentCount(state.messenger, room.id);
    const names = namesOf(state);
    let replies = null;
    if (T.hasAI(state.settings)) {
      const env = ui.aiEnv();
      try {
        const out = await T.callLLM(env.fetchImpl, state.settings, env.spentUsd, M.llmRequest(room, M.logOf(state.messenger, room.id), names));
        ui.update((s) => { Object.assign(s, RGA.store.addSpend(s, T.costOf(out.model, out.usage), ui.now())); });
        replies = room.kind === 'dm' ? [{ who: room.char, text: R.limitCodeBlocks(out.text).trim() }] : M.parseGroupReply(out.text, room.members);
        ui.logAi({ unitId: 'chat', kind: 'chat', input: text, output: replies ? replies.map((m) => m.who + ': ' + m.text).join('\n') : out.text, masking: { blocked: false, labels: [] }, source: 'llm', model: out.model });
      } catch (e) {
        ui.toast(providerName(state) + ' に接続できませんでした（' + e.message + '）。ルールの返事にします', 'warn');
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 450)); // 「入力中…」を少し見せる
    }
    if (!replies || !replies.length || !replies[0].text) replies = M.ruleReplies(room, text, n, names);
    sending = null;
    ui.update(() => { state.messenger = M.append(messengerOf(ui), room.id, replies, ui.now()); });
    ui.render();
  }

  RGA.chatView = { view };
})(globalThis);

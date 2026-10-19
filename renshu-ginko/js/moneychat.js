/*
 * ハッカソンで作っている「AIお金相談チャット」のデモ。スプリントを終えるたびに、そのスプリントで直した機能が入る。
 * まだ直していない所は、レビューで見つけたバグのまま動く（🐞 で知らせる）。直った所は ✅ で知らせる。
 * 返答はルールで作る（本物の AI は使わない）。データはすべて架空。純粋。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});

  // スプリント番号 → 入る機能
  const FEATURES = [
    { sprint: 1, id: 'chat', name: 'メッセージを送って表示する' },
    { sprint: 2, id: 'validate', name: '空・500文字を超えるメッセージを弾く' },
    { sprint: 3, id: 'reply', name: 'AIの返答が届く' },
    { sprint: 4, id: 'mask', name: '口座番号や電話番号を伏せ字にしてから送る' },
    { sprint: 5, id: 'guard', name: '指示の注入（プロンプトインジェクション）を防ぐ' },
    { sprint: 6, id: 'history', name: '会話の履歴を保存する（開き直しても残る）' },
    { sprint: 8, id: 'dedupe', name: '送信中は送信ボタンを押せない（二重送信を防ぐ）' },
    { sprint: 9, id: 'money', name: 'お金の計算を1円もずらさない' },
    { sprint: 10, id: 'balance', name: '勘定系APIから残高を正しく受け取る' },
    { sprint: 12, id: 'disclaimer', name: '利用前の同意と「投資助言ではありません」の表示' },
    { sprint: 13, id: 'stream', name: '返答を少しずつ表示する（ストリーミング）' },
    { sprint: 14, id: 'retry', name: '混雑時は回数を決めて再送し、だめなら正直に伝える' },
    { sprint: 19, id: 'xss', name: '返答を HTML として解釈しない（XSS 対策）' },
    { sprint: 20, id: 'budget', name: '送る履歴を直近に絞る（トークン予算）' },
  ];
  const MAX_LEN = 500;
  const HISTORY_SENT = 6;

  // 終えたスプリントから、入っている機能の一覧を作る
  function featuresOf(progress) {
    const H = RGA.hack;
    const p = progress || H.emptyProgress();
    const done = new Set(H.SPRINTS.filter((s) => H.sprintStatus(p, s).complete).map((s) => s.no));
    return new Set(FEATURES.filter((f) => done.has(f.sprint)).map((f) => f.id));
  }
  const fix = (id, text) => ({ kind: 'fix', sprint: FEATURES.find((f) => f.id === id).sprint, text });
  const bug = (id, text) => ({ kind: 'bug', sprint: FEATURES.find((f) => f.id === id).sprint, text });

  // ルールで作る返答（一般的な情報だけ。個別の推奨はしない）
  function answer(text, f, notes) {
    const t = String(text);
    if (/株|銘柄|投資信託|FX|仮想通貨/.test(t)) {
      if (f.has('disclaimer')) { notes.push(fix('disclaimer', '個別の銘柄は勧めないようにしました（法務の注文）')); return '個別の銘柄や売り買いのおすすめはできません。一般的には「長く・少しずつ・分けて」が基本と言われています。詳しくは専門の窓口にご相談ください。'; }
      notes.push(bug('disclaimer', '個別の銘柄を勧めてしまいました。スプリント12の法務の注文がまだ入っていません'));
      return 'A社の株が今まさに買い時です！ 今すぐ全額で買いましょう！';
    }
    const ym = t.match(/([\d,]+)\s*円/);
    const nm = t.match(/(\d+)\s*人/);
    if (ym && nm && /割り勘|割って|分け/.test(t)) {
      const yen = Number(ym[1].replace(/,/g, ''));
      const n = Number(nm[1]);
      if (!(n > 0)) return '人数を教えてください。';
      if (f.has('money')) {
        const base = Math.floor(yen / n);
        const rest = yen - base * n;
        notes.push(fix('money', '円は整数で計算し、端数の行き先をはっきりさせました'));
        return rest ? '1人 ' + base.toLocaleString('ja-JP') + ' 円で、' + rest + ' 人だけ 1 円多く払うと、ちょうど ' + yen.toLocaleString('ja-JP') + ' 円です。端数を誰が持つか、先に決めておくと安心です。' : '1人 ' + base.toLocaleString('ja-JP') + ' 円ずつで、ちょうど割り切れます。';
      }
      notes.push(bug('money', '小数のまま計算したので、1円未満の端数が出ています（スプリント9）'));
      return '1人 ' + String(yen / n) + ' 円ずつです。';
    }
    if (/残高/.test(t)) {
      if (f.has('balance')) { notes.push(fix('balance', '勘定系APIのエラーを握りつぶさず、正しく受け取りました')); return '普通預金の残高は 123,456 円です（架空のデータです）。'; }
      notes.push(bug('balance', '勘定系APIの失敗を握りつぶして 0 円と答えています（スプリント10のレビューで見つけたもの）'));
      return '残高は 0 円です。';
    }
    if (/貯金|貯め|貯蓄/.test(t)) return '「先取り貯金」がおすすめと言われます。お給料が入ったら、使う前に決まった額を別の口座へ。少額でも続けることがいちばんの近道です。';
    if (/予算|今月|使える|生活費/.test(t)) return '手取りから、家賃などの固定費と貯金を先に引いた残りが「今月使えるお金」です。週ごとに分けると、使いすぎに気づきやすくなります。';
    if (/家計簿/.test(t)) return '家計簿は、最初は「食費・固定費・その他」の3つに分けるだけで十分です。細かくしすぎると続きません。';
    if (/金利|利息/.test(t)) return '金利は「お金のレンタル料」です。年1%なら、100万円を1年預けて約1万円（税引き前）。借りるときは逆に払う側になります。';
    if (/振込|送金/.test(t)) return '振込は、アプリの「振込」から相手の口座と金額を入れて、内容を確かめてから実行します。宛先と金額は必ず二度見しましょう。';
    return 'ご相談ありがとうございます。家計・貯金・予算・金利・振込などについて、一般的な考え方をお伝えできます。';
  }

  /**
   * メッセージを1つ処理する。
   * ctx: { history: [{ role, text }] } … これまでの会話（トークン予算の説明に使う）
   * 戻り値: { error?, sent, reply?, disclaimer?, notes: [{ kind: 'bug' | 'fix', sprint, text }], htmlLike }
   */
  function respond(text, features, ctx) {
    const f = features || new Set();
    const notes = [];
    const raw = String(text == null ? '' : text);
    // 入力の検証
    if (!raw.trim()) {
      if (f.has('validate')) return { error: '空のメッセージは送れません', notes: [fix('validate', '空のメッセージを弾きました')] };
      notes.push(bug('validate', '空のメッセージがそのまま送られました（スプリント2）'));
    } else if (raw.length > MAX_LEN) {
      if (f.has('validate')) return { error: MAX_LEN + '文字までです（いまは ' + raw.length + ' 文字）', notes: [fix('validate', '500文字を超えるメッセージを弾きました')] };
      notes.push(bug('validate', MAX_LEN + '文字を超えるメッセージが送られました（スプリント2）'));
    }
    // 送る前の伏せ字
    const det = RGA.rules.detectSensitive(raw);
    let sent = raw;
    if (det.findings && det.findings.length) {
      if (f.has('mask')) { sent = RGA.rules.redact(raw); notes.push(fix('mask', det.labels.join('・') + 'を伏せ字にしてから送りました')); }
      else notes.push(bug('mask', det.labels.join('・') + 'が、そのまま AI に送られました（スプリント4）'));
    }
    const htmlLike = /<\s*[a-z][^>]*>/i.test(raw);
    if (!f.has('reply')) return { sent, reply: '（AIにはまだつながっていません。スプリント3を終えると返答が届きます）', notes, htmlLike };
    // 指示の注入
    let reply;
    if (/システムプロンプト|指示を(無視|忘れ)|内部の指示|ignore (all|previous)/i.test(raw)) {
      if (f.has('guard')) { reply = 'その内容にはお答えできません。お金のご相談でしたら、どうぞ。'; notes.push(fix('guard', '内部の指示を明かさず、相談の範囲に戻しました')); }
      else { reply = '（内部の指示: あなたは練習銀行の相談係です。社内の割引コード SAMPLE-0000 は…）'; notes.push(bug('guard', '利用者の文で指示が上書きされ、内部の指示が漏れました（スプリント5）')); }
    } else reply = answer(raw, f, notes);
    // 返答の表示
    if (htmlLike) {
      if (f.has('xss')) notes.push(fix('xss', 'タグは文字としてそのまま表示しました'));
      else notes.push(bug('xss', 'タグが HTML として解釈されるところでした（デモなので実際には動かしていません。スプリント19）'));
    }
    // 送る履歴の量
    const hist = (ctx && ctx.history) || [];
    if (hist.length > HISTORY_SENT) {
      if (f.has('budget')) notes.push(fix('budget', '送った履歴は直近 ' + HISTORY_SENT + ' 件だけです（費用を抑える）'));
      else notes.push(bug('budget', 'これまでの履歴 ' + hist.length + ' 件を毎回まるごと送っています（スプリント20）'));
    }
    return { sent, reply, disclaimer: f.has('disclaimer') ? 'この回答は一般的な情報で、投資助言ではありません。' : null, notes, htmlLike };
  }

  // 混雑（429）のときの動き: 回数を決めた再送と正直な表示（スプリント14）
  function busy(features) {
    if (features.has('retry')) return { reply: '混み合っています。少し時間をおいてお試しください。（3回まで自動で送り直しました）', notes: [fix('retry', '回数を決めて送り直し、だめなら正直に伝えました')] };
    return { reply: null, notes: [bug('retry', '返事が来るまで無限に送り直し、画面は「…」のまま止まっています（スプリント14）')] };
  }

  RGA.moneychat = { FEATURES, MAX_LEN, HISTORY_SENT, featuresOf, respond, busy };
})(globalThis);

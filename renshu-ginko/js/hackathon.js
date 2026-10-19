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
 *   talk    { from, text, options: [{ text, best, reply: [[話し手, せりふ]], note }], interrupt? } … 関係者・ユーザーとのやりとり
 *           interrupt: true は関係者の割り込みや仕様のひっくり返し（3〜4スプリントに1回だけ）
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
    { id: 'player', name: 'あなた', icon: '🧑‍💻', group: 'team', role: '新卒1年目（研修中・情報系の院卒）', persona: '主人公。新卒1年目で研修中。情報系の大学院を出ているので同期より少し年上（一人称は「俺」）。真面目さとゆるさが同居していて、やるときはやるが肩の力は抜けている。積極的で、分からないことにも自分から手を挙げる。読んでレビューする力を伸ばしている。上司2人からは「くん」付けで呼ばれる。' },
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
    { id: 'rio', name: '神崎 理央', icon: '🧑‍🔬', group: 'team', role: '同期・情報系の院卒', persona: '同期。情報系の大学院卒で、学生時代からゴリゴリ開発してきた経験者。主人公と境遇がまったく同じ（情報系の院卒で同期より少し年上）なので、めちゃくちゃ仲が良い。計算量・型・設計に強く、気心の知れた主人公にはくだけた口調で話す。', topics: [
      { q: '計算量ってレビューで見る？', a: '見る見る。件数が増えたときに困るかどうか、だけでいい。ループの中でループや通信をしてたら、まず疑う。院でさんざんやったよな（笑）' },
      { q: '型って何がうれしいの？', a: '「この値は何者か」をコードに書いておけること。読む人の頭の中の推測が減る。チーム開発だと特に効くんだよ。' },
      { q: '最近どう？', a: '研究室のころより、人に読まれるコードを書く楽しさが分かってきた。{player}、今日の帰りラーメン行かね？' },
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
    { id: 'kiryu', name: '桐生 拓', icon: '🧑‍🔧', group: 'user', role: '技術ユーザー', persona: '技術ユーザー。AI・アーキテクチャ・インフラ・セキュリティ・運用・コストまで、システムのすべての観点に精通していて、どの角度からでも意見を出せる。「AIの返答はどう送るの？」「プロンプトキャッシュは使ってる？」「サーバーに送る前にセキュアにしてる？」と鋭く聞く。ときどき仕様をひっくり返すが、なぜか憎めない。', topics: [
      { q: 'AIアプリで一番気にすることは？', a: '送る前に何を消しているか、だね。個人情報や鍵がプロンプトに乗ったら、もう取り返せないから。' },
      { q: 'プロンプトキャッシュって？', a: '毎回同じ前置き（システムプロンプトなど）を先頭に固定して、使い回してもらう仕組み。変わる部分は後ろに置くのがコツ。' },
      { q: '最近どう？', a: 'ごめん、また仕様をひっくり返したくなってる（笑）。でもユーザーのためになるなら言うべきだと思ってさ。' },
    ] },
    { id: 'shiraishi', name: '白石 結衣', icon: '👩‍🏫', group: 'boss', role: 'OJTリーダー（上司）', persona: 'OJTリーダー。いつも理解があり共感してくれる、優しくてとても仕事ができる理想の上司。だめなことはだめとはっきり言い、ときに厳しい助言もする。', topics: [
      { q: '成長するコツは？', a: '「読んだコードの数」は裏切らないよ。書けない日も、読むことはできる。読めるようになれば、書けるようになるから。' },
      { q: '指摘されて落ち込みました', a: 'うん、悔しいよね。でもその指摘は、あなたのコードが読まれた証拠。次に同じ指摘をされなければ、それで十分成長してる。' },
      { q: '最近どう？', a: '{player}くんのレビューコメント、根拠が書けるようになってきたね。そこは自信を持っていいよ。ただ、言い切れないときは「確認させてください」でいいからね。' },
    ] },
    { id: 'kumagai', name: '熊谷 大吾', icon: '🐻', group: 'boss', role: '上司', persona: '上司。部下のことを本当に大事に思い、いつも方向性を示してくれる。仕事にはとても厳しいが、ふだんは優しくゆるい口調で、真面目で面白い。こういう上司になりたいと思わせる人。', topics: [
      { q: '仕事で一番大事なことは？', a: 'お客さんのお金を預かってるってことだなぁ。だからテストもレビューも手を抜かない。そこだけは厳しくいくよ〜。' },
      { q: 'いいエンジニアってどんな人？', a: '「分からない」を早く言える人かな。分からないまま3日たつより、3分で聞いた方がチームは速いんだ。' },
      { q: '最近どう？', a: '最近、腰が痛くてねぇ…立って仕事する机を買ったら、立ってるのに疲れて座ってる（笑）。{player}くん、いい顔になってきたね。' },
    ] },
    // ---- ハッカソンの外の同期・友人・先輩（物語には直接かかわらず、雑談や「分からないことを聞きに行く」相手） ----
    { id: 'kujo', name: '九条 学', icon: '🤓', group: 'friend', daily: true, field: 'AI・機械学習・データ分析', role: '同期・データサイエンス部', persona: '同期（データサイエンス部）。AI・機械学習・データ解析にめっぽう強く、勉強がとてもできるいいやつ。ただしそれ以外のこと（段取り・忘れ物・生活のあれこれ）は引くほどできず、本人はそれをすごく気にしている。説明は数式寄りだが、聞けば一生懸命かみ砕いてくれる。', topics: [
      { q: 'LLMって結局なにをしてるの？', a: '次に来る言葉の確率を、ものすごく上手に当ててるんだ。だから「それっぽい嘘」も言える。……あ、また社員証忘れた。' },
      { q: '最近どう？', a: '学習データの前処理は完璧なのに、今朝は靴下を左右ちがうの履いてきた……。{player}、俺ってなんでこうなんだろう。' },
      { q: '勉強のコツは？', a: '分からない所を、分からないと書き出すこと。それができれば半分終わってる。……生活の分からない所は書き出しても直らないけど。' },
    ] },
    { id: 'himuro', name: '氷室 蓮', icon: '🧊', group: 'friend', daily: true, field: 'アプリ開発・技術全般', role: '同期・情報基盤部', persona: '同期（情報基盤部）。アプリ開発や技術全般がすごい。自分を過小評価しているが（自己肯定感が低いわけではない）、めちゃくちゃ仕事ができる。ただ、できない人への当たりが強く、人の気持ちを汲んだ物言いが苦手で、言い方がストレート。育ちが良く、根はいいやつ。', topics: [
      { q: '設計のコツは？', a: '変わりそうな所と変わらない所を分ける。それだけ。別に俺がすごいわけじゃなくて、普通のことだよ。' },
      { q: 'レビューで何を見る？', a: 'テストがない変更は見る前に返す。それで怒る人もいるけど、なんで怒るのかは正直よく分からない。' },
      { q: '最近どう？', a: '基盤の移行、予定より2週間早く終わった。……たまたまだよ。{player}のとこのハッカソン、ちゃんと動いてる？' },
    ] },
    { id: 'kasuga', name: '春日 ゆず', icon: '🍻', group: 'friend', daily: true, field: 'ネットワークの基本・初心者目線', role: '同期・ネット系基盤部', persona: '同期（ネット系基盤部）。文系出身の未経験で、飲み会が大好き。飲みへのモチベーションがとにかく高い。明るいけれど自己肯定感がとても低く、すぐ「私なんて」と落ち込みがちで、かまってほしがり。でもいい子で、守ってあげたくなる。初心者目線の素朴な疑問が、実は本質を突いていることがある。', topics: [
      { q: '今日飲み行く？', a: '行く！！！ 絶対行く！ ……あ、でも私なんかが誘っていいのかな。みんな忙しいよね……。ううん、行こ！🍺' },
      { q: 'ネットワークって難しい？', a: '難しいよ〜！ でも「手紙の住所（IP）と、部屋番号（ポート）」って教わってから、ちょっと分かった気がする。……合ってる？' },
      { q: '最近どう？', a: '今日もコマンド打ち間違えて先輩に笑われた……私ほんとダメだぁ。{player}くん、ちょっとだけ話聞いてくれる？' },
    ] },
    { id: 'seto', name: '瀬戸 海斗', icon: '🌏', group: 'friend', field: '英語の資料・海外の技術動向', role: '同期・海外本部', persona: '同期（海外本部）。とにかく頭の回転が速く、英語も技術も堪能。とても謙虚で控えめ、すごく優しい。英語の公式ドキュメントや海外の事例を、分かりやすく要約してくれる。', topics: [
      { q: '英語のドキュメントの読み方は？', a: '最初に見出しとコード例だけ拾うといいよ。全部訳さなくて大丈夫。僕もそうしてる。' },
      { q: '最近どう？', a: 'シンガポールの拠点とのミーティングが続いてるよ。{player}くんのハッカソンの話、いつも楽しみにしてるんだ。' },
    ] },
    { id: 'yabuki', name: '矢吹 航平', icon: '⚾', group: 'outside', field: '気持ちの立て直し・チームの空気', role: '他社のBP（大学の同級生）', persona: '他社から来ているビジネスパートナー（開発）。主人公と同じ大学の同級生で、仕事に関係なく友達として話せる。野球バカで根っから明るい。根性とコミュニケーション能力と明るさでみんなから人気がある、本当にいいやつ。主人公の心のメンター。思い出話にもよく花が咲く。', topics: [
      { q: 'しんどいときどうしてる？', a: '素振り！ ……は冗談で、とりあえず寝て、朝メシ食う。体が元気なら、だいたい何とかなるって。大学のときもそうだったろ？' },
      { q: '大学のころの話', a: '覚えてる？ 卒論の締め切り前に、研究室で朝までキャッチボールしたの（笑）。あのときお前、結局ちゃんと間に合わせたもんな。' },
      { q: '最近どう？', a: '今週末、草野球の試合あるんだよ。{player}も来いって！ 気分転換は大事だぞ！' },
    ] },
    { id: 'onizuka', name: '鬼塚 迅', icon: '⚡', group: 'friend', daily: true, field: '実装・デバッグ全般（即戦力）', role: '同期・別のハッカソンチーム', persona: '同期。別のハッカソンチームで開発している。技術力が半端なく、中途入社の人並みにできる。人の気持ちを汲み取るのが苦手で、そのことを少し気にしている（残念ながら改善は難しい）。主人公は、こいつが本当はいいやつだと分かっていて、なぜか誇らしく思っている。なんやかんやブーブー言いながら、助けてくれたり一緒に作業してくれたりする。', topics: [
      { q: 'ちょっと手伝ってくれない？', a: 'はぁ？ 自分のチームの見ろよ……。で、どこ。5分だけな。……あー、これは非同期の待ち忘れだな。ほら。' },
      { q: 'デバッグのコツは？', a: '思い込みを捨てて、ログを出す。以上。……なんでみんなそれをやらないのか分からん。' },
      { q: '最近どう？', a: 'うちのチームの子に「言い方がきつい」って言われた。……きつかったのか？ {player}、どう思う。' },
    ] },
    { id: 'yuzuki', name: '柚木 さくら', icon: '🌸', group: 'friend', field: 'チャネル（窓口・アプリ・ATM）の仕組み', role: '同期・チャネルシステム系', persona: '同期（チャネルシステム系）。いい子で、とても優しい。銀行の窓口・アプリ・ATM など、お客さまとの接点の仕組みに詳しい。', topics: [
      { q: 'チャネルって何？', a: 'お客さまが銀行とつながる「入り口」のことだよ。窓口、アプリ、ATM、コールセンター。どこから来ても同じ体験にするのが目標なの。' },
      { q: '最近どう？', a: 'アプリの問い合わせを読んでると、言葉ひとつで困らせちゃうんだなって思う。{player}くんも無理しないでね。' },
    ] },
    { id: 'hanaoka', name: '花岡 みのり', icon: '🌻', group: 'friend', field: '融資・ローンの業務', role: '同期・融資系', persona: '同期（融資系）。明るくて優しくて、話がおもしろい。融資・ローンの業務に詳しく、お金の話を身近なたとえで説明してくれる。', topics: [
      { q: '金利ってどう計算するの？', a: '借りたお金の「レンタル料」だよ！ 年3%なら、100万円を1年借りて3万円。……って言うと、急にこわくなるでしょ（笑）' },
      { q: '最近どう？', a: '審査の書類が山盛りで、昨日は書類の夢見た！ {player}くん、ハッカソン終わったら打ち上げしよ〜！' },
    ] },
    { id: 'saionji', name: '西園寺 麗華', icon: '💎', group: 'friend', field: '証券・資産運用の業務', role: '同期・証券系', persona: '同期（証券系）。お金持ちのお嬢様で、高嶺の花。上品で落ち着いた話し方。証券や資産運用の業務、投資に関するルールに詳しい。', topics: [
      { q: '投資助言って何がだめなの？', a: '登録のない者が「この銘柄を買うべき」と勧めることは、法律で厳しく決められていますの。一般的な情報と、個別の推奨は分けて考えてくださいませ。' },
      { q: '最近どう？', a: '週末は家族と別荘におりましたわ。{player}さんのハッカソン、陰ながら応援しておりますのよ。' },
    ] },
    { id: 'kurokawa', name: '黒川 怜', icon: '🕶️', group: 'friend', field: '証券システム・高負荷・正確さ', role: '同期・証券システム系', persona: '同期（証券システム系）。頭の回転が速く、仕事もできる。とっつきにくい雰囲気だが、話すと優しくていいやつ。ただし、できない人間には容赦がない。大量の取引を正確にさばく仕組み（同時実行・性能）に詳しい。', topics: [
      { q: '同時アクセスで気をつけることは？', a: '「確認してから書く」の間に、別の誰かが割り込む。それを前提に作れ。……分からなかったらもう一回説明する。' },
      { q: '最近どう？', a: '寄り付きの負荷試験が終わった。{player}、お前のとこのチャットも、混む時間を想定しとけよ。' },
    ] },
    { id: 'fukamachi', name: '深町 透', icon: '🧠', group: 'senpai', field: '開発プロセス・人とチームの見方', role: '先輩・開発支援部', persona: '先輩（開発支援部）。ハッカソン前の研修でとてもお世話になった。技術もすごいが、心理学部出身なので本質的な気づきをくれる。人をよく見ていてクールな印象だが、主人公と話すときはとても気さくでいい先輩。', topics: [
      { q: 'チームがうまくいくコツは？', a: '人は「正しいこと」より「分かってもらえた」で動くことが多いんだ。レビューも同じでね。まず相手の意図を言葉にしてあげるといい。' },
      { q: '最近どう？', a: '研修のときより、ずいぶん顔つきが変わったね。{player}は、困ったときに人を頼れるのが強みだよ。' },
    ] },
    { id: 'kazami', name: '風見 一真', icon: '🚗', group: 'senpai', field: '調査・新技術・鋭い助言', role: '先輩・リサーチ&開発部', persona: '先輩（リサーチ&開発部）。ちょっと変わっていておもしろいが、仕事はめちゃくちゃできる。質問すると鋭く的確なアドバイスをくれる。主人公とはドライブに行きまくる仲。', topics: [
      { q: '新しい技術、何から追えばいい？', a: '「何が嬉しくなったのか」だけ追えばいい。名前は3年で変わるけど、嬉しさは変わらない。……で、今週末どこ走る？' },
      { q: '最近どう？', a: '昨日、深夜の湾岸を走りながら設計のこと考えてたら、いい案が出た。{player}、次は海のほう行こうぜ。' },
    ] },
    { id: 'saotome', name: '早乙女 ことは', icon: '😇', group: 'senpai', field: '研修の内容・やさしい解説', role: '先輩・IT研修担当', persona: '先輩（IT研修担当）。主人公の2つ上。美人でおっとりした人で、いつも笑ってくれる優しい天使のような存在。主人公は完全に懐いている。研修で習った内容を、やさしく解説し直してくれる。', topics: [
      { q: '研修の内容、忘れちゃいました', a: 'ふふ、大丈夫だよ〜。忘れるのは使ってなかったからだから、今もう一回やればちゃんと残るよ。一緒に見よっか。' },
      { q: '最近どう？', a: '{player}くん、ハッカソンがんばってるって聞いたよ〜。えらいえらい。ちゃんと寝てる？' },
    ] },
    { id: 'miyamoto', name: '宮本 陽子', icon: '🤱', group: 'senpai', field: '何でも相談（気持ちの面も）', role: '先輩・IT研修担当', persona: '先輩（IT研修担当）。主人公の6つ上。とにかく包容力があり、すべてを包み込むような母性の持ち主。この人に何か聞かれると、主人公はつい全部話してしまう。仕事の悩みも気持ちの悩みも受け止めてくれる。', topics: [
      { q: '実は悩んでいて……', a: 'うんうん、どうしたの。全部話してごらん。……そっか、がんばってたんだね。ひとりで抱えなくていいのよ。' },
      { q: '最近どう？', a: '{player}くん、ちゃんとごはん食べてる？ 顔見たら分かるのよ。今日はもう早く帰りなさいね。' },
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

  // ---- 分からないことを聞きに行く相手（スプリントごと）と、毎日の雑談 ----
  // consult: { no, who, topic, q, lines: [[話し手, せりふ]] }  … 主人公の知らない分野が出たときに聞きに行くイベント
  // smalltalk: { no, lines: [[話し手, せりふ]] }               … 毎日しゃべる同期との雑談（物語には直接かかわらない）
  const CONSULTS = [];
  const SMALLTALK = [];
  function addConsults(list) { for (const c of list) CONSULTS.push(c); }
  function addSmallTalk(list) { for (const t of list) SMALLTALK.push(t); }
  const consultsOf = (no) => CONSULTS.filter((c) => c.no === no);
  const smallTalkOf = (no) => SMALLTALK.find((t) => t.no === no) || null;

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
    return { solved: {}, work: {}, chat: {}, choices: {}, briefed: {}, consulted: {} };
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
      ['friend', 'outside', 'senpai'].includes(c.group) ? 'あなたはハッカソンのチームの外の人で、物語には直接かかわらない。主人公から雑談や相談を受ける立場。得意な分野: ' + (c.field || '') : '',
      c.group === 'boss' ? '主人公のことは「' + nameOf('player', names) + 'くん」と呼ぶ。' : '',
      sprint ? '今はスプリント' + sprint.no + '「' + sprint.title + '」。スプリントゴール: ' + sprint.goal : '',
      '話し相手は' + nameOf('player', names) + '（新卒1年目・研修中）。',
      '守ること: 人物になりきって日本語で短め（3〜6文）に話す。実在の人物・企業・顧客情報には触れない。パスワードや API キーなどの秘密は聞かない・言わない。',
      '問題の答えそのものは言わず、考え方やヒントで導く。投資や税金の具体的な助言はしない（架空の研修の話にとどめる）。',
    ].filter(Boolean).join('\n');
  }

  RGA.hack = {
    TOTAL_SPRINTS, CAST, CAST_BY_ID, SM_ORDER, REVIEW_KINDS, LANGS, NG_WORDS, SPRINTS,
    CONSULTS, SMALLTALK, addConsults, addSmallTalk, consultsOf, smallTalkOf,
    addSprints, problemsOf, findProblem, scrumMaster, nameOf, fill,
    gradeReview, gradeFix, gradeChoice, gradeComment, gradeTalk, grade, answerWork,
    emptyProgress, sprintStatus, unlockedUpTo, released, velocity, solve, personaPrompt,
  };
})(globalThis);

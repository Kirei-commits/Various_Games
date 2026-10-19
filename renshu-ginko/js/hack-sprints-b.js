/*
 * ハッカソン: スプリント9〜16（お金の正確さ〜運用の目線）
 * 形は js/hackathon.js の先頭の説明を参照。コードは String.raw で書く。行番号は1始まり。
 */
(function (g) {
  'use strict';
  const H = g.RGA.hack;

  H.addSprints([
    {
      no: 9,
      title: '1円もずらさない: お金の計算',
      goal: '残高・利息・割り勘の計算で、1円の誤差も出さない',
      knowledge: ['小数（浮動小数点数）の誤差と 0.1 + 0.2', 'お金は「円の整数」で持つ', 'Java の BigDecimal（valueOf と RoundingMode）'],
      briefing: [
        ['hikari', 'スクラムマスターの陽野ひかりです！ 今回のテーマは「お金の計算」💰 ここから銀行っぽくなってきたね！'],
        ['hosoya', '先に申し上げておきます。1円でもずれたら、私は使いません。'],
        ['rio', '配る知識はこれ。コンピューターの小数は2進数なので、0.1 も 0.2 も「ほんの少しずれた値」で持っている。だからお金は「円の整数」で持つか、Java なら BigDecimal を文字列や valueOf から作って、丸め方（RoundingMode）を必ず指定する。'],
        ['kumagai', 'お金の計算で「だいたい合ってる」は、合ってないのと同じなんだよねぇ。今回はそこだけ厳しくいくよ〜。'],
      ],
      problems: [
        {
          id: 'S09-1', type: 'predict', title: '理央の小テスト: 0.1 + 0.2', by: 'rio', lang: 'js', points: 1,
          story: '{rio}「割り勘の画面で合計がおかしいって報告があった。原因はたぶんこれ。何が表示されると思う？」',
          code: String.raw`const fees = [0.1, 0.2];
const total = fees[0] + fees[1];
console.log(total === 0.3, total);`,
          q: '表示されるのは？',
          choices: ['true 0.3', 'false 0.30000000000000004', 'false 0.3', 'true 0.30000000000000004'],
          answer: 1,
          hints: [
            'コンピューターは小数を2進数で持っています。0.1 は2進数でぴったり書けるでしょうか？',
            '10進数の 1/3 = 0.333… と同じで、2進数では 0.1 が割り切れません。',
            '少しずつずれた値どうしを足すと、ずれも足されます。=== は「ぴったり同じ」かを比べます。',
            'JavaScript で 0.1 + 0.2 を表示すると、末尾に …0004 が付きます。',
          ],
          why: '0.1 と 0.2 はどちらも2進数で正確に表せず、足すと 0.30000000000000004 になる。=== 0.3 は false。お金は「円の整数」で計算し、表示のときだけ整形する。',
        },
        {
          id: 'S09-2', type: 'fix', title: '自分のコード: 利息が1円足りない', by: 'player', lang: 'java', points: 3,
          story: '先週の{player}が書いた利息の計算。{hosoya}さんから「残高 100,000円・年利 0.07% で、利息が 69円 と出ます。70円のはずです」と報告が来た。',
          file: 'core/src/main/java/bank/InterestCalculator.java',
          code: String.raw`import java.math.BigDecimal;
import java.math.RoundingMode;

public class InterestCalculator {

    // 残高（円）と年利（0.07% なら 0.0007）から、1年分の利息を返す（円未満は切り捨て）
    public static long yearlyInterest(long balanceYen, double annualRate) {
        BigDecimal balance = BigDecimal.valueOf(balanceYen);
        BigDecimal rate = new BigDecimal(annualRate);
        BigDecimal interest = balance.multiply(rate);
        return interest.setScale(0, RoundingMode.DOWN).longValueExact();
    }
}`,
          bugLine: 9,
          fixes: [
            'BigDecimal rate = BigDecimal.valueOf(annualRate);',
            'BigDecimal rate = new BigDecimal(annualRate).setScale(2, RoundingMode.HALF_UP);',
            'BigDecimal rate = new BigDecimal((float) annualRate);',
            'BigDecimal rate = new BigDecimal(Math.round(annualRate));',
          ],
          answer: 0,
          hints: [
            '100,000 × 0.0007 = 70 です。切り捨てで 69 になるのは、掛ける前の値が 70 より「ほんの少し小さい」からです。',
            'double の 0.0007 は、2進数のずれを含んだ値です。そのずれを BigDecimal にそのまま写していませんか？',
            'new BigDecimal(double) は、double が持っている「ずれた値」をそのまま正確に写します。0.000699999… になります。',
            'BigDecimal.valueOf(double) は、いったん "7.0E-4" という文字列にしてから作るので、ずれが入りません。',
            'setScale(2) で年利を丸めると 0.0007 が 0.00 になり、利息が 0円になってしまいます。',
          ],
          why: 'new BigDecimal(0.0007) は 0.000699999…（2進数のずれ込み）になり、100,000 を掛けて切り捨てると 69円になる。BigDecimal.valueOf(annualRate) なら文字列経由で 0.0007 ちょうどになる。本当は年利を最初から文字列や BigDecimal で受け取るのがいちばん安全。',
        },
      ],
      event: {
        id: 'S09-E', type: 'talk', title: '細谷さんの割り勘チェック', by: 'hosoya', from: 'hosoya', lang: 'text', points: 1,
        text: '{hosoya}「割り勘機能で 1,000円 を3人で割ったら、333円が3人分で 999円 でした。残りの1円はどこへ行ったのですか？」',
        options: [
          { text: '「1円くらいは誤差の範囲なので、ご容赦ください」', best: false, reply: [['hosoya', '1円でもずれたら使わない、と最初に申し上げました。']], note: 'お金の画面で「誤差」は通らない。ずれをなくすか、どこへ行くかを説明できるようにする。' },
          { text: '「333.33円 と小数まで表示すれば正確になります」', best: false, reply: [['rio', '円未満は払えないし、0.01円を3つ足しても1円にならないよ。']], note: '支払えない単位で表示しても解決しない。端数の行き先を決めるのが本題。' },
          { text: '「端数の扱いは仕様として決める必要があります。天野さんと『誰が1円多く払うか』を決めて、画面にも明記します」', best: true, reply: [['hosoya', '……明記されているなら納得できます。'], ['amano', 'いい論点！ 「端数は幹事が負担」で決めて、合計が必ず元の金額になるテストも足そう！']], note: '端数の行き先は技術の問題ではなく仕様。POと決め、画面とテストに反映する。' },
        ],
        hints: [
          '1,000 ÷ 3 は割り切れません。どこかで必ず端数が出ます。',
          'その端数を誰が持つかは、プログラムが勝手に決めてよいことでしょうか？',
          '仕様を決めるのは誰で、決めたことはどこに書くとよいでしょう？',
        ],
        why: '割り切れない金額の端数は必ず出る。誰に寄せるかは仕様としてPOと決め、画面に明記し、「合計が元の金額と一致する」テストで守る。',
      },
      retro: [
        ['hikari', 'おつかれさま〜！ よかったこと: 0.1 + 0.2 の正体が分かった✨ 次に試すこと: お金の型は「円の整数」か BigDecimal、ってチェックリストに追加！'],
        ['rio', 'new BigDecimal(double) は読むだけだと正しそうに見えるのが怖い。レビューで見つけられるようになっておきたい。'],
        ['kumagai', '1円の重みが分かったねぇ。お客さんにとっては、1円ずれたら「この銀行、大丈夫？」なんだよ。'],
      ],
    },
    {
      no: 10,
      title: '勘定系API（Java）とつなぐ',
      goal: 'チャットから勘定系APIの残高を安全に取り出し、失敗を失敗として扱う',
      knowledge: ['null と Optional（値がないことを型で表す）', '例外を握りつぶさない（catch して 0 を返さない）', 'コンフリクトの読み方（HEAD と取り込む側）'],
      briefing: [
        ['osamu', '今回のスクラムマスターは真壁だ。勘定系、つまり本物の残高を持っているシステムにつなぐ。'],
        ['osamu', '配る知識。失敗したときに「それっぽい値」を返すな。残高が取れなかったのに 0円 と返したら、AIは「残高は0円です」と答える。取れないなら、取れないと伝えるのが正しい。'],
        ['shiraishi', 'もうひとつ。Java の Optional は「値がないかもしれない」を型で表す箱だよ。get() でいきなり開けずに、isPresent や orElseThrow で「ないとき」を先に考えてね。'],
        ['daichi', '勘定系って聞くだけで緊張する…！ でも頑張る！'],
      ],
      problems: [
        {
          id: 'S10-1', type: 'review', title: '大地くんのPR: 残高の取得', by: 'daichi', lang: 'java', points: 3,
          story: '{daichi}「勘定系から残高とニックネームを取ってくるサービスです！ テストでは全部ちゃんと動きました！」',
          file: 'core/src/main/java/bank/BalanceService.java',
          code: String.raw`import java.util.Optional;

public class BalanceService {
    private final CoreBankingClient client;

    public BalanceService(CoreBankingClient client) {
        this.client = client;
    }

    // チャットに渡す残高（円）
    public long getBalance(String accountId) {
        try {
            Account account = client.findAccount(accountId);
            return account.getBalanceYen();
        } catch (Exception e) {
            return 0;
        }
    }

    // 画面に出す口座のニックネーム（未設定の口座もある）
    public String getNickname(String accountId) {
        Optional<Account> account = client.findAccountOptional(accountId);
        return account.get().getNickname();
    }
}`,
          defects: [
            { line: 16, kind: 'bug', why: '通信エラーも口座なしも全部「残高0円」になる。AIが「残高は0円です」と答えてしまう。例外は記録して呼び出し元へ伝え、画面では「残高を取得できませんでした」と出す。' },
            { line: 23, kind: 'bug', why: 'Optional を確かめずに get() している。口座が見つからないと NoSuchElementException。ニックネーム自体も未設定（null）のことがある。map(Account::getNickname).orElse("お客さまの口座") のように「ないとき」を書く。' },
          ],
          hints: [
            '「テストでは動いた」は成功したときの話。失敗したときに何が返るかを追ってみましょう。',
            'getBalance で勘定系が落ちていたら、呼び出し元は何を受け取りますか？ それをAIはどう説明するでしょう？',
            'catch して 0 を返すと、「残高0円」と「取れなかった」の区別がつきません。',
            'getNickname の Optional は「ないかもしれない」箱です。確かめずに開けている行があります。',
          ],
          why: '失敗を「0円」に化けさせると、間違った金額がお客さまに伝わる。例外はログに残して上へ伝える。Optional は get() で開けず、orElse / orElseThrow で「ないとき」を明示する。',
        },
        {
          id: 'S10-2', type: 'conflict', title: 'コンフリクト: 勘定系への問い合わせ', by: 'rio', lang: 'java', points: 2,
          story: '{rio}「v2 の API に切り替えるブランチを main に取り込もうとしたら、コンフリクトした…」',
          file: 'core/src/main/java/bank/CoreBankingClient.java',
          context: 'HEAD（main）では{osamu}が、勘定系が遅いときにずっと待たされないよう timeout(3秒) を足した。feature/core-api-v2 では{rio}が、勘定系チームの依頼で URL を v1 → v2 に変え、問い合わせを追えるように X-Request-Id ヘッダーを足した。どちらの変更も必要。',
          conflict: String.raw`    public HttpRequest buildRequest(String accountId, String requestId) {
<<<<<<< HEAD
        return HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v1/accounts/" + accountId))
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
=======
        return HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v2/accounts/" + accountId))
            .header("X-Request-Id", requestId)
            .GET()
            .build();
>>>>>>> feature/core-api-v2
    }`,
          options: [
            String.raw`    public HttpRequest buildRequest(String accountId, String requestId) {
        return HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v2/accounts/" + accountId))
            .header("X-Request-Id", requestId)
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
    }`,
            String.raw`    public HttpRequest buildRequest(String accountId, String requestId) {
        return HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v1/accounts/" + accountId))
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
    }`,
            String.raw`    public HttpRequest buildRequest(String accountId, String requestId) {
        return HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v2/accounts/" + accountId))
            .header("X-Request-Id", requestId)
            .GET()
            .build();
    }`,
            String.raw`    public HttpRequest buildRequest(String accountId, String requestId) {
        return HttpRequest.newBuilder()
            .uri(URI.create(baseUrl + "/v1/accounts/" + accountId))
            .header("X-Request-Id", requestId)
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
    }`,
          ],
          answer: 0,
          hints: [
            'コンフリクトは「どちらかを選ぶ」問題とは限りません。まず、両側が何をしたかったのかを読みましょう。',
            'HEAD 側の目的はタイムアウト、取り込む側の目的は v2 への切り替えとリクエストID です。',
            '両方の目的が両立するなら、両方を残すのが正解です。',
            'URL が v1 のままだと、v2 への切り替えという目的が失われます。',
          ],
          why: '両側の変更は別々の目的で、ぶつかっていない。v2 の URL・X-Request-Id・3秒のタイムアウトをすべて残す。片側だけを選ぶと、もう片方の人の仕事が黙って消える。',
        },
      ],
      event: {
        id: 'S10-E', type: 'talk', title: '役員からの前倒し依頼', by: 'exec', from: 'exec', lang: 'text', points: 1,
        text: '{exec}「来月の展示会に合わせたい。リリースを2スプリント前倒しできないかね？」',
        options: [
          { text: '「みんなで残業すれば、全部の機能を前倒しでいけると思います！」', best: false, reply: [['osamu', '疲れたチームが作った勘定系の連携は、本番で必ず牙をむく。']], note: '無理な約束は品質を削る。銀行のシステムでテストやレビューを削るのは危険。' },
          { text: '「天野さんと、前倒しするなら何を後ろに回すか（スコープ）を整理して、選べる案をお見せします」', best: true, reply: [['exec', 'ふむ。選べるなら判断しやすい。'], ['amano', '任せて！ 「残高照会と相談だけ先に出す案」と「全部そろえて予定どおりの案」を、リスク付きで持っていきます！']], note: '期日・範囲・品質のトレードオフを見える形にし、優先順位はPOと決める。品質は交渉の材料にしない。' },
          { text: '「無理です。計画どおりでお願いします」', best: false, reply: [['exec', '……理由も案もなしでは、判断のしようがないな。']], note: '頭ごなしに断ると、相談の場が閉じる。何ならできるかを示す。' },
          { text: '「テストを少し減らせば間に合います」', best: false, reply: [['kumagai', 'それはだめだよ〜。お客さんのお金を扱ってるからね。']], note: '品質（テスト）を削って期日を守るのは、銀行では最も危ない選択。' },
        ],
        hints: [
          '期日を早めるなら、何かを変える必要があります。何を変えるのが安全でしょう？',
          '「何を先に出すか」を決めるのは誰の役割でしたか？',
          '役員が判断しやすいのは、「できる／できない」だけの答えと、選択肢のどちらでしょう？',
        ],
        why: '期日を動かすなら範囲（スコープ）で調整し、品質は削らない。POと選べる案を用意して、判断する人に見せる。',
      },
      retro: [
        ['osamu', '失敗を 0 に化けさせるコードは、前の職場で一番怖かったやつだ。今回見つけられてよかった。'],
        ['daichi', '「動いた」は成功したときだけの話だったんだね…。失敗の道も書くようにする！'],
        ['amano', '前倒しの件、範囲で調整する案にしたよ！ 品質を守ってくれてありがとう！'],
      ],
    },
    {
      no: 11,
      title: 'コンフリクト祭り',
      goal: 'まとめてマージして起きたコンフリクトを、全員の意図を残して解決する',
      knowledge: ['コンフリクトは「両方の意図」を読んでから解く', 'Python の dict はキーが重なると後ろが勝つ', 'マージは小さく、こまめに'],
      briefing: [
        ['daichi', 'スクラムマスターの小森です！ えっと…最終日にみんなで一気にマージしたら、コンフリクトが3つも出ました…！'],
        ['madoka', '3日分の変更が同時にぶつかったからね。まずは一つずつ、落ち着いて解こう。'],
        ['shiraishi', '配る知識だよ。<<<<<<< から ======= までが今いるブランチ（HEAD）、======= から >>>>>>> までが取り込もうとしている側。どちらかを選ぶ前に、それぞれ「なぜ変えたか」を読んでね。'],
        ['rio', '補足。Python の dict リテラルで同じキーを2回書くとエラーにならず、後ろの値が黙って勝つ。マーカーを消すだけだと、これが起きやすい。'],
      ],
      problems: [
        {
          id: 'S11-1', type: 'conflict', title: 'コンフリクト: 送信欄のコンポーネント', by: 'hikari', lang: 'react', points: 2,
          story: '{hikari}「二重送信を直したのに、大地くんのブランチとぶつかっちゃった〜💦」',
          file: 'src/ChatInput.jsx',
          context: 'HEAD（main）では{hikari}が、{hosoya}さんの連打で二重送信される問題を直すため、送信中はボタンを disabled にした。feature/input-limit では{daichi}が、サーバーの上限に合わせて maxLength（500文字）を足し、案内文を変えた。どちらの変更も必要。',
          conflict: String.raw`  return (
    <form onSubmit={handleSubmit}>
<<<<<<< HEAD
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ご相談をどうぞ" />
      <button type="submit" disabled={sending}>送信</button>
=======
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="ご相談をどうぞ（500文字まで）" />
      <button type="submit">送信</button>
>>>>>>> feature/input-limit
    </form>
  );`,
          options: [
            String.raw`  return (
    <form onSubmit={handleSubmit}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="ご相談をどうぞ（500文字まで）" />
      <button type="submit">送信</button>
    </form>
  );`,
            String.raw`  return (
    <form onSubmit={handleSubmit}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="ご相談をどうぞ（500文字まで）" />
      <button type="submit" disabled={sending}>送信</button>
    </form>
  );`,
            String.raw`  return (
    <form onSubmit={handleSubmit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ご相談をどうぞ" />
      <button type="submit" disabled={sending}>送信</button>
    </form>
  );`,
            String.raw`  return (
    <form onSubmit={handleSubmit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="ご相談をどうぞ" />
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="ご相談をどうぞ（500文字まで）" />
      <button type="submit" disabled={sending}>送信</button>
    </form>
  );`,
          ],
          answer: 1,
          hints: [
            'HEAD 側は button を、取り込む側は input を主に変えています。',
            '取り込む側の button には disabled がありません。これは「消した」のでしょうか、それとも「まだ知らなかった」のでしょうか？',
            '{daichi}のブランチは、二重送信の修正より前に作られています。',
            '入力欄が2つ並ぶ案は、両方を残したのではなく、画面を壊しています。',
          ],
          why: '取り込む側の button に disabled がないのは、修正前に枝分かれしたから。input は取り込む側（maxLength と案内文）、button は HEAD（送信中は disabled）を取り、1つずつにまとめる。',
        },
        {
          id: 'S11-2', type: 'conflict', title: 'コンフリクト: AIサービスの設定', by: 'osamu', lang: 'python', points: 3,
          story: '{osamu}「設定ファイルでぶつかった。マーカーを消すだけで終わらせるなよ」',
          file: 'ai_service/config.py',
          context: 'HEAD（main）では{osamu}が、本番向けに max_retries を足し、ログを "INFO" にそろえた（チームの決まり: 本番の設定は INFO）。feature/answer-length では{rio}が、返答の長さを抑える max_tokens を足した。そのとき手元で調べ物をするために log_level を "DEBUG" にしたまま、戻し忘れていた。',
          conflict: String.raw`CONFIG = {
    "model": "chat-model-small",
    "timeout_sec": 10,
<<<<<<< HEAD
    "max_retries": 3,
    "log_level": "INFO",
=======
    "max_tokens": 800,
    "log_level": "DEBUG",
>>>>>>> feature/answer-length
}`,
          options: [
            String.raw`CONFIG = {
    "model": "chat-model-small",
    "timeout_sec": 10,
    "max_retries": 3,
    "log_level": "INFO",
    "max_tokens": 800,
    "log_level": "DEBUG",
}`,
            String.raw`CONFIG = {
    "model": "chat-model-small",
    "timeout_sec": 10,
    "max_tokens": 800,
    "log_level": "DEBUG",
}`,
            String.raw`CONFIG = {
    "model": "chat-model-small",
    "timeout_sec": 10,
    "max_retries": 3,
    "max_tokens": 800,
    "log_level": "INFO",
}`,
            String.raw`CONFIG = {
    "model": "chat-model-small",
    "timeout_sec": 10,
    "max_retries": 3,
    "log_level": "INFO",
}`,
          ],
          answer: 2,
          hints: [
            '足したいキーは max_retries と max_tokens の2つ。どちらも必要です。',
            'log_level は両側で値が違います。チームの決まりはどちらでしたか？',
            'DEBUG は{rio}が手元で調べるための一時的な変更でした。',
            'マーカーだけ消して両方残すと、log_level が2回書かれます。Python の dict では後ろの値が黙って勝ちます。',
          ],
          why: 'max_retries と max_tokens は両方残し、log_level は決まりどおり "INFO" を1つだけ。両方残す案は dict のキーが重なり、後ろの "DEBUG" が黙って勝つので、本番ログが詳しすぎる状態になる。',
        },
        {
          id: 'S11-3', type: 'conflict', title: 'コンフリクト: 振込手数料', by: 'madoka', lang: 'java', points: 3,
          story: '{madoka}「名前の変更とロジックの変更がぶつかってる。呼び出し側も見てから決めよう」',
          file: 'core/src/main/java/bank/FeeService.java',
          context: 'HEAD（main）では{madoka}が、メソッド名 calcFee を calculateTransferFee に変え、呼び出し側もすべて新しい名前に直した。feature/free-transfer では{daichi}が、{amano}の決定「月3回までは手数料無料」を中身に足した（名前は古い calcFee のまま）。',
          conflict: String.raw`<<<<<<< HEAD
    public long calculateTransferFee(long amountYen, int countThisMonth) {
        return amountYen >= 30000 ? 330 : 220;
    }
=======
    public long calcFee(long amountYen, int countThisMonth) {
        if (countThisMonth < 3) {
            return 0;
        }
        return amountYen >= 30000 ? 330 : 220;
    }
>>>>>>> feature/free-transfer`,
          options: [
            String.raw`    public long calcFee(long amountYen, int countThisMonth) {
        if (countThisMonth < 3) {
            return 0;
        }
        return amountYen >= 30000 ? 330 : 220;
    }`,
            String.raw`    public long calculateTransferFee(long amountYen, int countThisMonth) {
        return amountYen >= 30000 ? 330 : 220;
    }`,
            String.raw`    public long calculateTransferFee(long amountYen, int countThisMonth) {
        if (countThisMonth < 3) {
            return 0;
        }
        return amountYen >= 30000 ? 330 : 220;
    }`,
            String.raw`    public long calculateTransferFee(long amountYen, int countThisMonth) {
        return amountYen >= 30000 ? 330 : 220;
    }

    public long calcFee(long amountYen, int countThisMonth) {
        if (countThisMonth < 3) {
            return 0;
        }
        return amountYen >= 30000 ? 330 : 220;
    }`,
          ],
          answer: 2,
          hints: [
            'HEAD は「名前」を、取り込む側は「中身」を変えました。',
            '呼び出し側は、もうどちらの名前を使っていますか？',
            '古い名前のままだと、呼び出し側でコンパイルエラーになります。',
            '両方のメソッドを残すと、呼ばれるのは calculateTransferFee だけ。無料の決まりが効きません。',
          ],
          why: '新しい名前 calculateTransferFee に、月3回まで無料のロジックを入れる。古い名前を残すと呼び出し側が壊れ、両方を残すと新ロジックが使われないまま眠る。',
        },
      ],
      event: {
        id: 'S11-E', type: 'talk', title: 'まどかの問いかけ', by: 'madoka', from: 'madoka', lang: 'text', points: 1,
        text: '{madoka}「今回のコンフリクト、全員が3日分の変更を最終日にまとめてマージしたからだよね。次から、どうしようか？」',
        options: [
          { text: '「マージは一人ずつ順番にして、その間ほかの人は待つことにしよう」', best: false, reply: [['osamu', '待ち時間が増えるだけで、ぶつかる量は変わらない。']], note: '順番を決めても、たまった差分の大きさは同じ。原因は「まとめて」の方にある。' },
          { text: '「ファイルごとに担当を固定して、他人のファイルは触らないことにしよう」', best: false, reply: [['amano', 'それだと、担当が休んだ日に誰も直せなくなっちゃう！']], note: 'コードの持ち主を固定すると、知識が偏り、レビューもしにくくなる。' },
          { text: '「PRを小さくして毎日 main に取り込む。マージの前には main を取り込んで確かめる。これをチームの約束にしよう」', best: true, reply: [['madoka', 'いいね。ワーキングアグリーメントに書いておくね。'], ['amano', '小さく、こまめに！ それならレビューも速くなるし最高！']], note: '差分が小さいうちに混ぜれば、ぶつかっても小さく済む。約束として見える場所に書く。' },
        ],
        hints: [
          'コンフリクトの大きさは、何に比例するでしょう？',
          '3日分の差分と、半日分の差分。ぶつかったときに解きやすいのはどちらですか？',
          '決めたことは、どこに書いておくとチームで守りやすいでしょう？',
        ],
        why: 'コンフリクトは差分がたまるほど大きくなる。小さなPRをこまめに main に取り込み、それをチームの約束（ワーキングアグリーメント）にする。',
      },
      retro: [
        ['daichi', '初めてのスクラムマスター、コンフリクト祭りで大変だったけど…みんなで解けた！'],
        ['rio', 'dict のキーが重なる件、マーカーが消えた時点で安心しちゃうのが一番危ないね。'],
        ['madoka', '次に試すこと: 1日1回は main を取り込む。ボードの一番上に貼っておいたよ。'],
      ],
    },
    {
      no: 12,
      title: 'スプリントレビュー: 法務の注文',
      goal: '免責の表示と、使う前の同意を画面に入れる',
      knowledge: ['投資助言と受け取られる表現を避ける（免責の表示）', '同意は「使う前に・明示的に」もらう', 'ブラウザの保存領域（Web Storage）の値は文字列で返ってくる'],
      briefing: [
        ['hikari', '今回のスクラムマスターは{player}！ 初めての番だね、応援してるよ〜📣'],
        ['amano', '今日はスプリントレビュー！ 法務の堅田さんにも見てもらうよ！'],
        ['legal', '法務の堅田です。AIが「この株を買いましょう」と言えば、投資助言と受け取られかねません。画面には「投資助言ではありません」と明示し、利用前に同意をいただく必要があります。'],
        ['shiraishi', '配る知識を補足するね。同意は「使い始める前に」「自分でチェックして」もらうもの。それと、ブラウザの保存領域（Web Storage）は何を入れても文字列で返ってくる。false を入れても "false" という文字列になるよ。'],
      ],
      problems: [
        {
          id: 'S12-1', type: 'review', title: 'ひかりのPR: チャット画面', by: 'hikari', lang: 'react', points: 3,
          story: '{hikari}「スプリントレビュー用に画面を仕上げたよ✨ 法務の注文、入ってるかな？」 {player}は法務の要件と見比べてレビューする。',
          file: 'src/ChatScreen.jsx',
          code: String.raw`import { useState } from 'react';
import { MessageList } from './MessageList';

export function ChatScreen({ messages, consented, onSend }) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0;

  function handleSend() {
    onSend(text);
    setText('');
  }

  return (
    <main>
      <h1>AIお金相談チャット</h1>
      <p className="lead">AIがあなたに最適な投資先をお答えします！</p>
      <MessageList messages={messages} />
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={handleSend} disabled={!canSend}>送信</button>
    </main>
  );
}`,
          defects: [
            { line: 6, kind: 'spec', why: '送信できる条件に同意（consented）が入っていない。同意前でも相談を送れてしまう。const canSend = consented && text.trim().length > 0; にし、同意前は同意の案内を出す。' },
            { line: 16, kind: 'spec', why: '「最適な投資先をお答えします」は投資助言と受け取られる表現。「一般的な情報をお伝えします。投資助言ではありません」のような免責の表示に変える。' },
          ],
          hints: [
            '法務の注文は2つ。「免責の表示」と「使う前の同意」です。',
            'props に consented が渡ってきています。どこで使われていますか？',
            '送信ボタンが押せる条件を作っている行を見ましょう。',
            '画面の文言も仕様です。「最適な投資先」は、法務の言う「投資助言」に当たりませんか？',
          ],
          why: '同意のフラグを受け取っているのに送信の条件に使っていない（6行目）。リード文は投資助言に見える表現で、免責の表示もない（16行目）。どちらも動きは正しいが仕様とずれている。',
        },
        {
          id: 'S12-2', type: 'fix', title: '自分のコード: 同意したことになっている', by: 'player', lang: 'js', points: 2,
          story: '{player}が書いた同意の保存（storage はブラウザの保存領域 Web Storage）。{hosoya}さんから「『同意しない』を押したのに、次に開いたらチャットが使えました」と報告が来た。',
          file: 'src/consent.js',
          code: String.raw`const CONSENT_KEY = 'chat-consent-v1';

export function saveConsent(agreed) {
  storage.setItem(CONSENT_KEY, String(agreed));
}

export function hasConsent() {
  const v = storage.getItem(CONSENT_KEY);
  return Boolean(v);
}`,
          bugLine: 9,
          fixes: [
            "return v === 'true';",
            'return v !== null;',
            'return !!v;',
            'return Boolean(JSON.stringify(v));',
          ],
          answer: 0,
          hints: [
            '「同意しない」を押すと、saveConsent(false) で何が保存されますか？',
            'storage（Web Storage）には文字列しか入りません。String(false) は "false" です。',
            '空でない文字列は、Boolean にすると true と false のどちらになるでしょう？',
            '!!v は Boolean(v) と同じ意味です。null かどうかだけを見ても、"false" は通ってしまいます。',
          ],
          why: 'Boolean("false") は true（空でない文字列はすべて true）。保存した文字列が "true" と一致するかで判定する。同意の判定は「はっきり同意したときだけ true」にする。',
        },
      ],
      event: {
        id: 'S12-E', type: 'talk', title: '法務からの指摘', by: 'legal', from: 'legal', lang: 'text', points: 1,
        text: '{legal}「デモで、AIが『A社の株は今が買い時です』と答えていましたね。これは困ります。」',
        options: [
          { text: '「AIが自分で考えて言ったことなので、こちらでは制御できません」', best: false, reply: [['legal', '提供しているのは練習銀行です。責任は銀行にあります。']], note: 'AIの出力も、サービスとして出している以上は提供者の責任。制御の手段を考える。' },
          { text: '「免責の文を小さく下に入れておけば、大丈夫ですよね？」', best: false, reply: [['legal', '小さく書けばよい、という話ではありません。そもそも推奨しないことが先です。']], note: '免責の表示は、推奨させない対策の代わりにはならない。' },
          { text: '「ご指摘ありがとうございます。AIへの指示で個別の銘柄や売買を推奨しないよう制限し、返答の下に免責を常に表示します。文言は法務で確認いただけますか」', best: true, reply: [['legal', 'それなら進められます。文言の案を送ってください。'], ['amano', '次のスプリントの最優先にするね！ {player}、ナイス対応！']], note: '出力そのものを制限する対策と、免責の表示を両方。表現の最終確認は専門部署に任せる。' },
        ],
        hints: [
          'AIの返答も、銀行のサービスの一部として見られます。',
          '「言わせない」対策と「表示する」対策、どちらか一方で足りるでしょうか？',
          '法律の表現を最終的に確かめられるのは誰でしょう？',
        ],
        why: '出力の責任は提供者にある。AIへの指示で個別の推奨を制限し、免責を常に表示し、文言は法務に確認してもらう。',
      },
      retro: [
        ['madoka', '{player}、スクラムマスターおつかれさま。レビューの段取り、落ち着いてできてたよ。'],
        ['hikari', '「最適な投資先」、私が書いた文言だった〜💦 言葉も仕様なんだね、勉強になった！'],
        ['shiraishi', '動きが正しくても仕様とずれることはある。要件と見比べて読めたのは大きいよ。'],
      ],
    },
    {
      no: 13,
      title: '仕様ひっくり返し: ポーリングからストリーミングへ',
      goal: '仕様変更の影響を整理し、今のポーリングのコードの問題を洗い出す',
      knowledge: ['useEffect の後片付け（cleanup）', '古い値をつかんだままの関数（stale closure）と set 関数の関数渡し', '仕様変更は影響を洗い出してからPOと決める'],
      briefing: [
        ['madoka', '今回のスクラムマスターは私、早瀬です。今のチャットは、AIの返事を0.5秒ごとに取りに行く「ポーリング」で作ってるよね。'],
        ['kiryu', 'それなんだけどさ、返事が一気に出るから遅く感じるんだよね。少しずつ流れてくる「ストリーミング」にしない？ ……ごめん、また仕様ひっくり返してる（笑）'],
        ['rio', '配る知識。useEffect で setInterval を始めたら、return で clearInterval する後片付けが要る。それと、useEffect の中の関数は作られたときの state を覚えたままになる。最新の値で更新したいなら setCount((c) => c + 1) のように関数で渡す。'],
        ['amano', '変えるかどうかは、影響を見てから決めよう！ まずは今のコードの問題を洗い出してね！'],
      ],
      problems: [
        {
          id: 'S13-1', type: 'review', title: '理央のPR: 返事のポーリング', by: 'rio', lang: 'react', points: 3,
          story: '{rio}「ポーリングのフック。会話を切り替えると、なぜか通信がどんどん増えるんだ…」',
          file: 'src/useReply.js',
          code: String.raw`import { useEffect, useState } from 'react';

export function useReply(conversationId) {
  const [reply, setReply] = useState('');
  const [count, setCount] = useState(0);

  useEffect(() => {
    setInterval(async () => {
      const res = await apiFetch('/api/reply/' + conversationId);
      const data = await res.json();
      setReply(data.text);
      setCount(count + 1);
    }, 500);
  }, [conversationId]);

  return { reply, count };
}`,
          defects: [
            { line: 8, kind: 'bug', why: 'setInterval の戻り値を取っておらず、return () => clearInterval(id) の後片付けがない。会話を切り替えるたび、画面を離れても、タイマーが増え続ける。' },
            { line: 12, kind: 'bug', why: 'count は useEffect が作られたときの値（0）をつかんだまま。何回取りに行っても 1 にしかならない。setCount((c) => c + 1) と関数で渡す。' },
            { line: 13, kind: 'perf', why: '利用者全員が0.5秒ごとにサーバーへ問い合わせる。返事が来ていなくても通信が続き、サーバーとAPIの負荷が大きい。間隔を延ばすか、ストリーミングに切り替える。' },
          ],
          hints: [
            '「会話を切り替えると通信が増える」。useEffect が何度も実行されると、何が何個になりますか？',
            'useEffect が return で後片付けの関数を返していません。',
            'count を更新している行に注目。この関数が作られたとき、count はいくつでしたか？',
            '残りは性能。利用者が1,000人いたら、1秒に何回サーバーに問い合わせが来るでしょう？',
          ],
          why: 'タイマーを止める後片付けがないので、会話を切り替えるたびにタイマーが増える。count は古い値をつかんだまま。0.5秒ごとのポーリングは全員分の負荷になる。これがストリーミングを検討する理由にもなる。',
        },
        {
          id: 'S13-2', type: 'predict', title: '理央の小テスト: 古い値をつかむ関数', by: 'rio', lang: 'js', points: 2,
          story: '{rio}「さっきの count のバグを、React なしで再現してみた。何が表示される？」',
          code: String.raw`let count = 0;
const handlers = [];
for (let i = 0; i < 3; i++) {
  const snapshot = count;
  handlers.push(() => { count = snapshot + 1; });
}
handlers.forEach((h) => h());
console.log(count);`,
          q: '表示されるのは？',
          choices: ['3', '1', '0', '2'],
          answer: 1,
          hints: [
            '3つの関数が作られたとき、snapshot にはそれぞれ何が入りましたか？',
            '関数を作っている間（ループの中）、count はまだ一度も変わっていません。',
            'どの関数も「snapshot + 1」を count に入れます。snapshot はすべて同じ値です。',
          ],
          why: '関数が作られた時点の count（0）を snapshot として覚えているので、3つとも count = 0 + 1 を実行する。結果は 1。useEffect の中で setCount(count + 1) と書いたときと同じことが起きる。',
        },
      ],
      event: {
        id: 'S13-E', type: 'talk', title: '桐生さんの仕様変更', by: 'kiryu', from: 'kiryu', lang: 'text', points: 1,
        text: '{kiryu}「やっぱりストリーミングにしようよ。来週のデモで、返事が一文字ずつ流れてくるのを見たいんだ」',
        options: [
          { text: '「分かりました！ 今夜のうちに全部書き換えます」', best: false, reply: [['osamu', 'タイムアウトや途中で切れたときの扱いを決めずに書き換えるのは危ない。']], note: '影響を見ないまま引き受けると、エラー時の扱いやテストが抜ける。スプリントの計画も崩れる。' },
          { text: '「仕様はもう決まっているので、変えられません」', best: false, reply: [['kiryu', 'うーん、ユーザーのためになる話なんだけどなぁ。']], note: '変化を頭から断ると、よりよい製品にする機会を逃す。' },
          { text: '「体験がよくなるのは分かります。API・画面・途中で切れたときの扱い・テストへの影響を洗い出して、天野さんに優先順位を決めてもらいます」', best: true, reply: [['kiryu', 'それで十分。影響が見えれば、僕も無理は言わないよ。'], ['amano', '洗い出し、助かる！ 見積もりを見て、次のスプリントに入れるか決めるね！']], note: '変化は歓迎しつつ、影響を見える形にして、何をいつやるかはPOが決める。' },
        ],
        hints: [
          '仕様変更そのものは、悪いことでしょうか？',
          '変えると、どこに影響が出ますか？ 画面だけでしょうか？',
          '今のスプリントに入れるかどうかは、誰が決めますか？',
        ],
        why: '仕様変更は歓迎してよい。ただし影響（API・画面・エラー時・テスト）を洗い出し、POに優先順位を決めてもらう。言われるまま急いだり、頭ごなしに断ったりしない。',
      },
      retro: [
        ['madoka', 'よかったこと: 仕様変更の影響を表にできた。次に試すこと: useEffect には必ず後片付けがあるか見る。'],
        ['kiryu', '今回もひっくり返してごめんね。でも影響をちゃんと出してくれたから、話が早かったよ。'],
        ['rio', 'stale closure、理屈は知ってたけど、自分のPRで踏むと身にしみる…。'],
      ],
    },
    {
      no: 14,
      title: '429に備える: リトライとバックオフ',
      goal: 'AIのAPIが混んでいるときも、安全に再送し、やめどきを守る',
      knowledge: ['429（Too Many Requests）と、再送してよいエラー・いけないエラー', '指数バックオフとジッター', 'Retry-After ヘッダー'],
      briefing: [
        ['rio', 'スクラムマスターの神崎です。昨日の負荷試験で、AIのAPIから 429 がたくさん返ってきた。「混んでいるから少し待って」という意味だ。'],
        ['osamu', '配る知識。429 や 503 は待てば通ることがあるから、再送してよい。でも 400（送った内容がおかしい）は何度送っても同じだから、再送しない。待ち時間は 1秒・2秒・4秒…と倍に延ばし（指数バックオフ）、少しばらつき（ジッター）を足す。回数の上限も必ず決める。'],
        ['rio', '補足。サーバーが Retry-After ヘッダーで「何秒待って」と教えてくれたら、それに従う。ただしヘッダーの値は文字列で届く。'],
      ],
      problems: [
        {
          id: 'S14-1', type: 'review', title: '大地くんのPR: AIへの再送', by: 'daichi', lang: 'python', points: 3,
          story: '{daichi}「429 が出ても、成功するまで送り直すようにしました！ これで絶対に返事が返ります！」',
          file: 'ai_service/ask.py',
          code: String.raw`import time

def ask_ai(client, messages):
    while True:
        try:
            return client.create(messages=messages, timeout=30)
        except ApiError as e:
            print("retry", e.status)
            time.sleep(0.1)`,
          defects: [
            { line: 4, kind: 'bug', why: '回数の上限がない。APIが止まっていると永遠に終わらず、利用者も処理も待たされ続ける。最大回数を決め、超えたらエラーとして返す。' },
            { line: 7, kind: 'bug', why: 'どの ApiError でも再送している。400 や 401 は何度送っても失敗するので、再送してよいのは 429・5xx などに限る。' },
            { line: 9, kind: 'bug', why: '0.1秒の固定の待ち時間で送り直すと、混んでいるAPIをさらに混ませて 429 が続く。指数バックオフ＋ジッターで待ち時間を延ばし、Retry-After があれば従う。' },
          ],
          hints: [
            '「成功するまで」送り直すと、成功しなかったときはどうなりますか？',
            'すべての ApiError は、待てば成功するエラーでしょうか？ 400 の意味を思い出しましょう。',
            '混んでいるお店に、0.1秒おきに電話をかけ続けたらどうなるでしょう？',
            '指摘する行は、while・except・sleep の3か所です。どれも「バグ」です。',
          ],
          why: '上限のない再送は止まらない。400 のように直らないエラーまで再送しても無駄。固定の短い間隔は混雑を悪化させる。上限・再送してよいエラーの選別・指数バックオフをそろえる。',
        },
        {
          id: 'S14-2', type: 'fix', title: '自分のコード: Retry-After で落ちる', by: 'player', lang: 'python', points: 3,
          story: '{player}が書いた再送の処理。{osamu}「本番で 429 が返ったとき、TypeError で落ちた。ログはこれだ: unsupported operand / must be real number, not str」',
          file: 'ai_service/retry.py',
          code: String.raw`import random
import time

RETRYABLE = {429, 500, 502, 503, 504}

def wait_seconds(attempt, retry_after=None):
    if retry_after is not None:
        return retry_after
    base = min(2 ** attempt, 30)
    return base + random.uniform(0, 1)

def call_with_retry(send, payload, max_retries=4):
    for attempt in range(max_retries + 1):
        res = send(payload)
        if res.status < 400:
            return res
        if res.status not in RETRYABLE:
            raise ApiError(res.status)
        time.sleep(wait_seconds(attempt, res.headers.get("Retry-After")))
    raise ApiError(res.status)`,
          bugLine: 8,
          fixes: [
            'return float(retry_after)',
            'return str(retry_after)',
            'return min(retry_after, 30)',
            'return 0',
          ],
          answer: 0,
          hints: [
            '落ちたのは 429 のとき。429 のときだけ通る道はどこでしょう？',
            'res.headers.get("Retry-After") は、どんな型の値を返しますか？',
            'HTTP のヘッダーは文字列で届きます。"5" と 5 は違います。',
            'time.sleep に文字列を渡すと TypeError。min(文字列, 30) も比べられずに落ちます。',
          ],
          why: 'Retry-After は "5" のような文字列で届くので、time.sleep("5") で TypeError になる。float(retry_after) で数に直して返す（日付の形で届くこともあるので、本番では変換できないときの扱いも決めておく）。',
        },
      ],
      event: {
        id: 'S14-E', type: 'talk', title: '営業部長の要望', by: 'sales', from: 'sales', lang: 'text', points: 1,
        text: '{sales}「混んでいるときに『しばらくお待ちください』と出るのは印象が悪い。表示は出さずに、裏で返事が来るまで何度でも送り直してくれないか」',
        options: [
          { text: '「分かりました。上限なしで送り直すようにします」', best: false, reply: [['osamu', 'それは今日のレビューで直したばかりのバグだ。']], note: '上限のない再送は、混雑を悪化させ、利用者を無言で待たせ続ける。' },
          { text: '「印象を良くしたいお気持ちは分かります。再送は回数を決めて裏で行い、それでも駄目なときは『混み合っています。少し時間をおいてお試しください』と正直に出す案を、天野さんと詰めます」', best: true, reply: [['sales', 'なるほど、まずは裏で頑張って、駄目なら正直に、か。それなら納得だ。'], ['amano', '文言もやさしくするね！ お客さまの声、ありがとうございます！']], note: '要望の目的（印象）を受け止め、技術的に安全な形で叶える。最終的な優先順位はPOと決める。' },
          { text: '「技術的に無理です」', best: false, reply: [['sales', '無理と言われても、お客さまは待ってくれないんだがね。']], note: '要望の背景を聞かずに断ると、協力関係が崩れる。できる形を探す。' },
        ],
        hints: [
          '部長が本当に困っているのは何でしょう？ 表示そのものですか、お客さまの印象ですか？',
          '「何度でも」送り直すと、今回のレビューで見つけた問題が起きます。',
          '裏での再送と、正直な表示。両方を組み合わせられませんか？',
        ],
        why: '目的（お客さまの印象）は受け止め、再送は上限つきで裏で行い、それでも駄目なら正直でやさしい表示を出す。POと文言や優先度を決める。',
      },
      retro: [
        ['rio', 'よかったこと: 再送してよいエラーを表にできた。次に試すこと: ヘッダーの値は型を確かめてから使う。'],
        ['daichi', '「絶対に返事が返る」は、「絶対に終わらない」と紙一重だった…！'],
        ['osamu', '再送はやさしさにも凶器にもなる。上限と間隔、この2つを忘れるな。'],
      ],
    },
    {
      no: 15,
      title: '誰でも使える画面: アクセシビリティとエラー表示',
      goal: 'キーボードや読み上げでも使え、エラーのときに次の行動が分かる画面にする',
      knowledge: ['押せるものは button（div に onClick を付けない）', '入力欄の label と、変化を読み上げる aria-live', '利用者向けのエラーメッセージの書き方'],
      briefing: [
        ['hikari', '今回のスクラムマスターはまた私、陽野です！ テーマは「誰でも使える画面」🌈'],
        ['shiraishi', '配る知識だよ。div に onClick を付けても、キーボードでは選べないし、読み上げソフトにはボタンだと伝わらない。押せるものは button、入力欄には label、あとから出るエラーは aria-live や role="alert" で読み上げてもらう。このチームでは、これを受け入れ条件（仕様）として扱うよ。'],
        ['madoka', 'エラーの文言も今回の範囲。「何が起きたか」と「次に何をすればいいか」を、お客さまの言葉で書こう。'],
      ],
      problems: [
        {
          id: 'S15-1', type: 'review', title: '大地くんのPR: よく使う質問', by: 'daichi', lang: 'react', points: 3,
          story: '{daichi}「よく使う質問をワンタップで送れるようにしました！ 見た目もかわいくしたよ」 受け入れ条件には「キーボードと読み上げで操作できること」とある。',
          file: 'src/QuickQuestions.jsx',
          code: String.raw`const QUICK = ['今月の支出', '貯金のはじめ方', '固定費の見直し'];

export function QuickQuestions({ value, onChange, onPick, error }) {
  return (
    <section>
      {QUICK.map((q) => (
        <div key={q} className="chip" onClick={() => onPick(q)}>{q}</div>
      ))}
      <input value={value} onChange={onChange} placeholder="質問を入力" />
      {error && <p className="error">{error}</p>}
      <img src="/icons/send.svg" onClick={() => onPick(value)} />
    </section>
  );
}`,
          defects: [
            { line: 7, kind: 'spec', why: 'div はキーボードで選べず、読み上げでもボタンと伝わらない。<button type="button" className="chip"> にする。' },
            { line: 9, kind: 'spec', why: 'placeholder だけでラベルがない。入力すると消え、読み上げでは何の欄か分からない。<label> で「ご相談内容」などの名前を付ける。' },
            { line: 10, kind: 'spec', why: 'あとから出るエラーが読み上げられない。role="alert"（または aria-live="polite"）を付けて、変化を伝える。' },
            { line: 11, kind: 'spec', why: '送信が img への onClick。キーボードで押せず、alt もないので何のボタンか分からない。<button aria-label="送信"> の中にアイコンを入れる。' },
          ],
          hints: [
            'マウスを使わず、Tab キーとEnterキーだけで操作するつもりで読んでみましょう。',
            'div と img は、Tab キーで移動できる要素でしょうか？',
            '目が見えない人が読み上げソフトで使うと、入力欄はどう読まれますか？ placeholder は入力すると消えます。',
            'エラーは「あとから」画面に出ます。読み上げソフトは、気づいてくれるでしょうか？',
            '指摘は4か所。このチームではアクセシビリティは受け入れ条件なので、種類はすべて「仕様とずれ」です。',
          ],
          why: '押せるものは button、入力欄には label、あとから出るエラーには role="alert"、アイコンだけのボタンには aria-label。見た目が同じでも、キーボードと読み上げで使えるかは別の話。',
        },
        {
          id: 'S15-2', type: 'comment', title: 'エラーメッセージにコメントを書く', by: 'hikari', lang: 'js', points: 2,
          story: '{hikari}「エラー表示の文言を関数にまとめたよ！ 気になるところがあったら教えて〜」',
          file: 'src/errorMessage.js',
          code: String.raw`export function errorMessage(err) {
  if (err.status === 429) {
    return 'エラー: 429 Too Many Requests';
  }
  if (err.status >= 500) {
    return 'サーバーで例外が発生しました（NullPointerException at BalanceService.java:12）';
  }
  return '入力が不正です';
}`,
          focus: [3, 6, 8],
          prompt: '3・6・8行目の文言について、レビューコメントを書いてください（何が問題か・なぜ・どう直すか）。',
          checks: [
            { label: '利用者に分かる言葉になっていない（専門用語）ことに触れている', any: ['専門用語', '分かる言葉', 'わかる言葉', '利用者', 'ユーザー', 'お客さま', 'お客様', '平易'] },
            { label: '次に何をすればよいかを書く提案がある', any: ['しばらく', '時間をおいて', 'もう一度', '再度', 'やり直', '次に何', 'どうすれば', '行動'] },
            { label: '内部の情報（例外名・ファイル名）を出さないよう指摘している', any: ['内部', 'スタックトレース', '例外名', 'ファイル名', 'クラス名', '攻撃', 'ログに'] },
          ],
          min: 2,
          sample: '3行目と8行目は専門用語や「不正」という強い言葉で、お客さまには何が起きたか伝わりにくいです。「混み合っています。しばらく時間をおいてもう一度お試しください」のように、次に何をすればよいかを書きませんか？ 6行目は例外名やファイル名などの内部の情報が出ていて、攻撃のヒントになります。詳細はログに残し、画面には短い文だけにしましょう。文言を1か所にまとめたのは、とても良いと思います！',
          hints: [
            'この文言を読むのは誰でしょう？ 開発者ですか、お客さまですか？',
            '「429 Too Many Requests」を読んだお客さまは、次に何をすればよいか分かりますか？',
            '6行目には、クラス名や行番号が入っています。これは誰にとって役立つ情報でしょう？',
            '8行目の「不正」は、責められているように感じる言葉です。どこが違うのかも分かりません。',
            'コメントは「何が・なぜ・どう直すか」。関数にまとめた良い点も1つ添えましょう。',
          ],
          why: '利用者向けのエラーは、専門用語を避け、何が起きたかと次の行動を書く。例外名やファイル名などの内部情報はログに残し、画面には出さない（攻撃のヒントになる）。',
        },
      ],
      event: {
        id: 'S15-E', type: 'talk', title: '細谷さんのキーボード検証', by: 'hosoya', from: 'hosoya', lang: 'text', points: 1,
        text: '{hosoya}「マウスを使わず Tab キーだけで操作してみました。よく使う質問に移動できません。エラーが出ても、どこに出たのか分かりません。」',
        options: [
          { text: '「ほとんどの方はマウスかタッチで使うので、優先度は低いと思います」', best: false, reply: [['hosoya', '手が不自由な方、目が見えにくい方も、お金の相談はします。']], note: '「ほとんどの人」で切り捨てない。誰でも使えることは銀行のサービスの前提。' },
          { text: '「ありがとうございます。今日のレビューで同じ問題を見つけたところです。修正し、『キーボードだけで操作できる』を完成の定義に加えます」', best: true, reply: [['hosoya', '完成の定義に入るなら、次からは毎回確かめられますね。'], ['amano', 'いいね！ 完成の定義、更新しておくよ！']], note: '報告を受け止め、直すだけでなく、完成の定義（DoD）に入れて再発を防ぐ。' },
          { text: '「エラーは赤い文字で目立たせてあるので、見れば分かると思います」', best: false, reply: [['hikari', '色だけだと、色が見分けにくい人や読み上げの人には伝わらないかも…💦']], note: '色だけで情報を伝えない。読み上げにも伝わる仕組み（role="alert" など）が要る。' },
        ],
        hints: [
          '細谷さんの検証は、どんな人の使い方を代わりに試していますか？',
          '今回だけ直しても、次の画面で同じことが起きませんか？',
          'チームで「完成」と呼ぶための条件を、どこに書いていましたか？',
        ],
        why: '報告を受け止めて直し、「キーボードだけで操作できる」を完成の定義に加えて、毎回確かめるようにする。',
      },
      retro: [
        ['hikari', 'Tab キーだけで自分の画面を触ってみたら、びっくりするほど進めなかった〜！ 次からは毎回やる✨'],
        ['daichi', 'div とボタン、見た目は同じなのに全然違うんだね…。'],
        ['madoka', '次に試すこと: 完成の定義に「キーボード操作」「エラーの読み上げ」を追加。もう書いておいたよ。'],
      ],
    },
    {
      no: 16,
      title: 'ログに個人情報を残さない',
      goal: 'ログから口座番号と相談の本文を消し、障害対応に必要な情報だけを残す',
      knowledge: ['ログに残してよい情報・いけない情報', 'オブジェクトを丸ごとログに出すと toString で全項目が出る', 'マスキング（下4桁だけ残す など）'],
      briefing: [
        ['osamu', '今回のスクラムマスターは真壁だ。テーマはログ。障害のとき頼りになるのはログだが、ログは多くの人が見る場所でもある。'],
        ['osamu', '配る知識。ログに残すのは「いつ・どの処理が・どうなったか」を追える情報。リクエストIDや所要時間はいい。口座番号・相談の本文・氏名は残さない。どうしても要るなら下4桁だけにする。'],
        ['rio', '補足。Java の record やよくある DTO は、toString で全部の項目を出す。log.info("{}", req) と書くと、中身が丸ごとログに出る。'],
        ['kumagai', 'お客さんの相談内容は、預かってるお金と同じくらい大事なものだよ〜。ログでも同じ扱いでね。'],
      ],
      problems: [
        {
          id: 'S16-1', type: 'review', title: '理央のPR: 相談APIのログ', by: 'rio', lang: 'java', points: 3,
          story: '{rio}「障害のときに追えるよう、ログを手厚くしたよ」 ConsultRequest は record で、accountNumber（口座番号）と text（相談の本文）を持っている。',
          file: 'core/src/main/java/bank/ConsultController.java',
          code: String.raw`@RestController
public class ConsultController {
    private static final Logger log = LoggerFactory.getLogger(ConsultController.class);
    private final ConsultService service;

    public ConsultController(ConsultService service) {
        this.service = service;
    }

    @PostMapping("/api/consult")
    public ConsultResponse consult(@RequestBody ConsultRequest req) {
        log.info("consult request: {}", req);
        ConsultResponse res = service.answer(req);
        log.debug("account={} text={}", req.accountNumber(), req.text());
        log.info("consult done: requestId={} elapsedMs={}", res.requestId(), res.elapsedMs());
        return res;
    }
}`,
          defects: [
            { line: 12, kind: 'security', why: 'record の toString で口座番号と相談の本文が丸ごとログに出る。リクエストIDなど、追跡に必要な項目だけを出す。' },
            { line: 14, kind: 'security', why: '口座番号と本文をそのまま出している。debug でも、設定ひとつで本番に出る。出すなら口座番号は下4桁にマスクし、本文は文字数だけにする。' },
          ],
          hints: [
            'ConsultRequest は record です。log.info("{}", req) とすると、何が文字列になりますか？',
            'ログに出てはいけない項目は、口座番号と相談の本文です。それが出ている行を探しましょう。',
            'debug レベルなら安全でしょうか？ ログのレベルは設定で変えられます。',
            '15行目は requestId と所要時間だけ。これは障害対応に役立つ、良いログの例です。',
          ],
          why: 'オブジェクトを丸ごと出すと toString で全項目が出る（12行目）。debug でも個人情報は出さない（14行目）。15行目のように、追跡に要る情報だけを選んで出す。',
        },
        {
          id: 'S16-2', type: 'fix', title: '自分のコード: マスクが逆', by: 'player', lang: 'java', points: 2,
          story: '{player}が書いた口座番号のマスク。{osamu}「テストで 1234567 を渡したら ***1234 になった。仕様は ***4567 だろう」',
          file: 'core/src/main/java/bank/Masking.java',
          code: String.raw`public final class Masking {
    private Masking() {}

    // 口座番号は下4桁だけ残す（例: 1234567 → ***4567）
    public static String maskAccount(String accountNumber) {
        if (accountNumber == null || accountNumber.length() <= 4) {
            return "****";
        }
        int keep = 4;
        String head = "*".repeat(accountNumber.length() - keep);
        return head + accountNumber.substring(0, keep);
    }
}`,
          bugLine: 11,
          fixes: [
            'return head + accountNumber.substring(accountNumber.length() - keep);',
            'return head + accountNumber.substring(keep);',
            'return accountNumber.substring(0, keep) + head;',
            'return head + accountNumber;',
          ],
          answer: 0,
          hints: [
            '*** の数は合っています。おかしいのは後ろに付く4桁です。',
            'substring(0, 4) は、先頭から4文字を取ります。',
            '下4桁は「長さ − 4」の位置から最後までです。',
            'substring(keep) は「4文字目から最後まで」。7桁なら 567 の3文字になってしまいます。',
          ],
          why: 'substring(0, keep) は上4桁を取ってしまう。substring(length - keep) で下4桁を取る。マスクの関数は「何桁の番号でも下4桁だけが見える」ことをテストで確かめる。',
        },
      ],
      event: {
        id: 'S16-E', type: 'talk', title: 'セキュリティ室の確認', by: 'sec', from: 'sec', lang: 'text', points: 1,
        text: '{sec}「検証環境のログに、相談の本文と口座番号（テスト用のもの）が出ていたと聞きました。どう対応しますか？」',
        options: [
          { text: '「テスト用のデータなので、問題ありません」', best: false, reply: [['sec', '同じコードが本番に出れば、本物のお客さまの情報が出ます。']], note: 'データが架空でも、コードの問題は本番と同じ。検証環境で見つかったのは幸運と考える。' },
          { text: '「修正をすぐ出し、ほかに出ている箇所がないか調べます。出てしまったログの削除や閲覧制限は、セキュリティ室の手順に沿って進めます。再発防止にマスクのテストとレビューの観点を足します」', best: true, reply: [['sec', '手順に沿っていただけるなら安心です。調査結果を共有してください。'], ['osamu', '影響範囲の調査は俺も手伝う。']], note: '直す・範囲を調べる・手順に沿って後始末する・再発を防ぐ。隠さず、勝手に消さない。' },
          { text: '「目立たないうちに、こちらでログを消しておきます」', best: false, reply: [['sec', '記録を勝手に消すのはやめてください。何が起きたか確かめられなくなります。']], note: '自己判断で証跡を消すと、調査も報告もできなくなる。決められた手順に従う。' },
          { text: '「念のため、ログの出力を全部止めます」', best: false, reply: [['osamu', 'ログがなければ障害のとき何も追えない。消すべきは中身だ。']], note: 'ログ自体は運用に欠かせない。出す項目を選ぶのが正しい対策。' },
        ],
        hints: [
          'テスト用のデータでも、同じコードが本番で動いたら何が出ますか？',
          '出てしまったログの扱いを、自分たちだけで決めてよいでしょうか？',
          '直すだけでなく、次に同じことを起こさないためには何が要りますか？',
        ],
        why: 'すぐ直し、影響範囲を調べ、出てしまったログの扱いはセキュリティ室の手順に従う。マスクのテストやレビューの観点を足して再発を防ぐ。',
      },
      retro: [
        ['osamu', 'よかったこと: ログから個人情報を消しつつ、リクエストIDで追えるようにできた。次に試すこと: ログのレビュー観点をチェックリストに入れる。'],
        ['rio', '「手厚いログ」と「個人情報だらけのログ」は紙一重だった。出す項目を選ぶのが大事だね。'],
        ['shiraishi', 'ここまでで16スプリント。お金・つなぎ込み・法務・運用と、読むべき観点がずいぶん増えたね。{player}さん、自信を持っていいよ。'],
      ],
    },
  ]);
})(globalThis);

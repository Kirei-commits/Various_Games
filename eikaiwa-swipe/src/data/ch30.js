export default {
  id: "ch30",
  title: "銀行・お金の手続き",
  items: `
I'd like to open a bank account. | 銀行口座を開きたいです | A: I'd like to open a bank account. // B: Checking or savings? | A: 銀行口座を開きたいのですが。 // B: 当座預金と普通預金、どちらにしますか？
checking account | 当座預金口座（日常の支払い用） | A: Which account do you use for bills? // B: My checking account. | A: 支払いにはどの口座を使ってる？ // B: 当座預金口座だよ。
savings account | 普通預金口座（貯蓄用） | A: Do you have a savings account? // B: Yes, for emergencies. | A: 貯蓄用の口座ある？ // B: うん、緊急用に。
What do I need to open an account? | 口座開設に何が必要ですか？ | A: What do I need to open an account? // B: Your passport and proof of address. | A: 口座開設に何が必要ですか？ // B: パスポートと住所の証明です。
proof of address | 住所の証明 | A: What counts as proof of address? // B: A utility bill or a lease. | A: 住所の証明には何が使えますか？ // B: 公共料金の請求書か賃貸契約書です。
Is there a monthly fee? | 月額手数料はありますか？ | A: Is there a monthly fee? // B: It's waived if you keep five hundred dollars in it. | A: 月額手数料はありますか？ // B: 500ドル以上残高があれば無料です。
minimum balance | 最低残高 | A: What's the minimum balance? // B: One hundred dollars. | A: 最低残高はいくらですか？ // B: 100ドルです。
I'd like to deposit this check. | この小切手を入金したいです | A: I'd like to deposit this check. // B: Please sign the back. | A: この小切手を入金したいのですが。 // B: 裏面にサインをお願いします。
mobile deposit | スマホでの小切手入金 | A: Do I have to go to the bank? // B: No, just use mobile deposit. | A: 銀行に行かないといけない？ // B: ううん、スマホで入金すればいいよ。
I'd like to withdraw some cash. | 現金を引き出したいです | A: I'd like to withdraw some cash. // B: How much would you like? | A: 現金を引き出したいのですが。 // B: おいくらですか？
ATM | ATM（現金自動預け払い機） | A: Is there an ATM around here? // B: There's one inside the grocery store. | A: この辺にATMある？ // B: スーパーの中にあるよ。
ATM fee | ATM手数料 | A: Why was I charged three dollars? // B: That's the ATM fee. It wasn't your bank. | A: なんで3ドル引かれたの？ // B: ATM手数料だよ。自分の銀行じゃなかったから。
debit card | デビットカード | A: Should I use my debit card or credit card? // B: Credit is safer online. | A: デビットとクレジット、どっちを使うべき？ // B: ネットならクレジットの方が安全だよ。
My card was declined. | カードが使えなかった | A: My card was declined. // B: Maybe your bank flagged it. Call them. | A: カードが使えなかった。 // B: 銀行に止められたのかも。電話してみて。
I lost my card. | カードをなくしました | A: I lost my card. Can you cancel it? // B: Yes, I'll freeze it right now. | A: カードをなくしました。止めてもらえますか？ // B: はい、すぐに停止します。
freeze my card | カードを一時停止する | A: I can't find my wallet. // B: Freeze your card in the app. | A: 財布が見つからない。 // B: アプリでカードを一時停止して。
There's a charge I don't recognize. | 身に覚えのない請求があります | A: There's a charge I don't recognize. // B: Let's open a dispute. | A: 身に覚えのない請求があるんです。 // B: 異議申し立てをしましょう。
dispute a charge | 請求に異議を申し立てる | A: How do I dispute a charge? // B: Tap the transaction in the app and select "dispute." | A: 請求に異議を申し立てるには？ // B: アプリで取引をタップして「異議申し立て」を選んで。
fraud alert | 不正利用の警告 | A: I got a fraud alert text. // B: Don't click the link. Call your bank directly. | A: 不正利用の警告メッセージが来た。 // B: リンクは押さないで。銀行に直接電話して。
transfer money | 送金する | A: How do I transfer money to Japan? // B: Use a wire transfer or an online service. | A: 日本に送金するにはどうすればいい？ // B: 電信送金かオンラインサービスを使って。
wire transfer | 電信送金 | A: How long does a wire transfer take? // B: One to three business days. | A: 電信送金はどのくらいかかりますか？ // B: 1〜3営業日です。
routing number | 銀行の識別番号（ルーティング番号） | A: My employer needs my routing number. // B: It's on the bottom of your checks. | A: 会社が私のルーティング番号を必要としてるの。 // B: 小切手の下に書いてあるよ。
direct deposit | 給与振込 | A: Do you get paid by check? // B: No, direct deposit. | A: 給料は小切手でもらってるの？ // B: ううん、口座振込だよ。
Venmo me. | Venmoで送って | A: I paid for the tickets. // B: Thanks! I'll Venmo you. | A: チケット代払っといたよ。 // B: ありがとう！Venmoで送るね。
Zelle | Zelle（銀行間の即時送金） | A: Can I pay you back with Zelle? // B: Sure, use my phone number. | A: Zelleで返してもいい？ // B: いいよ、電話番号で送って。
credit score | クレジットスコア（信用スコア） | A: Why is building credit important? // B: Your credit score affects everything, even renting. | A: なんで信用を積むのが大事なの？ // B: クレジットスコアは家を借りるときも含めて全部に影響するんだ。
build credit | 信用履歴を積む | A: How can I build credit? // B: Get a card and pay it off every month. | A: どうやって信用を積めばいい？ // B: カードを作って毎月全額払えばいいよ。
pay off the balance | 残高を完済する | A: Do you pay off the balance every month? // B: Always. I hate paying interest. | A: 毎月残高を完済してる？ // B: いつもね。利息を払うのは嫌だから。
interest rate | 金利 | A: What's the interest rate on this card? // B: About twenty-four percent. | A: このカードの金利はいくら？ // B: 24パーセントくらい。
annual fee | 年会費 | A: Is there an annual fee? // B: No, it's free. | A: 年会費はありますか？ // B: いいえ、無料です。
statement | 利用明細書 | A: When does my statement come out? // B: On the fifteenth of each month. | A: 明細はいつ出ますか？ // B: 毎月15日です。
overdraft fee | 当座貸越手数料（残高不足時の手数料） | A: Why did the bank charge me thirty-five dollars? // B: It's an overdraft fee. | A: なんで銀行に35ドル取られたの？ // B: 残高不足の手数料だよ。
insufficient funds | 残高不足 | A: The payment failed. // B: It says "insufficient funds." | A: 支払いに失敗した。 // B: 「残高不足」って書いてあるよ。
bounce | （小切手が）不渡りになる | A: His rent check bounced. // B: That's bad. | A: 彼の家賃の小切手が不渡りになったんだ。 // B: まずいね。
Can I get this in smaller bills? | これを小額紙幣に替えてもらえますか？ | A: Can I get this hundred in smaller bills? // B: Twenties okay? | A: この100ドルを小額紙幣に替えてもらえますか？ // B: 20ドル札でいいですか？
quarters | 25セント硬貨 | A: I need quarters for the laundry machine. // B: There's a change machine over there. | A: 洗濯機用に25セント玉がいる。 // B: あそこに両替機があるよ。
bill | 紙幣／請求書 | A: Do you have a five-dollar bill? // B: Only a ten. | A: 5ドル札ある？ // B: 10ドル札しかない。
tax return | 確定申告（税金の申告書） | A: Did you file your tax return? // B: Not yet. It's due April fifteenth. | A: 確定申告した？ // B: まだ。締め切りは4月15日だよ。
tax refund | 税金の還付 | A: What will you do with your tax refund? // B: Save it for a trip. | A: 還付金で何する？ // B: 旅行のために貯金する。
W-2 | W-2（源泉徴収票） | A: What do I need to do my taxes? // B: Your W-2 from your employer. | A: 確定申告に何が必要？ // B: 会社からもらうW-2だよ。
Social Security number | 社会保障番号 | A: Do you need my Social Security number? // B: Yes, for the application. | A: 社会保障番号が必要ですか？ // B: はい、申込に必要です。
paycheck | 給料（小切手） | A: When do you get your paycheck? // B: Every other Friday. | A: 給料日はいつ？ // B: 隔週の金曜日だよ。
I'm on a tight budget. | 予算がきつい | A: Let's eat at that new steakhouse. // B: I'm on a tight budget this month. | A: あの新しいステーキハウスで食べよう。 // B: 今月は予算がきついんだ。
bank teller | 銀行の窓口係 | A: Can I do this at the ATM? // B: No, you'll need a bank teller. | A: これATMでできる？ // B: ううん、窓口じゃないとだめだよ。
online banking | オンラインバンキング | A: Do you still go to the bank? // B: Rarely. I use online banking. | A: まだ銀行に行ってる？ // B: めったに。オンラインバンキングを使ってるから。
set up autopay | 自動引き落としを設定する | A: I keep forgetting to pay my phone bill. // B: Set up autopay. | A: 携帯の支払いをいつも忘れちゃう。 // B: 自動引き落としにしなよ。
PIN | 暗証番号 | A: Please enter your PIN. // B: Oh no, I forgot it. | A: 暗証番号を入力してください。 // B: しまった、忘れた。
balance | 残高 | A: What's my balance? // B: You have two hundred dollars. | A: 残高はいくらですか？ // B: 200ドルです。
I'd like to close my account. | 口座を解約したいです | A: I'd like to close my account. I'm moving back to Japan. // B: I can help with that. | A: 口座を解約したいのですが。日本に帰るんです。 // B: お手伝いします。
money order | 郵便為替（送金為替） | A: My landlord doesn't take cards. // B: Pay with a money order. | A: 大家さんがカードを受け付けないんだ。 // B: 郵便為替で払えばいいよ。
`,
};

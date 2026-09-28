export default {
  id: "ch26",
  title: "アパート探し・契約",
  items: `
I'm looking for an apartment. | アパートを探しています | A: I'm looking for an apartment near campus. // B: What's your budget? | A: キャンパスの近くでアパートを探しています。 // B: 予算はどのくらいですか？
Is this apartment still available? | このアパートはまだ空いていますか？ | A: Is this apartment still available? // B: Yes, would you like to see it? | A: このアパートはまだ空いていますか？ // B: はい、内見しますか？
Can I schedule a viewing? | 内見の予約はできますか？ | A: Can I schedule a viewing for Saturday? // B: Sure, how about eleven? | A: 土曜日に内見の予約はできますか？ // B: はい、11時はどうですか？
How much is the rent? | 家賃はいくらですか？ | A: How much is the rent? // B: Two thousand a month. | A: 家賃はいくらですか？ // B: 月2000ドルです。
Are utilities included? | 光熱費は含まれていますか？ | A: Are utilities included? // B: Water and trash are. Electricity isn't. | A: 光熱費は含まれていますか？ // B: 水道とゴミは含まれています。電気は別です。
utilities | 光熱費（電気・ガス・水道） | A: How much do you pay for utilities? // B: About a hundred fifty a month. | A: 光熱費はいくら払ってる？ // B: 月150ドルくらい。
How much is the security deposit? | 敷金はいくらですか？ | A: How much is the security deposit? // B: One month's rent. | A: 敷金はいくらですか？ // B: 家賃1か月分です。
first and last month's rent | 最初と最後の月の家賃（前払い） | A: What do I need to pay up front? // B: First and last month's rent plus the deposit. | A: 最初に何を払う必要がありますか？ // B: 最初と最後の月の家賃と敷金です。
lease | 賃貸契約 | A: How long is the lease? // B: Twelve months. | A: 賃貸契約の期間は？ // B: 12か月です。
sign the lease | 賃貸契約を結ぶ | A: When can I sign the lease? // B: As soon as your application is approved. | A: いつ契約できますか？ // B: 申込が承認されたらすぐです。
month-to-month | 月ごとの契約 | A: Do you offer month-to-month? // B: Yes, but the rent is higher. | A: 月ごとの契約はできますか？ // B: はい、ただ家賃が高くなります。
rental application | 入居申込書 | A: Please fill out the rental application. // B: Is there a fee? | A: 入居申込書にご記入ください。 // B: 手数料はかかりますか？
credit check | 信用調査 | A: Do you run a credit check? // B: Yes, it's part of the application. | A: 信用調査はありますか？ // B: はい、申込手続きの一部です。
I don't have a credit history in the U.S. | アメリカでのクレジット履歴がありません | A: I don't have a credit history in the U.S. // B: You can pay a larger deposit instead. | A: アメリカでのクレジット履歴がないんです。 // B: 代わりに多めの敷金を払えば大丈夫です。
co-signer | 連帯保証人 | A: Do I need a co-signer? // B: Only if your income is too low. | A: 連帯保証人は必要ですか？ // B: 収入が基準に満たない場合のみです。
proof of income | 収入証明 | A: What documents do you need? // B: ID and proof of income. | A: どんな書類が必要ですか？ // B: 身分証と収入証明です。
Are pets allowed? | ペットは飼えますか？ | A: Are pets allowed? // B: Cats are okay, but no dogs. | A: ペットは飼えますか？ // B: 猫は大丈夫ですが、犬はだめです。
pet deposit | ペット保証金 | A: Is there a pet deposit? // B: Yes, three hundred dollars. | A: ペット保証金はありますか？ // B: はい、300ドルです。
Is there laundry in the building? | 建物に洗濯室はありますか？ | A: Is there laundry in the building? // B: Yes, in the basement. | A: 建物に洗濯室はありますか？ // B: はい、地下にあります。
in-unit washer and dryer | 部屋に洗濯機と乾燥機あり | A: Does it have an in-unit washer and dryer? // B: Yes, in the hallway closet. | A: 部屋に洗濯機と乾燥機はありますか？ // B: はい、廊下の収納にあります。
Is parking included in the rent? | 家賃に駐車場代は含まれていますか？ | A: Is parking included in the rent? // B: One spot is included. | A: 家賃に駐車場代は含まれていますか？ // B: 1台分は含まれています。
When can I move in? | いつ入居できますか？ | A: When can I move in? // B: The first of next month. | A: いつ入居できますか？ // B: 来月の1日からです。
move-in date | 入居日 | A: What's your move-in date? // B: September first. | A: 入居日はいつ？ // B: 9月1日だよ。
furnished | 家具付きの | A: Is the apartment furnished? // B: No, it's unfurnished. | A: そのアパートは家具付きですか？ // B: いいえ、家具なしです。
studio | ワンルーム（スタジオ） | A: Are you living in a one-bedroom? // B: No, a small studio. | A: 1ベッドルームに住んでるの？ // B: ううん、小さいワンルームだよ。
one-bedroom | 1ベッドルーム（1LDKに近い） | A: How much is a one-bedroom here? // B: About twenty-five hundred. | A: このあたりの1ベッドルームっていくら？ // B: 2500ドルくらい。
square feet | 平方フィート | A: How big is the apartment? // B: About six hundred square feet. | A: そのアパートの広さは？ // B: 600平方フィートくらい。
What's the neighborhood like? | どんな地域ですか？ | A: What's the neighborhood like? // B: Quiet, with lots of families. | A: どんな地域ですか？ // B: 静かで、家族連れが多いですよ。
Is it a safe area? | 治安のいい地域ですか？ | A: Is it a safe area at night? // B: Yes, it's pretty safe. | A: 夜も治安はいい地域ですか？ // B: はい、かなり安全です。
How close is it to public transportation? | 公共交通機関までどのくらい近いですか？ | A: How close is it to public transportation? // B: The bus stop is right outside. | A: 公共交通機関までどのくらい近いですか？ // B: バス停がすぐ外にあります。
property manager | 管理会社の担当者 | A: Who do I call if something breaks? // B: The property manager. Here's her number. | A: 何か壊れたら誰に電話すればいい？ // B: 管理担当者だよ。これが彼女の番号。
roommate wanted | ルームメイト募集 | A: I saw a "roommate wanted" post online. // B: Be careful and meet them first. | A: ネットで「ルームメイト募集」の投稿を見たよ。 // B: 気をつけて、まず会ってみてね。
sublet | 又貸し（転貸） | A: I'm going abroad for three months. // B: You could sublet your room. | A: 3か月海外に行くんだ。 // B: 部屋を又貸しすればいいよ。
break the lease | 契約を途中解約する | A: Can I break the lease early? // B: You'll have to pay two months' rent. | A: 契約を途中解約できますか？ // B: 家賃2か月分の違約金がかかります。
renew the lease | 契約を更新する | A: Are you going to renew the lease? // B: Only if the rent doesn't go up. | A: 契約更新する？ // B: 家賃が上がらなければね。
The rent is going up. | 家賃が上がる | A: The rent is going up by two hundred dollars. // B: That's a lot. | A: 家賃が200ドル上がるんだって。 // B: それは大きいね。
rent is due | 家賃の支払い期限 | A: When is rent due? // B: On the first of every month. | A: 家賃の支払い期限はいつ？ // B: 毎月1日だよ。
late fee | 延滞料金 | A: What if I pay rent late? // B: There's a fifty-dollar late fee. | A: 家賃の支払いが遅れたら？ // B: 50ドルの延滞料金がかかります。
Can I pay rent online? | 家賃はオンラインで払えますか？ | A: Can I pay rent online? // B: Yes, through our resident portal. | A: 家賃はオンラインで払えますか？ // B: はい、入居者用サイトから払えます。
move-in inspection | 入居時の点検 | A: Let's do the move-in inspection. // B: Good idea. I'll take pictures of any damage. | A: 入居時の点検をしましょう。 // B: そうですね。傷があれば写真を撮っておきます。
wear and tear | 経年劣化 | A: Will I lose my deposit for these scratches? // B: No, that's normal wear and tear. | A: この傷で敷金が引かれますか？ // B: いいえ、それは通常の経年劣化です。
Will I get my deposit back? | 敷金は返ってきますか？ | A: Will I get my deposit back? // B: Yes, if there's no damage. | A: 敷金は返ってきますか？ // B: はい、損傷がなければ。
give notice | 退去の通知をする | A: How much notice do I need to give? // B: Thirty days in writing. | A: 退去の通知はどのくらい前に？ // B: 30日前に書面でお願いします。
move-out date | 退去日 | A: What's your move-out date? // B: The end of June. | A: 退去日はいつ？ // B: 6月末だよ。
set up the electricity | 電気の契約をする | A: Did you set up the electricity? // B: Yes, it'll be on by Friday. | A: 電気の契約した？ // B: うん、金曜までには使えるよ。
renter's insurance | 賃貸住宅保険 | A: Do I need renter's insurance? // B: Yes, it's required in this building. | A: 賃貸住宅保険は必要ですか？ // B: はい、この建物では必須です。
walk-in closet | ウォークインクローゼット | A: Does the bedroom have a walk-in closet? // B: Yes, it's pretty big. | A: 寝室にウォークインクローゼットはありますか？ // B: はい、けっこう広いですよ。
It's a bit out of my price range. | 少し予算オーバーです | A: This one is three thousand a month. // B: It's a bit out of my price range. | A: こちらは月3000ドルです。 // B: 少し予算オーバーですね。
Can I think about it? | 少し考えてもいいですか？ | A: Do you want to apply today? // B: Can I think about it and call you tomorrow? | A: 今日申し込みますか？ // B: 少し考えて、明日電話してもいいですか？
I'll take it. I'd like to apply. | ここにします。申し込みたいです | A: So, what do you think? // B: I love it. I'd like to apply. | A: どうですか？ // B: すごく気に入りました。申し込みたいです。
`,
};

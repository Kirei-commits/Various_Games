export default {
  id: "ch23",
  title: "空港・入国審査",
  items: `
What's the purpose of your visit? | 訪問の目的は何ですか？ | A: What's the purpose of your visit? // B: I'm here for a business conference. | A: 訪問の目的は何ですか？ // B: ビジネスの会議のためです。
I'm here on vacation. | 休暇で来ました | A: Why are you visiting the U.S.? // B: I'm here on vacation. | A: アメリカに来た目的は？ // B: 休暇で来ました。
I'm here to study. | 留学で来ました | A: What brings you here? // B: I'm here to study at UCLA. | A: どういった目的で？ // B: UCLAに留学で来ました。
How long will you be staying? | 滞在期間はどのくらいですか？ | A: How long will you be staying? // B: Two weeks. | A: 滞在期間はどのくらいですか？ // B: 2週間です。
Where will you be staying? | どこに滞在しますか？ | A: Where will you be staying? // B: At the Hilton in downtown Chicago. | A: どこに滞在しますか？ // B: シカゴ中心部のヒルトンです。
I'm staying with a friend. | 友人の家に泊まります | A: Where are you staying? // B: I'm staying with a friend in Seattle. | A: どこに泊まりますか？ // B: シアトルの友人の家に泊まります。
Is this your first time in the U.S.? | アメリカは初めてですか？ | A: Is this your first time in the U.S.? // B: No, my second. | A: アメリカは初めてですか？ // B: いいえ、2回目です。
Do you have a return ticket? | 帰りの航空券はありますか？ | A: Do you have a return ticket? // B: Yes, here's my itinerary. | A: 帰りの航空券はありますか？ // B: はい、これが旅程表です。
What do you do for a living? | お仕事は何ですか？ | A: What do you do for a living? // B: I'm an engineer. | A: お仕事は何ですか？ // B: エンジニアです。
Anything to declare? | 申告するものはありますか？ | A: Anything to declare? // B: No, nothing. | A: 申告するものはありますか？ // B: いいえ、ありません。
Are you carrying any food? | 食べ物を持っていますか？ | A: Are you carrying any food? // B: Just some snacks from Japan. | A: 食べ物を持っていますか？ // B: 日本のお菓子を少しだけです。
Please place your finger here. | ここに指を置いてください | A: Please place your finger here. // B: Like this? | A: ここに指を置いてください。 // B: こうですか？
Look into the camera. | カメラを見てください | A: Look into the camera, please. // B: Okay. | A: カメラを見てください。 // B: はい。
Enjoy your stay. | 滞在を楽しんで | A: Here's your passport. Enjoy your stay. // B: Thank you! | A: パスポートをお返しします。滞在を楽しんでください。 // B: ありがとうございます！
Where do I pick up my luggage? | 荷物はどこで受け取りますか？ | A: Where do I pick up my luggage? // B: Carousel five. | A: 荷物はどこで受け取りますか？ // B: 5番のターンテーブルです。
Where's the check-in counter for United? | ユナイテッドのチェックインカウンターはどこですか？ | A: Where's the check-in counter for United? // B: Terminal two, row C. | A: ユナイテッドのチェックインカウンターはどこですか？ // B: 第2ターミナルのC列です。
I'd like to check this bag. | この荷物を預けたいです | A: I'd like to check this bag. // B: Please put it on the scale. | A: この荷物を預けたいです。 // B: はかりに載せてください。
Is my bag overweight? | 荷物は重量オーバーですか？ | A: Is my bag overweight? // B: It's fifty-two pounds. The limit is fifty. | A: 荷物は重量オーバーですか？ // B: 52ポンドです。上限は50です。
overweight fee | 重量超過料金 | A: How much is the overweight fee? // B: One hundred dollars. | A: 重量超過料金はいくらですか？ // B: 100ドルです。
Can I bring this on the plane? | これは機内に持ち込めますか？ | A: Can I bring this water on the plane? // B: Not through security, sorry. | A: この水は機内に持ち込めますか？ // B: 保安検査は通れません、すみません。
security check | 保安検査 | A: How long is the security check line? // B: About thirty minutes. | A: 保安検査の列はどのくらい？ // B: 30分くらいだよ。
Take off your shoes, please. | 靴を脱いでください | A: Take off your shoes, please. // B: My belt too? | A: 靴を脱いでください。 // B: ベルトもですか？
Please put your laptop in a separate bin. | ノートパソコンは別のトレーに入れてください | A: Please put your laptop in a separate bin. // B: Oh, okay. | A: ノートパソコンは別のトレーに入れてください。 // B: あ、わかりました。
Empty your pockets. | ポケットの中の物を出してください | A: Empty your pockets, please. // B: Just my phone and keys. | A: ポケットの中の物を出してください。 // B: スマホと鍵だけです。
Which gate is it? | 何番ゲートですか？ | A: Which gate is our flight? // B: Gate forty-two. | A: 私たちの便は何番ゲート？ // B: 42番ゲートだよ。
What time does boarding start? | 搭乗開始は何時ですか？ | A: What time does boarding start? // B: At ten fifteen. | A: 搭乗開始は何時ですか？ // B: 10時15分です。
Now boarding group three. | ただいまグループ3のご搭乗を開始します | A: Now boarding group three. // B: That's us. Let's go. | A: ただいまグループ3の方のご搭乗を開始します。 // B: 私たちだ。行こう。
final call | 最終案内 | A: Is that the final call for our flight? // B: Yes! Run! | A: あれって私たちの便の最終案内？ // B: そう！走って！
Can I change my seat? | 座席を変更できますか？ | A: Can I change my seat to a window? // B: Let me see what's available. | A: 窓側の席に変更できますか？ // B: 空いている席を確認します。
Is the flight full? | 満席ですか？ | A: Is the flight full? // B: Yes, it's completely full today. | A: 満席ですか？ // B: はい、本日は満席です。
connecting flight | 乗り継ぎ便 | A: I have a connecting flight to Dallas. // B: Your bag will go straight through. | A: ダラス行きの乗り継ぎ便があります。 // B: お荷物は最終目的地まで行きます。
Where do I transfer? | 乗り継ぎはどこですか？ | A: Where do I transfer to my next flight? // B: Follow the signs for connections. | A: 次の便への乗り継ぎはどこですか？ // B: 乗り継ぎの案内表示に従ってください。
terminal | ターミナル | A: Which terminal do we leave from? // B: Terminal B. | A: どのターミナルから出発？ // B: Bターミナルだよ。
Where's the shuttle to the hotel? | ホテル行きのシャトルはどこですか？ | A: Where's the shuttle to the hotel? // B: Outside door six. | A: ホテル行きのシャトルはどこですか？ // B: 6番ドアの外です。
Where can I get a taxi? | タクシーはどこで乗れますか？ | A: Where can I get a taxi? // B: Follow the signs to ground transportation. | A: タクシーはどこで乗れますか？ // B: 地上交通の案内に従ってください。
exchange money | 両替する | A: Where can I exchange money? // B: There's a currency exchange by the exit. | A: どこで両替できますか？ // B: 出口のそばに両替所があります。
exchange rate | 為替レート | A: What's the exchange rate today? // B: One dollar is about one hundred fifty yen. | A: 今日の為替レートは？ // B: 1ドル約150円です。
ESTA | エスタ（米国の電子渡航認証） | A: Did you apply for your ESTA? // B: Yes, it was approved last week. | A: ESTA申請した？ // B: うん、先週承認されたよ。
visa | ビザ | A: Do you need a visa to study there? // B: Yes, a student visa. | A: そこで勉強するのにビザがいるの？ // B: うん、学生ビザが必要。
customs form | 税関申告書 | A: Did you fill out the customs form? // B: Yes, it's in my passport. | A: 税関申告書書いた？ // B: うん、パスポートに挟んである。
duty-free | 免税（店） | A: Let's check out the duty-free shop. // B: I want to buy some perfume. | A: 免税店を見てみよう。 // B: 香水を買いたいな。
lost and found | 遺失物取扱所 | A: I left my jacket on the plane. // B: Try the lost and found. | A: 飛行機に上着を忘れた。 // B: 遺失物取扱所に行ってみて。
Where is the nearest restroom? | 一番近いお手洗いはどこですか？ | A: Where is the nearest restroom? // B: Right past gate twelve. | A: 一番近いお手洗いはどこですか？ // B: 12番ゲートのすぐ先です。
charging station | 充電スポット | A: Is there a charging station near here? // B: Yes, by the food court. | A: この近くに充電スポットある？ // B: うん、フードコートのそばに。
My flight lands at six. | 私の便は6時に着きます | A: When should I pick you up? // B: My flight lands at six. | A: 何時に迎えに行けばいい？ // B: 私の便は6時に着くよ。
arrivals | 到着ロビー | A: Where should we meet? // B: At arrivals, by the coffee shop. | A: どこで会う？ // B: 到着ロビーのコーヒーショップのそばで。
departures | 出発ロビー | A: Drop me off at departures. // B: Okay, which airline? | A: 出発ロビーで降ろして。 // B: わかった、どの航空会社？
I'm a U.S. resident. | 米国の居住者です | A: Are you a visitor? // B: No, I'm a U.S. resident. Here's my green card. | A: 旅行者ですか？ // B: いいえ、米国の居住者です。グリーンカードです。
green card | グリーンカード（永住権） | A: How long did it take to get your green card? // B: About three years. | A: グリーンカード取得にどのくらいかかった？ // B: 3年くらい。
Welcome to the United States. | アメリカへようこそ | A: Welcome to the United States. // B: Thank you. | A: アメリカへようこそ。 // B: ありがとうございます。
`,
};

export default {
  id: "ch28",
  title: "病院・診察",
  items: `
I'd like to make an appointment. | 診察の予約をしたいです | A: I'd like to make an appointment with Dr. Kim. // B: What's the reason for your visit? | A: キム先生の診察を予約したいのですが。 // B: どういったご症状ですか？
Are you a new patient? | 初診ですか？ | A: Are you a new patient? // B: Yes, this is my first visit. | A: 初診ですか？ // B: はい、今回が初めてです。
Do you accept my insurance? | 私の保険は使えますか？ | A: Do you accept Blue Cross insurance? // B: Yes, we're in-network. | A: ブルークロスの保険は使えますか？ // B: はい、提携しています。
Can I see a doctor today? | 今日診てもらえますか？ | A: Can I see a doctor today? It's urgent. // B: We have an opening at three. | A: 今日診てもらえますか？急ぎなんです。 // B: 3時に空きがあります。
urgent care | 緊急外来（予約なしのクリニック） | A: Should I go to the ER? // B: Go to urgent care. It's cheaper and faster. | A: 救急病院に行くべき？ // B: 緊急外来に行きなよ。安いし早いよ。
ER | 救急救命室 | A: He can't breathe well. // B: Take him to the ER right now. | A: 彼、うまく息ができないの。 // B: 今すぐ救急に連れて行って。
primary care doctor | かかりつけ医 | A: Do you have a primary care doctor? // B: Not yet. I just moved here. | A: かかりつけ医はいますか？ // B: まだです。引っ越してきたばかりで。
Please fill out these forms. | この書類に記入してください | A: Please fill out these forms and bring them back. // B: Okay. | A: この書類に記入して持ってきてください。 // B: わかりました。
What seems to be the problem? | どうされましたか？ | A: What seems to be the problem? // B: I've had a bad cough for a week. | A: どうされましたか？ // B: 1週間ひどい咳が続いてるんです。
What are your symptoms? | 症状は何ですか？ | A: What are your symptoms? // B: Fever, chills, and body aches. | A: 症状は何ですか？ // B: 熱と寒気と体の痛みです。
How long have you had these symptoms? | その症状はいつからですか？ | A: How long have you had these symptoms? // B: Since Monday. | A: その症状はいつからですか？ // B: 月曜からです。
It hurts when I swallow. | 飲み込むと痛い | A: Where does it hurt? // B: My throat. It hurts when I swallow. | A: どこが痛みますか？ // B: のどです。飲み込むと痛いんです。
I have a sharp pain here. | ここに鋭い痛みがある | A: I have a sharp pain here, on my right side. // B: Let me examine you. | A: ここ、右側に鋭い痛みがあるんです。 // B: 診察しますね。
dull pain | 鈍い痛み | A: What kind of pain is it? // B: A dull pain in my lower back. | A: どんな痛みですか？ // B: 腰に鈍い痛みがあります。
On a scale of one to ten, how bad is the pain? | 痛みは10段階でどのくらいですか？ | A: On a scale of one to ten, how bad is the pain? // B: About a seven. | A: 痛みは10段階でどのくらいですか？ // B: 7くらいです。
I've been throwing up. | 吐き続けている | A: I've been throwing up since last night. // B: Are you able to keep water down? | A: 昨夜からずっと吐いてるんです。 // B: 水は飲めていますか？
I have diarrhea. | 下痢をしている | A: I have diarrhea and stomach cramps. // B: Did you eat anything unusual? | A: 下痢と腹痛があります。 // B: 何か変わったものを食べましたか？
I feel nauseous. | 吐き気がする | A: I feel nauseous. // B: Sit down and take slow breaths. | A: 吐き気がする。 // B: 座ってゆっくり呼吸して。
I have a rash. | 発疹が出ている | A: I have a rash on my arms. // B: Is it itchy? | A: 腕に発疹が出てるんです。 // B: かゆいですか？
I'm short of breath. | 息切れがする | A: I'm short of breath when I climb stairs. // B: We should check your heart. | A: 階段を上ると息切れするんです。 // B: 心臓を調べたほうがいいですね。
I cut my finger. | 指を切った | A: I cut my finger while cooking. // B: Let's clean it and see if you need stitches. | A: 料理中に指を切ってしまいました。 // B: 消毒して、縫う必要があるか見ましょう。
stitches | 縫合（傷を縫うこと） | A: Did you need stitches? // B: Yes, five stitches. | A: 縫ったの？ // B: うん、5針。
I think I broke my arm. | 腕を骨折したかもしれない | A: I fell off my bike. I think I broke my arm. // B: We'll take an X-ray. | A: 自転車から落ちて、腕を骨折したかもしれません。 // B: レントゲンを撮りましょう。
X-ray | レントゲン | A: What did the X-ray show? // B: It's just a sprain. | A: レントゲンの結果は？ // B: ただのねんざでした。
blood test | 血液検査 | A: We need to do a blood test. // B: Do I need to fast? | A: 血液検査をしましょう。 // B: 絶食が必要ですか？
Take a deep breath in. | 息を大きく吸ってください | A: Take a deep breath in... and out. // B: Like that? | A: 息を大きく吸って…吐いて。 // B: こんな感じですか？
Are you taking any medication? | 何か薬を飲んでいますか？ | A: Are you taking any medication? // B: Just vitamins. | A: 何か薬を飲んでいますか？ // B: ビタミン剤だけです。
Do you have any allergies to medication? | 薬のアレルギーはありますか？ | A: Do you have any allergies to medication? // B: Yes, penicillin. | A: 薬のアレルギーはありますか？ // B: はい、ペニシリンです。
medical history | 病歴 | A: Tell me about your medical history. // B: I had surgery on my knee five years ago. | A: 病歴を教えてください。 // B: 5年前にひざの手術をしました。
I'm pregnant. | 妊娠しています | A: Is there anything else I should know? // B: Yes, I'm pregnant. | A: 他に知っておくべきことはありますか？ // B: はい、妊娠しています。
You should rest for a few days. | 数日は安静にしてください | A: You should rest for a few days. // B: Can I go to work? | A: 数日は安静にしてください。 // B: 仕事には行けますか？
I'll write you a prescription. | 処方箋を書きます | A: It's an infection. I'll write you a prescription. // B: Thank you. | A: 感染症ですね。処方箋を書きます。 // B: ありがとうございます。
Can I get a doctor's note? | 診断書をもらえますか？ | A: Can I get a doctor's note for work? // B: Sure, I'll print one out. | A: 仕事用に診断書をもらえますか？ // B: はい、印刷しますね。
follow-up appointment | 再診の予約 | A: Let's schedule a follow-up appointment in two weeks. // B: Okay. | A: 2週間後に再診の予約を入れましょう。 // B: わかりました。
specialist | 専門医 | A: I'm going to refer you to a specialist. // B: What kind of specialist? | A: 専門医を紹介しますね。 // B: どの専門医ですか？
referral | 紹介状 | A: Do I need a referral to see a dermatologist? // B: With your plan, yes. | A: 皮膚科にかかるのに紹介状は必要ですか？ // B: あなたの保険プランでは必要です。
Is it serious? | 深刻ですか？ | A: Is it serious? // B: No, it should clear up in a week. | A: 深刻ですか？ // B: いいえ、1週間で治るはずです。
Is it contagious? | 人にうつりますか？ | A: Is it contagious? // B: Yes, stay home until the fever goes away. | A: 人にうつりますか？ // B: はい、熱が下がるまで家にいてください。
flu shot | インフルエンザの予防接種 | A: Have you had your flu shot this year? // B: Not yet. | A: 今年はインフルエンザの予防接種を受けましたか？ // B: まだです。
vaccine | ワクチン | A: Which vaccines do I need for school? // B: The nurse will give you a list. | A: 学校にはどのワクチンが必要ですか？ // B: 看護師が一覧をお渡しします。
nurse | 看護師 | A: The nurse will take your temperature first. // B: Okay. | A: まず看護師が体温を測ります。 // B: わかりました。
waiting room | 待合室 | A: Please have a seat in the waiting room. // B: How long will it be? | A: 待合室でおかけください。 // B: どのくらいかかりますか？
The doctor will see you now. | 先生の診察の番です | A: Ms. Tanaka? The doctor will see you now. // B: Thank you. | A: 田中さん？診察室へどうぞ。 // B: ありがとうございます。
I have a family history of diabetes. | 家族に糖尿病の人がいます | A: Any family health issues? // B: I have a family history of diabetes. | A: ご家族に健康上の問題は？ // B: 家族に糖尿病の人がいます。
I've lost my appetite. | 食欲がない | A: How's your appetite? // B: I've lost my appetite completely. | A: 食欲はどうですか？ // B: まったく食欲がないんです。
I've been feeling tired lately. | 最近ずっとだるい | A: I've been feeling tired lately. // B: Let's check your iron levels. | A: 最近ずっとだるいんです。 // B: 鉄分の値を調べましょう。
I have a migraine. | 片頭痛がする | A: You look awful. // B: I have a migraine. The light is killing me. | A: 顔色ひどいよ。 // B: 片頭痛がするの。光がつらい。
physical exam | 健康診断（身体検査） | A: When was your last physical exam? // B: About two years ago. | A: 最後に健康診断を受けたのは？ // B: 2年くらい前です。
test results | 検査結果 | A: When will I get my test results? // B: In three to five days. | A: 検査結果はいつわかりますか？ // B: 3〜5日後です。
Do I need surgery? | 手術は必要ですか？ | A: Do I need surgery? // B: No, physical therapy should be enough. | A: 手術は必要ですか？ // B: いいえ、リハビリで十分なはずです。
`,
};

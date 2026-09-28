/*
 * 単語ガチャのデータ。
 * - 単語の章（51〜110章）がガチャの対象。レア度は部で決まる: 基礎=N、生活=R、応用=SR。
 * - ここに語源・豆知識（TRIVIA）を書いた単語は SSR になる（どの部の単語でもよい）。
 *   teaser は図鑑で未獲得のときに見せる「チラ見せ」、reveal はオチ（獲得すると見られる）。
 * - シークレット単語（SECRETS）はガチャには出ず、条件の単語を集めると解放される。
 * - 語源は定説のあるものだけを選び、諸説あるものは「〜と言われる」と書く。
 */

/** 章ごとの品詞。"auto" の章は日本語訳の形から推定する（POS_OVERRIDES で個別に直す） */
export const CHAPTER_POS = {
  ch51: "verb", ch52: "verb", ch53: "verb", ch80: "verb", ch81: "verb", ch82: "verb",
  ch97: "verb", ch98: "verb", ch108: "verb", ch110: "verb",
  ch54: "adj", ch55: "adj", ch75: "adj", ch83: "adj", ch99: "adj", ch100: "adj",
  ch56: "other", ch84: "other", ch85: "other", ch101: "other",
};

/** 品詞の推定を個別に直す（問題ID: 品詞） */
export const POS_OVERRIDES = {
  // 日本語訳が「〜い」「〜う」で終わる名詞など
  nephew: "noun", niece: "noun", sibling: "noun", heel: "noun", chair: "noun", honey: "noun", garlic: "noun", grape: "noun", eggplant: "noun", hail: "noun", allowance: "noun", installment: "noun", wheelchair: "noun", asthma: "noun", candle: "noun", crush: "noun", acquaintance: "noun", celebration: "noun", vow: "noun", mistake: "noun", difference: "noun", behavior: "noun", drought: "noun", series: "noun", jerk: "noun", kiddo: "noun", bummer: "noun", buzzkill: "noun", diaper: "noun", thing: "noun", stuff: "noun", feast: "noun",
  whisk: "verb", wear: "verb", slay: "verb",
  dizzy: "adj", bilingual: "adj", chewy: "adj", savory: "adj",
};

export const POS_LABELS = { noun: "名詞", verb: "動詞", adj: "形容詞", other: "副詞・その他" };

/** 語源・豆知識（ここにある単語は SSR） */
export const TRIVIA = {
  sandwich: {
    etymology: "18世紀イギリスの貴族「サンドイッチ伯爵（Earl of Sandwich）」の名前から。",
    teaser: "ある伯爵が、カードゲームの手を止めずに食べたくて…？",
    reveal: "肉をパンに挟ませて、片手で食べながら遊び続けた。その食べ方が伯爵の名前ごと広まったと言われる。",
  },
  company: {
    etymology: "com（一緒に）＋ pan（ラテン語 panis＝パン）。",
    teaser: "もともとは「一緒に◯◯を食べる仲間」という意味。何を食べる？",
    reveal: "パン。一緒にパンを食べる間柄＝仲間。そこから「会社」の意味にもなった。",
  },
  muscle: {
    etymology: "ラテン語 musculus（小さなネズミ）。",
    teaser: "腕に力を入れると動く筋肉が、ある小さな動物に見えたことから…？",
    reveal: "小さなネズミ（musculus）。皮膚の下で筋肉がもぞもぞ動く様子がネズミに見えた。",
  },
  window: {
    etymology: "古ノルド語 vindauga ＝ vindr（風）＋ auga（目）。",
    teaser: "窓は、もともと壁にあいた「◯の目」だった。",
    reveal: "風の目。ガラスのない穴から風が入り、外が見えたことから。",
  },
  breakfast: {
    etymology: "break（破る）＋ fast（断食）。",
    teaser: "この食事は、夜のあいだ続けていた「あること」を破るもの。",
    reveal: "断食（fast）。寝ている間の断食を破る（break）から breakfast。",
  },
  salad: {
    etymology: "ラテン語 sal（塩）から。塩をふった野菜。",
    teaser: "この料理の名前は、野菜にかける「ある調味料」から。",
    reveal: "塩（ラテン語 sal）。塩味をつけた生野菜が salad になった。",
  },
  hamburger: {
    etymology: "ドイツの港町ハンブルク（Hamburg）＋ -er（〜風の）。",
    teaser: "この食べ物の名前の前半は、肉の種類ではなく、ある都市の名前。",
    reveal: "ドイツのハンブルク。「ハンブルク風」のひき肉料理がアメリカで広まった。",
  },
  jeans: {
    etymology: "イタリアの港町ジェノヴァ（フランス語で Gênes）の綿布から。",
    teaser: "この服の名前は、丈夫な綿布を輸出していたある港町から。",
    reveal: "イタリアのジェノヴァ。そこで作られた布が jean と呼ばれた。",
  },
  denim: {
    etymology: "フランス語 serge de Nîmes（ニームのサージ織り）。",
    teaser: "この生地は「de ＋ ◯◯」。フランスのある町の布という意味。",
    reveal: "ニーム（Nîmes）。serge de Nîmes が縮まって denim。",
  },
  robot: {
    etymology: "チェコ語 robota（強制労働）。1920年の戯曲『R.U.R.』で使われた。",
    teaser: "この言葉は、約100年前のチェコの劇から生まれた。元の意味は…？",
    reveal: "強制労働（robota）。作家カレル・チャペックの戯曲で、人の代わりに働く人造人間の名前になった。",
  },
  alarm: {
    etymology: "イタリア語 all'arme（武器を取れ！）。",
    teaser: "この言葉は、もともと兵士に向けた「ある叫び声」だった。",
    reveal: "「武器を取れ！」（all'arme）。危険を知らせる合図の意味になった。",
  },
  candidate: {
    etymology: "ラテン語 candidatus（白い服を着た）。",
    teaser: "古代ローマで、この立場の人は目立つように「ある色」の服を着ていた。",
    reveal: "真っ白。白く輝く（candidus）トーガを着たことから candidate。",
  },
  panic: {
    etymology: "ギリシャ神話の牧神パン（Pan）から。",
    teaser: "この言葉は、ギリシャ神話の「ある神」が起こすと信じられた恐怖。",
    reveal: "牧神パン。森で突然おそわれる理由のない恐怖は、パンのしわざとされた。",
  },
  cereal: {
    etymology: "ローマ神話の穀物の女神ケレス（Ceres）。",
    teaser: "この朝食の名前は、ローマ神話の「◯◯の女神」から。",
    reveal: "穀物の女神ケレス。英語で「穀物」を意味する cereal もここから。",
  },
  january: {
    etymology: "ローマの神ヤヌス（Janus）の月。",
    teaser: "この月は、前と後ろに2つの顔を持つ神の月。",
    reveal: "ヤヌス。過去と未来を見る「扉・始まり」の神で、年の入り口の月になった。",
  },
  september: {
    etymology: "ラテン語 septem（7）。",
    teaser: "この月の名前の前半は「7」という意味。なのに9番目の月なのはなぜ？",
    reveal: "古代ローマの暦は3月始まりだったから。年の始まりが2か月ずれて、7番目の月が9月になった。",
  },
  saturday: {
    etymology: "Saturn（土星・ローマの神サトゥルヌス）の日。",
    teaser: "この曜日だけ、北欧の神ではなく「ある惑星」の名前。",
    reveal: "土星（サトゥルヌス）。ほかの曜日には北欧・ゲルマンの神や太陽・月の名前が入っている。",
  },
  thursday: {
    etymology: "北欧神話の雷神トール（Thor）の日。",
    teaser: "この曜日は、ハンマーを持った「雷の神」の日。",
    reveal: "トール（Thor）の日＝Thursday。",
  },
  wednesday: {
    etymology: "北欧神話の主神オーディン（古英語 Woden）の日。",
    teaser: "この曜日は、北欧神話の最高神の日。つづりの中に読まない文字がある。",
    reveal: "オーディン（Woden）の日＝Wednesday。d はつづりに残っただけで発音しなくなった。",
  },
  monday: {
    etymology: "moon（月）の日。",
    teaser: "この曜日は「◯の日」。日曜日は太陽の日。",
    reveal: "月（moon）の日。",
  },
  nice: {
    etymology: "ラテン語 nescius（知らない、無知な）。",
    teaser: "この形容詞は、昔は今とほぼ正反対の意味だった。「◯◯な」",
    reveal: "無知な・愚かな。何百年もかけて「几帳面な」「感じのいい」へと意味が変わった。",
  },
  awful: {
    etymology: "awe（畏れ）＋ -ful（満ちた）。",
    teaser: "この形容詞は、もともと悪い意味ではなく「◯◯に満ちた」。",
    reveal: "畏れ（awe）。神々しくて畏れ多い、という良い意味もあった。",
  },
  mortgage: {
    etymology: "古フランス語 mort（死んだ）＋ gage（誓約）＝死の誓約。",
    teaser: "お金に関するこの単語の前半は「死」という意味。いったい何が死ぬ？",
    reveal: "誓約。返し終えるか、返せずに担保を失うと、その誓約が「死ぬ（終わる）」ことから。",
  },
  planet: {
    etymology: "ギリシャ語 planētēs（さまよう者）。",
    teaser: "この天体の元の意味は「◯◯する者」。星空の中で…",
    reveal: "さまよう者。ほかの星と違って、夜空をうろうろ動いて見えたから。",
  },
  volcano: {
    etymology: "ローマ神話の火と鍛冶の神ウルカヌス（Vulcan）。",
    teaser: "この地形は、ローマ神話の「◯と鍛冶の神」の名前。",
    reveal: "火の神ウルカヌス。地下で鍛冶をしていると考えられた。",
  },
  ketchup: {
    etymology: "中国南部（福建）の魚醤を指す言葉（kê-tsiap）が語源と言われる。",
    teaser: "この調味料は、もともとトマトではなく「◯」から作るソースだった。",
    reveal: "魚。アジアの魚醤が由来と言われ、トマト味になったのはずっと後のこと。",
  },
  tea: {
    etymology: "中国・福建語の te から。陸路で広まった地域では cha（チャイなど）。",
    teaser: "この飲み物の呼び方は、世界で2種類に分かれる。◯で運ばれたか陸で運ばれたかで。",
    reveal: "海。海路で広まった国は te（tea, thé）、陸路の国は cha（chai, çay）と呼ぶ。",
  },
  alcohol: {
    etymology: "アラビア語 al-kuḥl（目元に塗る細かい粉）。",
    teaser: "この言葉の語源は、アラビア語で「目元に塗る◯」。",
    reveal: "粉（コール）。細かい粉→精製したエッセンス→蒸留した酒、と意味が変わった。",
  },
  orange: {
    etymology: "サンスクリット語 nāraṅga から。英語では a norange が an orange になった。",
    teaser: "この果物の名前は、昔は先頭にもう1文字あった。その文字はどこへ消えた？",
    reveal: "冠詞に吸収された。a norange が an orange と聞き間違えられて定着した。",
  },
  bankrupt: {
    etymology: "イタリア語 banca rotta（壊れた机）。",
    teaser: "この言葉は「◯◯が壊れた」という意味から。",
    reveal: "両替商の机（banca）。商売に失敗すると机を壊されたと言われる。",
  },
  calculate: {
    etymology: "ラテン語 calculus（小石）。",
    teaser: "この動詞の語源は、昔の計算に使った「あるもの」。",
    reveal: "小石（calculus）。小石を並べて数を数えていた。",
  },
  flu: {
    etymology: "influenza の略。イタリア語で「（星の）影響」。",
    teaser: "この病気の名前は、流行が「◯◯の影響」だと考えられていたことから。",
    reveal: "星（天体）の影響。イタリア語 influenza（影響）が病名になった。",
  },
  virus: {
    etymology: "ラテン語 virus（毒、毒液）。",
    teaser: "この言葉は、ラテン語でもともと「◯」という意味。",
    reveal: "毒・毒液。",
  },
  dollar: {
    etymology: "ボヘミアの谷ヨアヒムスタールの銀貨 Thaler（ターラー）。",
    teaser: "この通貨の名前は、ヨーロッパのある谷で作られた銀貨から。",
    reveal: "ヨアヒムスタール（谷）の銀貨 Thaler。これがなまって dollar になった。",
  },
  hospital: {
    etymology: "ラテン語 hospes（客・客をもてなす人）。hotel も同じ語源。",
    teaser: "この施設と「ホテル」は、もとは同じ言葉。共通点は？",
    reveal: "「客をもてなす」。病院も、もとは旅人や病人を泊めて世話をする施設だった。",
  },
  bus: {
    etymology: "omnibus（ラテン語で「すべての人のために」）の後ろ半分。",
    teaser: "この乗り物の名前は、ある長い単語の最後の3文字だけが残ったもの。",
    reveal: "omnibus（すべての人のための乗り物）。",
  },
  taxi: {
    etymology: "taximeter cab（料金メーター付きの馬車）の略。",
    teaser: "この乗り物の名前は「◯◯を測る機械」の短縮形。",
    reveal: "料金（taximeter）。メーター付きの馬車が taxi になった。",
  },
  shampoo: {
    etymology: "ヒンディー語 chāmpo（押せ、もめ）。",
    teaser: "これは、もともと髪を洗うことではなく「◯◯すること」だった。",
    reveal: "マッサージ。インドの頭のマッサージがイギリスに伝わった。",
  },
  pajamas: {
    etymology: "ペルシャ語・ヒンディー語 pāy-jāma（脚の衣服）。",
    teaser: "この服は、もともと「◯の服」という意味。",
    reveal: "脚の服。インドのゆったりしたズボンが由来。",
  },
  karaoke: {
    etymology: "日本語「空（から）」＋「オケ（オーケストラ）」。",
    teaser: "日本から英語になったこの言葉。直訳すると「空っぽの◯◯」。",
    reveal: "オーケストラ。歌のない伴奏だけ、という意味。",
  },
  emoji: {
    etymology: "日本語の「絵文字」。",
    teaser: "この言葉は emotion（感情）の仲間…ではなく、実は…",
    reveal: "日本語の「絵＋文字」。emotion と似ているのは偶然。",
  },
  escape: {
    etymology: "ex（外へ）＋ cappa（マント）と言われる。",
    teaser: "この動詞は「◯◯を脱ぎ捨てて逃げる」から、と言われる。",
    reveal: "マント（cappa）。つかまれたマントだけ残して逃げる様子から。",
  },
  ambition: {
    etymology: "ラテン語 ambire（歩き回る）。",
    teaser: "この名詞の元の意味は「◯◯◯◯」。古代ローマの選挙と関係がある。",
    reveal: "歩き回る。立候補者が票を集めて歩き回ったことから「野心」になった。",
  },
  rival: {
    etymology: "ラテン語 rivus（川）。",
    teaser: "この言葉の語源は「同じ◯を使う人たち」。",
    reveal: "川。同じ川の水を取り合う人たちが rival だった。",
  },
  nerd: {
    etymology: "ドクター・スースの絵本『If I Ran the Zoo』（1950年）が最初の記録とされる。",
    teaser: "このスラングが最初に確認されたのは、ある◯◯。",
    reveal: "絵本。ドクター・スースの本に出てくる架空の生き物の名前が最初とされる。",
  },
  calendar: {
    etymology: "ラテン語 calendae（古代ローマで月の最初の日）。",
    teaser: "古代ローマでは、月の最初の日に「あること」をしなければならなかった。それがこの単語の由来。",
    reveal: "借金の返済。その日（calendae）の帳簿 calendarium が calendar になった。",
  },
  july: {
    etymology: "ユリウス・カエサル（Julius Caesar）の名前から。",
    teaser: "この月は、ある古代ローマの権力者の名前。",
    reveal: "ユリウス・カエサル。8月 August は初代皇帝アウグストゥスから。",
  },
  chocolate: {
    etymology: "アステカのナワトル語が語源（xocolatl などの形と言われる）。",
    teaser: "このお菓子は、もともと甘いものではなく「苦い◯◯」だった。",
    reveal: "苦い飲み物。カカオを使ったアステカの飲み物がヨーロッパに伝わり、甘くなった。",
  },
  algebra: {
    etymology: "アラビア語 al-jabr（壊れた部分を元に戻すこと）。",
    teaser: "この数学の分野は、アラビア語で「◯◯を元に戻す」という意味。",
    reveal: "壊れた部分（骨接ぎの意味もあった）。9世紀の数学書の題名から。",
  },
  algorithm: {
    etymology: "9世紀のペルシャの数学者アル・フワーリズミーの名前がなまったもの。",
    teaser: "この言葉は、ある9世紀の数学者の名前から。",
    reveal: "アル・フワーリズミー。彼の名前のラテン語形 algorismus が変化した。",
  },
  jungle: {
    etymology: "ヒンディー語 jangal（荒れ地、未開の土地）。",
    teaser: "この言葉の語源のヒンディー語は、もともと「◯◯」という意味だった。",
    reveal: "荒れ地。木の茂った密林の意味は英語に入ってから広まった。",
  },
  soccer: {
    etymology: "Association Football（協会式フットボール）の soc ＋ -er。",
    teaser: "このスポーツの名前は、ある長い名前の途中の3文字から生まれた。",
    reveal: "Association（協会）の soc。ラグビー式と区別するための呼び名だった。",
  },
  tennis: {
    etymology: "フランス語 tenez（ほら、受けて！）と言われる。",
    teaser: "このスポーツは、サーブを打つときの「かけ声」が名前になったと言われる。",
    reveal: "フランス語の tenez（ほら、受けて！）。",
  },
  gym: {
    etymology: "gymnasium の略。ギリシャ語 gymnos（裸）。",
    teaser: "この場所の語源。古代ギリシャでは、運動するとき「◯」だった。",
    reveal: "裸（gymnos）。古代ギリシャの競技者は裸で運動した。",
  },
  school: {
    etymology: "ギリシャ語 scholē（暇、余暇）。",
    teaser: "この場所の語源は、意外にも「◯」という意味のギリシャ語。",
    reveal: "暇。暇な時間に議論や学問をしたことから。",
  },
  halloween: {
    etymology: "All Hallows' Eve（すべての聖人の日の前夜）。",
    teaser: "この行事の名前の最後の部分は、ある言葉が縮まったもの。",
    reveal: "eve（前夜）。11月1日の諸聖人の日（All Hallows）の前夜という意味。",
  },
  christmas: {
    etymology: "Christ（キリスト）＋ mass（ミサ）。",
    teaser: "この行事の名前の後半は「◯◯」という意味。",
    reveal: "ミサ（礼拝）。キリストのミサ＝Christmas。",
  },
  freelancer: {
    etymology: "free（自由な）＋ lance（槍）。小説『アイヴァンホー』（1819年）で広まった。",
    teaser: "この働き方の名前の真ん中の部分は、もともと「◯」のこと。",
    reveal: "槍。どの主君にも仕えない「自由な槍（傭兵の騎士）」が語源。",
  },
  bug: {
    etymology: "機械の不具合を bug と呼ぶのは古くからあるが、有名な逸話がある。",
    teaser: "1947年、コンピューターの故障の原因として見つかったのは…？",
    reveal: "本物の蛾。グレース・ホッパーのチームが記録に貼った「最初の本物のバグ」として有名。",
  },
  "wi-fi": {
    etymology: "Wi-Fi Alliance が名付けたブランド名。",
    teaser: "この技術の名前は、何の略？",
    reveal: "実は何の略でもない。覚えやすさで付けられた名前で、wireless fidelity はあとからのこじつけ。",
  },
  podcast: {
    etymology: "iPod ＋ broadcast（放送）。",
    teaser: "この言葉の前半は、ある有名な機械の名前から。",
    reveal: "iPod。iPod で聞く放送（broadcast）という意味の造語。",
  },
  cab: {
    etymology: "cabriolet（軽い一頭立て馬車）の略。",
    teaser: "タクシーをこう呼ぶのは、昔の「◯◯」の名前から。",
    reveal: "馬車（cabriolet）。フランス語でヤギが跳ねるように揺れる馬車という意味と言われる。",
  },
};

/**
 * シークレット単語（ガチャには出ない。rule の単語を min 個集めると解放）。
 * 図鑑では「？」の状態で hint だけ見える。
 */
export const SECRETS = [
  {
    id: "secret-companion",
    english: "companion",
    japanese: "仲間／連れ",
    pos: "noun",
    example: "My dog is my best companion.",
    exampleJa: "犬は私の一番の相棒だよ。",
    etymology: "com（一緒に）＋ pan（パン）＋ -ion。company と同じ仲間。",
    teaser: "com（一緒に）が付く単語を3つ集めると…？",
    reveal: "一緒にパンを食べる人＝仲間。company（会社）と同じ語源のシークレット単語。",
    rule: { ids: ["company", "communicate", "combine", "compete", "complete", "compare", "commit", "community"], min: 3 },
    hint: "com（一緒に）が付く単語を3つ集める",
  },
  {
    id: "secret-spectacular",
    english: "spectacular",
    japanese: "壮観な／目を見張るような",
    pos: "adj",
    example: "The view from the top was spectacular.",
    exampleJa: "頂上からの眺めは壮観だった。",
    etymology: "spect（見る）＋ -acular。respect（振り返って見る）、suspect（下から見る）と同じ spect。",
    teaser: "spect（見る）が入った単語を3つ集めると…？",
    reveal: "思わず見入ってしまうほどの＝壮観な。",
    rule: { ids: ["respect", "perspective", "suspect"], min: 3 },
    hint: "spect（見る）が入った単語を3つ集める",
  },
  {
    id: "secret-unicorn",
    english: "unicorn",
    japanese: "ユニコーン／一角獣",
    pos: "noun",
    example: "That startup became a unicorn in two years.",
    exampleJa: "あのスタートアップは2年でユニコーン企業になった。",
    etymology: "uni（1つ）＋ corn（ラテン語 cornu＝角）。",
    teaser: "uni（1つ）が付く単語を3つ集めると…？",
    reveal: "角が1本の生き物。ビジネスでは評価額10億ドル以上の未上場企業のたとえにも使う。",
    rule: { ids: ["uniform", "university", "unique", "unit"], min: 3 },
    hint: "uni（1つ）が付く単語を3つ集める",
  },
];

/**
 * 称号。rule の種類:
 * - set: ids の単語をすべて集める
 * - count: 集めた単語（シークレットを含む）が min 語以上
 * - rarity: そのレア度を min 語以上
 * - max: Lv.4（MAX）の単語が min 語以上
 */
export const TITLES = [
  { id: "stargazer", name: "天体観測者", desc: "sun・moon・star・planet・sky をそろえる", rule: { type: "set", ids: ["sun", "moon", "star", "planet", "sky"] } },
  { id: "seasons", name: "四季の旅人", desc: "spring・summer・autumn・winter をそろえる", rule: { type: "set", ids: ["spring", "summer", "autumn", "winter"] } },
  { id: "week", name: "曜日マスター", desc: "月曜から日曜までの7語をそろえる", rule: { type: "set", ids: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] } },
  { id: "family", name: "家族思い", desc: "father・mother・brother・sister・son・daughter をそろえる", rule: { type: "set", ids: ["father", "mother", "brother", "sister", "son", "daughter"] } },
  { id: "zoo", name: "動物園の園長", desc: "dog・cat・horse・lion・tiger・elephant・monkey・giraffe をそろえる", rule: { type: "set", ids: ["dog", "cat", "horse", "lion", "tiger", "elephant", "monkey", "giraffe"] } },
  { id: "chef", name: "見習いシェフ", desc: "boil・fry・bake・grill・roast・steam・chop・slice をそろえる", rule: { type: "set", ids: ["boil", "fry", "bake", "grill", "roast", "steam", "chop", "slice"] } },
  { id: "gods", name: "神話の語り部", desc: "panic・cereal・volcano・january をそろえる（神の名前から生まれた単語）", rule: { type: "set", ids: ["panic", "cereal", "volcano", "january"] } },
  { id: "collector50", name: "単語コレクター", desc: "50語を集める", rule: { type: "count", min: 50 } },
  { id: "collector300", name: "単語ハンター", desc: "300語を集める", rule: { type: "count", min: 300 } },
  { id: "collector1000", name: "歩く辞書", desc: "1000語を集める", rule: { type: "count", min: 1000 } },
  { id: "ssr5", name: "語源探偵", desc: "SSR を5語集める", rule: { type: "rarity", rarity: "SSR", min: 5 } },
  { id: "ssr30", name: "語源マスター", desc: "SSR を30語集める", rule: { type: "rarity", rarity: "SSR", min: 30 } },
  { id: "max10", name: "限界突破", desc: "10語を Lv.4（MAX）にする", rule: { type: "max", min: 10 } },
];

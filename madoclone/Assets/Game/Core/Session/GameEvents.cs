namespace Mado.Core.Session
{
    public enum GameEventKind
    {
        WalletChanged,        // Id = 通貨, Amount = 増減（正＝獲得、負＝消費）, Detail = 理由, Value = 残高
        CharacterObtained,    // Id = キャラ
        CharacterLevelUp,     // Id = キャラ, Amount = 上がったLv数, Value = 新しいLv
        CharacterAwakened,    // Id = キャラ, Value = 新しい★
        CrystalMoved,         // Id = 魔晶, Detail = "キャラ:枠"（移動先）
        MemoryCardDrawn,      // Id = カード, Detail = レア
        MemoryCardEquipped,   // Id = カード, Value = 枠
        MemoryCardSold,       // Id = カード（自動のときは空）, Amount = コイン, Value = 売った枚数
        MemoryGachaLevelUp,   // Value = 新しい絆ガチャLv
        LeaderChanged,        // Id = キャラ（解除なら空）
        LeaderLevelUp,        // Value = 新しいリーダーLv
        ShopBought,           // Id = 商品, Amount = 個数
        RouletteSpun,         // Amount = 回数
        AchievementClaimed,   // Id = 実績（まとめてなら空）, Value = 受け取った段の数
        PartyChanged,
        SettingsChanged,
        GachaPulled,          // Id = バナー, Amount = 回数, Value = 新しく入手したキャラ数, Detail = 受け取ったステップ報酬の数
        TreeNodeLevelUp,      // Id = "ツリー/ノード", Value = 新しいLv
        TarotChanged,         // Id = 効果, Value = 枠, Detail = レア
        CollectionStarUp,     // Id = セット, Value = 新しい★
        ZukanAchieved,        // Value = 新しく達成した目標の数
        StoneEquipped,        // Id = 石, Value = 円盤の枠の番号
        StoneLevelUp,         // Id = 石, Value = 新しいLv
        StoneDismantled,      // Id = 石（まとめてなら空）, Amount = 星の砂, Value = 枚数
        StonesDropped,        // Id = 試練, Amount = 持てずに星の砂にした分, Value = 手に入れた枚数
        DragonNodeLevelUp,    // Id = ノード, Value = 新しいLv
        DragonNestReset,      // Id = 属性, Amount = 戻った竜の炎
        SupportChanged,       // Id = サポート（解除なら空）, Value = 解除した種類
        TrialCleared,         // Id = 試練, Value = クリア済みの最高Lv
        TrialRewarded,        // Id = 試練, Value = 報酬の対象になったLv
        PlazaLevelUp,         // Id = 広場, Amount = 上がったLv数, Value = 新しいLv
        IdleClaimed,          // Amount = 経験値, Value = 経過時間（時間）
        BattleFinished,       // Id = 勝敗, Amount = 倒した敵の数
        ProgressAdvanced,     // Value = ランク, Detail = "エリア-ステージ"
        Saved,
    }

    /// <summary>View 向けのイベント。コマンドが1つ終わるたびに、その中で起きたことが順に出る。</summary>
    public readonly struct GameEvent
    {
        public readonly GameEventKind Kind;
        public readonly string Id;
        public readonly double Amount;
        public readonly double Value;
        public readonly string Detail;

        public GameEvent(GameEventKind kind, string id = "", double amount = 0, double value = 0, string detail = "")
        {
            Kind = kind; Id = id ?? ""; Amount = amount; Value = value; Detail = detail ?? "";
        }
    }

    /// <summary>コマンドの結果。失敗のとき Failure に理由（列挙型の名前）が入る。失敗したコマンドは状態を変えない。</summary>
    public readonly struct CommandResult
    {
        public readonly bool Success;
        public readonly string Failure;

        public CommandResult(bool success, string failure) { Success = success; Failure = failure ?? ""; }

        public static CommandResult Ok() { return new CommandResult(true, ""); }
        public static CommandResult Fail(object reason) { return new CommandResult(false, reason.ToString()); }
    }
}

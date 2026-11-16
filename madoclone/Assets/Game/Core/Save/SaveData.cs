using System.Collections.Generic;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using Newtonsoft.Json.Linq;

namespace Mado.Core.Save
{
    /// <summary>セーブの中身（docs/04 6.1節）。育成系・ガチャ・実績・放置は、フェーズが来たときに足す。</summary>
    public sealed class SaveData
    {
        public const string FormatName = "madoclone-save";

        public string Format { get; set; } = FormatName;
        public int SaveVersion { get; set; }
        public bool DevMode { get; set; }

        /// <summary>保存した時刻（UTC、ISO 8601）。Core は時計を持たないので呼び出し側が入れる。</summary>
        public string SavedAtUtc { get; set; } = "";

        public RngState Rng { get; set; } = RngState.FromSeed(1UL);
        public WalletState Wallet { get; set; } = new WalletState();

        /// <summary>キー＝キャラ ID。出力は ID の昇順に固定。</summary>
        public Dictionary<string, CharacterState> Characters { get; set; } = new Dictionary<string, CharacterState>();

        public string Leader { get; set; }
        public Dictionary<string, PartyState> Parties { get; set; } = new Dictionary<string, PartyState>();
        public Dictionary<string, double> Metrics { get; set; } = new Dictionary<string, double>();
        public ProgressState Progress { get; set; } = new ProgressState();
        public SettingsState Settings { get; set; } = new SettingsState();
        public MemoryState Memory { get; set; } = new MemoryState();
        public TempleState Temple { get; set; } = new TempleState();
        public IdleState Idle { get; set; } = new IdleState();
        public ArenaState Arena { get; set; } = new ArenaState();
        public PlazaState Plazas { get; set; } = new PlazaState();
        public Dictionary<string, TrialState> Trials { get; set; } = new Dictionary<string, TrialState>();
        public SupportsState Supports { get; set; } = new SupportsState();
        public DragonNestState DragonNest { get; set; } = new DragonNestState();
        public SpiritStoneState SpiritStones { get; set; } = new SpiritStoneState();
        public ResearchState Research { get; set; } = new ResearchState();
        public GachaState Gacha { get; set; } = new GachaState();
        public AchievementState Achievements { get; set; } = new AchievementState();

        /// <summary>マスタに無い ID・未知の項目の中身。捨てずに持ち越す（キーは "characters/ID" など）。</summary>
        public Dictionary<string, JToken> Orphans { get; set; } = new Dictionary<string, JToken>();

        public static SaveData CreateNew(int saveVersion, string savedAtUtc, ulong seed)
        {
            return new SaveData { SaveVersion = saveVersion, SavedAtUtc = savedAtUtc ?? "", Rng = RngState.FromSeed(seed) };
        }
    }

    public sealed class CharacterState
    {
        public const int CrystalSlots = 5;

        /// <summary>固有魔晶が最初に入る枠（★6で開く枠）。system.crystalSlotStars のこの位置の★で、魔晶が手に入る。</summary>
        public const int OwnCrystalSlot = 2;

        public int Star { get; set; }
        public int Lv { get; set; } = 1;
        public double Exp { get; set; }
        public int Copies { get; set; }

        /// <summary>長さ5。無い枠は null。</summary>
        public string[] Crystals { get; set; } = new string[CrystalSlots];
    }

    /// <summary>サブ効果1つ。Value は、レア UR・カードLv＋3 が subRefLv のときの値（レアの倍率とLvの伸びは計算時に掛ける）。</summary>
    public sealed class MemorySubState
    {
        public SubstatKey Stat { get; set; }
        public double Value { get; set; }
    }

    /// <summary>記憶カード1枚（持ち物）。係数はガチャで引いたときに決まる。</summary>
    public sealed class MemoryCardState
    {
        public string Id { get; set; }
        public string Rarity { get; set; }
        public MemoryKind Kind { get; set; }
        public int Lv { get; set; }

        /// <summary>メイン％の係数（スピードカードでは使わない）。</summary>
        public double Main { get; set; }

        /// <summary>スピードカードの HP・攻撃・防御％の係数（長さ3）。他の種類では空。</summary>
        public double[] Extra { get; set; } = new double[0];

        /// <summary>サブ効果（2つ）。</summary>
        public List<MemorySubState> Subs { get; set; } = new List<MemorySubState>();
    }

    /// <summary>記憶カード：持っているカード・装備・絆ガチャLv。</summary>
    public sealed class MemoryState
    {
        /// <summary>種類4つ × 各2枚。枠の番号は (int)Kind × 2 ＋ 0 か 1。</summary>
        public const int SlotCount = 8;

        public int GachaLv { get; set; } = 1;

        /// <summary>次に付けるカード ID の連番。</summary>
        public int NextCardNumber { get; set; } = 1;

        public List<MemoryCardState> Cards { get; set; } = new List<MemoryCardState>();

        /// <summary>長さ8。空の枠は null。</summary>
        public string[] Equipped { get; set; } = new string[SlotCount];
    }

    /// <summary>リーダー神殿：リーダーLv と、変えた属性（null なら元の属性）。</summary>
    public sealed class TempleState
    {
        public int LeaderLv { get; set; } = 1;
        public Element? LeaderElement { get; set; }
    }

    /// <summary>放置報酬：最後に受け取った（数え始めた）時刻（UTC、ISO 8601）。空なら、まだ数え始めていない。</summary>
    /// <summary>大魔闘演武のシーズン：いまのシーズン（1始まり）、そこで戦った数、いまのポイント、受け取り待ちの順位（0 は無し）。</summary>
    public sealed class ArenaState
    {
        public int Season { get; set; } = 1;
        public int Battles { get; set; }
        public int Points { get; set; }
        public int PendingRank { get; set; }
    }

    public sealed class IdleState
    {
        public string LastClaimUtc { get; set; } = "";
    }

    /// <summary>広場のLv（キーは plazas.json の id。無い広場は Lv1）。</summary>
    public sealed class PlazaState
    {
        public Dictionary<string, int> Levels { get; set; } = new Dictionary<string, int>();
    }

    /// <summary>繰り返せる収入の歯止めの状態（貯まっている回数と、最後に数えた時刻）。試練・ギルドレイドなどで共通。</summary>
    public sealed class GateState
    {
        public double Charges { get; set; }
        public string LastUtc { get; set; } = "";
    }

    /// <summary>試練1つの進み具合：クリア済みの最高Lv と、報酬の歯止め。</summary>
    public sealed class TrialState
    {
        public int ClearedLv { get; set; }
        public GateState Gate { get; set; } = new GateState();
    }

    /// <summary>サポートの★（キーは supports.json の id。無いものは★0）。持っているかは、解放の試練のLvから決まる（保存しない）。</summary>
    public sealed class SupportsState
    {
        public Dictionary<string, int> Stars { get; set; } = new Dictionary<string, int>();
    }

    /// <summary>竜の巣のツリー：ノードID（"属性.ブロック.段.ステータス"）→ Lv（0 のノードは持たない）。</summary>
    public sealed class DragonNestState
    {
        public Dictionary<string, int> Levels { get; set; } = new Dictionary<string, int>();
    }

    /// <summary>霊石版1枚（持ち物）。</summary>
    public sealed class StoneState
    {
        public string Id { get; set; }
        public string Rarity { get; set; }
        public string Constellation { get; set; }
        public int Lv { get; set; } = 1;
    }

    /// <summary>霊石版：持っている石と、円盤（ページ × 枠。Equipped は ページ×枠数 の長さの1列で、空は null）。</summary>
    public sealed class SpiritStoneState
    {
        public int NextNumber { get; set; } = 1;
        public List<StoneState> Stones { get; set; } = new List<StoneState>();
        public string[] Equipped { get; set; } = new string[0];
    }

    /// <summary>タロットの枠1つ。空は Effect が null。</summary>
    public sealed class TarotSlotState
    {
        public string Effect { get; set; }
        public string Rarity { get; set; }
    }

    /// <summary>研究ツリー（研究所・リーダー特殊ツリー）、タロット、コレクション、図鑑の状態。</summary>
    public sealed class ResearchState
    {
        /// <summary>ノードのLv。キーは "ツリー/ノード"（0 のノードは持たない）。</summary>
        public Dictionary<string, int> Nodes { get; set; } = new Dictionary<string, int>();
        public List<TarotSlotState> Tarot { get; set; } = new List<TarotSlotState>();

        /// <summary>コレクションのセットの★（キーはセット ID）。</summary>
        public Dictionary<string, int> Collection { get; set; } = new Dictionary<string, int>();

        /// <summary>達成した図鑑の目標（"キャラ.lv60"、"キャラ.star3"）。昇順で保存。</summary>
        public List<string> Zukan { get; set; } = new List<string>();

        /// <summary>タロットを入れ替えた回数（払った回数）。多いほど、次の入れ替えのワインが高くなる。</summary>
        public int TarotChanges { get; set; }
    }

    /// <summary>キャラガチャ：累計の引き数、ピックアップの天井までの数、選んだピックアップ、受け取り済みのステップの数。</summary>
    public sealed class GachaState
    {
        public int TotalPulls { get; set; }
        public int PickupPity { get; set; }
        public string PickupId { get; set; }
        public int StepsClaimed { get; set; }
    }

    /// <summary>実績：受け取り済みの段の数（キーは実績 ID）。</summary>
    public sealed class AchievementState
    {
        public Dictionary<string, int> Claimed { get; set; } = new Dictionary<string, int>();

        /// <summary>周回する実績の、終わった周の数（キーは実績 ID。0 は書かない）。</summary>
        public Dictionary<string, int> Laps { get; set; } = new Dictionary<string, int>();
    }

    public sealed class PartyState
    {
        public string[] Slots { get; set; } = new string[6];
        public string Familiar { get; set; }
        public string Spirit { get; set; }
        public string Dragon { get; set; }
    }

    public sealed class ProgressState
    {
        public int Rank { get; set; } = 1;
        public int Area { get; set; } = 1;
        public int Stage { get; set; } = 1;
    }

    public sealed class SettingsState
    {
        public double BattleSpeed { get; set; } = 1;
        public bool AutoBoss { get; set; }
        public bool SkipGachaAnim { get; set; } = true;

        /// <summary>成長速度の倍率（1〜5）。放置報酬と、試練の回数が貯まる速さに掛ける。</summary>
        public double GrowthSpeed { get; set; } = 1;
    }

    /// <summary>乱数の状態（ガチャ用・その他用の4つずつ）。戦闘の乱数は戦闘のシードから作るので持たない。</summary>
    public sealed class RngState
    {
        public uint[] Gacha { get; set; }
        public uint[] Misc { get; set; }

        public static RngState FromSeed(ulong seed)
        {
            return new RngState
            {
                Gacha = Util.Rng.Create(seed, RngStream.Gacha).GetState(),
                Misc = Util.Rng.Create(seed, RngStream.Misc).GetState(),
            };
        }
    }
}

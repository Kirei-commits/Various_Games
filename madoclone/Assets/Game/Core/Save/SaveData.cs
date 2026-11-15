using System.Collections.Generic;
using Mado.Core.Util;
using Mado.Core.Wallet;
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

        public int Star { get; set; }
        public int Lv { get; set; } = 1;
        public double Exp { get; set; }
        public int Copies { get; set; }

        /// <summary>長さ5。無い枠は null。</summary>
        public string[] Crystals { get; set; } = new string[CrystalSlots];
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

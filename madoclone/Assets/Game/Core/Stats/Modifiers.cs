using System.Collections.Generic;
using Mado.Data;

namespace Mado.Core.Stats
{
    /// <summary>補正の対象（Mado.Data.StatKey はバフ用で Hp と攻撃スピードを持たないので別に持つ）。</summary>
    public enum StatId { Atk, Hp, Def, Evasion, Accuracy, CritRate, CritResist, CritDamage, CritDefense, AttackSpeed }

    /// <summary>
    /// Global・DragonNest・LeaderLv は割合の3つの輪（Atk・Hp・Def にだけ。輪どうしは掛け算）。
    /// Flat は副ステータスの％ポイントと、AttackSpeed の％の足し算。
    /// </summary>
    public enum ModifierPool { Global, DragonNest, LeaderLv, Flat }

    /// <summary>Value は Pct（120 は120％の増加＝×2.2 ではなく +120％）。</summary>
    public readonly struct Modifier
    {
        public readonly StatId Stat;
        public readonly ModifierPool Pool;
        public readonly double Value;

        public Modifier(StatId stat, ModifierPool pool, double value) { Stat = stat; Pool = pool; Value = value; }
    }

    public readonly struct StatQuery
    {
        public readonly string CharacterId;
        public readonly int Star, Lv;
        public readonly Element Element;
        public readonly bool IsLeader;

        public StatQuery(string characterId, int star, int lv, Element element, bool isLeader)
        {
            CharacterId = characterId; Star = star; Lv = lv; Element = element; IsLeader = isLeader;
        }
    }

    /// <summary>補正の出どころ（広場・研究・竜の巣など）。フェーズ3以降に足す。</summary>
    public interface IModifierSource
    {
        void Collect(List<Modifier> sink, StatQuery query);
    }

    /// <summary>
    /// 本物の出どころが無いフェーズの代わり：ランクごとの「標準的な育ち具合」の共通倍率を Global の輪に足す（docs/04 8.2節）。
    /// 倍率 0（出どころ無し）なら何も足さない。戦闘シミュレーション専用。
    /// </summary>
    public sealed class ProfileModifierSource : IModifierSource
    {
        private readonly GlobalMultiplier _m;

        public ProfileModifierSource(SimProfileDef profile)
        {
            _m = profile.GlobalMultiplier;
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            Add(sink, StatId.Atk, _m.Atk);
            Add(sink, StatId.Hp, _m.Hp);
            Add(sink, StatId.Def, _m.Def);
        }

        private static void Add(List<Modifier> sink, StatId stat, double multiplier)
        {
            if (multiplier > 0) { sink.Add(new Modifier(stat, ModifierPool.Global, (multiplier - 1.0) * 100.0)); }
        }
    }
}

using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Data;

namespace Mado.Core.Growth
{
    /// <summary>
    /// 記憶カードの効果の計算（docs/01 7.2節）。％ ＝ 係数 ×（カードLv＋levelOffset）、固定値 ＝ fixed係数 ×（カードLv＋levelOffset）² × 単位換算、
    /// サブ ＝ 値 × レアの倍率 ×（カードLv＋levelOffset）÷ subRefLv。純粋関数。
    /// </summary>
    public static class MemoryCardEffects
    {
        public static MemoryRarityDef Rarity(GameData data, string rarityId)
        {
            foreach (MemoryRarityDef r in data.MemoryCards.Rarities) { if (r.Id == rarityId) { return r; } }
            throw new DataException("記憶カードのレアリティが無い: " + (rarityId ?? "(null)"));
        }

        public static int RarityIndex(GameData data, string rarityId)
        {
            IReadOnlyList<MemoryRarityDef> rs = data.MemoryCards.Rarities;
            for (int i = 0; i < rs.Count; i++) { if (rs[i].Id == rarityId) { return i; } }
            return -1;
        }

        /// <summary>カードの効果を sink に足す。マスタに無いレアのカードは何も足さない（検証がエラーにする）。</summary>
        public static void Collect(GameData data, MemoryCardState card, List<Modifier> sink)
        {
            MemoryCardsConfig cfg = data.MemoryCards;
            if (RarityIndex(data, card.Rarity) < 0) { return; }
            MemoryRarityDef r = Rarity(data, card.Rarity);
            double x = card.Lv + cfg.LevelOffset;
            FixedUnitScale u = cfg.FixedUnitScale;

            switch (card.Kind)
            {
                case MemoryKind.Hp:
                    sink.Add(new Modifier(StatId.Hp, ModifierPool.Global, card.Main * x));
                    sink.Add(new Modifier(StatId.Hp, ModifierPool.Flat, r.FixedHp * x * x * u.Hp));
                    break;
                case MemoryKind.Atk:
                    sink.Add(new Modifier(StatId.Atk, ModifierPool.Global, card.Main * x));
                    sink.Add(new Modifier(StatId.Atk, ModifierPool.Flat, r.FixedAtk * x * x * u.Atk));
                    break;
                case MemoryKind.Def:
                    sink.Add(new Modifier(StatId.Def, ModifierPool.Global, card.Main * x));
                    sink.Add(new Modifier(StatId.Def, ModifierPool.Flat, r.FixedDef * x * x * u.Def));
                    break;
                default:
                    sink.Add(new Modifier(StatId.AttackSpeed, ModifierPool.Flat, r.SpeedCoef * x));
                    if (card.Extra != null && card.Extra.Length == 3)
                    {
                        sink.Add(new Modifier(StatId.Hp, ModifierPool.Global, card.Extra[0] * x));
                        sink.Add(new Modifier(StatId.Atk, ModifierPool.Global, card.Extra[1] * x));
                        sink.Add(new Modifier(StatId.Def, ModifierPool.Global, card.Extra[2] * x));
                    }
                    break;
            }
            foreach (MemorySubState sub in card.Subs)
            {
                sink.Add(new Modifier(ToStat(sub.Stat), ModifierPool.Flat, sub.Value * r.SubScale * x / cfg.SubRefLv));
            }
        }

        public static StatId ToStat(SubstatKey key)
        {
            switch (key)
            {
                case SubstatKey.EvasionPct: return StatId.Evasion;
                case SubstatKey.AccuracyPct: return StatId.Accuracy;
                case SubstatKey.CritRatePct: return StatId.CritRate;
                case SubstatKey.CritResistPct: return StatId.CritResist;
                case SubstatKey.CritDamagePct: return StatId.CritDamage;
                default: return StatId.CritDefense;
            }
        }
    }

    /// <summary>装備中の記憶カードの効果を、チーム全体（全キャラ共通）の補正として出す。</summary>
    public sealed class MemoryCardSource : IModifierSource
    {
        private readonly GameData _data;
        private readonly SaveData _save;

        public MemoryCardSource(GameData data, SaveData save)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            MemoryState m = _save.Memory;
            for (int slot = 0; slot < m.Equipped.Length; slot++)
            {
                string id = m.Equipped[slot];
                if (id == null) { continue; }
                MemoryCardState card = Find(m, id);
                if (card != null) { MemoryCardEffects.Collect(_data, card, sink); }
            }
        }

        private static MemoryCardState Find(MemoryState m, string id)
        {
            foreach (MemoryCardState c in m.Cards) { if (c.Id == id) { return c; } }
            return null;
        }
    }
}

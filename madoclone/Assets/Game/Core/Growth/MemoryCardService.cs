using System;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum MemoryFailure { None, UnknownCard, WrongSlot, AtMaxGachaLv, NotEnough }

    public readonly struct PullResult
    {
        public readonly bool Success;
        public readonly MemoryFailure Failure;
        public readonly MemoryCardState Card;
        public readonly double ShortBy;

        public PullResult(bool success, MemoryFailure failure, MemoryCardState card, double shortBy)
        {
            Success = success; Failure = failure; Card = card; ShortBy = shortBy;
        }
    }

    /// <summary>
    /// 記憶カードの操作：絆ガチャ（絆ハートで引く）、絆ガチャLv上げ（コイン）、装備・外す。
    /// 乱数はセーブの Gacha ストリームを使い、引くたびに状態を書き戻す。払うのは Wallet 経由（不変条件3）。
    /// </summary>
    public sealed class MemoryCardService
    {
        public const string BondHeart = "bond_heart";

        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public MemoryCardService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public int GachaLv { get { return _save.Memory.GachaLv; } }

        /// <summary>絆ガチャLv lv → lv+1 の費用（コイン）。</summary>
        public double GachaLvCost(int lv)
        {
            MemoryCardsConfig c = _data.MemoryCards;
            if (lv < 1 || lv >= c.MaxCardLv) { throw new ArgumentException("絆ガチャLv が範囲外: " + lv); }
            return c.GachaLvCostBase * Math.Pow(c.GachaLvCostGrowth, lv - 1);
        }

        /// <summary>絆ガチャLv を1つ上げる。</summary>
        public MemoryFailure RaiseGachaLv()
        {
            MemoryState m = _save.Memory;
            if (m.GachaLv >= _data.MemoryCards.MaxCardLv) { return MemoryFailure.AtMaxGachaLv; }
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.Coin, GachaLvCost(m.GachaLv)), new PayReason(WalletReasons.MemoryGachaLevel));
            if (!pay.Success) { return MemoryFailure.NotEnough; }
            m.GachaLv++;
            return MemoryFailure.None;
        }

        /// <summary>絆ガチャを1回引く。引いたカードはいまの絆ガチャLv と同じLvになる（docs/01 7.2節 [推定]）。</summary>
        public PullResult Pull()
        {
            MemoryCardsConfig cfg = _data.MemoryCards;
            PayResult pay = _wallet.Pay(new Cost(BondHeart, cfg.PullCostBondHeart), new PayReason(WalletReasons.GachaPull));
            if (!pay.Success) { return new PullResult(false, MemoryFailure.NotEnough, null, pay.ShortBy); }

            MemoryState m = _save.Memory;
            Rng rng = Rng.FromState(_save.Rng.Gacha);
            MemoryCardState card = Roll(cfg, rng, m);
            _save.Rng.Gacha = rng.GetState();
            m.Cards.Add(card);
            return new PullResult(true, MemoryFailure.None, card, 0);
        }

        private MemoryCardState Roll(MemoryCardsConfig cfg, Rng rng, MemoryState m)
        {
            GachaBand band = BandFor(cfg, m.GachaLv);
            int rarity = PickWeighted(band.Weights, rng);
            MemoryRarityDef r = cfg.Rarities[rarity];
            var card = new MemoryCardState
            {
                Id = "mc_" + m.NextCardNumber.ToString("D5"),
                Rarity = r.Id,
                Kind = (MemoryKind)rng.NextInt(4),
                Lv = Math.Min(m.GachaLv, cfg.MaxCardLv),
            };
            m.NextCardNumber++;
            if (card.Kind == MemoryKind.Speed)
            {
                card.Extra = new[] { Between(rng, r.SpeedStatCoefMin, r.SpeedStatCoefMax), Between(rng, r.SpeedStatCoefMin, r.SpeedStatCoefMax), Between(rng, r.SpeedStatCoefMin, r.SpeedStatCoefMax) };
            }
            else
            {
                card.Main = Between(rng, r.MainCoefMin, r.MainCoefMax);
            }
            // サブは種類の重複なしで2つ。
            int first = rng.NextInt(cfg.SubEffects.Count);
            int second = rng.NextInt(cfg.SubEffects.Count - 1);
            if (second >= first) { second++; }
            foreach (int index in new[] { first, second })
            {
                MemorySubEffectDef s = cfg.SubEffects[index];
                card.Subs.Add(new MemorySubState { Stat = s.Stat, Value = Between(rng, s.Min, s.Max) });
            }
            return card;
        }

        public static GachaBand BandFor(MemoryCardsConfig cfg, int gachaLv)
        {
            GachaBand best = cfg.GachaBands[0];
            foreach (GachaBand b in cfg.GachaBands) { if (b.MinLv <= gachaLv) { best = b; } }
            return best;
        }

        private static int PickWeighted(System.Collections.Generic.IReadOnlyList<double> weights, Rng rng)
        {
            double roll = rng.NextDouble() * 100.0;
            double acc = 0;
            int last = 0;
            for (int i = 0; i < weights.Count; i++)
            {
                if (weights[i] <= 0) { continue; }
                acc += weights[i];
                last = i;
                if (roll < acc) { return i; }
            }
            return last;
        }

        private static double Between(Rng rng, double min, double max)
        {
            return min + (max - min) * rng.NextDouble();
        }

        /// <summary>枠の番号：種類 × 2 ＋ 何枚目か（0・1）。</summary>
        public static int Slot(MemoryKind kind, int index) { return (int)kind * 2 + index; }

        /// <summary>カードを枠に付ける。枠の種類とカードの種類が違えば WrongSlot。すでに別の枠に付いていれば、そこから外す。</summary>
        public MemoryFailure Equip(string cardId, int slot)
        {
            MemoryState m = _save.Memory;
            MemoryCardState card = m.Cards.Find(c => c.Id == cardId);
            if (card == null) { return MemoryFailure.UnknownCard; }
            if (slot < 0 || slot >= MemoryState.SlotCount || slot / 2 != (int)card.Kind) { return MemoryFailure.WrongSlot; }
            for (int i = 0; i < m.Equipped.Length; i++) { if (m.Equipped[i] == cardId) { m.Equipped[i] = null; } }
            m.Equipped[slot] = cardId;
            return MemoryFailure.None;
        }

        public void Unequip(int slot)
        {
            if (slot < 0 || slot >= MemoryState.SlotCount) { throw new ArgumentException("枠が範囲外: " + slot); }
            _save.Memory.Equipped[slot] = null;
        }
    }
}

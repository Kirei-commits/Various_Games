using System;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum MemoryFailure { None, UnknownCard, WrongSlot, AtMaxGachaLv, NotEnough, Equipped, InvalidSettings }

    public readonly struct PullResult
    {
        public readonly bool Success;
        public readonly MemoryFailure Failure;
        public readonly MemoryCardState Card;
        public readonly double ShortBy;

        /// <summary>true なら、いまより強いカードなので装備した（持ち物に入った）。false なら、引いたその場でコインと経験値に還元した。</summary>
        public readonly bool Kept;

        /// <summary>この1回で還元したカード（引いたカード、または付け替えで外れたカード）の数と、得たコイン・経験値。</summary>
        public readonly int Converted;
        public readonly double Coin, Exp;

        public PullResult(bool success, MemoryFailure failure, MemoryCardState card, double shortBy, bool kept = false, int converted = 0, double coin = 0, double exp = 0)
        {
            Success = success; Failure = failure; Card = card; ShortBy = shortBy; Kept = kept; Converted = converted; Coin = coin; Exp = exp;
        }
    }

    /// <summary>
    /// 記憶カードの操作：絆ガチャ（絆ハートで引く）、絆ガチャLv上げ（コイン）、装備・外す。
    /// 乱数はセーブの Gacha ストリームを使い、引くたびに状態を書き戻す。払うのは Wallet 経由（不変条件3）。
    /// </summary>
    public sealed class MemoryCardService
    {
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

        /// <summary>
        /// 絆ガチャを1回引く。引いたカードはいまの絆ガチャLv と同じLvになる（docs/01 7.2節 [推定]）。
        /// 装備しているものより強い（かつ rule の条件に合う）カードだけ、空き枠か弱いほうの枠に自動で付ける。付け替えで外れたカードも、
        /// 条件に合わないカードも、持ち物には入れず、その場でコインと経験値に還元する（カードは溜まらない）。rule が null なら「強くなるか」だけで決める。
        /// </summary>
        public PullResult Pull(AutoGachaSettings rule = null)
        {
            MemoryCardsConfig cfg = _data.MemoryCards;
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.BondHeart, cfg.PullCostBondHeart), new PayReason(WalletReasons.GachaPull));
            if (!pay.Success) { return new PullResult(false, MemoryFailure.NotEnough, null, pay.ShortBy); }

            MemoryState m = _save.Memory;
            Rng rng = Rng.FromState(_save.Rng.Gacha);
            MemoryCardState card = Roll(cfg, rng, m);
            _save.Rng.Gacha = rng.GetState();

            var judge = new AutoGachaSettings
            {
                RequirePowerUp = true,
                MinRarityIndex = rule == null ? 0 : rule.MinRarityIndex,
                Filter1 = rule == null ? new SubstatKey[0] : rule.Filter1,
                Filter2 = rule == null ? new SubstatKey[0] : rule.Filter2,
            };
            double coin = 0, exp = 0;
            int converted = 0;
            bool kept = MemoryCardRules.Matches(_data, m, card, judge);
            if (kept)
            {
                int slot = WeakestSlot(m, card.Kind);
                string oldId = m.Equipped[slot];
                MemoryCardState old = oldId == null ? null : m.Cards.Find(c => c.Id == oldId);
                if (old != null)
                {
                    m.Cards.Remove(old);
                    Convert(old, ref coin, ref exp);
                    converted++;
                }
                m.Cards.Add(card);
                m.Equipped[slot] = card.Id;
            }
            else
            {
                Convert(card, ref coin, ref exp);
                converted++;
            }
            return new PullResult(true, MemoryFailure.None, card, 0, kept, converted, coin, exp);
        }

        /// <summary>同じ種類の枠のうち、空きの枠、なければ弱いほうの枠の番号。</summary>
        private int WeakestSlot(MemoryState m, MemoryKind kind)
        {
            int best = Slot(kind, 0);
            double bestScore = double.MaxValue;
            for (int i = 0; i < 2; i++)
            {
                int slot = Slot(kind, i);
                string id = m.Equipped[slot];
                MemoryCardState c = id == null ? null : m.Cards.Find(x => x.Id == id);
                double score = c == null ? -1 : MemoryCardRules.Score(_data, c);
                if (score < bestScore) { bestScore = score; best = slot; }
            }
            return best;
        }

        /// <summary>カードをコインと経験値に還元する（売値のコイン、その sellExpPerCoin 倍の経験値）。</summary>
        private void Convert(MemoryCardState card, ref double coin, ref double exp)
        {
            double c = MemoryCardRules.SellPrice(_data, card);
            double e = c * _data.MemoryCards.SellExpPerCoin;
            coin += c; exp += e;
            _wallet.Grant(new Reward(CurrencyIds.Coin, c), new GrantReason(WalletReasons.MemoryConvert));
            if (e > 0) { _wallet.Grant(new Reward(CurrencyIds.Exp, e), new GrantReason(WalletReasons.MemoryConvert)); }
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

        /// <summary>カードを売ってコインにする。付けているカードは売れない。</summary>
        public MemoryFailure Sell(string cardId, out double coin)
        {
            coin = 0;
            MemoryState m = _save.Memory;
            MemoryCardState card = m.Cards.Find(c => c.Id == cardId);
            if (card == null) { return MemoryFailure.UnknownCard; }
            if (Array.IndexOf(m.Equipped, cardId) >= 0) { return MemoryFailure.Equipped; }
            coin = MemoryCardRules.SellPrice(_data, card);
            m.Cards.Remove(card);
            _wallet.Grant(new Reward(CurrencyIds.Coin, coin), new GrantReason(WalletReasons.MemorySell));
            return MemoryFailure.None;
        }

        /// <summary>
        /// 自動絆ガチャ：条件に合う（いまより強い）カードが出るまで引き続ける。出たカードは装備され、止まる。
        /// 合わないカードは引くたびにコインと経験値に還元される。絆ハートが尽きるか maxPulls に着いたら止まる。
        /// </summary>
        public MemoryFailure AutoPull(AutoGachaSettings settings, int maxPulls, out AutoGachaResult result)
        {
            result = new AutoGachaResult { Stop = AutoStop.Limit };
            if (settings == null || maxPulls < 1 || settings.MinRarityIndex < 0 || settings.MinRarityIndex >= _data.MemoryCards.Rarities.Count
                || settings.Filter1.Count > 2 || settings.Filter2.Count > 2) { return MemoryFailure.InvalidSettings; }
            while (result.Pulls < maxPulls)
            {
                PullResult r = Pull(settings);
                if (!r.Success) { result.Stop = AutoStop.NotEnough; break; }
                result.Pulls++;
                result.Sold += r.Converted;
                result.CoinGained += r.Coin;
                result.ExpGained += r.Exp;
                if (!r.Kept) { continue; }
                result.Kept++;
                result.Found = r.Card;
                if (settings.StopOnFound) { result.Stop = AutoStop.Found; break; }
            }
            return MemoryFailure.None;
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

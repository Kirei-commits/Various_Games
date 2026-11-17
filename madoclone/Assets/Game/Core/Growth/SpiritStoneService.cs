using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum StoneFailure { None, UnknownStone, WrongSlot, Equipped, AtMaxLv, NotEnough, InventoryFull }

    /// <summary>
    /// 霊石版（docs/01 5.2節）：持ち物（最大 maxStones 枚）、円盤（ページ × 枠）へのはめ込み、星の砂でのレベル上げ、分解、星霊王の稽古のドロップ。
    /// メイン効果は枠で決まり（1・6番＝攻撃、2・5番＝HP、3・4番＝防御）、隠し能力は Lv で現れ、同じページの同じ星座でセット効果が付く。
    /// </summary>
    public sealed class SpiritStoneService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public SpiritStoneService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            EnsureSlots();
        }

        public int SlotsPerPage { get { return _data.SpiritStones.SlotMainStat.Count; } }
        public int PageCount { get { return _data.SpiritStones.Pages; } }

        private void EnsureSlots()
        {
            int need = SlotsPerPage * PageCount;
            if (_save.SpiritStones.Equipped.Length != need)
            {
                var fixedSlots = new string[need];
                Array.Copy(_save.SpiritStones.Equipped, fixedSlots, Math.Min(need, _save.SpiritStones.Equipped.Length));
                _save.SpiritStones.Equipped = fixedSlots;
            }
        }

        public int Count { get { return _save.SpiritStones.Stones.Count; } }

        public StoneState Find(string id)
        {
            return _save.SpiritStones.Stones.Find(s => s.Id == id);
        }

        public int RarityIndex(string rarityId)
        {
            IReadOnlyList<StoneRarityDef> rs = _data.SpiritStones.Rarities;
            for (int i = 0; i < rs.Count; i++) { if (rs[i].Id == rarityId) { return i; } }
            return -1;
        }

        public bool IsEquipped(string id) { return Array.IndexOf(_save.SpiritStones.Equipped, id) >= 0; }

        /// <summary>枠の番号：ページ × 枠数 ＋ 枠（どちらも 0 から）。</summary>
        public int Slot(int page, int slot) { return page * SlotsPerPage + slot; }

        // ---------------- 手に入れる ----------------

        /// <summary>石を1枚足す。持てる枚数がいっぱいなら null。</summary>
        public StoneState Add(string rarityId, string constellationId, int lv = 1)
        {
            if (Count >= _data.SpiritStones.MaxStones) { return null; }
            var stone = new StoneState
            {
                Id = "st_" + _save.SpiritStones.NextNumber.ToString("D5"), Rarity = rarityId, Constellation = constellationId,
                Lv = Math.Max(1, Math.Min(lv, _data.SpiritStones.MaxLv)),
            };
            _save.SpiritStones.NextNumber++;
            _save.SpiritStones.Stones.Add(stone);
            return stone;
        }

        /// <summary>ドロップを count 枚。ドロップ率に従い、星座は一様。持てる枚数を超えた分は、そのまま星の砂にする。</summary>
        public List<StoneState> Drop(int count, out double autoSand)
        {
            autoSand = 0;
            var got = new List<StoneState>();
            Rng rng = Rng.FromState(_save.Rng.Gacha);
            SpiritStonesConfig c = _data.SpiritStones;
            for (int i = 0; i < count; i++)
            {
                double roll = rng.NextDouble() * 100.0, acc = 0;
                int r = c.Rarities.Count - 1;
                for (int k = 0; k < c.Rarities.Count; k++)
                {
                    acc += c.Rarities[k].DropPct;
                    if (c.Rarities[k].DropPct > 0 && roll < acc) { r = k; break; }
                }
                string cons = c.Constellations[rng.NextInt(c.Constellations.Count)].Id;
                StoneState stone = Add(c.Rarities[r].Id, cons);
                if (stone != null) { got.Add(stone); continue; }
                double sand = c.Rarities[r].SandBase * 2.0;      // Lv1 の分解と同じ（SandBase × (Lv＋1)）
                autoSand += sand;
            }
            _save.Rng.Gacha = rng.GetState();
            if (autoSand > 0) { _wallet.Grant(new Reward(CurrencyIds.StarSand, autoSand), new GrantReason(WalletReasons.StoneDismantle)); }
            return got;
        }

        // ---------------- はめ込み ----------------

        public StoneFailure Equip(int page, int slot, string stoneId)
        {
            if (Find(stoneId) == null) { return StoneFailure.UnknownStone; }
            if (page < 0 || page >= PageCount || slot < 0 || slot >= SlotsPerPage) { return StoneFailure.WrongSlot; }
            string[] eq = _save.SpiritStones.Equipped;
            for (int i = 0; i < eq.Length; i++) { if (eq[i] == stoneId) { eq[i] = null; } }
            eq[Slot(page, slot)] = stoneId;
            return StoneFailure.None;
        }

        public StoneFailure Unequip(int page, int slot)
        {
            if (page < 0 || page >= PageCount || slot < 0 || slot >= SlotsPerPage) { return StoneFailure.WrongSlot; }
            _save.SpiritStones.Equipped[Slot(page, slot)] = null;
            return StoneFailure.None;
        }

        // ---------------- レベル上げ・分解 ----------------

        /// <summary>Lv lv → lv+1 の星の砂。</summary>
        public double LevelCost(StoneState stone)
        {
            if (stone.Lv >= _data.SpiritStones.MaxLv) { throw new ArgumentException("最大Lv では次の費用が無い"); }
            SpiritStonesConfig c = _data.SpiritStones;
            double growth = stone.Lv > c.LevelCostGrowthFromLv ? Math.Pow(c.LevelCostGrowth, stone.Lv - c.LevelCostGrowthFromLv) : 1.0;
            return c.LevelCostBase * (RarityIndex(stone.Rarity) + 1) * stone.Lv * growth;
        }

        public StoneFailure LevelUp(string stoneId)
        {
            StoneState stone = Find(stoneId);
            if (stone == null) { return StoneFailure.UnknownStone; }
            if (stone.Lv >= _data.SpiritStones.MaxLv) { return StoneFailure.AtMaxLv; }
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.StarSand, LevelCost(stone)), new PayReason(WalletReasons.StoneLevelUp));
            if (!pay.Success) { return StoneFailure.NotEnough; }
            stone.Lv++;
            return StoneFailure.None;
        }

        public double SandOf(StoneState stone)
        {
            return _data.SpiritStones.Rarities[RarityIndex(stone.Rarity)].SandBase * (stone.Lv + 1);
        }

        /// <summary>1枚を分解して星の砂にする。はめている石は分解できない。</summary>
        public StoneFailure Dismantle(string stoneId, out double sand)
        {
            sand = 0;
            StoneState stone = Find(stoneId);
            if (stone == null) { return StoneFailure.UnknownStone; }
            if (IsEquipped(stoneId)) { return StoneFailure.Equipped; }
            sand = SandOf(stone);
            _save.SpiritStones.Stones.Remove(stone);
            _wallet.Grant(new Reward(CurrencyIds.StarSand, sand), new GrantReason(WalletReasons.StoneDismantle));
            return StoneFailure.None;
        }

        /// <summary>レアの順番が rarityIndex 以下の、はめていない石を全部分解する。</summary>
        public int DismantleUpTo(int rarityIndex, out double sand)
        {
            sand = 0;
            int n = 0;
            foreach (StoneState stone in _save.SpiritStones.Stones.ToArray())
            {
                if (RarityIndex(stone.Rarity) > rarityIndex || IsEquipped(stone.Id)) { continue; }
                Dismantle(stone.Id, out double one);
                sand += one;
                n++;
            }
            return n;
        }

        // ---------------- 効果の値 ----------------

        /// <summary>メイン効果の％（mainPerLv × Lv）。</summary>
        public double MainPct(StoneState stone)
        {
            return _data.SpiritStones.Rarities[RarityIndex(stone.Rarity)].MainPerLv * stone.Lv;
        }

        /// <summary>隠し能力の値：Lv が appearLv に着いてから、1Lv ごとに subBase ずつ。現れる前は 0。</summary>
        public double SubValue(StoneState stone, StoneSubDef sub)
        {
            if (stone.Lv < sub.AppearLv) { return 0; }
            return _data.SpiritStones.Rarities[RarityIndex(stone.Rarity)].SubBase * (stone.Lv - sub.AppearLv + 1);
        }
    }

    /// <summary>霊石版の効果：円盤にはめた石のメイン％（Global の輪）、隠し能力（Flat）、ページごとの星座のセット効果（Flat）。全キャラ共通。</summary>
    public sealed class SpiritStoneSource : IModifierSource
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly SpiritStoneService _service;

        public SpiritStoneSource(GameData data, SaveData save, SpiritStoneService service)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            SpiritStonesConfig c = _data.SpiritStones;
            int per = c.SlotMainStat.Count;
            string[] eq = _save.SpiritStones.Equipped;
            for (int page = 0; page < c.Pages; page++)
            {
                var counts = new Dictionary<string, int>();
                for (int slot = 0; slot < per; slot++)
                {
                    int index = page * per + slot;
                    StoneState stone = index < eq.Length && eq[index] != null ? _service.Find(eq[index]) : null;
                    if (stone == null || _service.RarityIndex(stone.Rarity) < 0) { continue; }
                    sink.Add(new Modifier(MainStat(c.SlotMainStat[slot]), ModifierPool.Global, _service.MainPct(stone)));
                    foreach (StoneSubDef sub in c.SubOrder)
                    {
                        double v = _service.SubValue(stone, sub);
                        if (v > 0) { sink.Add(new Modifier(SubStat(sub.Stat), ModifierPool.Flat, v)); }
                    }
                    counts[stone.Constellation] = (counts.TryGetValue(stone.Constellation, out int n) ? n : 0) + 1;
                }
                foreach (ConstellationDef k in c.Constellations)
                {
                    counts.TryGetValue(k.Id, out int have);
                    double v = have >= 4 ? k.Set4 : (have >= 2 ? k.Set2 : 0);
                    if (v > 0) { sink.Add(new Modifier(SubStat(k.SetStat), ModifierPool.Flat, v)); }
                }
            }
        }

        private static StatId MainStat(string key) { return key == "atk" ? StatId.Atk : (key == "hp" ? StatId.Hp : StatId.Def); }

        private static StatId SubStat(string key)
        {
            switch (key)
            {
                case "evasionPct": return StatId.Evasion;
                case "accuracyPct": return StatId.Accuracy;
                case "critRatePct": return StatId.CritRate;
                case "critResistPct": return StatId.CritResist;
                case "critDamagePct": return StatId.CritDamage;
                default: return StatId.CritDefense;
            }
        }
    }
}

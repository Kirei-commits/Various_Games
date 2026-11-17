using System;
using Mado.Core.Save;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum LevelFailure { None, UnknownCharacter, NotOwned, AtMaxLevel, InvalidTarget, NotEnoughExp }

    public readonly struct LevelResult
    {
        public readonly bool Success;
        public readonly LevelFailure Failure;
        public readonly int LevelsGained;

        /// <summary>払った経験値（開発者モードでも、払うはずだった量）。</summary>
        public readonly double ExpSpent;

        /// <summary>足りなかった経験値（NotEnoughExp のとき）。</summary>
        public readonly double ShortBy;

        public LevelResult(bool success, LevelFailure failure, int levelsGained, double expSpent, double shortBy)
        {
            Success = success; Failure = failure; LevelsGained = levelsGained; ExpSpent = expSpent; ShortBy = shortBy;
        }

        public static LevelResult Fail(LevelFailure f, double shortBy = 0) { return new LevelResult(false, f, 0, 0, shortBy); }
    }

    /// <summary>
    /// キャラのレベルアップ。経験値（通貨 exp）を払って 1 レベル上げる／目標のレベルまで上げる／払える所まで上げる。
    /// 費用は stat_tables.json の expToNext。上限は、そのキャラの★の最大 Lv。払うのは Wallet 経由（不変条件3）。
    /// </summary>
    public sealed class LevelService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public LevelService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        /// <summary>いまの★の最大 Lv。</summary>
        public int MaxLevel(CharacterState c) { return _data.Stats.StarMaxLv[c.Star]; }

        /// <summary>from から to まで上げるのに要る経験値の合計（from &lt; to）。</summary>
        public double TotalCost(int from, int to)
        {
            double sum = 0;
            for (int lv = from; lv < to; lv++) { sum += CostToNext(lv); }
            return sum;
        }

        /// <summary>Lv lv から lv+1 に上げる費用。</summary>
        public double CostToNext(int lv)
        {
            if (lv < 1 || lv >= _data.Stats.LevelTable.Count) { throw new ArgumentException("Lv が範囲外: " + lv); }
            double? cost = _data.Stats.LevelTable[lv - 1].ExpToNext;
            if (!cost.HasValue) { throw new ArgumentException("Lv" + lv + " は最大レベルで、次の費用が無い"); }
            return cost.Value;
        }

        public LevelResult LevelUp(string characterId)
        {
            if (!TryGet(characterId, out CharacterState c, out LevelFailure f)) { return LevelResult.Fail(f); }
            return LevelTo(characterId, c.Lv + 1);
        }

        /// <summary>目標の Lv まで一度に上げる（足りなければ何も変えない）。</summary>
        public LevelResult LevelTo(string characterId, int targetLv)
        {
            if (!TryGet(characterId, out CharacterState c, out LevelFailure f)) { return LevelResult.Fail(f); }
            if (c.Lv >= MaxLevel(c)) { return LevelResult.Fail(LevelFailure.AtMaxLevel); }
            if (targetLv <= c.Lv || targetLv > MaxLevel(c)) { return LevelResult.Fail(LevelFailure.InvalidTarget); }
            return Apply(c, targetLv);
        }

        /// <summary>払える所まで上げる（Lv.MAX UP）。開発者モードなら上限まで。1 レベルも上がらないなら NotEnoughExp。</summary>
        public LevelResult LevelUpMax(string characterId)
        {
            if (!TryGet(characterId, out CharacterState c, out LevelFailure f)) { return LevelResult.Fail(f); }
            int cap = MaxLevel(c);
            if (c.Lv >= cap) { return LevelResult.Fail(LevelFailure.AtMaxLevel); }
            int target = c.Lv;
            if (_wallet.Unlimited) { target = cap; }
            else
            {
                double budget = _wallet.Balance(CurrencyIds.Exp);
                double spent = 0;
                while (target < cap && spent + CostToNext(target) <= budget) { spent += CostToNext(target); target++; }
            }
            if (target == c.Lv) { return LevelResult.Fail(LevelFailure.NotEnoughExp, CostToNext(c.Lv) - _wallet.Balance(CurrencyIds.Exp)); }
            return Apply(c, target);
        }

        private LevelResult Apply(CharacterState c, int target)
        {
            double cost = TotalCost(c.Lv, target);
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.Exp, cost), new PayReason(WalletReasons.GrowthLevelUp));
            if (!pay.Success) { return LevelResult.Fail(LevelFailure.NotEnoughExp, pay.ShortBy); }
            int gained = target - c.Lv;
            c.Lv = target;
            return new LevelResult(true, LevelFailure.None, gained, cost, 0);
        }

        private bool TryGet(string id, out CharacterState c, out LevelFailure failure)
        {
            c = null;
            failure = LevelFailure.None;
            if (id == null || !_data.TryCharacter(id, out _)) { failure = LevelFailure.UnknownCharacter; return false; }
            if (!_save.Characters.TryGetValue(id, out c)) { failure = LevelFailure.NotOwned; return false; }
            return true;
        }
    }
}

using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum TempleFailure { None, UnknownCharacter, NotOwned, StarTooLow, AtMaxLv, NotEnough }

    public readonly struct TempleLevelResult
    {
        public readonly bool Success;
        public readonly TempleFailure Failure;
        public readonly int NewLv;
        public readonly double ExpSpent;
        public readonly double ShardsSpent;
        public readonly double CrystalReward;
        public readonly string ShortCurrencyId;
        public readonly double ShortBy;

        public TempleLevelResult(bool success, TempleFailure failure, int newLv, double exp, double shards, double crystals, string shortId, double shortBy)
        {
            Success = success; Failure = failure; NewLv = newLv; ExpSpent = exp; ShardsSpent = shards; CrystalReward = crystals; ShortCurrencyId = shortId; ShortBy = shortBy;
        }

        public static TempleLevelResult Fail(TempleFailure f, string shortId = null, double shortBy = 0)
        {
            return new TempleLevelResult(false, f, 0, 0, 0, 0, shortId, shortBy);
        }
    }

    /// <summary>
    /// リーダー神殿（docs/01 7.1節）：リーダーを選ぶ（★5以上）、リーダーLv を上げる（経験値＋魔力の欠片）、属性を変える（自作版は無料）。
    /// Lv に着いたとき 5Lv ごとに魔力の結晶がもらえる。払う・受け取るのは Wallet 経由（不変条件3）。
    /// </summary>
    public sealed class LeaderTempleService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public LeaderTempleService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        public int Lv { get { return _save.Temple.LeaderLv; } }
        public int MaxLv { get { return _data.LeaderTemple.MaxLv; } }

        /// <summary>リーダーLv が lv のときの、リーダー本人の攻撃・HP・防御の増加％。</summary>
        public double Pct(int lv)
        {
            if (lv < 1 || lv > MaxLv) { throw new ArgumentException("リーダーLv が範囲外: " + lv); }
            return _data.LeaderTemple.LvPct[lv - 1];
        }

        public double ExpCost(int lv)
        {
            CheckCostLv(lv);
            LeaderTempleConfig t = _data.LeaderTemple;
            return t.ExpCostBase * Math.Pow(t.ExpCostGrowth, lv - t.ExpCostBaseLv);
        }

        public double ShardCost(int lv)
        {
            CheckCostLv(lv);
            return (double)_data.LeaderTemple.ShardCostPerLv * lv;
        }

        /// <summary>リーダーLv が lv に着いたときにもらえる魔力の結晶（もらえない Lv は 0）。</summary>
        public double RewardAt(int lv)
        {
            LeaderTempleConfig t = _data.LeaderTemple;
            if (lv < t.RewardMinLv || lv % t.RewardEveryLv != 0) { return 0; }
            return (double)t.RewardCrystalPerLv * lv;
        }

        private void CheckCostLv(int lv)
        {
            if (lv < 1 || lv >= MaxLv) { throw new ArgumentException("Lv が範囲外（最大Lv では次の費用が無い）: " + lv); }
        }

        /// <summary>リーダーを設定する（null で解除）。★が leaderMinStar 未満のキャラはなれない。</summary>
        public TempleFailure SetLeader(string characterId)
        {
            if (characterId == null) { _save.Leader = null; return TempleFailure.None; }
            if (!_data.TryCharacter(characterId, out _)) { return TempleFailure.UnknownCharacter; }
            if (!_save.Characters.TryGetValue(characterId, out CharacterState c)) { return TempleFailure.NotOwned; }
            if (c.Star < _data.System.LeaderMinStar) { return TempleFailure.StarTooLow; }
            _save.Leader = characterId;
            return TempleFailure.None;
        }

        /// <summary>リーダーの属性を変える（null で元の属性に戻す）。自作版は無料。</summary>
        public void SetLeaderElement(Element? element)
        {
            _save.Temple.LeaderElement = element;
        }

        /// <summary>リーダーLv を1つ上げる。経験値と魔力の欠片の両方を払い、足りなければ何も変えない。</summary>
        public TempleLevelResult LevelUp()
        {
            int lv = _save.Temple.LeaderLv;
            if (lv >= MaxLv) { return TempleLevelResult.Fail(TempleFailure.AtMaxLv); }
            double exp = ExpCost(lv), shards = ShardCost(lv);
            var cost = new Cost(new[] { new Money(CurrencyIds.Exp, exp), new Money(CurrencyIds.ManaShard, shards) });
            PayResult pay = _wallet.Pay(cost, new PayReason(WalletReasons.LeaderLevelUp));
            if (!pay.Success) { return TempleLevelResult.Fail(TempleFailure.NotEnough, pay.ShortCurrencyId, pay.ShortBy); }
            _save.Temple.LeaderLv = lv + 1;
            double reward = RewardAt(lv + 1);
            if (reward > 0) { _wallet.Grant(new Reward(CurrencyIds.ManaCrystal, reward), new GrantReason(WalletReasons.LeaderReward)); }
            return new TempleLevelResult(true, TempleFailure.None, lv + 1, exp, shards, reward, null, 0);
        }
    }

    /// <summary>リーダーLv の効果：リーダー本人にだけ、攻撃・HP・防御の割合の輪（LeaderLv）を足す。</summary>
    public sealed class LeaderLvSource : IModifierSource
    {
        private readonly GameData _data;
        private readonly SaveData _save;

        public LeaderLvSource(GameData data, SaveData save)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            if (!query.IsLeader) { return; }
            int lv = Math.Max(1, Math.Min(_save.Temple.LeaderLv, _data.LeaderTemple.MaxLv));
            double pct = _data.LeaderTemple.LvPct[lv - 1];
            if (pct <= 0) { return; }
            sink.Add(new Modifier(StatId.Atk, ModifierPool.LeaderLv, pct));
            sink.Add(new Modifier(StatId.Hp, ModifierPool.LeaderLv, pct));
            sink.Add(new Modifier(StatId.Def, ModifierPool.LeaderLv, pct));
        }
    }
}

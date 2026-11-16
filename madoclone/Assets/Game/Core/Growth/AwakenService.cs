using System;
using Mado.Core.Save;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum AwakenFailure { None, UnknownCharacter, NotOwned, AtMaxStar, NotEnoughShards }

    public readonly struct AwakenResult
    {
        public readonly bool Success;
        public readonly AwakenFailure Failure;
        public readonly int NewStar;
        public readonly double ShardsSpent;
        public readonly double ShortBy;

        public AwakenResult(bool success, AwakenFailure failure, int newStar, double shardsSpent, double shortBy)
        {
            Success = success; Failure = failure; NewStar = newStar; ShardsSpent = shardsSpent; ShortBy = shortBy;
        }

        public static AwakenResult Fail(AwakenFailure f, double shortBy = 0) { return new AwakenResult(false, f, 0, 0, shortBy); }
    }

    /// <summary>
    /// 覚醒（★を1つ上げる）。覚醒の欠片（通貨 awaken_shard）を、stat_tables.json の awakenCost の枚数だけ払う
    /// （docs/01 11節 #17：仮に覚醒の欠片で払う）。★6になる覚醒では、固有魔晶が枠に入る（RosterService → CrystalService）。
    /// </summary>
    public sealed class AwakenService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;
        private readonly RosterService _roster;

        public AwakenService(GameData data, SaveData save, Wallet.Wallet wallet, RosterService roster)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            _roster = roster ?? throw new ArgumentNullException(nameof(roster));
        }

        public int MaxStar { get { return _data.Stats.StarMaxLv.Count - 1; } }

        /// <summary>★ star から star+1 に上げるのに要る欠片の枚数。</summary>
        public int CostToNext(int star)
        {
            if (star < 0 || star >= MaxStar) { throw new ArgumentException("★が範囲外: " + star); }
            return _data.Stats.AwakenCost[star + 1];
        }

        public AwakenResult Awaken(string characterId)
        {
            if (characterId == null || !_data.TryCharacter(characterId, out _)) { return AwakenResult.Fail(AwakenFailure.UnknownCharacter); }
            if (!_save.Characters.TryGetValue(characterId, out CharacterState c)) { return AwakenResult.Fail(AwakenFailure.NotOwned); }
            if (c.Star >= MaxStar) { return AwakenResult.Fail(AwakenFailure.AtMaxStar); }
            int cost = CostToNext(c.Star);
            double have = _wallet.Balance(CurrencyIds.AwakenShard);
            if (!_wallet.Unlimited && have < cost) { return AwakenResult.Fail(AwakenFailure.NotEnoughShards, cost - have); }

            // 先に★を上げる（魔晶の置き場が壊れていれば、ここで例外になり、欠片は減らない）。そのあとで払う。
            int newStar = c.Star + 1;
            if (!_roster.TrySetStar(characterId, newStar)) { throw new InvalidOperationException("★を上げられない: " + characterId); }
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.AwakenShard, cost), new PayReason(WalletReasons.GrowthAwaken));
            if (!pay.Success) { throw new InvalidOperationException("残高を確かめたのに払えなかった（プログラムの誤り）"); }
            return new AwakenResult(true, AwakenFailure.None, newStar, cost, 0);
        }
    }
}

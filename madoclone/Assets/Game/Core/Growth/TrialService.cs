using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum TrialFailure { None, UnknownTrial, NoCharge, NothingToSweep, NoParty, Locked }

    public sealed class TrialResult
    {
        public TrialFailure Failure { get; set; }
        public bool Success { get { return Failure == TrialFailure.None; } }
        public BattleOutcome Outcome { get; set; }

        /// <summary>この挑戦でクリアした（全連戦に勝った）。</summary>
        public bool Cleared { get; set; }

        /// <summary>報酬の対象になったLv（クリアしたLv、または掃討のLv）。</summary>
        public int RewardLv { get; set; }

        /// <summary>報酬を受け取った。クリアしても貯まっている回数が無ければ Lv だけ上がって報酬は出ない。</summary>
        public bool RewardGranted { get; set; }
        public IReadOnlyList<Money> Rewards { get; set; } = new Money[0];
        public int NewClearedLv { get; set; }

        /// <summary>damage 型の試練で与えたダメージ。</summary>
        public double Damage { get; set; }
    }

    /// <summary>
    /// 試練（docs/01 5.4節）：Lv を1つずつ上げる挑戦と、クリア済みの最高Lvの掃討。報酬 ＝ 1Lvあたりの量 × Lv。
    /// 報酬を受け取れる回数は RepeatGate が貯める（挑戦そのものは何度でもできる）。払う・受け取るのは Wallet 経由。
    /// </summary>
    public sealed class TrialService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;
        private readonly IClock _clock;
        private readonly StageFactory _stages;
        private readonly BattleSetupBuilder _builder;

        public TrialService(GameData data, SaveData save, Wallet.Wallet wallet, IClock clock, StageFactory stages, BattleSetupBuilder builder)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _stages = stages ?? throw new ArgumentNullException(nameof(stages));
            _builder = builder ?? throw new ArgumentNullException(nameof(builder));
        }

        public int ClearedLv(string trialId)
        {
            return _save.Trials.TryGetValue(trialId ?? "", out TrialState s) ? s.ClearedLv : 0;
        }

        /// <summary>貯まっている回数（時刻まで数えた値）。gate なしの試練は無制限なので PositiveInfinity。</summary>
        public double Charges(string trialId)
        {
            if (!_data.Trials.TryGet(trialId, out TrialDef def)) { throw new ArgumentException("試練が無い: " + trialId); }
            if (def.Gate == null) { return double.PositiveInfinity; }
            TrialState s = State(trialId);
            RepeatGate.Accrue(s.Gate, def.Gate, _clock.UtcNow);
            return s.Gate.Charges;
        }

        /// <summary>試練Lv lv の敵の合計戦力。</summary>
        public double EnemyPower(TrialDef def, int lv)
        {
            return def.PowerBase * Math.Pow(def.PowerGrowth, lv - 1);
        }

        /// <summary>mirror 型の敵の戦力：自分の編成の戦力 ×（1 ± mirrorSpread のうち、シードで決まる値）。</summary>
        public static double MirrorPower(TrialDef def, IReadOnlyList<UnitSetup> allies, ulong seed)
        {
            double sum = 0;
            foreach (UnitSetup a in allies) { sum += a.Stats.Power; }
            double u = Rng.Create(seed, RngStream.Misc).NextDouble();
            return sum * (1.0 - def.MirrorSpread + 2.0 * def.MirrorSpread * u);
        }

        public IReadOnlyList<Money> RewardFor(TrialDef def, int lv)
        {
            var list = new List<Money>();
            foreach (TrialReward r in def.RewardPerLv) { list.Add(new Money(r.CurrencyId, r.Amount * lv)); }
            return list;
        }

        /// <summary>次のLv（クリア済み＋1）に挑む。勝つとLvが上がり、貯まっている回数があれば報酬が出る。味方は呼び出し側が渡す（編成）。</summary>
        public TrialResult Challenge(string trialId, IReadOnlyList<UnitSetup> allies, ulong seed, IReadOnlyList<UnitSetup> supports = null)
        {
            if (!_data.Trials.TryGet(trialId, out TrialDef def)) { return new TrialResult { Failure = TrialFailure.UnknownTrial }; }
            if (allies == null || allies.Count == 0) { return new TrialResult { Failure = TrialFailure.NoParty }; }
            TrialState s = State(trialId);
            RepeatGate.Accrue(s.Gate, def.Gate, _clock.UtcNow);

            if (def.IsDamageKind) { return ChallengeDamage(def, s, allies, seed, supports); }
            int lv = s.ClearedLv + 1;
            BattleOutcome outcome = Fight(def, lv, allies, seed, supports);
            var result = new TrialResult { Outcome = outcome, RewardLv = lv, NewClearedLv = s.ClearedLv };
            if (outcome != BattleOutcome.Win) { return result; }

            result.Cleared = true;
            s.ClearedLv = lv + def.LevelOnClear - 1;
            result.NewClearedLv = s.ClearedLv;
            if (RepeatGate.CanConsume(s.Gate, def.Gate)) { Grant(def, s, lv, result); }
            return result;
        }

        /// <summary>damage 型：倒れない的に制限時間のあいだ攻撃し、与えたダメージでLvが決まる。記録を更新したらクリア扱い。報酬は到達Lv（記録）ぶん。</summary>
        private TrialResult ChallengeDamage(TrialDef def, TrialState s, IReadOnlyList<UnitSetup> allies, ulong seed, IReadOnlyList<UnitSetup> supports)
        {
            List<UnitSetup> dummies = _stages.BuildTrial(def.StatRank, EnemyPower(def, 1), def.Traits);
            foreach (UnitSetup d in dummies)
            {
                BattleStats st = d.Stats;
                st.Hp = double.MaxValue / 1e6;       // 倒れない（時間切れまで殴り続けられる）
                d.Stats = st;
            }
            BattleSetup setup = _builder.Assemble(allies, dummies, seed, def.TimeLimitSec, supports);
            BattleResult br = new BattleSim(setup).RunToEnd(null);
            double damage = 0;
            for (int i = 0; i < allies.Count; i++) { damage += br.DamageDealt[i]; }
            for (int i = 0; i < (supports == null ? 0 : supports.Count); i++) { damage += br.DamageDealt[allies.Count + dummies.Count + i]; }
            int reached = DamageLevel(def, damage);
            var result = new TrialResult { Outcome = br.Outcome, RewardLv = Math.Max(s.ClearedLv, reached), NewClearedLv = s.ClearedLv, Damage = damage };
            if (reached > s.ClearedLv) { s.ClearedLv = reached; result.NewClearedLv = reached; result.Cleared = true; result.RewardLv = reached; }
            if (result.RewardLv >= 1 && RepeatGate.CanConsume(s.Gate, def.Gate)) { Grant(def, s, result.RewardLv, result); }
            return result;
        }

        /// <summary>与えたダメージが届いたLv（damageBase に届かなければ 0）。</summary>
        public static int DamageLevel(TrialDef def, double damage)
        {
            if (!(damage >= def.DamageBase)) { return 0; }
            return 1 + (int)Math.Floor(Math.Log(damage / def.DamageBase) / Math.Log(def.DamageGrowth) + 1e-9);
        }

        /// <summary>クリア済みの最高Lv の報酬を、戦わずにもう一度受け取る（掃討）。貯まっている回数を1回使う。</summary>
        public TrialResult Sweep(string trialId)
        {
            if (!_data.Trials.TryGet(trialId, out TrialDef def)) { return new TrialResult { Failure = TrialFailure.UnknownTrial }; }
            TrialState s = State(trialId);
            if (s.ClearedLv < 1) { return new TrialResult { Failure = TrialFailure.NothingToSweep }; }
            RepeatGate.Accrue(s.Gate, def.Gate, _clock.UtcNow);
            if (!RepeatGate.CanConsume(s.Gate, def.Gate)) { return new TrialResult { Failure = TrialFailure.NoCharge, RewardLv = s.ClearedLv }; }
            var result = new TrialResult { Cleared = false, Outcome = BattleOutcome.Win, RewardLv = s.ClearedLv, NewClearedLv = s.ClearedLv };
            Grant(def, s, s.ClearedLv, result);
            return result;
        }

        private void Grant(TrialDef def, TrialState s, int lv, TrialResult result)
        {
            RepeatGate.Consume(s.Gate, def.Gate);
            IReadOnlyList<Money> rewards = RewardFor(def, def.FixedRewardLv > 0 ? def.FixedRewardLv : lv);
            _wallet.Grant(new Reward(rewards), new GrantReason(WalletReasons.TrialReward));
            result.RewardGranted = true;
            result.Rewards = rewards;
        }

        private BattleOutcome Fight(TrialDef def, int lv, IReadOnlyList<UnitSetup> allies, ulong seed, IReadOnlyList<UnitSetup> supports)
        {
            double perFight = def.TimeLimitSec / def.Fights;
            for (int i = 0; i < def.Fights; i++)
            {
                List<UnitSetup> enemies = _stages.BuildTrial(def.StatRank, def.IsMirrorKind ? MirrorPower(def, allies, seed + (ulong)i) : EnemyPower(def, lv), def.Traits);
                // 連戦ごとに味方は元の状態から（HP は引き継がない）。味方の UnitSetup は書き換えないので使い回せる。
                BattleSetup setup = _builder.Assemble(allies, enemies, seed + (ulong)i, perFight, supports);
                BattleOutcome o = new BattleSim(setup).RunToEnd(null).Outcome;
                if (o != BattleOutcome.Win) { return o; }
            }
            return BattleOutcome.Win;
        }

        private TrialState State(string trialId)
        {
            if (!_save.Trials.TryGetValue(trialId, out TrialState s)) { s = new TrialState(); _save.Trials[trialId] = s; }
            return s;
        }
    }
}

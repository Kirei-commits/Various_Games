using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>
    /// 実データ（105体のスキル・魔晶）からランダムに組んだ戦闘を流して、どの戦闘でも成り立つべきことを確かめる。
    /// 個別のテストでは書ききれない組み合わせ（スキル×バフ×トリガー）の破綻を見つけるための網。
    /// </summary>
    public class BattleInvariantTests
    {
        private static GameData Data { get { return TestData.Data; } }

        /// <summary>イベントを受けながら、順番・値・生死の整合を調べる。</summary>
        private sealed class Checker : IBattleEventSink
        {
            public readonly List<string> Problems = new List<string>();
            public readonly double[] Dealt, Healed;
            public readonly int[] DeathTick;
            public int Count, EndCount, LastTick, Warnings;
            private readonly int _n;

            public Checker(int n)
            {
                _n = n;
                Dealt = new double[n];
                Healed = new double[n];
                DeathTick = new int[n];
                for (int i = 0; i < n; i++) { DeathTick[i] = -1; }
            }

            private void Bad(in BattleEvent e, string what)
            {
                if (Problems.Count < 5) { Problems.Add("tick " + e.Tick + " " + e.Type + " " + e.Source + "→" + e.Target + ": " + what); }
            }

            public void OnEvent(in BattleEvent e)
            {
                Count++;
                if (EndCount > 0) { Bad(e, "BattleEnd のあとにイベント"); }
                if (e.Tick < LastTick) { Bad(e, "刻みが戻った"); }
                LastTick = e.Tick;
                if (e.Source < -1 || e.Source >= _n || e.Target < -1 || e.Target >= _n) { Bad(e, "添字が範囲外"); }
                if (double.IsNaN(e.Value) || double.IsInfinity(e.Value)) { Bad(e, "値が NaN・無限大"); }
                switch (e.Type)
                {
                    case BattleEventType.Damage:
                        if (e.Value < 0) { Bad(e, "負のダメージ"); }
                        if (DeathTick[e.Target] >= 0) { Bad(e, "戦闘不能の相手にダメージ"); }
                        if (e.Source >= 0) { Dealt[e.Source] += e.Value; }
                        break;
                    case BattleEventType.Heal:
                        if (e.Value <= 0) { Bad(e, "0 以下の回復"); }
                        if (DeathTick[e.Target] >= 0) { Bad(e, "戦闘不能の相手を回復"); }
                        if (e.Source >= 0) { Healed[e.Source] += e.Value; }
                        break;
                    case BattleEventType.Death:
                        if (DeathTick[e.Target] >= 0) { Bad(e, "2回目の戦闘不能"); }
                        DeathTick[e.Target] = e.Tick;
                        break;
                    case BattleEventType.SkillFired:
                        // 戦闘不能のあとに動けるのは、その刻みの onDeath だけ。
                        if (DeathTick[e.Source] >= 0 && DeathTick[e.Source] != e.Tick) { Bad(e, "戦闘不能のユニットがスキルを使った"); }
                        break;
                    case BattleEventType.BuffApplied:
                        if (DeathTick[e.Target] >= 0) { Bad(e, "戦闘不能の相手にバフ"); }
                        break;
                    case BattleEventType.Warning:
                        Warnings++;
                        break;
                    case BattleEventType.BattleEnd:
                        EndCount++;
                        break;
                }
            }
        }

        private static BattleSetup RandomSetup(Rng rng, ulong seed)
        {
            var builder = new BattleSetupBuilder(Data, new StatResolver(Data));
            int size = rng.NextInt(1, 8);
            int star = rng.NextInt(0, 12);
            int lv = rng.NextInt(1, Data.Stats.StarMaxLv[star] + 1);
            var allies = new List<UnitSetup>();
            var used = new HashSet<string>();
            double power = 0;
            while (allies.Count < size)
            {
                CharacterDef c = Data.Characters[rng.NextInt(Data.Characters.Count)];
                if (!used.Add(c.Id)) { continue; }
                // 魔晶は他人のものも付けられる（枠の種類の制限は無い）。
                IReadOnlyList<string> crystals = null;
                if (rng.NextInt(2) == 0)
                {
                    crystals = new[]
                    {
                        Data.Crystals[rng.NextInt(Data.Crystals.Count)].Id, null, c.CrystalId, null, null,
                    };
                }
                UnitSetup u = builder.BuildAlly(c.Id, star, lv, crystals, allies.Count == size - 1);
                allies.Add(u);
                power += u.Stats.Power;
            }
            var factory = new StageFactory(Data);
            double factor = 0.3 + rng.NextDouble() * 5.0;
            StageKind kind = rng.NextInt(2) == 0 ? StageKind.Wave : StageKind.Boss;
            List<UnitSetup> enemies = factory.BuildWithPower(rng.NextInt(1, 33), power * factor, kind, 1.0, 1.0);
            return builder.Assemble(allies, enemies, seed, 60);
        }

        [Test]
        public void RandomMasterBuiltBattles_KeepTheInvariants()
        {
            Rng rng = Rng.Create(20261116UL, RngStream.Misc);
            var outcomes = new Dictionary<BattleOutcome, int>();
            for (int i = 0; i < 300; i++)
            {
                BattleSetup s = RandomSetup(rng, (ulong)(i + 1));
                var sim = new BattleSim(s);
                var check = new Checker(sim.UnitCount);
                BattleResult r = sim.RunToEnd(check);
                string at = "戦闘 " + i + "（味方 " + s.Allies.Count + " 体）";

                Assert.IsEmpty(check.Problems, at + "\n" + string.Join("\n", check.Problems));
                Assert.AreEqual(1, check.EndCount, at + " BattleEnd の数");
                Assert.AreEqual(check.Count, r.EventCount, at + " イベントの数");
                Assert.AreEqual(0, check.Warnings, at + " 警告（連鎖の上限・状態の容量）が出た");
                Assert.LessOrEqual(r.EndTick, s.Rules.TimeLimitTicks, at);

                bool anyAlly = false, anyEnemy = false;
                for (int u = 0; u < sim.UnitCount; u++)
                {
                    double maxHp = u < s.Allies.Count ? s.Allies[u].Stats.Hp : s.Enemies[u - s.Allies.Count].Stats.Hp;
                    Assert.That(sim.Hp(u), Is.InRange(0.0, maxHp), at + " ユニット " + u + " の HP");
                    Assert.AreEqual(check.DeathTick[u] < 0, sim.IsAlive(u), at + " 生死とイベントの食い違い（ユニット " + u + "）");
                    Assert.AreEqual(sim.IsAlive(u), sim.Hp(u) > 0, at + " 生きているのに HP 0、またはその逆");
                    if (sim.IsAlive(u)) { if (u < s.Allies.Count) { anyAlly = true; } else { anyEnemy = true; } }
                    Assert.AreEqual(check.Dealt[u], r.DamageDealt[u], Math.Abs(check.Dealt[u]) * 1e-9, at + " 与ダメージの合計");
                    Assert.AreEqual(check.Healed[u], r.Healed[u], Math.Abs(check.Healed[u]) * 1e-9, at + " 回復の合計");
                }
                switch (r.Outcome)
                {
                    case BattleOutcome.Win: Assert.IsFalse(anyEnemy, at + " 勝ちなのに敵が残っている"); break;
                    case BattleOutcome.Lose: Assert.IsFalse(anyAlly, at + " 負けなのに味方が残っている"); Assert.IsTrue(anyEnemy, at); break;
                    default:
                        Assert.AreEqual(s.Rules.TimeLimitTicks, r.EndTick, at);
                        Assert.IsTrue(anyAlly && anyEnemy, at + " 時間切れなのに片方が全滅している");
                        break;
                }
                outcomes[r.Outcome] = outcomes.TryGetValue(r.Outcome, out int n) ? n + 1 : 1;

                // 決定性：同じ入力をもう一度。
                if (i % 10 == 0) { Assert.AreEqual(r.EventHash, new BattleSim(s).RunToEnd(null).EventHash, at + " 決定性"); }
            }
            // 網が片寄っていないこと（勝ちも負けも出ている）。
            Assert.IsTrue(outcomes.ContainsKey(BattleOutcome.Win) && outcomes.ContainsKey(BattleOutcome.Lose), "勝ちと負けの両方が出ていない");
        }

        [Test]
        public void EventSink_DoesNotChangeTheResult()
        {
            Rng rng = Rng.Create(5UL, RngStream.Misc);
            for (int i = 0; i < 20; i++)
            {
                BattleSetup s = RandomSetup(rng, (ulong)(i + 100));
                var sim = new BattleSim(s);
                BattleResult with = sim.RunToEnd(new Checker(sim.UnitCount));
                BattleResult without = new BattleSim(s).RunToEnd(null);
                Assert.AreEqual(with.EventHash, without.EventHash);
                Assert.AreEqual(with.EndTick, without.EndTick);
            }
        }
    }
}

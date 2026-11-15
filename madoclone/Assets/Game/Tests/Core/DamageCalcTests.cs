using Mado.Core.Battle;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    public class DamageCalcTests
    {
        private static readonly BattleConstants K = new BattleConstants();

        [Test]
        public void Basic_AtkTimesMultiplier()
        {
            Assert.AreEqual(100, DamageCalc.Damage(K, 100, 0, 100, 0, 0, 0, 1.0, false, 1.0), 1e-9);
            Assert.AreEqual(250, DamageCalc.Damage(K, 100, 0, 250, 0, 0, 0, 1.0, false, 1.0), 1e-9);
        }

        [Test]
        public void Defense_IsSubtractedBeforeElementAndCrit()
        {
            // (100 - 40) × 1.2 × 2.0
            Assert.AreEqual(144, DamageCalc.Damage(K, 100, 40, 100, 0, 0, 0, 1.2, true, 2.0), 1e-9);
        }

        [Test]
        public void ElementMultiplier_AdvantageDisadvantageNeutral()
        {
            Assert.AreEqual(1.2, DamageCalc.ElementMultiplier(K, Element.Valor, Element.Skill), 1e-9);
            Assert.AreEqual(1.2, DamageCalc.ElementMultiplier(K, Element.Wisdom, Element.Valor), 1e-9); // 循環
            Assert.AreEqual(0.8, DamageCalc.ElementMultiplier(K, Element.Skill, Element.Valor), 1e-9);
            Assert.AreEqual(0.8, DamageCalc.ElementMultiplier(K, Element.Valor, Element.Wisdom), 1e-9);
            Assert.AreEqual(1.0, DamageCalc.ElementMultiplier(K, Element.Valor, Element.Heart), 1e-9);
            Assert.AreEqual(1.0, DamageCalc.ElementMultiplier(K, Element.Valor, Element.Valor), 1e-9);
        }

        [Test]
        public void HitChance_ClampedToMinAndMax()
        {
            Assert.AreEqual(5, DamageCalc.HitChancePct(K, 100, 500), 1e-9);   // 回避が高すぎても下限5％
            Assert.AreEqual(100, DamageCalc.HitChancePct(K, 300, 0), 1e-9);   // 上限100％
            Assert.AreEqual(95, DamageCalc.HitChancePct(K, 100, 5), 1e-9);
        }

        [Test]
        public void CritChance_ClampedTo0And100()
        {
            Assert.AreEqual(0, DamageCalc.CritChancePct(10, 50), 1e-9);
            Assert.AreEqual(100, DamageCalc.CritChancePct(300, 0), 1e-9);
            Assert.AreEqual(20, DamageCalc.CritChancePct(30, 10), 1e-9);
        }

        [Test]
        public void CritMultiplier_FloorIsOne_AndOtherwiseDiffOver100()
        {
            Assert.AreEqual(1.0, DamageCalc.CritMultiplier(K, 1000, 1500), 1e-9);  // クリティカル防御が高すぎる
            Assert.AreEqual(1.0, DamageCalc.CritMultiplier(K, 1000, 1000), 1e-9);
            Assert.AreEqual(5.0, DamageCalc.CritMultiplier(K, 1500, 1000), 1e-9);
        }

        [Test]
        public void MinimumDamage_WhenDefenseExceedsAttack()
        {
            Assert.AreEqual(1, DamageCalc.Damage(K, 100, 9999, 100, 0, 0, 0, 1.0, false, 1.0), 1e-9);
        }

        [Test]
        public void NegativeBasis_ClampsToZero_ThenMinimumDamage()
        {
            // 攻撃力ダウンの重ね掛けで有効 Atk が 0 以下
            Assert.AreEqual(1, DamageCalc.Damage(K, 0, 0, 100, 0, 0, 0, 1.0, false, 1.0), 1e-9);
            Assert.AreEqual(1, DamageCalc.Damage(K, -50, 0, 100, 0, 0, 0, 1.0, false, 1.0), 1e-9);
        }

        [Test]
        public void SelfLostHp_IsAddedToTheBasis()
        {
            // 100 + 500 × 10% = 150
            Assert.AreEqual(150, DamageCalc.Damage(K, 100, 0, 100, 0, 500, 10, 1.0, false, 1.0), 1e-9);
        }

        [Test]
        public void CountBonus_AddsToMultiplier()
        {
            Assert.AreEqual(100, DamageCalc.Damage(K, 100, 0, 100, 0, 0, 0, 1.0, false, 1.0), 1e-9);   // 人数 0
            Assert.AreEqual(150, DamageCalc.Damage(K, 100, 0, 100, 50, 0, 0, 1.0, false, 1.0), 1e-9);  // 人数 1
            Assert.AreEqual(200, DamageCalc.Damage(K, 100, 0, 100, 100, 0, 0, 1.0, false, 1.0), 1e-9); // 上限
        }

        [Test]
        public void Roll_HitThenCrit_DrawsCritOnlyWhenHit()
        {
            var miss = new ScriptedChance { Default = false };
            Assert.IsFalse(DamageCalc.Roll(miss, K, 100, 0, 50, 0, false, out bool c1));
            Assert.AreEqual(1, miss.Calls.Count);
            Assert.IsFalse(c1);

            var hitCrit = new ScriptedChance { Default = true };
            Assert.IsTrue(DamageCalc.Roll(hitCrit, K, 100, 0, 50, 0, false, out bool c2));
            Assert.AreEqual(2, hitCrit.Calls.Count);
            Assert.AreEqual(100, hitCrit.Calls[0], 1e-9);
            Assert.AreEqual(50, hitCrit.Calls[1], 1e-9);
            Assert.IsTrue(c2);
        }

        [Test]
        public void Roll_CritShield_StillDrawsButNeverCrits()
        {
            var chance = new ScriptedChance { Default = true };
            Assert.IsTrue(DamageCalc.Roll(chance, K, 100, 0, 100, 0, true, out bool crit));
            Assert.AreEqual(2, chance.Calls.Count);
            Assert.IsFalse(crit);
        }
    }
}

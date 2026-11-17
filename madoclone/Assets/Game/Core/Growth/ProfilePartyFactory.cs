using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Stats;
using Mado.Data;

namespace Mado.Core.Growth
{
    /// <summary>
    /// sim_profiles.json の1行（ランクごとの「標準的な育ち具合」）から、味方の編成を組む。
    /// 戦闘シミュレーション（calibrate・バランスのテスト）専用で、ゲーム本体は使わない。
    /// </summary>
    public sealed class ProfilePartyFactory
    {
        private readonly GameData _data;
        private readonly EnemySubstatFormulas _allySubstats;

        /// <param name="allySubstats">味方の副ステータスの標準値（sim_profiles.json の allySubstats）。null なら足さない。</param>
        public ProfilePartyFactory(GameData data, EnemySubstatFormulas allySubstats)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _allySubstats = allySubstats;
        }

        /// <summary>
        /// 編成を組む。powerRatio は共通倍率に掛ける比（1.0 が標準、0.7 なら戦力が7割）。
        /// 人数が編成枠（system.partySlots）より多いとき、最後の1体をリーダーにする。★6以上なら固有魔晶を付ける。
        /// </summary>
        public List<UnitSetup> Build(SimProfileDef profile, double powerRatio = 1.0)
        {
            if (profile == null) { throw new ArgumentNullException(nameof(profile)); }
            SimProfileDef scaled = Scale(profile, powerRatio);
            IModifierSource source = _allySubstats != null
                ? new ProfileModifierSource(scaled, _allySubstats, _data.System.BaseSubstats)
                : new ProfileModifierSource(scaled);
            var builder = new BattleSetupBuilder(_data, new StatResolver(_data, new[] { source }));
            IReadOnlyList<string> ids = profile.PartyCharacterIds;
            bool hasLeader = ids.Count > _data.System.PartySlots;
            var party = new List<UnitSetup>(ids.Count);
            for (int i = 0; i < ids.Count; i++)
            {
                bool isLeader = hasLeader && i == ids.Count - 1;
                party.Add(builder.BuildAlly(ids[i], profile.Star, profile.Lv, builder.OwnCrystalLoadout(ids[i], profile.Star), isLeader));
            }
            return party;
        }

        /// <summary>編成の戦力の合計。</summary>
        public double Power(SimProfileDef profile, double powerRatio = 1.0)
        {
            double sum = 0;
            foreach (UnitSetup u in Build(profile, powerRatio)) { sum += u.Stats.Power; }
            return sum;
        }

        private static SimProfileDef Scale(SimProfileDef p, double ratio)
        {
            GlobalMultiplier m = p.GlobalMultiplier;
            return new SimProfileDef
            {
                Rank = p.Rank, Star = p.Star, Lv = p.Lv, PartyCharacterIds = p.PartyCharacterIds,
                GlobalMultiplier = new GlobalMultiplier { Atk = m.Atk * ratio, Hp = m.Hp * ratio, Def = m.Def * ratio },
            };
        }
    }
}

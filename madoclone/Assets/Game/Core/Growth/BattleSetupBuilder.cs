using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Data;

namespace Mado.Core.Growth
{
    /// <summary>育成状態（★・Lv・魔晶）から、戦闘用に解決済みの BattleSetup を組み立てる（docs/04 10節）。</summary>
    public sealed class BattleSetupBuilder
    {
        private readonly GameData _data;
        private readonly StatResolver _stats;
        private readonly BuffBook _book;
        private readonly SkillResolver _skills;

        public BattleSetupBuilder(GameData data, StatResolver stats)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _stats = stats ?? throw new ArgumentNullException(nameof(stats));
            _book = new BuffBook(data);
            _skills = new SkillResolver(data, _book);
        }

        public BuffBook Buffs { get { return _book; } }
        public SkillResolver Skills { get { return _skills; } }

        public BattleConstants Constants()
        {
            SystemConfig s = _data.System;
            return new BattleConstants
            {
                TickSec = s.TickSec,
                BaseAttackIntervalSec = s.BaseAttackIntervalSec,
                ElementCycle = new List<Element>(s.ElementCycle),
                ElementAdvantagePct = s.ElementAdvantagePct,
                ElementDisadvantagePct = s.ElementDisadvantagePct,
                HitChanceMinPct = s.HitChanceMinPct,
                HitChanceMaxPct = s.HitChanceMaxPct,
                CritMultiplierMin = s.CritMultiplierMin,
                MinDamage = s.MinDamage,
                ChainLimit = s.ChainLimit,
            };
        }

        /// <summary>crystalIds は枠の順（null は空き枠）。</summary>
        public UnitSetup BuildAlly(string characterId, int star, int lv, IReadOnlyList<string> crystalIds, bool isLeader)
        {
            CharacterDef c = _data.Character(characterId);
            var u = new UnitSetup
            {
                Id = c.Id, Element = c.Element, Role = c.Role, Row = FormationRules.RowFor(c.Role), IsLeader = isLeader,
                Stats = _stats.Resolve(c, star, lv, isLeader),
                Normal = _skills.Resolve(_data.Skill(c.Skills.Normal), SkillResolver.RankFor(_data, SkillKind.Normal, star)),
                Special = _skills.Resolve(_data.Skill(c.Skills.Special), SkillResolver.RankFor(_data, SkillKind.Special, star)),
                Ultimate = _skills.Resolve(_data.Skill(c.Skills.Ultimate), SkillResolver.RankFor(_data, SkillKind.Ultimate, star)),
            };
            if (crystalIds != null)
            {
                foreach (string id in crystalIds)
                {
                    if (id != null) { u.Crystals.Add(_skills.Resolve(_data.Crystal(id), 0)); }
                }
            }
            return u;
        }

        /// <summary>
        /// 固有魔晶だけを、もらった直後の場所（★6で開く枠）に付けた状態。★が足りなければ null（魔晶なし）。
        /// セーブを持たないシミュレーションやゴールデンで使う。
        /// </summary>
        public IReadOnlyList<string> OwnCrystalLoadout(string characterId, int star)
        {
            int slot = CrystalService.OwnCrystalSlot;
            if (star < _data.System.CrystalSlotStars[slot]) { return null; }
            var loadout = new string[CharacterState.CrystalSlots];
            loadout[slot] = _data.Character(characterId).CrystalId;
            return loadout;
        }

        public UnitSetup BuildAlly(string characterId, CharacterState s, bool isLeader)
        {
            return BuildAlly(characterId, s.Star, s.Lv, s.Crystals, isLeader);
        }

        /// <summary>編成スロット順 → リーダー、の順に味方を作る。leader が編成に入っていても、リーダー枠として別に1体足す。</summary>
        public List<UnitSetup> BuildParty(SaveData save, string partyKey)
        {
            if (!save.Parties.TryGetValue(partyKey, out PartyState party) && !save.Parties.TryGetValue("default", out party))
            {
                throw new ArgumentException("編成が無い: " + partyKey);
            }
            var list = new List<UnitSetup>();
            foreach (string id in party.Slots)
            {
                if (id != null) { list.Add(BuildAlly(id, save.Characters[id], false)); }
            }
            if (save.Leader != null)
            {
                UnitSetup leader = BuildAlly(save.Leader, save.Characters[save.Leader], true);
                if (save.Temple.LeaderElement.HasValue) { leader.Element = save.Temple.LeaderElement.Value; }   // リーダー神殿で変えた属性
                list.Add(leader);
            }
            return list;
        }

        public BattleSetup Assemble(IEnumerable<UnitSetup> allies, IEnumerable<UnitSetup> enemies, ulong seed, double timeLimitSec)
        {
            return new BattleSetup
            {
                Seed = seed,
                Rules = new BattleRules
                {
                    TimeLimitTicks = SkillResolver.ToTicks(timeLimitSec, _data.System.TickSec),
                    SkipAvailableAfterTicks = SkillResolver.ToTicks(_data.System.SkipAvailableAfterSec, _data.System.TickSec),
                },
                Constants = Constants(),
                Allies = new List<UnitSetup>(allies),
                Enemies = new List<UnitSetup>(enemies),
                Buffs = new List<ResolvedBuff>(_book.Buffs),
            };
        }
    }
}

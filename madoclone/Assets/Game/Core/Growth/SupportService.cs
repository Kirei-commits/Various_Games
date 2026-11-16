using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum SupportFailure { None, UnknownSupport, NotOwned, UnknownParty, AtMaxStar, NotEnough }

    /// <summary>
    /// サポート（使い魔・契約霊・竜）：持っているか（解放の試練のLv）、編成にセット、戦闘用のユニットの組み立て（docs/01 第5章）。
    /// 種類ごとに1体ずつセットできる。使い魔は★ごとに効果時間が延びる。
    /// </summary>
    public sealed class SupportService
    {
        public const int MaxStar = 10;

        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly SkillResolver _skills;

        private readonly Wallet.Wallet _wallet;

        public SupportService(GameData data, SaveData save, SkillResolver skills, Wallet.Wallet wallet = null)
        {
            _wallet = wallet;
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _skills = skills ?? throw new ArgumentNullException(nameof(skills));
        }

        /// <summary>解放の試練を unlockLv までクリアしていれば、持っている。</summary>
        public bool IsOwned(string supportId)
        {
            if (!_data.Supports.TryGet(supportId, out SupportDef def)) { return false; }
            return _save.Trials.TryGetValue(def.UnlockTrial, out TrialState t) && t.ClearedLv >= def.UnlockLv;
        }

        public IReadOnlyList<string> Owned(SupportKind kind)
        {
            var list = new List<string>();
            foreach (SupportDef s in _data.Supports.Supports) { if (s.Kind == kind && IsOwned(s.Id)) { list.Add(s.Id); } }
            return list;
        }

        public int Star(string supportId)
        {
            return _save.Supports.Stars.TryGetValue(supportId ?? "", out int v) ? v : 0;
        }

        /// <summary>★ star → star+1 の覚醒の欠片。</summary>
        public double StarCost(SupportDef def, int star)
        {
            if (star < 0 || star >= MaxStar) { throw new ArgumentException("★が範囲外: " + star); }
            return def.StarCostShards * (star + 1);
        }

        /// <summary>サポートの★を1つ上げる（持っているものだけ。覚醒の欠片を払う）。</summary>
        public SupportFailure RaiseStar(string supportId)
        {
            if (!_data.Supports.TryGet(supportId, out SupportDef def)) { return SupportFailure.UnknownSupport; }
            if (!IsOwned(supportId)) { return SupportFailure.NotOwned; }
            int star = Star(supportId);
            if (star >= MaxStar) { return SupportFailure.AtMaxStar; }
            if (_wallet == null) { throw new InvalidOperationException("財布が無い"); }
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.AwakenShard, StarCost(def, star)), new PayReason(WalletReasons.SupportStar));
            if (!pay.Success) { return SupportFailure.NotEnough; }
            _save.Supports.Stars[supportId] = star + 1;
            return SupportFailure.None;
        }

        /// <summary>編成にセットする（種類は ID から決まる）。null の種類は解除。</summary>
        public SupportFailure Set(string partyKey, string supportId)
        {
            if (!_data.Supports.TryGet(supportId, out SupportDef def)) { return SupportFailure.UnknownSupport; }
            if (!IsOwned(supportId)) { return SupportFailure.NotOwned; }
            PartyState party = Party(partyKey, create: true);
            switch (def.Kind)
            {
                case SupportKind.Familiar: party.Familiar = supportId; break;
                case SupportKind.Spirit: party.Spirit = supportId; break;
                default: party.Dragon = supportId; break;
            }
            return SupportFailure.None;
        }

        public SupportFailure Clear(string partyKey, SupportKind kind)
        {
            if (!_save.Parties.TryGetValue(partyKey ?? "", out PartyState party)) { return SupportFailure.UnknownParty; }
            switch (kind)
            {
                case SupportKind.Familiar: party.Familiar = null; break;
                case SupportKind.Spirit: party.Spirit = null; break;
                default: party.Dragon = null; break;
            }
            return SupportFailure.None;
        }

        /// <summary>編成にセットされているサポートを、戦闘用のユニットにする（持っていないものは出さない）。使い魔・契約霊・竜の順。</summary>
        public List<UnitSetup> BuildUnits(string partyKey)
        {
            var list = new List<UnitSetup>();
            if (!_save.Parties.TryGetValue(partyKey ?? "", out PartyState party)) { return list; }
            foreach (string id in new[] { party.Familiar, party.Spirit, party.Dragon })
            {
                if (id != null && IsOwned(id)) { list.Add(Build(id)); }
            }
            return list;
        }

        public UnitSetup Build(string supportId)
        {
            SupportDef def = Find(supportId);
            var body = new SupportBody(def);
            ResolvedSkill skill = _skills.Resolve(body, 0);
            double bonusTicks = def.StarDurationBonusSec * Star(supportId) / _data.System.TickSec;
            if (bonusTicks > 0)
            {
                foreach (ResolvedEffect e in skill.Effects)
                {
                    if (e.Type == EffectType.ApplyBuff && e.DurationTicks > 0) { e.DurationTicks += (int)Math.Round(bonusTicks); }
                }
            }
            return new UnitSetup
            {
                Id = def.Id, Element = Element.Valor, Role = Role.Ranged, Row = Row.Back, IsLeader = false,
                // 攻撃力は発動のたびに「味方全員の平均」に置き換わる。必ず当たり、クリティカルしない。
                Stats = new BattleStats { Atk = 0, Hp = 1, Def = 0, AccuracyPct = 1000, AttackSpeed = 1.0, CritDamagePct = 100, CritDefensePct = 0 },
                Special = skill,
            };
        }

        private SupportDef Find(string id)
        {
            if (!_data.Supports.TryGet(id, out SupportDef def)) { throw new ArgumentException("サポートが無い: " + id); }
            return def;
        }

        private PartyState Party(string key, bool create)
        {
            if (!_save.Parties.TryGetValue(key, out PartyState party))
            {
                party = new PartyState();
                if (create) { _save.Parties[key] = party; }
            }
            return party;
        }

        private sealed class SupportBody : SkillDefBase
        {
            public SupportBody(SupportDef s) : base(s.Id, new TriggerDef { Type = TriggerType.Interval, EverySec = s.IntervalSec }, s.Effects) { }
        }
    }

    /// <summary>サポートの所持効果：持っているサポートの ownedStat が、全キャラ共通で上がる（Global の輪）。</summary>
    public sealed class SupportOwnedSource : IModifierSource
    {
        private readonly GameData _data;
        private readonly SupportService _service;

        public SupportOwnedSource(GameData data, SupportService service)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        public void Collect(List<Modifier> sink, StatQuery query)
        {
            foreach (SupportDef s in _data.Supports.Supports)
            {
                if (!_service.IsOwned(s.Id)) { continue; }
                double pct = s.OwnedBasePct + s.OwnedPerStarPct * _service.Star(s.Id);
                StatId stat = s.OwnedStat == "atk" ? StatId.Atk : (s.OwnedStat == "hp" ? StatId.Hp : StatId.Def);
                sink.Add(new Modifier(stat, ModifierPool.Global, pct));
            }
        }
    }
}

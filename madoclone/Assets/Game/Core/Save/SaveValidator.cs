using System.Collections.Generic;
using System.Linq;
using Mado.Data;

namespace Mado.Core.Save
{
    /// <summary>セーブが満たすべきこと（docs/04 6.2節）。直さずに、問題のリストを返す。</summary>
    public static class SaveValidator
    {
        public static List<SaveIssue> Validate(SaveData save, GameData data)
        {
            var issues = new List<SaveIssue>();
            int maxStar = data.Stats.StarMaxLv.Count - 1;
            var seenCrystal = new Dictionary<string, string>(); // 魔晶 ID → 最初に見つけた場所

            var ids = new List<string>(save.Characters.Keys);
            ids.Sort(System.StringComparer.Ordinal);
            foreach (string id in ids)
            {
                CharacterState c = save.Characters[id];
                string at = "characters." + id;
                if (c.Star < 0 || c.Star > maxStar)
                {
                    Add(issues, SaveSeverity.Error, "STAR_RANGE", "★が 0〜" + maxStar + " の外: " + c.Star, at + ".star");
                }
                else if (c.Lv < 1 || c.Lv > data.Stats.StarMaxLv[c.Star])
                {
                    Add(issues, SaveSeverity.Error, "LV_RANGE", "Lv が 1〜" + data.Stats.StarMaxLv[c.Star] + " の外: " + c.Lv, at + ".lv");
                }

                string[] slots = c.Crystals ?? new string[CharacterState.CrystalSlots];
                for (int i = 0; i < slots.Length; i++)
                {
                    string cid = slots[i];
                    if (cid == null) { continue; }
                    string place = at + ".crystals[" + i + "]";
                    if (!data.TryCrystal(cid, out _))
                    {
                        Add(issues, SaveSeverity.Error, "CRYSTAL_UNKNOWN", "マスタに無い魔晶 " + cid, place);
                        continue;
                    }
                    if (seenCrystal.TryGetValue(cid, out string first))
                    {
                        Add(issues, SaveSeverity.Error, "CRYSTAL_DUP", "魔晶 " + cid + " が " + first + " にもある", place);
                    }
                    else { seenCrystal[cid] = place; }
                    if (i < data.System.CrystalSlotStars.Count && c.Star < data.System.CrystalSlotStars[i])
                    {
                        Add(issues, SaveSeverity.Error, "SLOT_LOCKED", "★" + c.Star + " では枠 " + i + " は解放前（★" + data.System.CrystalSlotStars[i] + " から）", place);
                    }
                }
            }

            // (b) 持ち主の★が6以上ならちょうど1か所、未満（未所持を含む）ならどこにも無い。
            int crystalStar = CrystalStar(data);
            foreach (CharacterDef def in data.Characters)
            {
                if (def.CrystalId == null) { continue; }
                bool owned = save.Characters.TryGetValue(def.Id, out CharacterState oc);
                bool shouldExist = owned && oc.Star >= crystalStar;
                bool exists = seenCrystal.ContainsKey(def.CrystalId);
                if (shouldExist && !exists)
                {
                    Add(issues, SaveSeverity.Error, "CRYSTAL_MISSING", "★" + crystalStar + " 以上なのに固有魔晶 " + def.CrystalId + " がどこにも無い", "characters." + def.Id);
                }
                else if (!shouldExist && exists)
                {
                    Add(issues, SaveSeverity.Error, "CRYSTAL_UNEXPECTED", "持ち主が★" + crystalStar + " 未満なのに魔晶 " + def.CrystalId + " が存在する", seenCrystal[def.CrystalId]);
                }
            }

            foreach (KeyValuePair<string, PartyState> kv in save.Parties)
            {
                for (int i = 0; i < kv.Value.Slots.Length; i++)
                {
                    string cid = kv.Value.Slots[i];
                    if (cid != null && !save.Characters.ContainsKey(cid))
                    {
                        Add(issues, SaveSeverity.Warning, "PARTY_NOT_OWNED", "未所持のキャラ " + cid + " が編成にいる", "parties." + kv.Key + ".slots[" + i + "]");
                    }
                }
            }

            if (save.Leader != null)
            {
                if (!save.Characters.TryGetValue(save.Leader, out CharacterState leader))
                {
                    Add(issues, SaveSeverity.Warning, "LEADER_NOT_OWNED", "リーダー " + save.Leader + " が未所持", "leader");
                }
                else if (leader.Star < data.System.LeaderMinStar)
                {
                    Add(issues, SaveSeverity.Warning, "LEADER_STAR", "リーダーは★" + data.System.LeaderMinStar + " 以上", "leader");
                }
            }
            CheckMemory(save, data, issues);
            CheckStones(save, data, issues);
            CheckResearch(save, data, issues);
            foreach (KeyValuePair<string, int> kv in save.Achievements.Claimed)
            {
                if (!data.Economy.TryAchievement(kv.Key, out AchievementDef ad)) { Add(issues, SaveSeverity.Warning, "ACHIEVEMENT_UNKNOWN", "マスタに無い実績 " + kv.Key, "achievements." + kv.Key); }
                else if (kv.Value < 0 || kv.Value > ad.Tiers.Count) { Add(issues, SaveSeverity.Error, "ACHIEVEMENT_TIER", "受け取り済みの段が 0〜" + ad.Tiers.Count + " の外: " + kv.Value, "achievements." + kv.Key); }
            }
            foreach (KeyValuePair<string, int> kv in save.Achievements.Laps)
            {
                if (!data.Economy.TryAchievement(kv.Key, out AchievementDef la)) { Add(issues, SaveSeverity.Warning, "ACHIEVEMENT_UNKNOWN", "マスタに無い実績 " + kv.Key, "achievementLaps." + kv.Key); }
                else if (kv.Value < 0 || (kv.Value > 0 && !la.LapScale.HasValue)) { Add(issues, SaveSeverity.Error, "ACHIEVEMENT_LAP", "周の数が負か、周回しない実績に周がある: " + kv.Value, "achievementLaps." + kv.Key); }
            }
            ArenaState ar = save.Arena;
            if (ar.Season < 1 || ar.Battles < 0 || ar.Battles >= data.Guild.Arena.SeasonBattles || ar.Points < 0 || ar.PendingRank < 0 || ar.PendingRank > data.Guild.Arena.Rivals.Count + 1)
            {
                Add(issues, SaveSeverity.Error, "ARENA_STATE", "闘技のシーズンの値が範囲外", "arena");
            }
            GachaState gs = save.Gacha;
            if (gs.TotalPulls < 0 || gs.PickupPity < 0 || gs.PickupPity > data.Gacha.PickupPity || gs.StepsClaimed < 0 || gs.StepsClaimed > data.Gacha.Steps.Count)
            {
                Add(issues, SaveSeverity.Error, "GACHA_STATE", "ガチャの状態が範囲外（引き数・天井・受け取り済みステップ）", "gacha");
            }
            if (gs.PickupId != null && !data.TryCharacter(gs.PickupId, out _)) { Add(issues, SaveSeverity.Warning, "GACHA_PICKUP", "ピックアップのキャラがマスタに無い: " + gs.PickupId, "gacha.pickupId"); }
            var nestMax = NestMaxLevels(data);
            foreach (KeyValuePair<string, int> kv in save.DragonNest.Levels)
            {
                string at = "dragonNest." + kv.Key;
                if (!nestMax.TryGetValue(kv.Key, out int max)) { Add(issues, SaveSeverity.Warning, "NEST_UNKNOWN", "マスタに無い竜の巣のノード " + kv.Key, at); }
                else if (kv.Value < 0 || kv.Value > max) { Add(issues, SaveSeverity.Error, "NEST_LV", "ノードのLv が 0〜" + max + " の外: " + kv.Value, at); }
            }
            foreach (KeyValuePair<string, int> kv in save.Supports.Stars)
            {
                if (!data.Supports.TryGet(kv.Key, out _)) { Add(issues, SaveSeverity.Warning, "SUPPORT_UNKNOWN", "マスタに無いサポート " + kv.Key, "supports.stars." + kv.Key); }
                else if (kv.Value < 0 || kv.Value > Growth.SupportService.MaxStar) { Add(issues, SaveSeverity.Error, "SUPPORT_STAR", "サポートの★が 0〜" + Growth.SupportService.MaxStar + " の外: " + kv.Value, "supports.stars." + kv.Key); }
            }
            foreach (KeyValuePair<string, PartyState> kv in save.Parties)
            {
                CheckSupportSlot(data, issues, kv.Key, "familiar", kv.Value.Familiar, SupportKind.Familiar);
                CheckSupportSlot(data, issues, kv.Key, "spirit", kv.Value.Spirit, SupportKind.Spirit);
                CheckSupportSlot(data, issues, kv.Key, "dragon", kv.Value.Dragon, SupportKind.Dragon);
            }
            foreach (KeyValuePair<string, TrialState> kv in save.Trials)
            {
                string at = "trials." + kv.Key;
                if (!data.Trials.TryGet(kv.Key, out TrialDef def)) { Add(issues, SaveSeverity.Warning, "TRIAL_UNKNOWN", "マスタに無い試練 " + kv.Key, at); continue; }
                if (kv.Value.ClearedLv < 0) { Add(issues, SaveSeverity.Error, "TRIAL_LV", "クリア済みLv が負: " + kv.Value.ClearedLv, at + ".clearedLv"); }
                double c = kv.Value.Gate.Charges;
                if (double.IsNaN(c) || double.IsInfinity(c) || c < 0 || (def.Gate != null && def.Gate.Cap.HasValue && c > def.Gate.Cap.Value + 1e-9))
                {
                    Add(issues, SaveSeverity.Error, "TRIAL_CHARGES", "貯まっている回数が不正: " + c, at + ".charges");
                }
            }
            foreach (KeyValuePair<string, int> kv in save.Plazas.Levels)
            {
                data.Plazas.TryGet(kv.Key, out PlazaDef def);
                if (def == null) { Add(issues, SaveSeverity.Warning, "PLAZA_UNKNOWN", "マスタに無い広場 " + kv.Key, "plazas." + kv.Key); }
                else if (kv.Value < 1 || kv.Value > def.MaxLv) { Add(issues, SaveSeverity.Error, "PLAZA_LV", "広場Lv が 1〜" + def.MaxLv + " の外: " + kv.Value, "plazas." + kv.Key); }
            }
            if (save.Temple.LeaderLv < 1 || save.Temple.LeaderLv > data.LeaderTemple.MaxLv)
            {
                Add(issues, SaveSeverity.Error, "TEMPLE_LV", "リーダーLv が 1〜" + data.LeaderTemple.MaxLv + " の外: " + save.Temple.LeaderLv, "temple.leaderLv");
            }
            return issues;
        }

        private static void CheckMemory(SaveData save, GameData data, List<SaveIssue> issues)
        {
            MemoryState m = save.Memory;
            MemoryCardsConfig cfg = data.MemoryCards;
            if (m.GachaLv < 1 || m.GachaLv > cfg.MaxCardLv)
            {
                Add(issues, SaveSeverity.Error, "MEMORY_GACHA_LV", "絆ガチャLv が 1〜" + cfg.MaxCardLv + " の外: " + m.GachaLv, "memory.gachaLv");
            }
            var byId = new Dictionary<string, MemoryCardState>();
            for (int i = 0; i < m.Cards.Count; i++)
            {
                MemoryCardState c = m.Cards[i];
                string at = "memory.cards[" + i + "]";
                if (string.IsNullOrEmpty(c.Id) || byId.ContainsKey(c.Id))
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_CARD_ID", "カード ID が空か重複: " + c.Id, at + ".id");
                    continue;
                }
                byId[c.Id] = c;
                if (Growth.MemoryCardEffects.RarityIndex(data, c.Rarity) < 0)
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_RARITY", "マスタに無いレアリティ " + c.Rarity, at + ".rarity");
                }
                if (c.Lv < 1 || c.Lv > cfg.MaxCardLv)
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_CARD_LV", "カードLv が 1〜" + cfg.MaxCardLv + " の外: " + c.Lv, at + ".lv");
                }
                int extra = c.Extra == null ? 0 : c.Extra.Length;
                if (extra != (c.Kind == MemoryKind.Speed ? 3 : 0) || c.Subs.Count != 2)
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_CARD_SHAPE", "スピードカードは extra が3つ、他は0。サブは2つ", at);
                }
                else if (c.Subs[0].Stat == c.Subs[1].Stat)
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_CARD_SHAPE", "サブ効果が同じ種類", at + ".subs");
                }
            }
            if (m.NextCardNumber < 1) { Add(issues, SaveSeverity.Error, "MEMORY_NEXT_ID", "nextCardNumber が1未満", "memory.nextCardNumber"); }
            var used = new HashSet<string>();
            for (int slot = 0; slot < m.Equipped.Length; slot++)
            {
                string id = m.Equipped[slot];
                if (id == null) { continue; }
                string at = "memory.equipped[" + slot + "]";
                if (!byId.TryGetValue(id, out MemoryCardState card))
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_EQUIP_UNKNOWN", "持っていないカード " + id + " を装備している", at);
                }
                else if ((int)card.Kind != slot / 2)
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_EQUIP_KIND", "枠の種類とカードの種類が違う: " + id, at);
                }
                else if (!used.Add(id))
                {
                    Add(issues, SaveSeverity.Error, "MEMORY_EQUIP_DUP", "同じカード " + id + " を2つの枠に付けている", at);
                }
            }
        }

        private static void CheckResearch(SaveData save, GameData data, List<SaveIssue> issues)
        {
            ResearchState r = save.Research;
            var max = new Dictionary<string, int>();
            foreach (TreeDef t in data.Research.Trees) { foreach (TreeNodeDef n in t.Nodes) { max[t.Id + "/" + n.Id] = n.MaxLv; } }
            foreach (KeyValuePair<string, int> kv in r.Nodes)
            {
                if (!max.TryGetValue(kv.Key, out int m)) { Add(issues, SaveSeverity.Warning, "RESEARCH_UNKNOWN", "マスタに無いノード " + kv.Key, "research.nodes." + kv.Key); }
                else if (kv.Value < 0 || kv.Value > m) { Add(issues, SaveSeverity.Error, "RESEARCH_LV", "ノードのLv が 0〜" + m + " の外: " + kv.Value, "research.nodes." + kv.Key); }
            }
            foreach (KeyValuePair<string, int> kv in r.Collection)
            {
                CollectionSetDef set = data.Research.Collection.Sets.FirstOrDefault(x => x.Id == kv.Key);
                if (set == null) { Add(issues, SaveSeverity.Warning, "COLLECTION_UNKNOWN", "マスタに無いセット " + kv.Key, "research.collection." + kv.Key); }
                else if (kv.Value < 0 || kv.Value > set.Values.Count) { Add(issues, SaveSeverity.Error, "COLLECTION_STAR", "セットの★が 0〜" + set.Values.Count + " の外: " + kv.Value, "research.collection." + kv.Key); }
            }
            for (int i = 0; i < r.Tarot.Count; i++)
            {
                TarotSlotState t = r.Tarot[i];
                if (t.Effect == null && t.Rarity == null) { continue; }
                string at = "research.tarot[" + i + "]";
                bool effectOk = t.Effect != null && data.Research.Tarot.Effects.Any(e => e == t.Effect);
                bool rarityOk = t.Rarity != null && data.Research.Tarot.Rarities.Any(x => x.Id == t.Rarity);
                if (!effectOk || !rarityOk) { Add(issues, SaveSeverity.Error, "TAROT_SLOT", "タロットの枠が壊れている（効果かレアが無い・不明）", at); }
            }
            if (r.Tarot.Count > data.Research.Tarot.Slots) { Add(issues, SaveSeverity.Error, "TAROT_SLOT", "タロットの枠が多すぎる: " + r.Tarot.Count, "research.tarot"); }
            var seen = new HashSet<string>();
            foreach (string g in r.Zukan) { if (!seen.Add(g)) { Add(issues, SaveSeverity.Error, "ZUKAN_DUP", "図鑑の目標が重複: " + g, "research.zukan"); } }
        }

        private static void CheckStones(SaveData save, GameData data, List<SaveIssue> issues)
        {
            SpiritStonesConfig c = data.SpiritStones;
            SpiritStoneState st = save.SpiritStones;
            var ids = new HashSet<string>();
            for (int i = 0; i < st.Stones.Count; i++)
            {
                StoneState s = st.Stones[i];
                string at = "spiritStones.stones[" + i + "]";
                if (string.IsNullOrEmpty(s.Id) || !ids.Add(s.Id)) { Add(issues, SaveSeverity.Error, "STONE_ID", "石の ID が空か重複: " + s.Id, at + ".id"); }
                if (!c.Rarities.Any(r => r.Id == s.Rarity)) { Add(issues, SaveSeverity.Error, "STONE_RARITY", "マスタに無いレア " + s.Rarity, at + ".rarity"); }
                if (!c.Constellations.Any(k => k.Id == s.Constellation)) { Add(issues, SaveSeverity.Error, "STONE_CONSTELLATION", "マスタに無い星座 " + s.Constellation, at + ".constellation"); }
                if (s.Lv < 1 || s.Lv > c.MaxLv) { Add(issues, SaveSeverity.Error, "STONE_LV", "石のLv が 1〜" + c.MaxLv + " の外: " + s.Lv, at + ".lv"); }
            }
            if (st.Stones.Count > c.MaxStones) { Add(issues, SaveSeverity.Warning, "STONE_OVER", "石が持てる枚数を超えている: " + st.Stones.Count, "spiritStones.stones"); }
            if (st.NextNumber < 1) { Add(issues, SaveSeverity.Error, "STONE_NEXT_ID", "nextNumber が1未満", "spiritStones.nextNumber"); }
            var used = new HashSet<string>();
            for (int slot = 0; slot < st.Equipped.Length; slot++)
            {
                string id = st.Equipped[slot];
                if (id == null) { continue; }
                string at = "spiritStones.equipped[" + slot + "]";
                if (!ids.Contains(id)) { Add(issues, SaveSeverity.Error, "STONE_EQUIP_UNKNOWN", "持っていない石 " + id + " をはめている", at); }
                else if (!used.Add(id)) { Add(issues, SaveSeverity.Error, "STONE_EQUIP_DUP", "同じ石 " + id + " を2か所にはめている", at); }
            }
        }

        /// <summary>竜の巣のノードID → 最大Lv。</summary>
        internal static Dictionary<string, int> NestMaxLevels(GameData data)
        {
            var map = new Dictionary<string, int>();
            foreach (Element el in new[] { Element.Valor, Element.Skill, Element.Heart, Element.Wisdom })
            {
                for (int b = 1; b <= data.DragonNest.Blocks; b++)
                {
                    foreach (DragonTierDef t in data.DragonNest.Tiers)
                    {
                        foreach (string stat in t.Stats) { map[EnumStringConverter.Text(el) + "." + b + "." + t.Id + "." + stat] = t.MaxLv; }
                    }
                }
            }
            return map;
        }

        private static void CheckSupportSlot(GameData data, List<SaveIssue> issues, string party, string slot, string id, SupportKind kind)
        {
            if (id == null) { return; }
            string at = "parties." + party + "." + slot;
            if (!data.Supports.TryGet(id, out SupportDef def)) { Add(issues, SaveSeverity.Warning, "SUPPORT_UNKNOWN", "マスタに無いサポート " + id, at); }
            else if (def.Kind != kind) { Add(issues, SaveSeverity.Error, "SUPPORT_KIND", "枠の種類とサポートの種類が違う: " + id, at); }
        }

        /// <summary>固有魔晶が現れる★（＝固有魔晶の枠が開く★。いまは 6）。</summary>
        private static int CrystalStar(GameData data)
        {
            return data.System.CrystalSlotStars[CharacterState.OwnCrystalSlot];
        }

        private static void Add(List<SaveIssue> l, SaveSeverity sev, string code, string msg, string path)
        {
            l.Add(new SaveIssue(sev, code, msg, path));
        }
    }
}

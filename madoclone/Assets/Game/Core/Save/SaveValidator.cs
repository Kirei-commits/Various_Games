using System.Collections.Generic;
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

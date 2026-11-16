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

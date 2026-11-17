using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Data;

namespace Mado.Core.Save
{
    /// <summary>
    /// 不変条件に違反したセーブを、遊べる形に直す（docs/04 6.2節「Repair で直した結果を返す」）。
    /// 直したことは警告（Code は REPAIRED）で返す。Repair の後で SaveValidator を通すとエラーが 0 になる。
    /// 直せないほど壊れたものは捨てる（そのカードなど）。捨てる前の中身は、呼び出し側が元のバイト列として残す（バックアップ）。
    /// </summary>
    public static class SaveRepair
    {
        public static List<SaveIssue> Repair(SaveData save, GameData data)
        {
            if (save == null) { throw new ArgumentNullException(nameof(save)); }
            if (data == null) { throw new ArgumentNullException(nameof(data)); }
            var done = new List<SaveIssue>();
            RepairCharacters(save, data, done);
            RepairCrystals(save, data, done);
            RepairParties(save, data, done);
            RepairMemory(save, data, done);
            RepairStones(save, data, done);
            RepairResearch(save, data, done);
            foreach (string id in new List<string>(save.Achievements.Claimed.Keys))
            {
                if (!data.Economy.TryAchievement(id, out AchievementDef ad)) { continue; }
                int tier = Math.Max(0, Math.Min(save.Achievements.Claimed[id], ad.Tiers.Count));
                if (tier != save.Achievements.Claimed[id]) { Note(done, "実績の段 " + save.Achievements.Claimed[id] + " → " + tier, "achievements." + id); save.Achievements.Claimed[id] = tier; }
            }
            foreach (string id in new List<string>(save.Achievements.Laps.Keys))
            {
                if (!data.Economy.TryAchievement(id, out AchievementDef la)) { continue; }
                int lap = la.LapScale.HasValue ? Math.Max(0, save.Achievements.Laps[id]) : 0;
                if (lap != save.Achievements.Laps[id]) { Note(done, "実績の周 " + save.Achievements.Laps[id] + " → " + lap, "achievementLaps." + id); save.Achievements.Laps[id] = lap; }
            }
            ArenaState ar = save.Arena;
            ArenaConfig ac = data.Guild.Arena;
            int aSeason = Math.Max(1, ar.Season), aBattles = Math.Max(0, Math.Min(ar.Battles, ac.SeasonBattles - 1)), aPoints = Math.Max(0, ar.Points), aPending = Math.Max(0, Math.Min(ar.PendingRank, ac.Rivals.Count + 1));
            if (aSeason != ar.Season || aBattles != ar.Battles || aPoints != ar.Points || aPending != ar.PendingRank)
            {
                Note(done, "闘技のシーズンの値を範囲内に直した", "arena");
                ar.Season = aSeason; ar.Battles = aBattles; ar.Points = aPoints; ar.PendingRank = aPending;
            }
            GachaState gs = save.Gacha;
            int pulls = Math.Max(0, gs.TotalPulls), pity = Math.Max(0, Math.Min(gs.PickupPity, data.Gacha.PickupPity)), steps = Math.Max(0, Math.Min(gs.StepsClaimed, data.Gacha.Steps.Count));
            if (pulls != gs.TotalPulls || pity != gs.PickupPity || steps != gs.StepsClaimed)
            {
                Note(done, "ガチャの状態を範囲内に直した", "gacha");
                gs.TotalPulls = pulls; gs.PickupPity = pity; gs.StepsClaimed = steps;
            }
            Dictionary<string, int> nestMax = SaveValidator.NestMaxLevels(data);
            foreach (string id in new List<string>(save.DragonNest.Levels.Keys))
            {
                if (!nestMax.TryGetValue(id, out int max)) { continue; }
                int lv = Math.Max(0, Math.Min(save.DragonNest.Levels[id], max));
                if (lv == save.DragonNest.Levels[id]) { continue; }
                Note(done, "竜の巣のノードLv " + save.DragonNest.Levels[id] + " → " + lv, "dragonNest." + id);
                if (lv == 0) { save.DragonNest.Levels.Remove(id); } else { save.DragonNest.Levels[id] = lv; }
            }
            foreach (string id in new List<string>(save.Supports.Stars.Keys))
            {
                if (!data.Supports.TryGet(id, out _)) { continue; }
                int star = Math.Max(0, Math.Min(save.Supports.Stars[id], Growth.SupportService.MaxStar));
                if (star != save.Supports.Stars[id]) { Note(done, "サポートの★ " + save.Supports.Stars[id] + " → " + star, "supports.stars." + id); save.Supports.Stars[id] = star; }
            }
            foreach (KeyValuePair<string, PartyState> kv in save.Parties)
            {
                kv.Value.Familiar = FixSlot(data, done, kv.Key, "familiar", kv.Value.Familiar, SupportKind.Familiar);
                kv.Value.Spirit = FixSlot(data, done, kv.Key, "spirit", kv.Value.Spirit, SupportKind.Spirit);
                kv.Value.Dragon = FixSlot(data, done, kv.Key, "dragon", kv.Value.Dragon, SupportKind.Dragon);
            }
            foreach (KeyValuePair<string, TrialState> kv in save.Trials)
            {
                if (!data.Trials.TryGet(kv.Key, out TrialDef def)) { continue; }
                if (kv.Value.ClearedLv < 0) { Note(done, "クリア済みLv " + kv.Value.ClearedLv + " → 0", "trials." + kv.Key + ".clearedLv"); kv.Value.ClearedLv = 0; }
                double c = kv.Value.Gate.Charges;
                double fixedC = (double.IsNaN(c) || double.IsInfinity(c) || c < 0) ? 0 : c;
                if (def.Gate != null && def.Gate.Cap.HasValue) { fixedC = Math.Min(fixedC, def.Gate.Cap.Value); }
                if (fixedC != c && !(double.IsNaN(c) && double.IsNaN(fixedC))) { Note(done, "貯まっている回数 " + c + " → " + fixedC, "trials." + kv.Key + ".charges"); kv.Value.Gate.Charges = fixedC; }
            }
            foreach (string id in new List<string>(save.Plazas.Levels.Keys))
            {
                if (!data.Plazas.TryGet(id, out PlazaDef def)) { continue; }   // 知らない広場は警告のまま持ち越す
                int lv = Math.Max(1, Math.Min(save.Plazas.Levels[id], def.MaxLv));
                if (lv != save.Plazas.Levels[id]) { Note(done, "広場Lv " + save.Plazas.Levels[id] + " → " + lv, "plazas." + id); save.Plazas.Levels[id] = lv; }
            }
            if (save.Temple.LeaderLv < 1 || save.Temple.LeaderLv > data.LeaderTemple.MaxLv)
            {
                int fixedLv = Math.Max(1, Math.Min(save.Temple.LeaderLv, data.LeaderTemple.MaxLv));
                Note(done, "リーダーLv " + save.Temple.LeaderLv + " → " + fixedLv, "temple.leaderLv");
                save.Temple.LeaderLv = fixedLv;
            }
            return done;
        }

        private static void Note(List<SaveIssue> l, string message, string path)
        {
            l.Add(new SaveIssue(SaveSeverity.Warning, "REPAIRED", message, path));
        }

        private static void RepairResearch(SaveData save, GameData data, List<SaveIssue> done)
        {
            ResearchState r = save.Research;
            var max = new Dictionary<string, int>();
            foreach (TreeDef t in data.Research.Trees) { foreach (TreeNodeDef n in t.Nodes) { max[t.Id + "/" + n.Id] = n.MaxLv; } }
            foreach (string key in new List<string>(r.Nodes.Keys))
            {
                if (!max.TryGetValue(key, out int m)) { continue; }
                int lv = Math.Max(0, Math.Min(r.Nodes[key], m));
                if (lv == r.Nodes[key]) { continue; }
                Note(done, "ノードLv " + r.Nodes[key] + " → " + lv, "research.nodes." + key);
                if (lv == 0) { r.Nodes.Remove(key); } else { r.Nodes[key] = lv; }
            }
            foreach (string id in new List<string>(r.Collection.Keys))
            {
                CollectionSetDef set = data.Research.Collection.Sets.FirstOrDefault(x => x.Id == id);
                if (set == null) { continue; }
                int star = Math.Max(0, Math.Min(r.Collection[id], set.Values.Count));
                if (star != r.Collection[id]) { Note(done, "セットの★ " + r.Collection[id] + " → " + star, "research.collection." + id); r.Collection[id] = star; }
            }
            for (int i = 0; i < r.Tarot.Count; i++)
            {
                TarotSlotState t = r.Tarot[i];
                if (t.Effect == null && t.Rarity == null) { continue; }
                bool ok = t.Effect != null && t.Rarity != null && data.Research.Tarot.Effects.Any(e => e == t.Effect) && data.Research.Tarot.Rarities.Any(x => x.Id == t.Rarity);
                if (!ok) { r.Tarot[i] = new TarotSlotState(); Note(done, "壊れたタロットの枠を空にした", "research.tarot[" + i + "]"); }
            }
            if (r.Tarot.Count > data.Research.Tarot.Slots)
            {
                r.Tarot.RemoveRange(data.Research.Tarot.Slots, r.Tarot.Count - data.Research.Tarot.Slots);
                Note(done, "タロットの余分な枠を捨てた", "research.tarot");
            }
            var unique = new List<string>();
            var seen = new HashSet<string>();
            foreach (string g in r.Zukan) { if (seen.Add(g)) { unique.Add(g); } }
            if (unique.Count != r.Zukan.Count) { r.Zukan = unique; Note(done, "図鑑の重複を除いた", "research.zukan"); }
        }

        private static void RepairStones(SaveData save, GameData data, List<SaveIssue> done)
        {
            SpiritStonesConfig c = data.SpiritStones;
            SpiritStoneState st = save.SpiritStones;
            int need = c.Pages * c.SlotMainStat.Count;
            if (st.Equipped == null || st.Equipped.Length != need)
            {
                var slots = new string[need];
                if (st.Equipped != null) { Array.Copy(st.Equipped, slots, Math.Min(need, st.Equipped.Length)); }
                bool wasEmpty = st.Equipped == null || st.Equipped.Length == 0;      // まだ一度も使っていないセーブは、黙って枠を作る
                st.Equipped = slots;
                if (!wasEmpty) { Note(done, "円盤の枠の数を直した", "spiritStones.equipped"); }
            }
            var kept = new List<StoneState>();
            var ids = new HashSet<string>();
            int maxNumber = 0;
            foreach (StoneState s in st.Stones)
            {
                bool broken = string.IsNullOrEmpty(s.Id) || !ids.Add(s.Id)
                    || !c.Rarities.Any(r => r.Id == s.Rarity) || !c.Constellations.Any(k => k.Id == s.Constellation);
                if (broken) { Note(done, "壊れた石 " + s.Id + " を捨てた", "spiritStones.stones"); continue; }
                int lv = Math.Max(1, Math.Min(s.Lv, c.MaxLv));
                if (lv != s.Lv) { Note(done, "石のLv " + s.Lv + " → " + lv, "spiritStones.stones." + s.Id); s.Lv = lv; }
                kept.Add(s);
                if (s.Id.StartsWith("st_", StringComparison.Ordinal) && int.TryParse(s.Id.Substring(3), out int n)) { maxNumber = Math.Max(maxNumber, n); }
            }
            st.Stones = kept;
            if (st.NextNumber <= maxNumber || st.NextNumber < 1)
            {
                Note(done, "次の石の番号 " + st.NextNumber + " → " + (maxNumber + 1), "spiritStones.nextNumber");
                st.NextNumber = maxNumber + 1;
            }
            var used = new HashSet<string>();
            for (int slot = 0; slot < st.Equipped.Length; slot++)
            {
                string id = st.Equipped[slot];
                if (id == null) { continue; }
                if (!ids.Contains(id) || !used.Add(id)) { st.Equipped[slot] = null; Note(done, "はめた石 " + id + " を外した（無い・重複）", "spiritStones.equipped[" + slot + "]"); }
            }
        }

        /// <summary>種類の違うサポートは外す（知らないものは警告のまま持ち越す。持っていないものも、試練を進めれば使えるので残す）。</summary>
        private static string FixSlot(GameData data, List<SaveIssue> done, string party, string slot, string id, SupportKind kind)
        {
            if (id == null || !data.Supports.TryGet(id, out SupportDef def) || def.Kind == kind) { return id; }
            Note(done, "枠の種類が違うサポート " + id + " を外した", "parties." + party + "." + slot);
            return null;
        }

        private static void RepairCharacters(SaveData save, GameData data, List<SaveIssue> done)
        {
            int maxStar = data.Stats.StarMaxLv.Count - 1;
            foreach (KeyValuePair<string, CharacterState> kv in save.Characters)
            {
                CharacterState c = kv.Value;
                string at = "characters." + kv.Key;
                int star = Math.Max(0, Math.Min(c.Star, maxStar));
                if (star != c.Star) { Note(done, "★ " + c.Star + " → " + star, at + ".star"); c.Star = star; }
                int lv = Math.Max(1, Math.Min(c.Lv, data.Stats.StarMaxLv[c.Star]));
                if (lv != c.Lv) { Note(done, "Lv " + c.Lv + " → " + lv, at + ".lv"); c.Lv = lv; }
                if (c.Crystals == null || c.Crystals.Length != CharacterState.CrystalSlots)
                {
                    var fixedSlots = new string[CharacterState.CrystalSlots];
                    if (c.Crystals != null) { Array.Copy(c.Crystals, fixedSlots, Math.Min(c.Crystals.Length, fixedSlots.Length)); }
                    c.Crystals = fixedSlots;
                    Note(done, "魔晶の枠の数を直した", at + ".crystals");
                }
            }
        }

        private static void RepairCrystals(SaveData save, GameData data, List<SaveIssue> done)
        {
            var ids = new List<string>(save.Characters.Keys);
            ids.Sort(StringComparer.Ordinal);
            var seen = new HashSet<string>();

            // 1. 知らない魔晶・解放前の枠・重複を外す。
            foreach (string id in ids)
            {
                CharacterState c = save.Characters[id];
                for (int i = 0; i < c.Crystals.Length; i++)
                {
                    string cid = c.Crystals[i];
                    if (cid == null) { continue; }
                    string why = null;
                    if (!data.TryCrystal(cid, out _)) { why = "マスタに無い魔晶"; }
                    else if (i < data.System.CrystalSlotStars.Count && c.Star < data.System.CrystalSlotStars[i]) { why = "解放前の枠"; }
                    else if (!seen.Add(cid)) { why = "重複"; }
                    if (why != null) { c.Crystals[i] = null; Note(done, "魔晶 " + cid + " を外した（" + why + "）", "characters." + id + ".crystals[" + i + "]"); }
                }
            }

            // 2. 固有魔晶：持ち主が★6以上ならちょうど1か所、未満ならどこにも無い。
            int crystalStar = data.System.CrystalSlotStars[CharacterState.OwnCrystalSlot];
            foreach (CharacterDef def in data.Characters)
            {
                if (def.CrystalId == null) { continue; }
                bool owned = save.Characters.TryGetValue(def.Id, out CharacterState owner);
                bool should = owned && owner.Star >= crystalStar;
                bool found = false;
                foreach (string id in ids)
                {
                    CharacterState c = save.Characters[id];
                    for (int i = 0; i < c.Crystals.Length; i++)
                    {
                        if (c.Crystals[i] != def.CrystalId) { continue; }
                        found = true;
                        if (!should) { c.Crystals[i] = null; Note(done, "持ち主が★" + crystalStar + " 未満なので魔晶 " + def.CrystalId + " を外した", "characters." + id + ".crystals[" + i + "]"); }
                    }
                }
                if (should && !found)
                {
                    // いつもの枠（★6で開く枠）が空ならそこへ。埋まっていたら、解放済みの空き枠。それも無ければ、いつもの枠の魔晶を外して入れる。
                    int slot = CharacterState.OwnCrystalSlot;
                    for (int i = 0; owner.Crystals[slot] != null && i < owner.Crystals.Length; i++)
                    {
                        bool unlocked = i >= data.System.CrystalSlotStars.Count || owner.Star >= data.System.CrystalSlotStars[i];
                        if (unlocked && owner.Crystals[i] == null) { slot = i; }
                    }
                    if (owner.Crystals[slot] != null) { Note(done, "場所が無いので魔晶 " + owner.Crystals[slot] + " を外した", "characters." + def.Id + ".crystals[" + slot + "]"); }
                    owner.Crystals[slot] = def.CrystalId;
                    Note(done, "固有魔晶 " + def.CrystalId + " を戻した", "characters." + def.Id + ".crystals[" + slot + "]");
                }
            }
        }

        private static void RepairParties(SaveData save, GameData data, List<SaveIssue> done)
        {
            foreach (KeyValuePair<string, PartyState> kv in save.Parties)
            {
                for (int i = 0; i < kv.Value.Slots.Length; i++)
                {
                    string cid = kv.Value.Slots[i];
                    if (cid != null && !save.Characters.ContainsKey(cid))
                    {
                        kv.Value.Slots[i] = null;
                        Note(done, "未所持の " + cid + " を編成から外した", "parties." + kv.Key + ".slots[" + i + "]");
                    }
                }
            }
            if (save.Leader != null)
            {
                bool ok = save.Characters.TryGetValue(save.Leader, out CharacterState leader) && leader.Star >= data.System.LeaderMinStar;
                if (!ok) { Note(done, "リーダー " + save.Leader + " を解除した（未所持か★不足）", "leader"); save.Leader = null; }
            }
        }

        private static void RepairMemory(SaveData save, GameData data, List<SaveIssue> done)
        {
            MemoryState m = save.Memory;
            MemoryCardsConfig cfg = data.MemoryCards;
            int gacha = Math.Max(1, Math.Min(m.GachaLv, cfg.MaxCardLv));
            if (gacha != m.GachaLv) { Note(done, "絆ガチャLv " + m.GachaLv + " → " + gacha, "memory.gachaLv"); m.GachaLv = gacha; }
            if (m.Equipped == null || m.Equipped.Length != MemoryState.SlotCount)
            {
                var slots = new string[MemoryState.SlotCount];
                if (m.Equipped != null) { Array.Copy(m.Equipped, slots, Math.Min(m.Equipped.Length, slots.Length)); }
                m.Equipped = slots;
                Note(done, "装備枠の数を直した", "memory.equipped");
            }

            var kept = new List<MemoryCardState>();
            var ids = new HashSet<string>();
            int maxNumber = 0;
            for (int i = 0; i < m.Cards.Count; i++)
            {
                MemoryCardState c = m.Cards[i];
                string at = "memory.cards[" + i + "]";
                int extra = c.Extra == null ? 0 : c.Extra.Length;
                bool broken = string.IsNullOrEmpty(c.Id) || !ids.Add(c.Id)
                    || Growth.MemoryCardEffects.RarityIndex(data, c.Rarity) < 0
                    || extra != (c.Kind == MemoryKind.Speed ? 3 : 0) || c.Subs == null || c.Subs.Count != 2 || c.Subs[0].Stat == c.Subs[1].Stat;
                if (broken) { Note(done, "壊れたカード " + c.Id + " を捨てた", at); continue; }
                int lv = Math.Max(1, Math.Min(c.Lv, cfg.MaxCardLv));
                if (lv != c.Lv) { Note(done, "カードLv " + c.Lv + " → " + lv, at + ".lv"); c.Lv = lv; }
                kept.Add(c);
                if (c.Id.StartsWith("mc_", StringComparison.Ordinal) && int.TryParse(c.Id.Substring(3), out int n)) { maxNumber = Math.Max(maxNumber, n); }
            }
            m.Cards = kept;
            if (m.NextCardNumber <= maxNumber || m.NextCardNumber < 1)
            {
                Note(done, "次のカード番号 " + m.NextCardNumber + " → " + (maxNumber + 1), "memory.nextCardNumber");
                m.NextCardNumber = maxNumber + 1;
            }

            var byId = new Dictionary<string, MemoryCardState>();
            foreach (MemoryCardState c in m.Cards) { byId[c.Id] = c; }
            if (m.Pending != null && !Growth.MemoryCardRules.IsWellFormed(data, m.Pending, byId))
            {
                Note(done, "壊れた返事待ちのカードを捨てた", "memory.pending");
                m.Pending = null;
            }
            if (m.Rule == null || !Growth.MemoryCardRules.IsRuleValid(data, m.Rule))
            {
                Note(done, "確認の条件を初期値に戻した", "memory.rule");
                m.Rule = new MemoryRuleState();
            }
            var used = new HashSet<string>();
            for (int slot = 0; slot < m.Equipped.Length; slot++)
            {
                string id = m.Equipped[slot];
                if (id == null) { continue; }
                if (!byId.TryGetValue(id, out MemoryCardState card) || (int)card.Kind != slot / 2 || !used.Add(id))
                {
                    m.Equipped[slot] = null;
                    Note(done, "装備 " + id + " を外した（無い・種類違い・重複）", "memory.equipped[" + slot + "]");
                }
            }
        }
    }
}

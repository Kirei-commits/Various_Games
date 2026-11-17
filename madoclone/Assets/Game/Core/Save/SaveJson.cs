using System;
using System.Collections.Generic;
using Mado.Core.Wallet;
using Mado.Data;
using Newtonsoft.Json.Linq;

namespace Mado.Core.Save
{
    /// <summary>形が合わないセーブ（読み込みの失敗として扱う）。</summary>
    internal sealed class SaveFormatException : Exception
    {
        public SaveFormatException(string message) : base(message) { }
    }

    /// <summary>SaveData ⇔ JObject。キーの順番は固定（ID の昇順）で、同じ状態なら同じバイト列になる。</summary>
    internal static class SaveJson
    {
        private static readonly HashSet<string> KnownTop = new HashSet<string>
        {
            "format", "saveVersion", "devMode", "savedAtUtc", "rng", "wallet", "walletCarry",
            "characters", "leader", "parties", "metrics", "progress", "settings", "memory", "temple", "idle", "plazas", "trials", "supports", "dragonNest", "spiritStones", "research", "gacha", "achievements", "achievementLaps", "arena", "orphans",
        };

        // ---------------- 書き出し ----------------

        public static JObject ToJObject(SaveData s)
        {
            var o = new JObject();
            o["format"] = s.Format;
            o["saveVersion"] = s.SaveVersion;
            o["devMode"] = s.DevMode;
            o["savedAtUtc"] = s.SavedAtUtc ?? "";
            o["rng"] = new JObject { ["gacha"] = UIntArray(s.Rng.Gacha), ["misc"] = UIntArray(s.Rng.Misc) };

            var carry = new Dictionary<string, JToken>();
            var wallet = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, double> kv in s.Wallet.Balances) { wallet[kv.Key] = new JValue(kv.Value); }
            foreach (KeyValuePair<string, double> kv in s.Wallet.Carry) { carry[kv.Key] = new JValue(kv.Value); }
            o["wallet"] = Sorted(wallet);
            o["walletCarry"] = Sorted(carry);

            var chars = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, CharacterState> kv in s.Characters)
            {
                CharacterState c = kv.Value;
                var arr = new JArray();
                foreach (string id in c.Crystals ?? new string[CharacterState.CrystalSlots]) { arr.Add(id == null ? JValue.CreateNull() : new JValue(id)); }
                chars[kv.Key] = new JObject
                {
                    ["star"] = c.Star, ["lv"] = c.Lv, ["exp"] = c.Exp, ["copies"] = c.Copies, ["crystals"] = arr,
                };
            }
            o["characters"] = Sorted(chars);
            o["leader"] = s.Leader == null ? JValue.CreateNull() : new JValue(s.Leader);

            var parties = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, PartyState> kv in s.Parties)
            {
                PartyState p = kv.Value;
                var slots = new JArray();
                foreach (string id in p.Slots ?? new string[0]) { slots.Add(id == null ? JValue.CreateNull() : new JValue(id)); }
                parties[kv.Key] = new JObject
                {
                    ["slots"] = slots,
                    ["familiar"] = Str(p.Familiar), ["spirit"] = Str(p.Spirit), ["dragon"] = Str(p.Dragon),
                };
            }
            o["parties"] = Sorted(parties);

            var metrics = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, double> kv in s.Metrics) { metrics[kv.Key] = new JValue(kv.Value); }
            o["metrics"] = Sorted(metrics);

            o["progress"] = new JObject { ["rank"] = s.Progress.Rank, ["area"] = s.Progress.Area, ["stage"] = s.Progress.Stage };
            o["settings"] = new JObject
            {
                ["battleSpeed"] = s.Settings.BattleSpeed, ["autoBoss"] = s.Settings.AutoBoss, ["skipGachaAnim"] = s.Settings.SkipGachaAnim, ["growthSpeed"] = s.Settings.GrowthSpeed,
            };

            o["memory"] = MemoryToJson(s.Memory);
            var plazaLv = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in s.Plazas.Levels) { plazaLv[kv.Key] = new JValue(kv.Value); }
            o["plazas"] = Sorted(plazaLv);
            var trials = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, TrialState> kv in s.Trials)
            {
                trials[kv.Key] = new JObject
                {
                    ["clearedLv"] = kv.Value.ClearedLv,
                    ["charges"] = kv.Value.Gate.Charges,
                    ["lastUtc"] = kv.Value.Gate.LastUtc ?? "",
                };
            }
            o["trials"] = Sorted(trials);
            var stars = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in s.Supports.Stars) { stars[kv.Key] = new JValue(kv.Value); }
            o["supports"] = new JObject { ["stars"] = Sorted(stars) };
            var nest = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in s.DragonNest.Levels) { nest[kv.Key] = new JValue(kv.Value); }
            o["dragonNest"] = Sorted(nest);
            o["spiritStones"] = StonesToJson(s.SpiritStones);
            o["research"] = ResearchToJson(s.Research);
            o["gacha"] = new JObject { ["totalPulls"] = s.Gacha.TotalPulls, ["pickupPity"] = s.Gacha.PickupPity, ["pickupId"] = Str(s.Gacha.PickupId), ["stepsClaimed"] = s.Gacha.StepsClaimed };
            var claimed = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in s.Achievements.Claimed) { claimed[kv.Key] = new JValue(kv.Value); }
            o["achievements"] = Sorted(claimed);
            var laps = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in s.Achievements.Laps) { if (kv.Value > 0) { laps[kv.Key] = new JValue(kv.Value); } }
            o["achievementLaps"] = Sorted(laps);
            o["arena"] = new JObject { ["season"] = s.Arena.Season, ["battles"] = s.Arena.Battles, ["points"] = s.Arena.Points, ["pendingRank"] = s.Arena.PendingRank };
            o["idle"] = new JObject { ["lastClaimUtc"] = s.Idle.LastClaimUtc ?? "" };
            o["temple"] = new JObject
            {
                ["leaderLv"] = s.Temple.LeaderLv,
                ["leaderElement"] = s.Temple.LeaderElement.HasValue ? new JValue(EnumStringConverter.Text(s.Temple.LeaderElement.Value)) : JValue.CreateNull(),
            };

            // 孤児。"top/X" は最上位の未知の項目 X をそのまま戻す。それ以外は orphans の中に置く。
            var orphans = new Dictionary<string, JToken>();
            var tops = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, JToken> kv in s.Orphans)
            {
                if (kv.Key.StartsWith("top/", StringComparison.Ordinal)) { tops[kv.Key.Substring(4)] = kv.Value; }
                else { orphans[kv.Key] = kv.Value; }
            }
            if (orphans.Count > 0) { o["orphans"] = Sorted(orphans); }
            foreach (KeyValuePair<string, JToken> kv in SortedPairs(tops))
            {
                if (!KnownTop.Contains(kv.Key)) { o[kv.Key] = kv.Value.DeepClone(); }
            }
            return o;
        }

        // ---------------- 読み込み ----------------

        /// <summary>マスタに無い ID は Orphans に回し、警告を issues に入れる。形が合わなければ SaveFormatException。</summary>
        public static SaveData FromJObject(JObject o, GameData data, List<SaveIssue> issues)
        {
            var s = new SaveData
            {
                Format = Req<string>(o, "format", "format"),
                SaveVersion = Req<int>(o, "saveVersion", "saveVersion"),
                DevMode = Opt(o, "devMode", false),
                SavedAtUtc = Opt(o, "savedAtUtc", ""),
            };

            JObject rng = Obj(o, "rng");
            if (rng != null) { s.Rng = new RngState { Gacha = UIntArray(rng["gacha"], "rng.gacha"), Misc = UIntArray(rng["misc"], "rng.misc") }; }

            // 前の保存で孤児にしたものも、もう一度マスタと突き合わせる（データを戻せば復活する）。
            JObject oldOrphans = Obj(o, "orphans");
            IEnumerable<KeyValuePair<string, JToken>> Section(string name, JObject main)
            {
                if (main != null) { foreach (KeyValuePair<string, JToken> kv in main) { yield return kv; } }
                if (oldOrphans != null)
                {
                    foreach (KeyValuePair<string, JToken> kv in oldOrphans)
                    {
                        if (kv.Key.StartsWith(name + "/", StringComparison.Ordinal)) { yield return new KeyValuePair<string, JToken>(kv.Key.Substring(name.Length + 1), kv.Value); }
                    }
                }
            }
            if (oldOrphans != null)
            {
                foreach (KeyValuePair<string, JToken> kv in oldOrphans)
                {
                    bool section = kv.Key.StartsWith("characters/", StringComparison.Ordinal)
                        || kv.Key.StartsWith("wallet/", StringComparison.Ordinal)
                        || kv.Key.StartsWith("walletCarry/", StringComparison.Ordinal);
                    if (!section) { s.Orphans[kv.Key] = kv.Value; }
                }
            }

            foreach (KeyValuePair<string, JToken> kv in Section("wallet", Obj(o, "wallet")))
            {
                if (data.TryCurrency(kv.Key, out _)) { s.Wallet.Balances[kv.Key] = Num(kv.Value, "wallet." + kv.Key); }
                else { Orphan(s, issues, "wallet/" + kv.Key, kv.Value, "マスタに無い通貨"); }
            }
            foreach (KeyValuePair<string, JToken> kv in Section("walletCarry", Obj(o, "walletCarry")))
            {
                if (data.TryCurrency(kv.Key, out _)) { s.Wallet.Carry[kv.Key] = Num(kv.Value, "walletCarry." + kv.Key); }
                else { Orphan(s, issues, "walletCarry/" + kv.Key, kv.Value, "マスタに無い通貨"); }
            }
            foreach (KeyValuePair<string, JToken> kv in Section("characters", Obj(o, "characters")))
            {
                if (data.TryCharacter(kv.Key, out _)) { s.Characters[kv.Key] = ReadCharacter(kv.Value, kv.Key); }
                else { Orphan(s, issues, "characters/" + kv.Key, kv.Value, "マスタに無いキャラ"); }
            }

            s.Leader = OptStr(o, "leader");

            JObject parties = Obj(o, "parties");
            if (parties != null)
            {
                foreach (KeyValuePair<string, JToken> kv in parties)
                {
                    var p = kv.Value as JObject ?? throw new SaveFormatException("parties." + kv.Key + " がオブジェクトではない");
                    s.Parties[kv.Key] = new PartyState
                    {
                        Slots = StrArray(p["slots"], "parties." + kv.Key + ".slots", -1),
                        Familiar = OptStr(p, "familiar"), Spirit = OptStr(p, "spirit"), Dragon = OptStr(p, "dragon"),
                    };
                }
            }

            JObject metrics = Obj(o, "metrics");
            if (metrics != null) { foreach (KeyValuePair<string, JToken> kv in metrics) { s.Metrics[kv.Key] = Num(kv.Value, "metrics." + kv.Key); } }

            JObject progress = Obj(o, "progress");
            if (progress != null)
            {
                s.Progress = new ProgressState { Rank = Opt(progress, "rank", 1), Area = Opt(progress, "area", 1), Stage = Opt(progress, "stage", 1) };
            }
            JObject settings = Obj(o, "settings");
            if (settings != null)
            {
                s.Settings = new SettingsState
                {
                    BattleSpeed = Opt(settings, "battleSpeed", 1.0), AutoBoss = Opt(settings, "autoBoss", false), SkipGachaAnim = Opt(settings, "skipGachaAnim", true),
                    GrowthSpeed = Math.Max(1.0, Math.Min(5.0, Opt(settings, "growthSpeed", 1.0))),
                };
            }

            s.Memory = ReadMemory(Obj(o, "memory"));
            JObject plazas = Obj(o, "plazas");
            if (plazas != null)
            {
                foreach (KeyValuePair<string, JToken> kv in plazas)
                {
                    if (kv.Value.Type != JTokenType.Integer) { throw new SaveFormatException("plazas." + kv.Key + " が整数ではない"); }
                    s.Plazas.Levels[kv.Key] = kv.Value.Value<int>();
                }
            }
            JObject trials = Obj(o, "trials");
            if (trials != null)
            {
                foreach (KeyValuePair<string, JToken> kv in trials)
                {
                    var t = kv.Value as JObject ?? throw new SaveFormatException("trials." + kv.Key + " がオブジェクトではない");
                    s.Trials[kv.Key] = new TrialState
                    {
                        ClearedLv = Opt(t, "clearedLv", 0),
                        Gate = new GateState { Charges = Opt(t, "charges", 0.0), LastUtc = Opt(t, "lastUtc", "") },
                    };
                }
            }
            JObject supports = Obj(o, "supports");
            JObject starObj = supports == null ? null : Obj(supports, "stars");
            if (starObj != null)
            {
                foreach (KeyValuePair<string, JToken> kv in starObj)
                {
                    if (kv.Value.Type != JTokenType.Integer) { throw new SaveFormatException("supports.stars." + kv.Key + " が整数ではない"); }
                    s.Supports.Stars[kv.Key] = kv.Value.Value<int>();
                }
            }
            JObject nestObj = Obj(o, "dragonNest");
            if (nestObj != null)
            {
                foreach (KeyValuePair<string, JToken> kv in nestObj)
                {
                    if (kv.Value.Type != JTokenType.Integer) { throw new SaveFormatException("dragonNest." + kv.Key + " が整数ではない"); }
                    s.DragonNest.Levels[kv.Key] = kv.Value.Value<int>();
                }
            }
            s.SpiritStones = ReadStones(Obj(o, "spiritStones"));
            s.Research = ReadResearch(Obj(o, "research"));
            JObject gacha = Obj(o, "gacha");
            if (gacha != null)
            {
                s.Gacha = new GachaState
                {
                    TotalPulls = Opt(gacha, "totalPulls", 0), PickupPity = Opt(gacha, "pickupPity", 0),
                    PickupId = OptStr(gacha, "pickupId"), StepsClaimed = Opt(gacha, "stepsClaimed", 0),
                };
            }
            JObject achievements = Obj(o, "achievements");
            if (achievements != null) { foreach (KeyValuePair<string, JToken> kv in achievements) { s.Achievements.Claimed[kv.Key] = IntOf(kv.Value, "achievements." + kv.Key); } }
            JObject achievementLaps = Obj(o, "achievementLaps");
            if (achievementLaps != null) { foreach (KeyValuePair<string, JToken> kv in achievementLaps) { s.Achievements.Laps[kv.Key] = IntOf(kv.Value, "achievementLaps." + kv.Key); } }
            JObject arena = Obj(o, "arena");
            if (arena != null) { s.Arena = new ArenaState { Season = Opt(arena, "season", 1), Battles = Opt(arena, "battles", 0), Points = Opt(arena, "points", 0), PendingRank = Opt(arena, "pendingRank", 0) }; }
            JObject idle = Obj(o, "idle");
            if (idle != null) { s.Idle = new IdleState { LastClaimUtc = Opt(idle, "lastClaimUtc", "") }; }
            JObject temple = Obj(o, "temple");
            if (temple != null)
            {
                string el = OptStr(temple, "leaderElement");
                s.Temple = new TempleState
                {
                    LeaderLv = Opt(temple, "leaderLv", 1),
                    LeaderElement = el == null ? (Element?)null : ParseEnum<Element>(el, "temple.leaderElement"),
                };
            }

            foreach (KeyValuePair<string, JToken> kv in o)
            {
                if (!KnownTop.Contains(kv.Key)) { s.Orphans["top/" + kv.Key] = kv.Value.DeepClone(); }
            }
            return s;
        }

        private static void Orphan(SaveData s, List<SaveIssue> issues, string key, JToken value, string why)
        {
            s.Orphans[key] = value.DeepClone();
            issues.Add(new SaveIssue(SaveSeverity.Warning, "ORPHAN", why + "。読み飛ばして保持する", key));
        }

        private static CharacterState ReadCharacter(JToken t, string id)
        {
            var o = t as JObject ?? throw new SaveFormatException("characters." + id + " がオブジェクトではない");
            string at = "characters." + id;
            return new CharacterState
            {
                Star = Req<int>(o, "star", at + ".star"),
                Lv = Req<int>(o, "lv", at + ".lv"),
                Exp = Opt(o, "exp", 0.0),
                Copies = Opt(o, "copies", 0),
                Crystals = StrArray(o["crystals"], at + ".crystals", CharacterState.CrystalSlots),
            };
        }

        private static JObject ResearchToJson(ResearchState r)
        {
            var nodes = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in r.Nodes) { nodes[kv.Key] = new JValue(kv.Value); }
            var tarot = new JArray();
            foreach (TarotSlotState t in r.Tarot) { tarot.Add(new JObject { ["effect"] = Str(t.Effect), ["rarity"] = Str(t.Rarity) }); }
            var coll = new Dictionary<string, JToken>();
            foreach (KeyValuePair<string, int> kv in r.Collection) { coll[kv.Key] = new JValue(kv.Value); }
            var zukan = new JArray();
            var sorted = new List<string>(r.Zukan);
            sorted.Sort(StringComparer.Ordinal);
            foreach (string g in sorted) { zukan.Add(g); }
            return new JObject { ["nodes"] = Sorted(nodes), ["tarot"] = tarot, ["collection"] = Sorted(coll), ["zukan"] = zukan, ["tarotChanges"] = r.TarotChanges };
        }

        private static ResearchState ReadResearch(JObject o)
        {
            var r = new ResearchState();
            if (o == null) { return r; }
            JObject nodes = Obj(o, "nodes");
            if (nodes != null) { foreach (KeyValuePair<string, JToken> kv in nodes) { r.Nodes[kv.Key] = IntOf(kv.Value, "research.nodes." + kv.Key); } }
            if (o["tarotChanges"] != null) { r.TarotChanges = Math.Max(0, IntOf(o["tarotChanges"], "research.tarotChanges")); }
            JObject coll = Obj(o, "collection");
            if (coll != null) { foreach (KeyValuePair<string, JToken> kv in coll) { r.Collection[kv.Key] = IntOf(kv.Value, "research.collection." + kv.Key); } }
            if (o["tarot"] is JArray tarot)
            {
                for (int i = 0; i < tarot.Count; i++)
                {
                    var t = tarot[i] as JObject ?? throw new SaveFormatException("research.tarot[" + i + "] がオブジェクトではない");
                    r.Tarot.Add(new TarotSlotState { Effect = OptStr(t, "effect"), Rarity = OptStr(t, "rarity") });
                }
            }
            if (o["zukan"] is JArray z)
            {
                foreach (JToken g in z)
                {
                    if (g.Type != JTokenType.String) { throw new SaveFormatException("research.zukan が文字列の配列ではない"); }
                    r.Zukan.Add(g.Value<string>());
                }
            }
            return r;
        }

        private static int IntOf(JToken t, string at)
        {
            if (t.Type != JTokenType.Integer) { throw new SaveFormatException(at + " が整数ではない"); }
            return t.Value<int>();
        }

        private static JObject StonesToJson(SpiritStoneState st)
        {
            var stones = new JArray();
            foreach (StoneState c in st.Stones) { stones.Add(new JObject { ["id"] = c.Id, ["rarity"] = c.Rarity, ["constellation"] = c.Constellation, ["lv"] = c.Lv }); }
            var eq = new JArray();
            foreach (string id in st.Equipped ?? new string[0]) { eq.Add(Str(id)); }
            return new JObject { ["nextNumber"] = st.NextNumber, ["stones"] = stones, ["equipped"] = eq };
        }

        private static SpiritStoneState ReadStones(JObject o)
        {
            var st = new SpiritStoneState();
            if (o == null) { return st; }
            st.NextNumber = Opt(o, "nextNumber", 1);
            st.Equipped = o["equipped"] == null || o["equipped"].Type == JTokenType.Null ? new string[0] : StrArray(o["equipped"], "spiritStones.equipped", -1);
            if (o["stones"] is JArray arr)
            {
                for (int i = 0; i < arr.Count; i++)
                {
                    string at = "spiritStones.stones[" + i + "]";
                    var c = arr[i] as JObject ?? throw new SaveFormatException(at + " がオブジェクトではない");
                    st.Stones.Add(new StoneState
                    {
                        Id = Req<string>(c, "id", at + ".id"), Rarity = Req<string>(c, "rarity", at + ".rarity"),
                        Constellation = Req<string>(c, "constellation", at + ".constellation"), Lv = Req<int>(c, "lv", at + ".lv"),
                    });
                }
            }
            return st;
        }

        private static JObject CardToJson(MemoryCardState c)
        {
            var subs = new JArray();
            foreach (MemorySubState sub in c.Subs) { subs.Add(new JObject { ["stat"] = EnumStringConverter.Text(sub.Stat), ["value"] = sub.Value }); }
            var extra = new JArray();
            foreach (double e in c.Extra ?? new double[0]) { extra.Add(e); }
            return new JObject
            {
                ["id"] = c.Id, ["rarity"] = c.Rarity, ["kind"] = EnumStringConverter.Text(c.Kind), ["lv"] = c.Lv,
                ["main"] = c.Main, ["extra"] = extra, ["subs"] = subs,
            };
        }

        private static JArray KeysToJson(List<SubstatKey> keys)
        {
            var a = new JArray();
            foreach (SubstatKey k in keys) { a.Add(EnumStringConverter.Text(k)); }
            return a;
        }

        private static JObject MemoryToJson(MemoryState m)
        {
            var cards = new JArray();
            foreach (MemoryCardState c in m.Cards) { cards.Add(CardToJson(c)); }
            var equipped = new JArray();
            foreach (string id in m.Equipped ?? new string[MemoryState.SlotCount]) { equipped.Add(Str(id)); }
            var o = new JObject { ["gachaLv"] = m.GachaLv, ["nextCardNumber"] = m.NextCardNumber, ["cards"] = cards, ["equipped"] = equipped };
            if (m.Pending != null) { o["pending"] = CardToJson(m.Pending); }
            o["rule"] = new JObject
            {
                ["minRarityIndex"] = m.Rule.MinRarityIndex, ["filter1"] = KeysToJson(m.Rule.Filter1), ["filter2"] = KeysToJson(m.Rule.Filter2),
                ["requirePowerUp"] = m.Rule.RequirePowerUp,
            };
            return o;
        }

        private static MemoryCardState ReadCard(JObject c, string at)
        {
            var card = new MemoryCardState
            {
                Id = Req<string>(c, "id", at + ".id"),
                Rarity = Req<string>(c, "rarity", at + ".rarity"),
                Kind = ParseEnum<MemoryKind>(Req<string>(c, "kind", at + ".kind"), at + ".kind"),
                Lv = Req<int>(c, "lv", at + ".lv"),
                Main = Opt(c, "main", 0.0),
            };
            if (c["extra"] is JArray ex)
            {
                card.Extra = new double[ex.Count];
                for (int k = 0; k < ex.Count; k++) { card.Extra[k] = Num(ex[k], at + ".extra[" + k + "]"); }
            }
            if (c["subs"] is JArray subs)
            {
                for (int k = 0; k < subs.Count; k++)
                {
                    var so = subs[k] as JObject ?? throw new SaveFormatException(at + ".subs[" + k + "] がオブジェクトではない");
                    card.Subs.Add(new MemorySubState
                    {
                        Stat = ParseEnum<SubstatKey>(Req<string>(so, "stat", at + ".subs[" + k + "].stat"), at + ".subs[" + k + "].stat"),
                        Value = Req<double>(so, "value", at + ".subs[" + k + "].value"),
                    });
                }
            }
            return card;
        }

        private static List<SubstatKey> ReadKeys(JToken t, string at)
        {
            var list = new List<SubstatKey>();
            if (t is JArray a) { for (int i = 0; i < a.Count; i++) { list.Add(ParseEnum<SubstatKey>(a[i].ToString(), at + "[" + i + "]")); } }
            return list;
        }

        private static MemoryState ReadMemory(JObject o)
        {
            var m = new MemoryState();
            if (o == null) { return m; }
            m.GachaLv = Opt(o, "gachaLv", 1);
            m.NextCardNumber = Opt(o, "nextCardNumber", 1);
            m.Equipped = StrArray(o["equipped"], "memory.equipped", MemoryState.SlotCount);
            if (o["pending"] is JObject pending) { m.Pending = ReadCard(pending, "memory.pending"); }
            if (o["rule"] is JObject rule)
            {
                m.Rule = new MemoryRuleState
                {
                    MinRarityIndex = Opt(rule, "minRarityIndex", 0),
                    Filter1 = ReadKeys(rule["filter1"], "memory.rule.filter1"),
                    Filter2 = ReadKeys(rule["filter2"], "memory.rule.filter2"),
                    RequirePowerUp = Opt(rule, "requirePowerUp", true),
                };
            }
            if (o["cards"] == null || o["cards"].Type == JTokenType.Null) { return m; }
            var cards = o["cards"] as JArray ?? throw new SaveFormatException("memory.cards が配列ではない");
            for (int i = 0; i < cards.Count; i++)
            {
                string at = "memory.cards[" + i + "]";
                m.Cards.Add(ReadCard(cards[i] as JObject ?? throw new SaveFormatException(at + " がオブジェクトではない"), at));
            }
            return m;
        }

        private static T ParseEnum<T>(string text, string at) where T : struct
        {
            try { return EnumStringConverter.Parse<T>(text); }
            catch (DataException) { throw new SaveFormatException(at + " が未知の値: " + text); }
        }

        // ---------------- 小さな道具 ----------------

        private static JToken Str(string v) { return v == null ? JValue.CreateNull() : new JValue(v); }

        private static IEnumerable<KeyValuePair<string, JToken>> SortedPairs(Dictionary<string, JToken> d)
        {
            var keys = new List<string>(d.Keys);
            keys.Sort(StringComparer.Ordinal);
            foreach (string k in keys) { yield return new KeyValuePair<string, JToken>(k, d[k]); }
        }

        private static JObject Sorted(Dictionary<string, JToken> d)
        {
            var o = new JObject();
            foreach (KeyValuePair<string, JToken> kv in SortedPairs(d)) { o[kv.Key] = kv.Value.DeepClone(); }
            return o;
        }

        private static JArray UIntArray(uint[] a)
        {
            var r = new JArray();
            if (a != null) { foreach (uint u in a) { r.Add(u); } }
            return r;
        }

        private static uint[] UIntArray(JToken t, string at)
        {
            if (t == null || t.Type == JTokenType.Null) { return null; }
            var a = t as JArray ?? throw new SaveFormatException(at + " が配列ではない");
            if (a.Count != 4) { throw new SaveFormatException(at + " の長さが4ではない"); }
            var r = new uint[4];
            for (int i = 0; i < 4; i++)
            {
                try { r[i] = checked((uint)a[i].Value<long>()); }
                catch (Exception) { throw new SaveFormatException(at + "[" + i + "] が uint ではない"); }
            }
            return r;
        }

        private static string[] StrArray(JToken t, string at, int length)
        {
            if (t == null || t.Type == JTokenType.Null)
            {
                if (length < 0) { throw new SaveFormatException(at + " が無い"); }
                return new string[length];
            }
            var a = t as JArray ?? throw new SaveFormatException(at + " が配列ではない");
            if (length >= 0 && a.Count != length) { throw new SaveFormatException(at + " の長さが " + length + " ではない"); }
            var r = new string[a.Count];
            for (int i = 0; i < a.Count; i++)
            {
                if (a[i].Type == JTokenType.Null) { continue; }
                if (a[i].Type != JTokenType.String) { throw new SaveFormatException(at + "[" + i + "] が文字列でも null でもない"); }
                r[i] = a[i].Value<string>();
            }
            return r;
        }

        private static JObject Obj(JObject o, string key)
        {
            JToken t = o[key];
            if (t == null || t.Type == JTokenType.Null) { return null; }
            return t as JObject ?? throw new SaveFormatException(key + " がオブジェクトではない");
        }

        private static double Num(JToken t, string at)
        {
            if (t.Type != JTokenType.Integer && t.Type != JTokenType.Float) { throw new SaveFormatException(at + " が数値ではない"); }
            double v = t.Value<double>();
            if (double.IsNaN(v) || double.IsInfinity(v) || v < 0) { throw new SaveFormatException(at + " が負・NaN・無限大"); }
            return v;
        }

        private static string OptStr(JObject o, string key)
        {
            JToken t = o[key];
            if (t == null || t.Type == JTokenType.Null) { return null; }
            if (t.Type != JTokenType.String) { throw new SaveFormatException(key + " が文字列ではない"); }
            return t.Value<string>();
        }

        private static T Req<T>(JObject o, string key, string at)
        {
            JToken t = o[key];
            if (t == null || t.Type == JTokenType.Null) { throw new SaveFormatException(at + " が無い"); }
            return Conv<T>(t, at);
        }

        private static T Opt<T>(JObject o, string key, T fallback)
        {
            JToken t = o[key];
            if (t == null || t.Type == JTokenType.Null) { return fallback; }
            return Conv<T>(t, key);
        }

        private static T Conv<T>(JToken t, string at)
        {
            Type want = typeof(T);
            bool ok = want == typeof(string) ? t.Type == JTokenType.String
                : want == typeof(bool) ? t.Type == JTokenType.Boolean
                : want == typeof(int) ? t.Type == JTokenType.Integer
                : t.Type == JTokenType.Integer || t.Type == JTokenType.Float; // double
            if (!ok) { throw new SaveFormatException(at + " の型が違う（" + t.Type + "）"); }
            try { return t.Value<T>(); }
            catch (Exception) { throw new SaveFormatException(at + " の値が範囲外"); }
        }
    }
}

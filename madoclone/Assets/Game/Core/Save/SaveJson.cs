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
            "characters", "leader", "parties", "metrics", "progress", "settings", "memory", "orphans",
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
                ["battleSpeed"] = s.Settings.BattleSpeed, ["autoBoss"] = s.Settings.AutoBoss, ["skipGachaAnim"] = s.Settings.SkipGachaAnim,
            };

            o["memory"] = MemoryToJson(s.Memory);

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
                };
            }

            s.Memory = ReadMemory(Obj(o, "memory"));

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

        private static JObject MemoryToJson(MemoryState m)
        {
            var cards = new JArray();
            foreach (MemoryCardState c in m.Cards)
            {
                var subs = new JArray();
                foreach (MemorySubState sub in c.Subs) { subs.Add(new JObject { ["stat"] = EnumStringConverter.Text(sub.Stat), ["value"] = sub.Value }); }
                var extra = new JArray();
                foreach (double e in c.Extra ?? new double[0]) { extra.Add(e); }
                cards.Add(new JObject
                {
                    ["id"] = c.Id, ["rarity"] = c.Rarity, ["kind"] = EnumStringConverter.Text(c.Kind), ["lv"] = c.Lv,
                    ["main"] = c.Main, ["extra"] = extra, ["subs"] = subs,
                });
            }
            var equipped = new JArray();
            foreach (string id in m.Equipped ?? new string[MemoryState.SlotCount]) { equipped.Add(Str(id)); }
            return new JObject { ["gachaLv"] = m.GachaLv, ["nextCardNumber"] = m.NextCardNumber, ["cards"] = cards, ["equipped"] = equipped };
        }

        private static MemoryState ReadMemory(JObject o)
        {
            var m = new MemoryState();
            if (o == null) { return m; }
            m.GachaLv = Opt(o, "gachaLv", 1);
            m.NextCardNumber = Opt(o, "nextCardNumber", 1);
            m.Equipped = StrArray(o["equipped"], "memory.equipped", MemoryState.SlotCount);
            if (o["cards"] == null || o["cards"].Type == JTokenType.Null) { return m; }
            var cards = o["cards"] as JArray ?? throw new SaveFormatException("memory.cards が配列ではない");
            for (int i = 0; i < cards.Count; i++)
            {
                string at = "memory.cards[" + i + "]";
                var c = cards[i] as JObject ?? throw new SaveFormatException(at + " がオブジェクトではない");
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
                m.Cards.Add(card);
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

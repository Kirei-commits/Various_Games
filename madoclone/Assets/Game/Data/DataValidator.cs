using System;
using System.Collections.Generic;

namespace Mado.Data
{
    /// <summary>
    /// 読み込んだ GameData の「JSON の型変換だけでは分からない」検証（docs/04 3.3節、tools/bootstrap/validate.py の C# 版）。
    /// 結果は DataIssue の一覧。Code は短い英字で、テストはこれを確かめる。
    /// </summary>
    public static class DataValidator
    {
        private static readonly int[] SubstatStars = { 2, 4, 8, 10 };

        public static List<DataIssue> Validate(GameData d)
        {
            if (d == null)
            {
                throw new ArgumentNullException(nameof(d));
            }
            var issues = new List<DataIssue>();
            CheckDuplicates(d, issues);
            CheckCharacters(d, issues);
            CheckCrystals(d, issues);
            CheckSkillBodies(d, issues);
            CheckCounts(d, issues);
            CheckSystem(d, issues);
            CheckStatTables(d, issues);
            CheckDifficulty(d, issues);
            CheckRewards(d, issues);
            CheckMemoryCards(d, issues);
            CheckLeaderTemple(d, issues);
            CheckEnemyKits(d, issues);
            CheckPlazas(d, issues);
            CheckTrials(d, issues);
            CheckSupports(d, issues);
            CheckDragonNest(d, issues);
            CheckSpiritStones(d, issues);
            return issues;
        }

        // ---- ID の重複 ----

        private static void CheckDuplicates(GameData d, List<DataIssue> issues)
        {
            var ids = new List<string>();
            foreach (CharacterDef c in d.Characters) { ids.Add(c.Id); }
            Duplicates(ids, DataLoader.CharactersFile, issues);
            ids.Clear();
            foreach (SkillDef s in d.Skills) { ids.Add(s.Id); }
            Duplicates(ids, DataLoader.SkillsFile, issues);
            ids.Clear();
            foreach (CrystalDef c in d.Crystals) { ids.Add(c.Id); }
            Duplicates(ids, DataLoader.CrystalsFile, issues);
            ids.Clear();
            foreach (BuffDef b in d.Buffs.Items) { ids.Add(b.Id); }
            Duplicates(ids, DataLoader.BuffsFile, issues);
            ids.Clear();
            foreach (CurrencyDef c in d.Currencies) { ids.Add(c.Id); }
            Duplicates(ids, DataLoader.CurrenciesFile, issues);
            ids.Clear();
            foreach (TierDef t in d.Tiers) { ids.Add(t.Id.ToString()); }
            Duplicates(ids, DataLoader.TiersFile, issues);
        }

        private static void Duplicates(List<string> ids, string file, List<DataIssue> issues)
        {
            var seen = new HashSet<string>();
            foreach (string id in ids)
            {
                if (!seen.Add(id))
                {
                    Error(issues, "ID_DUPLICATE", file + ":" + id, "ID が重複している");
                }
            }
        }

        // ---- キャラ ----

        private static void CheckCharacters(GameData d, List<DataIssue> issues)
        {
            foreach (CharacterDef c in d.Characters)
            {
                string at = DataLoader.CharactersFile + ":" + c.Id;
                foreach (SkillKind kind in new[] { SkillKind.Normal, SkillKind.Special, SkillKind.Ultimate })
                {
                    string sid = c.Skills.Get(kind);
                    SkillDef s;
                    if (!d.TrySkill(sid, out s))
                    {
                        Error(issues, "REF_MISSING", at + "/skills", "スキルが無い: " + sid);
                    }
                    else if (s.Kind != kind)
                    {
                        Error(issues, "SKILL_KIND_MISMATCH", at + "/skills", "スキルの種類が違う: " + sid);
                    }
                }

                CrystalDef crystal;
                if (!d.TryCrystal(c.CrystalId, out crystal))
                {
                    Error(issues, "REF_MISSING", at + "/crystalId", "魔晶が無い: " + c.CrystalId);
                }
                else if (crystal.OwnerId != c.Id)
                {
                    Error(issues, "OWNER_MISMATCH", at + "/crystalId", "魔晶の持ち主がこのキャラではない: " + c.CrystalId);
                }

                if (!d.Text.Contains(c.Id + ".name"))
                {
                    Error(issues, "TEXT_MISSING", at, "表示名が " + DataLoader.TextFile + " に無い（" + c.Id + ".name）");
                }

                bool starsOk = c.SubstatBonuses.Count == SubstatStars.Length;
                for (int i = 0; starsOk && i < SubstatStars.Length; i++)
                {
                    starsOk = c.SubstatBonuses[i].Star == SubstatStars[i];
                }
                if (!starsOk)
                {
                    Error(issues, "SUBSTAT_STARS", at + "/substatBonuses", "凸ステの★が 2・4・8・10 ではない");
                }

                if ((c.Tier == CharTier.Lr) != (c.Obtain == ObtainKind.BossFirstClear))
                {
                    Error(issues, "OBTAIN_MISMATCH", at, "LR と入手方法（boss_first_clear）が合わない");
                }
            }

            foreach (string id in d.System.StarterCharacters)
            {
                CharacterDef unused;
                if (!d.TryCharacter(id, out unused))
                {
                    Error(issues, "REF_MISSING", DataLoader.SystemFile + ":starterCharacters", "キャラが無い: " + id);
                }
            }
        }

        // ---- 魔晶 ----

        private static void CheckCrystals(GameData d, List<DataIssue> issues)
        {
            foreach (CrystalDef c in d.Crystals)
            {
                string at = DataLoader.CrystalsFile + ":" + c.Id;
                if (c.Kind != DataConstants.CrystalKind)
                {
                    Error(issues, "CRYSTAL_KIND", at + "/kind", "kind が \"" + DataConstants.CrystalKind + "\" ではない: " + c.Kind);
                }
                CharacterDef owner;
                if (!d.TryCharacter(c.OwnerId, out owner))
                {
                    Error(issues, "REF_MISSING", at + "/ownerId", "持ち主のキャラが無い: " + c.OwnerId);
                }
                else if (owner.CrystalId != c.Id)
                {
                    Error(issues, "OWNER_MISMATCH", at + "/ownerId", "持ち主の crystalId がこの魔晶ではない");
                }
            }
        }

        // ---- スキルと魔晶の中身 ----

        private static void CheckSkillBodies(GameData d, List<DataIssue> issues)
        {
            foreach (SkillDef s in d.Skills)
            {
                CheckBody(d, s, DataLoader.SkillsFile + ":" + s.Id, issues);
            }
            foreach (CrystalDef c in d.Crystals)
            {
                CheckBody(d, c, DataLoader.CrystalsFile + ":" + c.Id, issues);
            }

            foreach (CharacterDef c in d.Characters)
            {
                foreach (SkillKind kind in new[] { SkillKind.Normal, SkillKind.Ultimate })
                {
                    SkillDef s;
                    if (!d.TrySkill(c.Skills.Get(kind), out s))
                    {
                        continue;
                    }
                    // 巨人化のように、無敵を付けるだけの必殺は、ダメージも回復も無くてよい。
                    bool hasOutput = false;
                    foreach (EffectDef e in s.Effects)
                    {
                        if (e.Type == EffectType.Damage || e.Type == EffectType.Heal || e.BuffId == "invincible")
                        {
                            hasOutput = true;
                        }
                    }
                    if (!hasOutput)
                    {
                        Error(issues, "NO_DAMAGE_OR_HEAL", DataLoader.SkillsFile + ":" + s.Id, "ダメージも回復も無い");
                    }
                }

                SkillDef ultimate;
                if (d.TrySkill(c.Skills.Ultimate, out ultimate))
                {
                    double? cooldown = ultimate.Trigger.CooldownSec;
                    if (!cooldown.HasValue || cooldown.Value <= 0)
                    {
                        Error(issues, "ULTIMATE_COOLDOWN", DataLoader.SkillsFile + ":" + ultimate.Id, "必殺のクールタイムが無い");
                    }
                }
            }
        }

        private static void CheckBody(GameData d, SkillDefBase body, string at, List<DataIssue> issues)
        {
            CheckStatusIf(d, body.Trigger.If, at + "/trigger/if", issues);

            for (int i = 0; i < body.Effects.Count; i++)
            {
                EffectDef e = body.Effects[i];
                string ep = at + "/effects[" + i + "]";

                if (e.Type == EffectType.ApplyBuff)
                {
                    if (e.BuffId == null || !e.Target.HasValue)
                    {
                        Error(issues, "EFFECT_FIELD_MISSING", ep, "applyBuff には buffId と target が要る");
                    }
                    if (e.BuffId != null)
                    {
                        CheckBuffTier(d, e, ep, issues);
                    }
                }
                else if (e.Type == EffectType.GaugeShift && (e.Sec == null || !e.Target.HasValue))
                {
                    Error(issues, "EFFECT_FIELD_MISSING", ep, "gaugeShift には sec と target が要る");
                }
                else if (e.Type == EffectType.Heal && (e.MultiplierPct == null || !e.Target.HasValue))
                {
                    Error(issues, "EFFECT_FIELD_MISSING", ep, "heal には multiplierPct と target が要る");
                }

                if (e.Target == TargetType.AllyElement && !e.Element.HasValue)
                {
                    Error(issues, "EFFECT_FIELD_MISSING", ep, "ally_element には element が要る");
                }

                CheckStatusIf(d, e.If, ep + "/if", issues);
                CheckIncreasing(e.MultiplierPct, "multiplierPct", ep, issues);
                CheckIncreasing(e.DurationSec, "durationSec", ep, issues);
                CheckIncreasing(e.BonusSelfLostHpPct, "bonusSelfLostHpPct", ep, issues);

                if (body.Trigger.Type == TriggerType.Always && e.DurationSec != null)
                {
                    Error(issues, "ALWAYS_WITH_DURATION", ep, "常時（always）の効果に durationSec は付けない");
                }
                if (e.MinRank.HasValue && (e.MinRank.Value < 0 || e.MinRank.Value > 2))
                {
                    Error(issues, "MINRANK_RANGE", ep, "minRank は 0〜2");
                }
            }
        }

        private static void CheckBuffTier(GameData d, EffectDef e, string ep, List<DataIssue> issues)
        {
            BuffDef buff;
            if (!d.TryBuff(e.BuffId, out buff))
            {
                Error(issues, "REF_MISSING", ep + "/buffId", "バフが buffs.json に無い: " + e.BuffId);
                return;
            }
            if (buff.IsTierless)
            {
                if (e.Tier != null && (e.Tier.R0.HasValue || e.Tier.R1.HasValue || e.Tier.R2.HasValue))
                {
                    Error(issues, "TIER_UNEXPECTED", ep + "/tier", "段階を持たないバフに段階がある: " + e.BuffId);
                }
                return;
            }
            if (e.Tier == null)
            {
                Error(issues, "TIER_MISSING", ep + "/tier", "段階が要るバフに tier が無い: " + e.BuffId);
                return;
            }
            for (int rank = 0; rank < 3; rank++)
            {
                TierLevel? t = e.Tier.Pick(rank);
                if (!t.HasValue)
                {
                    Error(issues, "TIER_MISSING", ep + "/tier", "段階が要るバフに tier が無い（ランク" + rank + "）: " + e.BuffId);
                }
                else if (buff.FindTier(t) == null)
                {
                    Error(issues, "TIER_UNKNOWN", ep + "/tier", e.BuffId + " に段階 " + EnumStringConverter.Text(t.Value) + " が無い");
                }
            }
        }

        private static void CheckStatusIf(GameData d, StatusIf cond, string at, List<DataIssue> issues)
        {
            if (cond == null)
            {
                return;
            }
            foreach (string id in cond.TargetHasAnyStatus)
            {
                BuffDef unused;
                if (!d.TryBuff(id, out unused))
                {
                    Error(issues, "REF_MISSING", at, "状態が buffs.json に無い: " + id);
                }
            }
        }

        private static void CheckIncreasing(Ranked<double> value, string name, string at, List<DataIssue> issues)
        {
            if (value != null && !(value.R0 <= value.R1 && value.R1 <= value.R2))
            {
                Error(issues, "RANK_NOT_INCREASING", at + "/" + name, "凸で増えていない");
            }
        }

        // ---- 人数 ----

        private static void CheckCounts(GameData d, List<DataIssue> issues)
        {
            if (d.Characters.Count != DataConstants.CharacterCount)
            {
                Error(issues, "COUNT_TOTAL", DataLoader.CharactersFile, "キャラが " + DataConstants.CharacterCount + " 体ではない: " + d.Characters.Count);
            }
            int sum = 0;
            foreach (TierDef t in d.Tiers)
            {
                sum += t.Count;
                int actual = 0;
                foreach (CharacterDef c in d.Characters)
                {
                    if (c.Tier == t.Id)
                    {
                        actual++;
                    }
                }
                if (actual != t.Count)
                {
                    Error(issues, "COUNT_TIER", DataLoader.TiersFile + ":" + t.Id, "格の体数が違う: " + actual + "（tiers.json は " + t.Count + "）");
                }
            }
            if (sum != DataConstants.CharacterCount)
            {
                Error(issues, "COUNT_TIER", DataLoader.TiersFile, "格ごとの体数の合計が " + DataConstants.CharacterCount + " ではない: " + sum);
            }
        }

        // ---- system.json ----

        private static void CheckSystem(GameData d, List<DataIssue> issues)
        {
            SystemConfig s = d.System;
            string at = DataLoader.SystemFile;
            if (s.CrystalSlotStars.Count != DataConstants.CrystalSlotCount)
            {
                Error(issues, "CRYSTAL_SLOTS", at + ":crystalSlotStars", "魔晶の枠の★が " + DataConstants.CrystalSlotCount + " 個ではない");
            }
            else
            {
                for (int i = 1; i < s.CrystalSlotStars.Count; i++)
                {
                    if (s.CrystalSlotStars[i] <= s.CrystalSlotStars[i - 1])
                    {
                        Error(issues, "CRYSTAL_SLOTS", at + ":crystalSlotStars", "魔晶の枠の★が増えていない");
                    }
                }
            }
            if (s.ElementCycle.Count != 4 || new HashSet<Element>(s.ElementCycle).Count != 4)
            {
                Error(issues, "ELEMENT_CYCLE", at + ":elementCycle", "属性の並びが4つの別々の属性ではない");
            }
            if (!IsLowerHex64(s.DevModeCodeSha256))
            {
                Error(issues, "DEVMODE_HASH", at + ":devModeCodeSha256", "小文字の16進64桁ではない");
            }
            if (s.TickSec <= 0 || s.BaseAttackIntervalSec <= 0)
            {
                Error(issues, "SYSTEM_VALUE", at, "tickSec と baseAttackIntervalSec は正の数");
            }
        }

        private static bool IsLowerHex64(string text)
        {
            if (text == null || text.Length != 64)
            {
                return false;
            }
            foreach (char ch in text)
            {
                bool ok = (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f');
                if (!ok)
                {
                    return false;
                }
            }
            return true;
        }

        // ---- stat_tables.json ----

        private static void CheckStatTables(GameData d, List<DataIssue> issues)
        {
            StatTables t = d.Stats;
            string at = DataLoader.StatTablesFile;

            if (t.LevelTable.Count != DataConstants.MaxLevel)
            {
                Error(issues, "LEVEL_TABLE", at + ":levelTable", "Lv1〜" + DataConstants.MaxLevel + " の行数ではない: " + t.LevelTable.Count);
            }
            else
            {
                for (int i = 0; i < t.LevelTable.Count; i++)
                {
                    LevelRow row = t.LevelTable[i];
                    if (row.Lv != i + 1)
                    {
                        Error(issues, "LEVEL_TABLE", at + ":levelTable[" + i + "]", "Lv が " + (i + 1) + " ではない: " + row.Lv);
                    }
                    if (i > 0)
                    {
                        LevelRow prev = t.LevelTable[i - 1];
                        if (!(row.Atk > prev.Atk && row.Hp > prev.Hp && row.Def > prev.Def))
                        {
                            Error(issues, "LEVEL_TABLE", at + ":levelTable[" + i + "]", "Lv" + row.Lv + " が前のレベルより増えていない");
                        }
                    }
                }
            }

            if (t.StarMultipliers.Count != DataConstants.StarSteps
                || t.StarMaxLv.Count != DataConstants.StarSteps
                || t.AwakenCost.Count != DataConstants.StarSteps)
            {
                Error(issues, "STAR_TABLE", at, "★の表が " + DataConstants.StarSteps + " 個ではない");
            }
            else
            {
                int total = 0;
                foreach (int cost in t.AwakenCost)
                {
                    total += cost;
                }
                if (total != DataConstants.AwakenCostTotal)
                {
                    Error(issues, "AWAKEN_SUM", at + ":awakenCost", "覚醒の必要枚数の合計が " + DataConstants.AwakenCostTotal + " ではない: " + total);
                }
            }

            foreach (Role role in new[] { Role.Ranged, Role.Melee, Role.Defense, Role.Heal, Role.Disrupt })
            {
                if (!t.RoleMultipliers.ContainsKey(EnumStringConverter.Text(role)))
                {
                    Error(issues, "ROLE_MULTIPLIER_MISSING", at + ":roleMultipliers", "役割の倍率が無い: " + EnumStringConverter.Text(role));
                }
            }

            foreach (SkillKind kind in new[] { SkillKind.Normal, SkillKind.Special, SkillKind.Ultimate })
            {
                IReadOnlyList<int> stars = t.SkillRankStars.Get(kind);
                if (stars.Count != 2 || stars[0] >= stars[1])
                {
                    Error(issues, "SKILL_RANK_STARS", at + ":skillRankStars", "スキルのランクの境目が [小, 大] の2つではない: " + kind);
                }
            }
        }

        // ---- rewards.json ----

        private static void CheckRewards(GameData d, List<DataIssue> issues)
        {
            RewardsConfig r = d.Rewards;
            string at = DataLoader.RewardsFile;
            if (r.ExpPerEnemy.Count != d.Difficulty.Ranks)
            {
                Error(issues, "REWARDS", at + ":expPerEnemy", "ランク1〜" + d.Difficulty.Ranks + " の行数ではない: " + r.ExpPerEnemy.Count);
            }
            for (int i = 0; i < r.ExpPerEnemy.Count; i++)
            {
                if (!(r.ExpPerEnemy[i] > 0))
                {
                    Error(issues, "REWARDS", at + ":expPerEnemy[" + i + "]", "経験値は正の数");
                }
            }
            if (!(r.PaceSlack > 0) || r.EnemiesPerWave < 1 || r.EnemiesPerBoss < 1)
            {
                Error(issues, "REWARDS", at, "paceSlack は正の数、enemiesPerWave・enemiesPerBoss は1以上");
            }
            if (!(r.IdleCapHours > 0) || !(r.IdleKillsPerMinute > 0) || r.IdleCoinPerExp < 0 || r.IdleBondHeartPerHour < 0)
            {
                Error(issues, "REWARDS", at, "idleCapHours・idleKillsPerMinute は正の数、idleCoinPerExp・idleBondHeartPerHour は0以上");
            }
        }

        // ---- memory_cards.json ----

        private static void CheckMemoryCards(GameData d, List<DataIssue> issues)
        {
            MemoryCardsConfig m = d.MemoryCards;
            string at = DataLoader.MemoryCardsFile;
            if (m.MaxCardLv < 1 || m.LevelOffset < 0 || m.SubRefLv < 1 || !(m.PullCostBondHeart > 0)
                || !(m.GachaLvCostBase > 0) || !(m.GachaLvCostGrowth >= 1.0) || m.SellCoinBase < 0)
            {
                Error(issues, "MEMORY_CARDS", at, "maxCardLv・subRefLv は1以上、levelOffset は0以上、費用は正の数（成長率は1以上）");
            }
            FixedUnitScale u = m.FixedUnitScale;
            if (!(u.Hp > 0) || !(u.Atk > 0) || !(u.Def > 0))
            {
                Error(issues, "MEMORY_CARDS", at + ":fixedUnitScale", "単位換算は正の数");
            }
            if (m.Rarities.Count == 0) { Error(issues, "MEMORY_CARDS", at + ":rarities", "レアリティが1つも無い"); }
            var seen = new HashSet<string>();
            double prevMain = 0;
            for (int i = 0; i < m.Rarities.Count; i++)
            {
                MemoryRarityDef r = m.Rarities[i];
                string where = at + ":rarities[" + i + "]";
                if (string.IsNullOrEmpty(r.Id) || !seen.Add(r.Id)) { Error(issues, "MEMORY_CARDS", where, "レアリティの ID が空か重複: " + r.Id); }
                if (!(r.MainCoefMin > 0) || r.MainCoefMax < r.MainCoefMin || !(r.SpeedCoef > 0)
                    || !(r.SpeedStatCoefMin > 0) || r.SpeedStatCoefMax < r.SpeedStatCoefMin || !(r.SubScale > 0)
                    || !(r.FixedHp > 0) || !(r.FixedAtk > 0) || !(r.FixedDef > 0))
                {
                    Error(issues, "MEMORY_CARDS", where, "係数は正の数で、Min ≤ Max");
                }
                if (r.MainCoefMin < prevMain) { Error(issues, "MEMORY_CARDS", where, "メイン係数が弱いほうから強いほうへ並んでいない"); }
                prevMain = r.MainCoefMin;
            }
            if (m.SubEffects.Count < 2) { Error(issues, "MEMORY_CARDS", at + ":subEffects", "サブ効果は2種類以上要る（カードに2つ付く）"); }
            var subSeen = new HashSet<SubstatKey>();
            foreach (MemorySubEffectDef s in m.SubEffects)
            {
                if (!subSeen.Add(s.Stat) || !(s.Min > 0) || s.Max < s.Min) { Error(issues, "MEMORY_CARDS", at + ":subEffects", "サブ効果が重複か、幅が正しくない: " + s.Stat); }
            }
            if (m.GachaBands.Count == 0 || m.GachaBands[0].MinLv != 1) { Error(issues, "MEMORY_CARDS", at + ":gachaBands", "最初の帯は minLv 1"); }
            for (int i = 0; i < m.GachaBands.Count; i++)
            {
                GachaBand b = m.GachaBands[i];
                string where = at + ":gachaBands[" + i + "]";
                if (i > 0 && b.MinLv <= m.GachaBands[i - 1].MinLv) { Error(issues, "MEMORY_CARDS", where, "minLv が昇順ではない"); }
                if (b.MinLv > m.MaxCardLv) { Error(issues, "MEMORY_CARDS", where, "minLv が上限より大きい"); }
                double sum = 0;
                bool negative = false;
                foreach (double w in b.Weights) { sum += w; negative |= w < 0; }
                if (b.Weights.Count != m.Rarities.Count || negative || System.Math.Abs(sum - 100.0) > 1e-6)
                {
                    Error(issues, "MEMORY_CARDS", where, "排出率はレアリティと同じ数で、負でなく、合計100");
                }
            }
        }

        // ---- leader_temple.json ----

        private static void CheckLeaderTemple(GameData d, List<DataIssue> issues)
        {
            LeaderTempleConfig t = d.LeaderTemple;
            string at = DataLoader.LeaderTempleFile;
            if (t.LvPct.Count != t.MaxLv || t.MaxLv < 2)
            {
                Error(issues, "LEADER_TEMPLE", at + ":lvPct", "lvPct の長さが maxLv（2以上）と違う: " + t.LvPct.Count);
            }
            else
            {
                for (int i = 0; i < t.LvPct.Count; i++)
                {
                    if (t.LvPct[i] < 0 || (i > 0 && t.LvPct[i] < t.LvPct[i - 1]))
                    {
                        Error(issues, "LEADER_TEMPLE", at + ":lvPct[" + i + "]", "負か、前のLvより小さい");
                    }
                }
            }
            if (!(t.ExpCostBase > 0) || !(t.ExpCostGrowth >= 1.0) || t.ExpCostBaseLv < 1 || t.ShardCostPerLv < 1
                || t.RewardEveryLv < 1 || t.RewardMinLv < 1 || t.RewardCrystalPerLv < 1)
            {
                Error(issues, "LEADER_TEMPLE", at, "費用・報酬の数値は正（成長率は1以上）");
            }
        }

        // ---- enemy_kits.json ----

        private static void CheckEnemyKits(GameData d, List<DataIssue> issues)
        {
            EnemyKitsConfig k = d.EnemyKits;
            string at = DataLoader.EnemyKitsFile;
            var skillIds = new HashSet<string>();
            foreach (EnemySkillDef s in k.Skills)
            {
                if (!skillIds.Add(s.Id)) { Error(issues, "ID_DUPLICATE", at + ":" + s.Id, "ID が重複している"); }
                CheckBody(d, s, at + ":" + s.Id, issues);
            }
            foreach (KeyValuePair<string, IReadOnlyList<string>> role in k.RoleSkills)
            {
                foreach (string id in role.Value)
                {
                    if (!skillIds.Contains(id)) { Error(issues, "ENEMY_KITS", at + ":roleSkills/" + role.Key, "知らないスキル " + id); }
                }
            }
            var traitIds = new HashSet<string>();
            foreach (BossTraitDef t in k.Traits)
            {
                if (!traitIds.Add(t.Id)) { Error(issues, "ID_DUPLICATE", at + ":" + t.Id, "ID が重複している"); }
                if (t.Skills != null)
                {
                    foreach (string id in t.Skills)
                    {
                        if (!skillIds.Contains(id)) { Error(issues, "ENEMY_KITS", at + ":" + t.Id, "知らないスキル " + id); }
                    }
                }
                if (t.ResistElement.HasValue != t.ResistMultiplier.HasValue || (t.ResistMultiplier.HasValue && !(t.ResistMultiplier.Value > 0)))
                {
                    Error(issues, "ENEMY_KITS", at + ":" + t.Id, "resistElement と resistMultiplier は組で、倍率は正");
                }
                if ((t.AtkMultiplier.HasValue && !(t.AtkMultiplier.Value > 0)) || (t.CritDamageMultiplier.HasValue && !(t.CritDamageMultiplier.Value > 0)))
                {
                    Error(issues, "ENEMY_KITS", at + ":" + t.Id, "倍率は正");
                }
            }
            foreach (string id in k.FinalBossTraits)
            {
                if (!traitIds.Contains(id)) { Error(issues, "ENEMY_KITS", at + ":finalBossTraits", "知らない特徴 " + id); }
            }
            for (int i = 0; i < k.BossPlan.Count; i++)
            {
                BossPlanRow r = k.BossPlan[i];
                string where = at + ":bossPlan[" + i + "]";
                if (r.FromRank < 1 || r.ToRank < r.FromRank || r.ToRank > d.Difficulty.Ranks)
                {
                    Error(issues, "ENEMY_KITS", where, "ランクの範囲が正しくない");
                }
                foreach (string id in r.Traits)
                {
                    if (!traitIds.Contains(id)) { Error(issues, "ENEMY_KITS", where, "知らない特徴 " + id); }
                }
                for (int j = 0; j < i; j++)
                {
                    BossPlanRow o = k.BossPlan[j];
                    if (r.FromRank <= o.ToRank && o.FromRank <= r.ToRank) { Error(issues, "ENEMY_KITS", where, "ランクの範囲が他の行と重なる"); }
                }
            }
        }

        // ---- plazas.json ----

        private static void CheckPlazas(GameData d, List<DataIssue> issues)
        {
            string at = DataLoader.PlazasFile;
            var ids = new HashSet<string>();
            foreach (PlazaDef p in d.Plazas.Plazas)
            {
                string where = at + ":" + p.Id;
                if (string.IsNullOrEmpty(p.Id) || !ids.Add(p.Id)) { Error(issues, "PLAZAS", where, "ID が空か重複"); }
                if (!d.TryCurrency(p.CurrencyId, out _)) { Error(issues, "PLAZAS", where, "マスタに無い通貨 " + p.CurrencyId); }
                if (p.MaxLv < 2 || !(p.PctPerLv > 0) || !(p.CostAtLv > 0) || p.CostLv < 1 || p.CostLv >= p.MaxLv || !(p.CostGrowth >= 1.0) || p.KnotLv < 2 || p.KnotLv > p.MaxLv || !(p.KnotPct > 0))
                {
                    Error(issues, "PLAZAS", where, "maxLv は2以上、増加％・費用は正、costLv は 1 以上 maxLv 未満、成長率は1以上、knotLv は 2〜maxLv、knotPct は正");
                }
            }
        }

        // ---- trials.json ----

        private static void CheckTrials(GameData d, List<DataIssue> issues)
        {
            string at = DataLoader.TrialsFile;
            var ids = new HashSet<string>();
            var traitIds = new HashSet<string>();
            foreach (BossTraitDef t in d.EnemyKits.Traits) { traitIds.Add(t.Id); }
            foreach (TrialDef t in d.Trials.Trials)
            {
                string where = at + ":" + t.Id;
                if (string.IsNullOrEmpty(t.Id) || !ids.Add(t.Id)) { Error(issues, "TRIALS", where, "ID が空か重複"); }
                if (!(t.TimeLimitSec > 0) || t.Fights < 1 || t.LevelOnClear < 1 || !(t.PowerBase > 0) || !(t.PowerGrowth >= 1.0)
                    || t.StatRank < 1 || t.StatRank > d.Difficulty.Ranks)
                {
                    Error(issues, "TRIALS", where, "制限時間・戦力は正、連戦・Lv上昇は1以上、成長率は1以上、statRank は1〜ランク数");
                }
                if (t.RewardPerLv.Count == 0) { Error(issues, "TRIALS", where, "報酬が無い"); }
                foreach (TrialReward r in t.RewardPerLv)
                {
                    if (!d.TryCurrency(r.CurrencyId, out _) || !(r.Amount > 0)) { Error(issues, "TRIALS", where, "報酬の通貨が無いか、量が正でない: " + r.CurrencyId); }
                }
                if (t.Gate != null && (!(t.Gate.ChargePerDay > 0) || (t.Gate.Cap.HasValue && t.Gate.Cap.Value < 1)))
                {
                    Error(issues, "TRIALS", where, "gate：chargePerDay は正、cap は1以上");
                }
                foreach (string id in t.Traits)
                {
                    if (!traitIds.Contains(id)) { Error(issues, "TRIALS", where, "知らない特徴 " + id); }
                }
            }
        }

        // ---- supports.json ----

        private static void CheckSupports(GameData d, List<DataIssue> issues)
        {
            string at = DataLoader.SupportsFile;
            var ids = new HashSet<string>();
            foreach (SupportDef s in d.Supports.Supports)
            {
                string where = at + ":" + s.Id;
                if (string.IsNullOrEmpty(s.Id) || !ids.Add(s.Id)) { Error(issues, "SUPPORTS", where, "ID が空か重複"); }
                if (!(s.IntervalSec > 0) || s.StarDurationBonusSec < 0 || s.UnlockLv < 1 || s.Effects.Count == 0)
                {
                    Error(issues, "SUPPORTS", where, "intervalSec は正、★ごとの延長は0以上、unlockLv は1以上、effects は1つ以上");
                }
                if (!d.Trials.TryGet(s.UnlockTrial, out _)) { Error(issues, "SUPPORTS", where, "マスタに無い試練 " + s.UnlockTrial); }
                // 効果の中身は、スキルと同じ検査（buffId・段階・必須項目）
                CheckBody(d, new SupportBody(s), where, issues);
            }
        }

        /// <summary>サポートの効果を、スキルと同じ検査にかけるための入れ物（interval で発動するスキルとして見る）。</summary>
        private sealed class SupportBody : SkillDefBase
        {
            public SupportBody(SupportDef s) : base(s.Id, new TriggerDef { Type = TriggerType.Interval, EverySec = s.IntervalSec }, s.Effects) { }
        }

        // ---- dragon_nest.json ----

        public static readonly string[] DragonStatKeys = { "atk", "hp", "def", "critRatePct", "accuracyPct", "evasionPct", "critResistPct", "critDamagePct", "critDefensePct" };

        private static void CheckDragonNest(GameData d, List<DataIssue> issues)
        {
            DragonNestConfig n = d.DragonNest;
            string at = DataLoader.DragonNestFile;
            if (n.Blocks < 1 || !(n.BlockMultiplier >= 1.0) || n.UnlockLv < 1 || n.Tiers.Count == 0)
            {
                Error(issues, "DRAGON_NEST", at, "blocks・unlockLv は1以上、blockMultiplier は1以上、tiers が1つ以上");
            }
            var known = new HashSet<string>(DragonStatKeys);
            var ids = new HashSet<string>();
            foreach (DragonTierDef t in n.Tiers)
            {
                string where = at + ":" + t.Id;
                if (string.IsNullOrEmpty(t.Id) || !ids.Add(t.Id)) { Error(issues, "DRAGON_NEST", where, "ID が空か重複"); }
                if (t.Kind != "pct" && t.Kind != "sub") { Error(issues, "DRAGON_NEST", where, "kind は pct か sub"); }
                if (!(t.PerLv > 0) || t.MaxLv < 1 || t.CostBase < 0 || t.CostStep < 0 || (t.FirstLv.HasValue && !(t.FirstLv.Value > 0)))
                {
                    Error(issues, "DRAGON_NEST", where, "perLv は正、maxLv は1以上、費用は0以上");
                }
                if (t.Stats.Count == 0) { Error(issues, "DRAGON_NEST", where, "stats が空"); }
                foreach (string stat in t.Stats)
                {
                    if (!known.Contains(stat)) { Error(issues, "DRAGON_NEST", where, "知らないステータス " + stat); }
                    else if (t.Kind == "pct" && stat != "atk" && stat != "hp" && stat != "def") { Error(issues, "DRAGON_NEST", where, "pct の段は atk・hp・def だけ: " + stat); }
                    else if (t.Kind == "sub" && (!n.SubPerLv.TryGetValue(stat, out double v) || !(v > 0))) { Error(issues, "DRAGON_NEST", where, "subPerLv に無い（か正でない）: " + stat); }
                }
            }
        }

        // ---- spirit_stones.json ----

        public static readonly string[] StoneStatKeys = { "evasionPct", "accuracyPct", "critRatePct", "critResistPct", "critDamagePct", "critDefensePct" };

        private static void CheckSpiritStones(GameData d, List<DataIssue> issues)
        {
            SpiritStonesConfig c = d.SpiritStones;
            string at = DataLoader.SpiritStonesFile;
            if (c.MaxStones < 1 || c.MaxLv < 2 || c.Pages < 1 || !(c.LevelCostBase > 0) || c.DropsPerClear < 1 || c.SlotMainStat.Count == 0)
            {
                Error(issues, "SPIRIT_STONES", at, "maxStones・pages・dropsPerClear は1以上、maxLv は2以上、levelCostBase は正、slotMainStat が1つ以上");
            }
            foreach (string stat in c.SlotMainStat)
            {
                if (stat != "atk" && stat != "hp" && stat != "def") { Error(issues, "SPIRIT_STONES", at + ":slotMainStat", "メイン効果は atk・hp・def: " + stat); }
            }
            if (c.Rarities.Count == 0) { Error(issues, "SPIRIT_STONES", at + ":rarities", "レアが1つも無い"); }
            double drop = 0, prevMain = 0;
            var ids = new HashSet<string>();
            foreach (StoneRarityDef r in c.Rarities)
            {
                string where = at + ":" + r.Id;
                if (string.IsNullOrEmpty(r.Id) || !ids.Add(r.Id)) { Error(issues, "SPIRIT_STONES", where, "ID が空か重複"); }
                if (!(r.MainPerLv > 0) || !(r.SubBase > 0) || r.DropPct < 0 || !(r.SandBase > 0)) { Error(issues, "SPIRIT_STONES", where, "係数は正（ドロップ率は0以上）"); }
                if (r.MainPerLv < prevMain) { Error(issues, "SPIRIT_STONES", where, "メイン効果が弱いほうから強いほうへ並んでいない"); }
                prevMain = r.MainPerLv;
                drop += r.DropPct;
            }
            if (c.Rarities.Count > 0 && System.Math.Abs(drop - 100.0) > 1e-6) { Error(issues, "SPIRIT_STONES", at + ":rarities", "ドロップ率の合計が100ではない: " + drop); }
            var known = new HashSet<string>(StoneStatKeys);
            int prevLv = 0;
            foreach (StoneSubDef s in c.SubOrder)
            {
                if (!known.Contains(s.Stat) || s.AppearLv <= prevLv || s.AppearLv > c.MaxLv) { Error(issues, "SPIRIT_STONES", at + ":subOrder", "隠し能力が知らないステータスか、現れるLv が昇順・範囲内でない: " + s.Stat); }
                prevLv = s.AppearLv;
            }
            var cons = new HashSet<string>();
            foreach (ConstellationDef k in c.Constellations)
            {
                if (string.IsNullOrEmpty(k.Id) || !cons.Add(k.Id) || !known.Contains(k.SetStat) || !(k.Set2 > 0) || k.Set4 < k.Set2)
                {
                    Error(issues, "SPIRIT_STONES", at + ":constellations", "星座が空・重複、ステータスが不明、set4 が set2 未満: " + k.Id);
                }
            }
            if (c.Constellations.Count == 0) { Error(issues, "SPIRIT_STONES", at + ":constellations", "星座が1つも無い"); }
        }

        // ---- difficulty.json ----

        private static void CheckDifficulty(GameData d, List<DataIssue> issues)
        {
            DifficultyConfig df = d.Difficulty;
            string at = DataLoader.DifficultyFile;
            if (df.EnemyScale.Count != df.Ranks)
            {
                Error(issues, "ENEMY_SCALE", at + ":enemyScale", "ランク1〜" + df.Ranks + " の行数ではない: " + df.EnemyScale.Count);
            }
            else
            {
                for (int i = 0; i < df.EnemyScale.Count; i++)
                {
                    if (df.EnemyScale[i].Rank != i + 1)
                    {
                        Error(issues, "ENEMY_SCALE", at + ":enemyScale[" + i + "]", "rank が " + (i + 1) + " ではない");
                    }
                }
            }
            // growth が全ランクをすき間なく覆っているか。
            for (int rank = 1; rank <= df.Ranks; rank++)
            {
                int covered = 0;
                foreach (GrowthStep g in df.Growth)
                {
                    if (g.FromRank <= rank && rank <= g.ToRank)
                    {
                        covered++;
                    }
                }
                if (covered != 1)
                {
                    Error(issues, "GROWTH_COVERAGE", at + ":growth", "ランク" + rank + " を覆う区間が " + covered + " 個ある（1個であるべき）");
                }
            }
        }

        private static void Error(List<DataIssue> issues, string code, string path, string message)
        {
            issues.Add(new DataIssue(DataSeverity.Error, code, message, path));
        }
    }
}

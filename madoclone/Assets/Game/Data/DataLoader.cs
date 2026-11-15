using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace Mado.Data
{
    /// <summary>読み込みの結果。Data は、読み込み（JSON の型変換）に失敗したファイルがあると null。</summary>
    public sealed class DataLoadResult
    {
        public GameData Data { get; }
        public IReadOnlyList<DataIssue> Issues { get; }

        public DataLoadResult(GameData data, IReadOnlyList<DataIssue> issues)
        {
            Data = data;
            Issues = issues;
        }

        public bool HasErrors
        {
            get
            {
                for (int i = 0; i < Issues.Count; i++)
                {
                    if (Issues[i].Severity == DataSeverity.Error)
                    {
                        return true;
                    }
                }
                return false;
            }
        }
    }

    /// <summary>
    /// マスタ JSON を読む。手順：全ファイルを読む → 型に変換（未知の項目・未知の列挙値・必須項目の抜け・
    /// 長さの違うランク配列はエラー）→ GameData を作る → DataValidator で検証。
    /// エラーは1つ目で止めず、集められるだけ集める。
    /// </summary>
    public static class DataLoader
    {
        public const string CharactersFile = "characters.json";
        public const string SkillsFile = "skills.json";
        public const string CrystalsFile = "crystals.json";
        public const string BuffsFile = "buffs.json";
        public const string TiersFile = "tiers.json";
        public const string CurrenciesFile = "currencies.json";
        public const string SystemFile = "system.json";
        public const string StatTablesFile = "stat_tables.json";
        public const string DifficultyFile = "difficulty.json";
        public const string TextFile = "text/ja.json";

        /// <summary>読み込むファイルの一覧。</summary>
        public static readonly IReadOnlyList<string> FileNames = new[]
        {
            CharactersFile, SkillsFile, CrystalsFile, BuffsFile, TiersFile,
            CurrenciesFile, SystemFile, StatTablesFile, DifficultyFile, TextFile,
        };

        private static readonly JsonSerializerSettings Settings = CreateSettings();

        private static JsonSerializerSettings CreateSettings()
        {
            return new JsonSerializerSettings
            {
                // JSON にあって型に無い項目はエラー（JSON Schema の additionalProperties: false と同じ）。
                MissingMemberHandling = MissingMemberHandling.Error,
                DateParseHandling = DateParseHandling.None,
                FloatParseHandling = FloatParseHandling.Double,
                Converters = new List<JsonConverter> { new EnumStringConverter(), new RankedConverter() },
            };
        }

        /// <summary>FILE_MISSING の例外。</summary>
        public static DataException FileMissing(string relativePath, string fullPath)
        {
            return new DataException(new[]
            {
                new DataIssue(DataSeverity.Error, "FILE_MISSING", "ファイルが無い: " + fullPath, relativePath),
            });
        }

        /// <summary>読み込んで検証する。エラーが1件でもあれば DataException（問題の一覧つき）。警告だけなら読み込めた GameData を返す。</summary>
        public static GameData Load(IDataSource source)
        {
            DataLoadResult result = LoadWithIssues(source);
            if (result.HasErrors)
            {
                var errors = new List<DataIssue>();
                foreach (DataIssue issue in result.Issues)
                {
                    if (issue.Severity == DataSeverity.Error)
                    {
                        errors.Add(issue);
                    }
                }
                throw new DataException(errors);
            }
            return result.Data;
        }

        /// <summary>例外にせず、問題の一覧（警告も）を返す。Mado.Sim の validate が使う。</summary>
        public static DataLoadResult LoadWithIssues(IDataSource source)
        {
            if (source == null)
            {
                throw new ArgumentNullException(nameof(source));
            }
            var issues = new List<DataIssue>();

            ItemsFile<CharacterDef> characters = Parse<ItemsFile<CharacterDef>>(source, CharactersFile, issues);
            ItemsFile<SkillDef> skills = Parse<ItemsFile<SkillDef>>(source, SkillsFile, issues);
            ItemsFile<CrystalDef> crystals = Parse<ItemsFile<CrystalDef>>(source, CrystalsFile, issues);
            BuffTable buffs = Parse<BuffTable>(source, BuffsFile, issues);
            ItemsFile<TierDef> tiers = Parse<ItemsFile<TierDef>>(source, TiersFile, issues);
            ItemsFile<CurrencyDef> currencies = Parse<ItemsFile<CurrencyDef>>(source, CurrenciesFile, issues);
            SystemConfig system = Parse<SystemConfig>(source, SystemFile, issues);
            StatTables stats = Parse<StatTables>(source, StatTablesFile, issues);
            DifficultyConfig difficulty = Parse<DifficultyConfig>(source, DifficultyFile, issues);
            Dictionary<string, string> texts = Parse<Dictionary<string, string>>(source, TextFile, issues);

            foreach (DataIssue issue in issues)
            {
                if (issue.Severity == DataSeverity.Error)
                {
                    return new DataLoadResult(null, issues);
                }
            }

            CheckSchemaVersions(issues, characters.SchemaVersion, skills.SchemaVersion, crystals.SchemaVersion,
                buffs.SchemaVersion, tiers.SchemaVersion, currencies.SchemaVersion,
                system.SchemaVersion, stats.SchemaVersion, difficulty.SchemaVersion);

            var data = new GameData(
                system, stats, difficulty, buffs,
                tiers.Items, characters.Items, skills.Items, crystals.Items, currencies.Items,
                new TextTable(texts));
            issues.AddRange(DataValidator.Validate(data));
            return new DataLoadResult(data, issues);
        }

        private static T Parse<T>(IDataSource source, string file, List<DataIssue> issues) where T : class
        {
            string text;
            try
            {
                text = source.ReadText(file);
            }
            catch (DataException ex)
            {
                issues.AddRange(ex.Issues);
                return null;
            }
            try
            {
                T value = JsonConvert.DeserializeObject<T>(text, Settings);
                if (value == null)
                {
                    issues.Add(new DataIssue(DataSeverity.Error, "JSON_PARSE", "中身が空（null）", file));
                }
                return value;
            }
            catch (JsonException ex)
            {
                issues.Add(new DataIssue(DataSeverity.Error, "JSON_PARSE", ex.Message, file));
                return null;
            }
        }

        private static void CheckSchemaVersions(List<DataIssue> issues, params int[] versions)
        {
            for (int i = 0; i < versions.Length; i++)
            {
                if (versions[i] != DataConstants.SchemaVersion)
                {
                    issues.Add(new DataIssue(DataSeverity.Error, "SCHEMA_VERSION",
                        "schemaVersion が " + versions[i] + "（このプログラムは " + DataConstants.SchemaVersion + " を読む）", FileNames[i]));
                }
            }
        }
    }

    /// <summary>{ "schemaVersion": 1, "items": [...] } という形のファイルのルート。</summary>
    [JsonObject(ItemRequired = Required.Always)]
    public sealed class ItemsFile<T>
    {
        public int SchemaVersion { get; init; }
        public IReadOnlyList<T> Items { get; init; }
    }
}

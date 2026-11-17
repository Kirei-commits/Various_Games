using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json.Nodes;
using Json.Schema;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>マスタの検証（docs/04 4節）。①Schemas/*.schema.json で検査 ②DataLoader＋DataValidator ③警告の扱い（--strict）。</summary>
    public static class ValidateCommand
    {
        public static int Run(Options o)
        {
            bool strict = o.Has("--strict");
            string dataDir = o.Get("--data", null) ?? Paths.Data();
            string schemaDir = o.Get("--schemas", null) ?? Paths.Schemas();
            int errors = 0, warnings = 0;

            foreach (string schemaPath in Directory.GetFiles(schemaDir, "*.schema.json"))
            {
                string name = Path.GetFileName(schemaPath).Replace(".schema.json", ".json");
                string dataPath = Path.Combine(dataDir, name);
                if (!File.Exists(dataPath))
                {
                    Console.WriteLine("エラー: スキーマはあるがデータが無い: " + name);
                    errors++;
                    continue;
                }
                JsonSchema schema = JsonSchema.FromText(File.ReadAllText(schemaPath));
                JsonNode node = JsonNode.Parse(File.ReadAllText(dataPath));
                EvaluationResults result = schema.Evaluate(node, new EvaluationOptions { OutputFormat = OutputFormat.List });
                if (result.IsValid) { continue; }
                foreach (EvaluationResults d in result.Details)
                {
                    if (d.IsValid || d.Errors == null) { continue; }
                    foreach (KeyValuePair<string, string> e in d.Errors)
                    {
                        Console.WriteLine("エラー: [schema] " + name + " " + d.InstanceLocation + ": " + e.Value);
                        errors++;
                    }
                }
            }

            DataLoadResult load = DataLoader.LoadWithIssues(new FileDataSource(dataDir));
            foreach (DataIssue i in load.Issues)
            {
                bool isError = i.Severity == DataSeverity.Error || strict;
                Console.WriteLine((isError ? "エラー: " : "警告: ") + i);
                if (isError) { errors++; } else { warnings++; }
            }
            try { SimProfiles.Load(new FileDataSource(dataDir)); }
            catch (DataException e) { Console.WriteLine("エラー: " + e.Message); errors++; }

            if (load.Data != null)
            {
                GameData d = load.Data;
                Console.WriteLine("validate(C#): エラー " + errors + "、警告 " + warnings + "（キャラ " + d.Characters.Count + "、スキル " + d.Skills.Count + "、魔晶 " + d.Crystals.Count + "、バフ " + d.Buffs.Items.Count + "）");
            }
            else { Console.WriteLine("validate(C#): エラー " + errors + "、警告 " + warnings); }
            return errors > 0 ? 1 : 0;
        }
    }
}

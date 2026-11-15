using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text;
using Mado.Data;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Mado.Core.Save
{
    /// <summary>セーブのバイト列への書き出し・読み込み、エクスポート／インポート（docs/04 6.1節）。</summary>
    public static class SaveCodec
    {
        public const string ExportPrefix = "MADOSAVE1:";
        private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false);

        public static byte[] Serialize(SaveData save)
        {
            JObject o = SaveJson.ToJObject(save);
            return Utf8.GetBytes(o.ToString(Formatting.None));
        }

        public static LoadResult Load(byte[] bytes, GameData data, SaveMigrator migrator = null)
        {
            if (bytes == null || bytes.Length == 0) { return LoadResult.Fail("セーブが空"); }
            string json;
            try { json = new UTF8Encoding(false, true).GetString(bytes); }
            catch (Exception) { return LoadResult.Fail("UTF-8 として読めない"); }
            return LoadJson(json, data, migrator ?? new SaveMigrator());
        }

        public static LoadResult LoadJson(string json, GameData data, SaveMigrator migrator)
        {
            JObject root;
            try
            {
                using (var reader = new JsonTextReader(new StringReader(json)) { DateParseHandling = DateParseHandling.None })
                {
                    JToken t = JToken.Load(reader);
                    root = t as JObject;
                }
            }
            catch (Exception e) { return LoadResult.Fail("JSON として読めない: " + e.Message, json); }
            if (root == null) { return LoadResult.Fail("最上位が JSON オブジェクトではない", json); }

            JToken fmt = root["format"];
            if (fmt == null || fmt.Type != JTokenType.String || fmt.Value<string>() != SaveData.FormatName)
            {
                return LoadResult.Fail("format が \"" + SaveData.FormatName + "\" ではない", json);
            }
            JToken ver = root["saveVersion"];
            if (ver == null || ver.Type != JTokenType.Integer) { return LoadResult.Fail("saveVersion が整数ではない", json); }

            string error;
            JObject migrated = migrator.Migrate(root, ver.Value<int>(), out error);
            if (migrated == null) { return LoadResult.Fail(error, json); }

            var issues = new List<SaveIssue>();
            SaveData save;
            try { save = SaveJson.FromJObject(migrated, data, issues); }
            catch (SaveFormatException e) { return LoadResult.Fail(e.Message, json); }

            issues.AddRange(SaveValidator.Validate(save, data));
            return new LoadResult(true, save, null, issues, json);
        }

        /// <summary>MADOSAVE1: ＋ base64(gzip(UTF-8 JSON))。</summary>
        public static string Export(SaveData save)
        {
            byte[] raw = Serialize(save);
            using (var ms = new MemoryStream())
            {
                using (var gz = new GZipStream(ms, CompressionMode.Compress, true)) { gz.Write(raw, 0, raw.Length); }
                return ExportPrefix + Convert.ToBase64String(ms.ToArray());
            }
        }

        /// <summary>形式・版・検証（SaveValidator）を通ったものだけ受け入れる。検証でエラーが出たら失敗にする。</summary>
        public static LoadResult Import(string text, GameData data, SaveMigrator migrator = null)
        {
            if (text == null) { return LoadResult.Fail("入力が無い"); }
            text = text.Trim();
            if (!text.StartsWith(ExportPrefix, StringComparison.Ordinal)) { return LoadResult.Fail("先頭が " + ExportPrefix + " ではない"); }
            byte[] raw;
            try
            {
                byte[] gz = Convert.FromBase64String(text.Substring(ExportPrefix.Length));
                using (var input = new MemoryStream(gz))
                using (var g = new GZipStream(input, CompressionMode.Decompress))
                using (var output = new MemoryStream())
                {
                    g.CopyTo(output);
                    raw = output.ToArray();
                }
            }
            catch (Exception e) { return LoadResult.Fail("展開できない: " + e.Message); }

            LoadResult r = Load(raw, data, migrator);
            if (r.Success && r.HasErrors) { return new LoadResult(false, null, "検証でエラー: " + FirstError(r), r.Issues, r.OriginalJson); }
            return r;
        }

        /// <summary>エクスポートのファイル名。開発者モードのセーブには -dev を付ける。</summary>
        public static string ExportFileName(SaveData save)
        {
            return "madoclone-save" + (save.DevMode ? "-dev" : "") + ".txt";
        }

        private static string FirstError(LoadResult r)
        {
            foreach (SaveIssue i in r.Issues) { if (i.Severity == SaveSeverity.Error) { return i.ToString(); } }
            return "";
        }
    }
}

using System;
using System.IO;

namespace Mado.Sim
{
    public static class Program
    {
        private const string Usage =
@"Mado.Sim — 開発用のコンソール
  validate [--strict] [--data DIR] [--schemas DIR]   マスタ JSON の検証（スキーマ＋型への読み込み＋DataValidator）
  golden [--update] [--generate]                      ゴールデン（解決済み BattleSetup のハッシュ）の確認・更新
  battle (--setup FILE | --case NAME) [--n 1000] [--seed0 1] [--factor X]   1,000戦（--case では敵の戦力倍率を上書きできる）などを回して勝率・決着時間・ダメージを表示
";

        public static int Main(string[] args)
        {
            if (args.Length == 0) { Console.Error.Write(Usage); return 2; }
            string cmd = args[0];
            var opts = new Options(args, 1);
            try
            {
                switch (cmd)
                {
                    case "validate": return ValidateCommand.Run(opts);
                    case "golden": return GoldenCommand.Run(opts);
                    case "battle": return BattleCommand.Run(opts);
                    default:
                        Console.Error.Write(Usage);
                        return 2;
                }
            }
            catch (Exception e) when (e is IOException || e is Mado.Data.DataException || e is ArgumentException)
            {
                Console.Error.WriteLine("エラー: " + e.Message);
                return 1;
            }
        }
    }

    /// <summary>--name value と --flag だけの簡単な引数。</summary>
    public sealed class Options
    {
        private readonly string[] _a;
        private readonly int _from;

        public Options(string[] args, int from) { _a = args; _from = from; }

        public bool Has(string name)
        {
            for (int i = _from; i < _a.Length; i++) { if (_a[i] == name) { return true; } }
            return false;
        }

        public string Get(string name, string fallback = null)
        {
            for (int i = _from; i < _a.Length - 1; i++) { if (_a[i] == name) { return _a[i + 1]; } }
            return fallback;
        }

        public int GetInt(string name, int fallback)
        {
            string v = Get(name);
            return v == null ? fallback : int.Parse(v, System.Globalization.CultureInfo.InvariantCulture);
        }
    }

    public static class Paths
    {
        /// <summary>カレントから上へたどって、Assets/Game がある場所（リポジトリのルート）を探す。</summary>
        public static string Root()
        {
            foreach (string start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
            {
                for (DirectoryInfo d = new DirectoryInfo(start); d != null; d = d.Parent)
                {
                    if (Directory.Exists(Path.Combine(d.FullName, "Assets", "Game", "Data"))) { return d.FullName; }
                }
            }
            throw new DirectoryNotFoundException("リポジトリのルート（Assets/Game/Data）が見つからない");
        }

        public static string Data() { return Path.Combine(Root(), "Assets", "Game", "Data", "Json"); }
        public static string Schemas() { return Path.Combine(Root(), "Schemas"); }
        public static string Golden() { return Path.Combine(Root(), "Assets", "Game", "Tests", "Core", "Golden"); }
    }
}

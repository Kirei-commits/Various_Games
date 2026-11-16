using System;
using System.IO;
using Mado.Data;
using Mado.Data.Tests;

namespace Mado.Core.Tests
{
    /// <summary>Core のテストが共有する実データ（1回だけ読む）と、リポジトリの中のファイルの探し方。</summary>
    internal static class TestData
    {
        private static GameData _data;

        public static GameData Data
        {
            get { return _data ?? (_data = DataLoader.Load(TestPaths.RealSource())); }
        }

        public static string FindDataDir() { return TestPaths.DataDir(); }

        /// <summary>作業フォルダから上へたどって、parts をつないだパス（フォルダかファイル）を探す。</summary>
        public static string FindUp(params string[] parts)
        {
            foreach (string start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
            {
                for (DirectoryInfo d = new DirectoryInfo(start); d != null; d = d.Parent)
                {
                    string candidate = Path.Combine(d.FullName, Path.Combine(parts));
                    if (Directory.Exists(candidate) || File.Exists(candidate)) { return candidate; }
                }
            }
            throw new FileNotFoundException(string.Join("/", parts));
        }

        public static string Fixture(string name) { return FindUp("Assets", "Game", "Tests", "Fixtures", name); }
    }
}

using System;
using System.IO;
using Mado.Data;

namespace Mado.Data.Tests
{
    /// <summary>テストが実データ（Assets/Game/Data/Json）を探すための道具。dotnet test でも Unity の EditMode でも動く。</summary>
    internal static class TestPaths
    {
        public static string DataDir()
        {
            string[] starts = { Directory.GetCurrentDirectory(), AppContext.BaseDirectory };
            foreach (string start in starts)
            {
                DirectoryInfo dir = new DirectoryInfo(start);
                while (dir != null)
                {
                    string candidate = System.IO.Path.Combine(dir.FullName, "Assets", "Game", "Data", "Json");
                    if (Directory.Exists(candidate))
                    {
                        return candidate;
                    }
                    dir = dir.Parent;
                }
            }
            throw new DirectoryNotFoundException("Assets/Game/Data/Json が見つからない（作業フォルダ: " + Directory.GetCurrentDirectory() + "）");
        }

        public static IDataSource RealSource()
        {
            return new FileDataSource(DataDir());
        }
    }
}

using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Mado.View.Editor
{
    /// <summary>
    /// マスタ JSON（Assets/Game/Data/Json）を、実行時に Resources から読める場所（Assets/Game/View/Resources/MadoData）へコピーする。
    /// 元の JSON が正で、コピー先は生成物（.gitignore 済み）。ビルドの前に自動で走り、メニューからも流せる。
    /// </summary>
    public sealed class DataSync : IPreprocessBuildWithReport
    {
        private const string Source = "Assets/Game/Data/Json";
        private const string Target = "Assets/Game/View/Resources/MadoData";

        public int callbackOrder { get { return 0; } }

        public void OnPreprocessBuild(BuildReport report) { Sync(); }

        [MenuItem("Mado/データを同期")]
        public static void SyncFromMenu()
        {
            int n = Sync();
            Debug.Log("マスタ JSON を " + n + " 個コピーした → " + Target);
        }

        /// <summary>コピーした個数を返す。コピー先にあって元に無いファイルは消す。</summary>
        public static int Sync()
        {
            if (!Directory.Exists(Source)) { throw new DirectoryNotFoundException(Source); }
            if (Directory.Exists(Target)) { Directory.Delete(Target, true); }
            int count = 0;
            foreach (string file in Directory.GetFiles(Source, "*.json", SearchOption.AllDirectories))
            {
                string rel = file.Substring(Source.Length + 1).Replace('\\', '/');
                string dest = Path.Combine(Target, rel);
                Directory.CreateDirectory(Path.GetDirectoryName(dest));
                File.Copy(file, dest, true);
                count++;
            }
            AssetDatabase.Refresh();
            return count;
        }
    }
}

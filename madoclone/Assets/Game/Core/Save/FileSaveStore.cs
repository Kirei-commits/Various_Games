using System;
using System.Collections.Generic;
using System.IO;

namespace Mado.Core.Save
{
    /// <summary>
    /// フォルダの中にセーブを置く ISaveStore（Unity の Application.persistentDataPath や、dotnet のテストの一時フォルダで使う）。
    /// 書くときは、一時ファイルに書き切ってから入れ替える（途中で落ちても元のセーブは壊れない）。直前の内容は generations 世代まで残す。
    /// 現在: save.json、バックアップ: save.bak1.json（新しい）〜 save.bakN.json。
    /// </summary>
    public sealed class FileSaveStore : ISaveStore
    {
        public const string CurrentName = "save.json";
        public const string TempName = "save.tmp";

        private readonly string _dir;
        private readonly int _generations;

        public FileSaveStore(string directory, int generations = 3)
        {
            if (string.IsNullOrEmpty(directory)) { throw new ArgumentException("フォルダが空", nameof(directory)); }
            if (generations < 1) { throw new ArgumentOutOfRangeException(nameof(generations)); }
            _dir = directory;
            _generations = generations;
        }

        private string Path(string name) { return System.IO.Path.Combine(_dir, name); }
        private string Backup(int i) { return Path("save.bak" + i + ".json"); }

        public byte[] Read()
        {
            string p = Path(CurrentName);
            return File.Exists(p) ? File.ReadAllBytes(p) : null;
        }

        public void Write(byte[] data)
        {
            if (data == null) { throw new ArgumentNullException(nameof(data)); }
            Directory.CreateDirectory(_dir);
            string tmp = Path(TempName);
            using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                fs.Write(data, 0, data.Length);
                fs.Flush(true);
            }
            string current = Path(CurrentName);
            if (File.Exists(current))
            {
                // 古い世代から順にずらす：bakN-1 → bakN、…、current → bak1
                for (int i = _generations; i >= 2; i--)
                {
                    if (File.Exists(Backup(i - 1))) { File.Copy(Backup(i - 1), Backup(i), true); }
                }
                File.Copy(current, Backup(1), true);
            }
            if (File.Exists(current)) { File.Delete(current); }
            File.Move(tmp, current);
        }

        public IReadOnlyList<byte[]> ReadBackups()
        {
            var list = new List<byte[]>();
            for (int i = 1; i <= _generations; i++)
            {
                if (File.Exists(Backup(i))) { list.Add(File.ReadAllBytes(Backup(i))); }
            }
            return list;
        }
    }
}

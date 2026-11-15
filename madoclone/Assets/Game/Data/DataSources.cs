using System.Collections.Generic;
using System.IO;
using System.Text;

namespace Mado.Data
{
    /// <summary>マスタ JSON の置き場。"characters.json"、"text/ja.json" のような相対パスで読む。</summary>
    public interface IDataSource
    {
        /// <summary>ファイルの中身（UTF-8）。無ければ FILE_MISSING の DataException。</summary>
        string ReadText(string relativePath);
    }

    /// <summary>フォルダの中のファイルを読む（dotnet のテスト、Mado.Sim、Unity のエディタ）。</summary>
    public sealed class FileDataSource : IDataSource
    {
        private readonly string _rootDir;

        public FileDataSource(string rootDir)
        {
            if (string.IsNullOrEmpty(rootDir))
            {
                throw new System.ArgumentException("rootDir が空", nameof(rootDir));
            }
            _rootDir = rootDir;
        }

        public string ReadText(string relativePath)
        {
            string full = System.IO.Path.Combine(_rootDir, relativePath);
            if (!File.Exists(full))
            {
                throw DataLoader.FileMissing(relativePath, full);
            }
            return File.ReadAllText(full, Encoding.UTF8);
        }
    }

    /// <summary>メモリ上の文字列を返す（テストで壊したデータを渡す・Unity の実行時に TextAsset から作る）。</summary>
    public sealed class MemoryDataSource : IDataSource
    {
        private readonly Dictionary<string, string> _files;

        public MemoryDataSource(IReadOnlyDictionary<string, string> files)
        {
            _files = new Dictionary<string, string>();
            foreach (KeyValuePair<string, string> kv in files)
            {
                _files[kv.Key] = kv.Value;
            }
        }

        /// <summary>1つのファイルだけ差し替えた複製を返す（テストで1か所だけ壊すのに使う）。</summary>
        public MemoryDataSource With(string relativePath, string text)
        {
            var copy = new MemoryDataSource(_files);
            copy._files[relativePath] = text;
            return copy;
        }

        /// <summary>別の置き場の全ファイルを写し取る。</summary>
        public static MemoryDataSource CopyOf(IDataSource source)
        {
            var files = new Dictionary<string, string>();
            foreach (string name in DataLoader.FileNames)
            {
                files[name] = source.ReadText(name);
            }
            return new MemoryDataSource(files);
        }

        public string ReadText(string relativePath)
        {
            string text;
            if (!_files.TryGetValue(relativePath, out text))
            {
                throw DataLoader.FileMissing(relativePath, relativePath);
            }
            return text;
        }
    }
}

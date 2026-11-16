using System.Collections.Generic;

namespace Mado.Core.Save
{
    /// <summary>
    /// セーブのバイト列の置き場（実装は View：Unity なら persistentDataPath に「一時ファイルへ書いてから入れ替え、
    /// 直前3世代を残す」。テスト・Mado.Sim は <see cref="MemorySaveStore"/>）。Core は中身を知らない。
    /// </summary>
    public interface ISaveStore
    {
        /// <summary>いまのセーブ。まだ無ければ null。</summary>
        byte[] Read();

        /// <summary>保存する。成功するか、元のセーブを壊さずに失敗するかのどちらか（実装の責任）。直前の内容はバックアップに回る。</summary>
        void Write(byte[] data);

        /// <summary>バックアップ（新しい順）。無ければ空。</summary>
        IReadOnlyList<byte[]> ReadBackups();
    }

    /// <summary>メモリ上の ISaveStore（直前 <see cref="Generations"/> 世代を残す）。参照実装で、テストとシミュレーションが使う。</summary>
    public sealed class MemorySaveStore : ISaveStore
    {
        public const int Generations = 3;

        private byte[] _current;
        private readonly List<byte[]> _backups = new List<byte[]>();

        public byte[] Read() { return _current == null ? null : (byte[])_current.Clone(); }

        public void Write(byte[] data)
        {
            if (data == null) { throw new System.ArgumentNullException(nameof(data)); }
            if (_current != null)
            {
                _backups.Insert(0, _current);
                if (_backups.Count > Generations) { _backups.RemoveRange(Generations, _backups.Count - Generations); }
            }
            _current = (byte[])data.Clone();
        }

        public IReadOnlyList<byte[]> ReadBackups()
        {
            var copy = new List<byte[]>(_backups.Count);
            foreach (byte[] b in _backups) { copy.Add((byte[])b.Clone()); }
            return copy;
        }
    }
}

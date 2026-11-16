using Mado.Data;

namespace Mado.Core.Save
{
    /// <summary>どこから読めたか。</summary>
    public enum SaveSource { Current, Backup, New }

    public sealed class LoadedSave
    {
        public SaveData Save { get; }
        public SaveSource Source { get; }

        /// <summary>Backup のとき、何番目（0 が直前）のバックアップか。</summary>
        public int BackupIndex { get; }

        /// <summary>読み込みの問題（孤児・検証の警告など）。</summary>
        public System.Collections.Generic.IReadOnlyList<SaveIssue> Issues { get; }

        /// <summary>いまのセーブが読めなかった理由（Source が Backup・New のとき）。</summary>
        public string CurrentFailure { get; }

        public LoadedSave(SaveData save, SaveSource source, int backupIndex, System.Collections.Generic.IReadOnlyList<SaveIssue> issues, string currentFailure)
        {
            Save = save; Source = source; BackupIndex = backupIndex; Issues = issues; CurrentFailure = currentFailure;
        }
    }

    /// <summary>
    /// 起動時の読み込み：いまのセーブ → だめなら新しいバックアップから順に → 何も無ければ新規（docs/04 6.1節）。
    /// 壊れたセーブで落とさない。何から読めたかを返すので、View は「バックアップから復元しました」と知らせられる。
    /// </summary>
    public static class SaveLoader
    {
        public static LoadedSave LoadOrCreate(ISaveStore store, GameData data, ulong newSeed, string nowUtc, SaveMigrator migrator = null)
        {
            string failure = null;
            byte[] current = store.Read();
            if (current != null)
            {
                LoadResult r = SaveCodec.Load(current, data, migrator);
                if (r.Success) { return new LoadedSave(r.Save, SaveSource.Current, -1, r.Issues, null); }
                failure = r.FailureReason;
            }
            var backups = store.ReadBackups();
            for (int i = 0; i < backups.Count; i++)
            {
                LoadResult r = SaveCodec.Load(backups[i], data, migrator);
                if (r.Success) { return new LoadedSave(r.Save, SaveSource.Backup, i, r.Issues, failure); }
            }
            SaveData fresh = SaveData.CreateNew((migrator ?? new SaveMigrator()).CurrentVersion, nowUtc, newSeed);
            return new LoadedSave(fresh, SaveSource.New, -1, new SaveIssue[0], failure);
        }

        /// <summary>保存する。保存時刻を入れて、バイト列にして store に渡す。</summary>
        public static void Save(ISaveStore store, SaveData save, string nowUtc)
        {
            save.SavedAtUtc = nowUtc ?? "";
            store.Write(SaveCodec.Serialize(save));
        }
    }
}

using System.Collections.Generic;

namespace Mado.Core.Save
{
    public enum SaveSeverity { Warning, Error }

    /// <summary>セーブの問題1件。Code は短い英字（テストが確かめる）。</summary>
    public sealed class SaveIssue
    {
        public SaveSeverity Severity { get; }
        public string Code { get; }
        public string Message { get; }
        public string Path { get; }

        public SaveIssue(SaveSeverity severity, string code, string message, string path)
        {
            Severity = severity;
            Code = code;
            Message = message ?? "";
            Path = path ?? "";
        }

        public override string ToString() { return Severity + " " + Code + " " + Path + ": " + Message; }
    }

    /// <summary>読み込みの結果。壊れたセーブでも例外にせず、ここに理由を入れる（docs/04 1.3節）。</summary>
    public sealed class LoadResult
    {
        public bool Success { get; }
        public SaveData Save { get; }
        public string FailureReason { get; }
        public IReadOnlyList<SaveIssue> Issues { get; }

        /// <summary>移行の前の JSON（失敗しても戻れるよう、必ず取っておく）。</summary>
        public string OriginalJson { get; }

        public LoadResult(bool success, SaveData save, string failureReason, IReadOnlyList<SaveIssue> issues, string originalJson)
        {
            Success = success;
            Save = save;
            FailureReason = failureReason;
            Issues = issues ?? new List<SaveIssue>();
            OriginalJson = originalJson;
        }

        public bool HasErrors
        {
            get
            {
                foreach (SaveIssue i in Issues) { if (i.Severity == SaveSeverity.Error) { return true; } }
                return false;
            }
        }

        public static LoadResult Fail(string reason, string originalJson = null)
        {
            return new LoadResult(false, null, reason, null, originalJson);
        }
    }
}

using System;
using System.Collections.Generic;
using System.Text;

namespace Mado.Data
{
    /// <summary>検証で見つけた問題の重さ。</summary>
    public enum DataSeverity
    {
        Error,
        Warning,
    }

    /// <summary>データの問題1件。Code は短い英字（テストはこれを確かめる）、Path は「ファイル名:項目のパス」。</summary>
    public sealed class DataIssue
    {
        public DataSeverity Severity { get; }
        public string Code { get; }
        public string Message { get; }
        public string Path { get; }

        public DataIssue(DataSeverity severity, string code, string message, string path)
        {
            Severity = severity;
            Code = code ?? throw new ArgumentNullException(nameof(code));
            Message = message ?? "";
            Path = path ?? "";
        }

        public override string ToString()
        {
            return (Severity == DataSeverity.Error ? "エラー" : "警告") + " [" + Code + "] " + Path + " " + Message;
        }
    }

    /// <summary>
    /// マスタデータの誤り。ゲームを始めさせない。問題を1つ目で止めずに全部持つ。
    /// （実行時の不正な操作は例外にせず、失敗を表す結果を返す。プログラムの誤りは ArgumentException。docs/04 1.3節）
    /// </summary>
    public sealed class DataException : Exception
    {
        public IReadOnlyList<DataIssue> Issues { get; }

        public DataException(string message)
            : base(message)
        {
            Issues = new List<DataIssue> { new DataIssue(DataSeverity.Error, "DATA", message, "") };
        }

        public DataException(IReadOnlyList<DataIssue> issues)
            : base(BuildMessage(issues))
        {
            Issues = issues;
        }

        public bool HasCode(string code)
        {
            for (int i = 0; i < Issues.Count; i++)
            {
                if (Issues[i].Code == code)
                {
                    return true;
                }
            }
            return false;
        }

        private static string BuildMessage(IReadOnlyList<DataIssue> issues)
        {
            var sb = new StringBuilder();
            sb.Append("データの誤りが ").Append(issues.Count).Append(" 件ある");
            int shown = Math.Min(issues.Count, 20);
            for (int i = 0; i < shown; i++)
            {
                sb.Append('\n').Append("  ").Append(issues[i].ToString());
            }
            if (issues.Count > shown)
            {
                sb.Append('\n').Append("  …ほか ").Append(issues.Count - shown).Append(" 件");
            }
            return sb.ToString();
        }
    }
}

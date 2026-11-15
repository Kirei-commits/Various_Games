using System;
using System.Security.Cryptography;
using System.Text;

namespace Mado.Core.Wallet
{
    /// <summary>開発者モードの合言葉の照合。フラグは呼び出し側が SaveData に書く（docs/04 5.4節）。</summary>
    public static class DevMode
    {
        /// <summary>code の前後の空白を除き、UTF-8 の SHA-256（小文字16進）が期待値と一致するか。大文字小文字は区別する。</summary>
        public static bool TryEnable(string code, string expectedSha256Hex)
        {
            if (code == null || expectedSha256Hex == null) { return false; }
            using (SHA256 sha = SHA256.Create())
            {
                byte[] hash = sha.ComputeHash(Encoding.UTF8.GetBytes(code.Trim()));
                var sb = new StringBuilder(hash.Length * 2);
                foreach (byte b in hash) { sb.Append(b.ToString("x2")); }
                return string.Equals(sb.ToString(), expectedSha256Hex, StringComparison.Ordinal);
            }
        }
    }
}

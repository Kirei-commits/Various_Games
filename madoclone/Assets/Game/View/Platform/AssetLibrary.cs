using System.Collections.Generic;
using UnityEngine;

namespace Mado.View.Platform
{
    /// <summary>
    /// 絵と音の ID（ledger/assets.json の id。例：art.chr_001.icon、audio.se.tap）から、Resources の実物を引く。
    /// 規則：先頭の "art." は Resources/MadoArt/、"audio." は Resources/MadoAudio/ に当たり、残りの "." を "/" に替えたパス。
    /// 見つからなければ null を返す（呼ぶ側が色の四角などで代える。落とさない）。1度引いたものは覚える。
    /// </summary>
    public static class AssetLibrary
    {
        private static readonly Dictionary<string, Sprite> Sprites = new Dictionary<string, Sprite>();
        private static readonly Dictionary<string, AudioClip> Clips = new Dictionary<string, AudioClip>();
        private static readonly HashSet<string> Warned = new HashSet<string>();

        /// <summary>ID に対応する Resources のパス（拡張子なし）。絵・音でない ID は null。</summary>
        public static string PathOf(string id)
        {
            if (string.IsNullOrEmpty(id)) { return null; }
            if (id.StartsWith("art.")) { return "MadoArt/" + id.Substring(4).Replace('.', '/'); }
            if (id.StartsWith("audio.")) { return "MadoAudio/" + id.Substring(6).Replace('.', '/'); }
            return null;
        }

        public static Sprite Sprite(string id)
        {
            if (Sprites.TryGetValue(id ?? "", out Sprite cached)) { return cached; }
            string path = PathOf(id);
            Sprite s = path == null ? null : Resources.Load<Sprite>(path);
            if (s == null) { Warn(id); }
            Sprites[id ?? ""] = s;
            return s;
        }

        public static AudioClip Clip(string id)
        {
            if (Clips.TryGetValue(id ?? "", out AudioClip cached)) { return cached; }
            string path = PathOf(id);
            AudioClip c = path == null ? null : Resources.Load<AudioClip>(path);
            if (c == null) { Warn(id); }
            Clips[id ?? ""] = c;
            return c;
        }

        private static void Warn(string id)
        {
            if (Warned.Add(id ?? "")) { Debug.LogWarning("絵・音が見つからない: " + id); }
        }
    }
}

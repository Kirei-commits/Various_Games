using Mado.Core.Session;
using UnityEngine;

namespace Mado.View.Platform
{
    /// <summary>
    /// 効果音とBGM。MadoHost が1つ作る。ミュートは端末に覚えさせる（セーブ（Core）には入れない。音は見た目の設定）。
    /// 音のファイルが無くても落ちない（AssetLibrary が null を返したら何もしない）。
    /// </summary>
    public sealed class AudioPlayer : MonoBehaviour
    {
        private const string MutePref = "mado.mute";
        private const float BgmVolume = 0.35f, SeVolume = 0.8f;

        private static AudioPlayer _instance;
        private AudioSource _bgm, _se;
        private string _bgmName;

        public static bool Muted
        {
            get { return PlayerPrefs.GetInt(MutePref, 0) == 1; }
            set
            {
                PlayerPrefs.SetInt(MutePref, value ? 1 : 0);
                PlayerPrefs.Save();
                if (_instance != null) { _instance.ApplyMute(); }
            }
        }

        public static void Create(GameObject host)
        {
            if (_instance != null) { return; }
            _instance = host.AddComponent<AudioPlayer>();
            _instance._bgm = host.AddComponent<AudioSource>();
            _instance._bgm.loop = true;
            _instance._bgm.volume = BgmVolume;
            _instance._bgm.playOnAwake = false;
            _instance._se = host.AddComponent<AudioSource>();
            _instance._se.volume = SeVolume;
            _instance._se.playOnAwake = false;
            _instance.ApplyMute();
        }

        private void ApplyMute()
        {
            if (_bgm != null) { _bgm.mute = Muted; }
            if (_se != null) { _se.mute = Muted; }
        }

        /// <summary>効果音を鳴らす（名前は audio.se.* の後ろ。例："tap"）。</summary>
        public static void Se(string name)
        {
            if (_instance == null || _instance._se == null) { return; }
            AudioClip clip = AssetLibrary.Clip("audio.se." + name);
            if (clip != null) { _instance._se.PlayOneShot(clip, SeVolume); }
        }

        /// <summary>BGM を切り替える（同じものが鳴っていれば何もしない）。</summary>
        public static void Bgm(string name)
        {
            if (_instance == null || _instance._bgm == null || _instance._bgmName == name) { return; }
            AudioClip clip = AssetLibrary.Clip("audio.bgm." + name);
            if (clip == null) { return; }
            _instance._bgmName = name;
            _instance._bgm.Stop();
            _instance._bgm.clip = clip;
            _instance._bgm.Play();
        }

        /// <summary>GameSession のイベントに合わせた効果音（コマンドごとに、いちばん目立つ1つだけ鳴らす）。</summary>
        public static void ForEvents(System.Collections.Generic.IReadOnlyList<GameEvent> events)
        {
            string pick = null;
            int best = 0;
            foreach (GameEvent e in events)
            {
                string se = null; int weight = 0;
                switch (e.Kind)
                {
                    case GameEventKind.GachaPulled: se = e.Value > 0 ? "gacha_rare" : "gacha"; weight = 5; break;
                    case GameEventKind.BattleFinished: se = e.Id == "Win" ? "win" : "lose"; weight = 4; break;
                    case GameEventKind.TrialCleared: case GameEventKind.ProgressAdvanced: se = "win"; weight = 4; break;
                    case GameEventKind.CharacterAwakened: case GameEventKind.LeaderLevelUp: case GameEventKind.PlazaLevelUp: case GameEventKind.TreeNodeLevelUp:
                    case GameEventKind.DragonNodeLevelUp: case GameEventKind.StoneLevelUp: case GameEventKind.MemoryGachaLevelUp: se = "levelup"; weight = 3; break;
                    case GameEventKind.CharacterLevelUp: se = "levelup"; weight = 3; break;
                    case GameEventKind.AchievementClaimed: case GameEventKind.IdleClaimed: case GameEventKind.ArenaSeasonClaimed: case GameEventKind.TrialRewarded: se = "claim"; weight = 3; break;
                    case GameEventKind.ShopBought: case GameEventKind.RouletteSpun: se = "coin"; weight = 2; break;
                    case GameEventKind.PartyChanged: case GameEventKind.SettingsChanged: case GameEventKind.StoneEquipped: case GameEventKind.MemoryCardEquipped: se = "ok"; weight = 1; break;
                }
                if (se != null && weight > best) { pick = se; best = weight; }
            }
            if (pick != null) { Se(pick); }
        }
    }
}

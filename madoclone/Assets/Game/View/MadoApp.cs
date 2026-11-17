using System;
using System.Collections.Generic;
using Mado.Core.Session;
using Mado.Data;
using Mado.View.Screens;
using Mado.View.Ui;
using UnityEngine;
using UnityEngine.UI;

namespace Mado.View
{
    public enum ScreenId { Party, Trial, Home, Guild, Garden, Gacha }

    /// <summary>
    /// 画面全体の組み立て：Canvas・下のタブ6つ（編成／試練／ホーム／ギルド／箱庭／ガチャ。docs/01 3.7節）・各画面・戦闘画面・短いお知らせ。
    /// ルールは持たない。コマンドは GameSession に渡し、結果を見て画面を作り直すだけ。
    /// </summary>
    public sealed class MadoApp
    {
        private const float TabHeight = 0.09f;

        public GameData Data { get; }
        public GameSession Session { get; }

        private readonly RectTransform _root;
        private readonly Dictionary<ScreenId, GameScreen> _screens = new Dictionary<ScreenId, GameScreen>();
        private readonly BattleScreen _battle;
        private readonly RectTransform _tabBar;
        private readonly Text _toast;
        private float _toastLeft;
        private GameScreen _current;
        private bool _dirty;

        /// <summary>前回の保存から状態が変わった。MadoHost が少し間を置いて保存し、ClearDirty する。</summary>
        public bool Dirty { get { return _dirty; } }

        public MadoApp(GameObject host, GameData data, GameSession session)
        {
            Data = data;
            Session = session;
            _root = UiKit.CreateRoot(host);
            UiKit.Icon(_root, "Background", "art.bg.home", 0f, 0f, 1f, 1f, UiKit.Background).preserveAspect = false;
            Mado.View.Platform.AudioPlayer.Bgm("home");

            RectTransform content = UiKit.Box(_root, "Content", 0f, TabHeight, 1f, 1f);
            _screens[ScreenId.Party] = new PartyScreen(this, content);
            _screens[ScreenId.Trial] = new TrialScreen(this, content, "Trial", new[] { "phantom", "battle_rush", "edrasu", "hades", "spirit_king", "dragon", "zeref" });
            _screens[ScreenId.Home] = new HomeScreen(this, content);
            _screens[ScreenId.Guild] = new HubScreen(this, content, "GuildHub",
                new[] { "ui.guild.sub_info", "ui.guild.sub_raid", "ui.guild.sub_arena", "ui.guild.sub_rank", "ui.guild.sub_library", "ui.guild.sub_shop" },
                new Func<Transform, GameScreen>[]
                {
                    t => new GuildInfoScreen(this, t),
                    t => new TrialScreen(this, t, "Raid", new[] { "guild_raid" }, "ui.guild.sub_raid"),
                    t => new TrialScreen(this, t, "Arena", new[] { "arena" }, "ui.guild.sub_arena"),
                    t => new ArenaRankScreen(this, t),
                    t => new TrialScreen(this, t, "Library", new[] { "library" }, "ui.guild.sub_library"),
                    t => new ShopScreen(this, t, "exchange"),
                });
            _screens[ScreenId.Garden] = new GardenScreen(this, content);
            _screens[ScreenId.Gacha] = new HubScreen(this, content, "GachaHub",
                new[] { "ui.sub.gacha", "ui.sub.roulette", "ui.sub.shop", "ui.sub.achievement", "ui.sub.memory", "ui.sub.equip", "ui.sub.settings" },
                new Func<Transform, GameScreen>[]
                {
                    t => new GachaScreen(this, t), t => new RouletteScreen(this, t), t => new ShopScreen(this, t), t => new AchievementScreen(this, t), t => new MemoryScreen(this, t), t => new EquipScreen(this, t), t => new SettingsScreen(this, t),
                });
            _battle = new BattleScreen(this, _root);

            _tabBar = UiKit.Box(_root, "TabBar", 0f, 0f, 1f, TabHeight);
            string[] keys = { "ui.tab.party", "ui.tab.trial", "ui.tab.home", "ui.tab.guild", "ui.tab.garden", "ui.tab.gacha" };
            ScreenId[] ids = { ScreenId.Party, ScreenId.Trial, ScreenId.Home, ScreenId.Guild, ScreenId.Garden, ScreenId.Gacha };
            for (int i = 0; i < ids.Length; i++)
            {
                ScreenId id = ids[i];
                UiKit.Button(_tabBar, "Tab" + id, data.Text.Get(keys[i]), i / 6f, 0f, (i + 1) / 6f, 1f, UiKit.Panel, () => Show(id));
            }

            _toast = UiKit.Label(_root, "Toast", "", 34, 0.05f, TabHeight + 0.01f, 0.95f, TabHeight + 0.07f, TextAnchor.MiddleCenter);
            _toast.gameObject.SetActive(false);
            Show(ScreenId.Home);
        }

        public void Show(ScreenId id)
        {
            _battle.Hide();
            Mado.View.Platform.AudioPlayer.Bgm("home");
            _tabBar.gameObject.SetActive(true);
            if (_current != null) { _current.Hide(); }
            _current = _screens[id];
            _current.Show();
        }

        /// <summary>直前の戦闘（Session.LastBattleSetup）を再生する戦闘画面に切り替える。</summary>
        public void ShowBattle(FightResult result)
        {
            if (_current != null) { _current.Hide(); }
            _tabBar.gameObject.SetActive(false);
            Mado.View.Platform.AudioPlayer.Bgm("battle");
            _battle.Begin(Session.LastBattleSetup, result);
        }

        /// <summary>戦闘画面から戻る。</summary>
        public void LeaveBattle() { Show(ScreenId.Home); }

        public void Tick(float unscaledDeltaTime)
        {
            if (_current != null) { _current.Tick(unscaledDeltaTime); }
            _battle.Tick(unscaledDeltaTime);
            if (_toast.gameObject.activeSelf)
            {
                _toastLeft -= unscaledDeltaTime;
                if (_toastLeft <= 0f) { _toast.gameObject.SetActive(false); }
            }
        }

        public void Toast(string text)
        {
            _toast.text = text;
            _toast.gameObject.SetActive(true);
            _toastLeft = 2.5f;
        }

        /// <summary>コマンドの結果を受ける：失敗ならお知らせを出す。成功なら保存の印を付け、いまの画面を作り直す。</summary>
        public bool Commit(CommandResult result)
        {
            Mado.View.Platform.AudioPlayer.ForEvents(Session.DrainEvents());
            if (!result.Success)
            {
                Mado.View.Platform.AudioPlayer.Se("error");
                Toast(result.Failure == "Locked" ? Data.Text.Get("ui.locked") : string.Format(Data.Text.Get("ui.failed"), result.Failure));
                return false;
            }
            Changed();
            return true;
        }

        /// <summary>状態が変わったことを知らせる（保存の印と画面の作り直し）。</summary>
        public void Changed()
        {
            _dirty = true;
            if (_current != null) { _current.Refresh(); }
        }

        public void SaveNow()
        {
            Session.Save();
            Session.DrainEvents();
            _dirty = false;
        }

        public void ClearDirty() { _dirty = false; }
    }
}

using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Data;
using Mado.View.Platform;
using UnityEngine;
using UnityEngine.UI;

namespace Mado.View
{
    /// <summary>
    /// 起動：マスタを読み、保存を読み込み（壊れていれば Core がバックアップや修復で直す）、GameSession と画面を作る。
    /// 状態が変わったら少し間を置いて保存し、アプリが止まる・終わるときにも保存する（docs/02 4.9節）。
    /// シーンに置かなくても、起動時に自動で1つ作られる。
    /// </summary>
    public sealed class MadoHost : MonoBehaviour
    {
        /// <summary>保存までの間（秒）。短い間に何度も変わっても、1回にまとめる。</summary>
        private const float SaveDelaySec = 1f;

        private MadoApp _app;
        private float _dirtyFor;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (FindFirstObjectByType<MadoHost>() != null) { return; }
            var go = new GameObject("MadoHost");
            go.AddComponent<MadoHost>();
            DontDestroyOnLoad(go);
        }

        private void Awake()
        {
            Application.targetFrameRate = 60;
            try
            {
                var source = new ResourcesDataSource();
                GameData data = DataLoader.Load(source);
                SimProfilesFile profiles = SimProfiles.LoadFile(source);
                var store = new FileSaveStore(Application.persistentDataPath);

                // 育成の経済の校正が済むまでの代用：いまのランクの標準的な共通倍率を足す（RankProfileSource の説明を参照）。
                GameSession session = null;
                var sources = new List<IModifierSource>
                {
                    new RankProfileSource(profiles.Items, () => session == null ? 1 : session.State.Progress.Rank, profiles.AllySubstats, data.System.BaseSubstats),
                };
                ulong seed = (ulong)DateTime.UtcNow.Ticks;
                session = GameSession.LoadOrCreate(data, store, new UnityClock(), seed, sources);
                if (session.Loaded.Source == SaveSource.New) { GiveStarterSet(session, data); }
                else if (session.Loaded.Source == SaveSource.Backup) { Debug.LogWarning("セーブを読めなかったので、バックアップから復元した: " + session.Loaded.CurrentFailure); }
                foreach (SaveIssue issue in session.Loaded.Issues) { Debug.Log("セーブの読み込み: " + issue); }

                Mado.View.Platform.AudioPlayer.Create(gameObject);
                _app = new MadoApp(gameObject, data, session);
                if (session.Loaded.Source == SaveSource.Backup) { _app.Toast("バックアップから復元しました"); }
                _app.SaveNow();
            }
            catch (Exception e)
            {
                Debug.LogError("起動に失敗: " + e);
                ShowFatal(e.Message);
            }
        }

        /// <summary>最初の1回だけ：遊び始められるキャラとチケットを渡す（デバッグ用コマンドを使う。ガチャが回せるまでの導入）。</summary>
        private static void GiveStarterSet(GameSession session, GameData data)
        {
            var party = new List<string>();
            foreach (CharacterDef c in data.Characters)
            {
                if (party.Count >= data.System.PartySlots) { break; }
                if (c.Tier == CharTier.So || c.Tier == CharTier.Tou)
                {
                    session.Debug.GrantCharacter(c.Id);
                    party.Add(c.Id);
                }
            }
            session.SetParty(party);
            session.Debug.GrantCurrency("gacha_ticket", 30);
            session.DrainEvents();
        }

        private void ShowFatal(string message)
        {
            RectTransform root = Ui.UiKit.CreateRoot(gameObject);
            Ui.UiKit.Rect(root, "Bg", 0f, 0f, 1f, 1f, Ui.UiKit.Background);
            Ui.UiKit.Label(root, "Error", "起動に失敗しました\n" + message, 40, 0.05f, 0.3f, 0.95f, 0.7f, TextAnchor.MiddleCenter);
        }

        private void Update()
        {
            if (_app == null) { return; }
            _app.Tick(Time.unscaledDeltaTime);
            if (_app.Dirty)
            {
                _dirtyFor += Time.unscaledDeltaTime;
                if (_dirtyFor >= SaveDelaySec) { _app.SaveNow(); _dirtyFor = 0f; }
            }
            else { _dirtyFor = 0f; }
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused && _app != null) { _app.SaveNow(); }
        }

        private void OnApplicationQuit()
        {
            if (_app != null) { _app.SaveNow(); }
        }
    }
}

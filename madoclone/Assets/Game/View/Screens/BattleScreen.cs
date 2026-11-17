using System;
using System.Collections.Generic;
using Mado.Core.Battle;
using Mado.Core.Session;
using Mado.View.Ui;
using UnityEngine;
using UnityEngine.UI;

namespace Mado.View.Screens
{
    /// <summary>
    /// 戦闘画面（docs/01 3.6節）：味方・敵の HP バー、ダメージの流れ、残り時間、再生速度（×1／×2／×4）、スキップ（開始1秒後から）。
    /// 戦闘は Core で最後まで進めた記録（BattleReplay）を、1秒に10刻み × 速度で再生するだけ。速度やスキップで結果は変わらない。
    /// </summary>
    public sealed class BattleScreen
    {
        private static readonly int[] Speeds = { 1, 2, 4 };
        private const float TicksPerSecond = 10f;
        private const int LogLines = 7;

        private readonly MadoApp _app;
        private readonly RectTransform _root;
        private BattleReplay _replay;
        private BattleSetup _setup;
        private FightResult _fight;
        private readonly List<Row> _rows = new List<Row>();
        private readonly List<string> _log = new List<string>();
        private readonly List<FloatText> _floats = new List<FloatText>();
        private Text _timeText, _logText, _resultText;
        private Button _speedButton, _skipButton, _backButton;
        private int _speedIndex;
        private float _tickAcc;
        private int _tick;
        private bool _active;

        private sealed class Row
        {
            public int Unit;
            public Text Name;
            public RectTransform Fill;
        }

        public BattleScreen(MadoApp app, Transform parent)
        {
            _app = app;
            _root = UiKit.Fill(parent, "Battle");
            _root.gameObject.SetActive(false);
        }

        public void Hide()
        {
            _active = false;
            _root.gameObject.SetActive(false);
        }

        public void Begin(BattleSetup setup, FightResult fight)
        {
            _setup = setup;
            _fight = fight;
            _replay = BattleReplay.Record(setup);
            _speedIndex = 0;
            _tickAcc = 0f;
            _tick = 0;
            _log.Clear();
            _active = true;
            Build();
            _root.gameObject.SetActive(true);
        }

        private string T(string key, params object[] args) { return string.Format(_app.Data.Text.Get(key), args); }

        private string UnitName(ReplayUnit u)
        {
            if (u.Side == Side.Ally) { return _app.Data.Text.Get(u.Id + ".name"); }
            return T("ui.battle.enemy", u.Index - _setup.Allies.Count + 1);
        }

        private void Build()
        {
            UiKit.Clear(_root);
            UiKit.Rect(_root, "Bg", 0f, 0f, 1f, 1f, UiKit.Background);
            _rows.Clear();
            int a = 0, e = 0;
            foreach (ReplayUnit u in _replay.Units)
            {
                if (u.IsSupport) { continue; }
                bool ally = u.Side == Side.Ally;
                int slot = ally ? a++ : e++;
                float x0 = ally ? 0.03f : 0.52f, x1 = ally ? 0.48f : 0.97f;
                float y1 = 0.9f - slot * 0.085f, y0 = y1 - 0.075f;
                UiKit.Rect(_root, "Row" + u.Index, x0, y0, x1, y1, UiKit.Panel);
                Text name = UiKit.Label(_root, "Name" + u.Index, UnitName(u), 26, x0 + 0.01f, y0 + 0.035f, x1, y1);
                UiKit.Bar(_root, "Bar" + u.Index, x0 + 0.01f, y0 + 0.008f, x1 - 0.01f, y0 + 0.03f, new Color(0.25f, 0.1f, 0.1f, 1f), ally ? UiKit.Good : UiKit.Danger, out RectTransform fill);
                _rows.Add(new Row { Unit = u.Index, Name = name, Fill = fill });
            }
            _timeText = UiKit.Label(_root, "Time", "", 36, 0.03f, 0.92f, 0.5f, 0.99f);
            _logText = UiKit.Label(_root, "Log", "", 28, 0.03f, 0.2f, 0.97f, 0.4f);
            _resultText = UiKit.Label(_root, "Result", "", 40, 0.03f, 0.42f, 0.97f, 0.55f, TextAnchor.MiddleCenter);
            _speedButton = UiKit.Button(_root, "Speed", T("ui.battle.speed", Speeds[0]), 0.03f, 0.06f, 0.33f, 0.16f, UiKit.PanelLight, CycleSpeed);
            _skipButton = UiKit.Button(_root, "Skip", T("ui.battle.skip"), 0.36f, 0.06f, 0.66f, 0.16f, UiKit.Accent, Skip);
            _backButton = UiKit.Button(_root, "Back", T("ui.battle.back"), 0.69f, 0.06f, 0.97f, 0.16f, UiKit.Good, _app.LeaveBattle);
            _backButton.gameObject.SetActive(false);
            UpdateView();
        }

        private void CycleSpeed()
        {
            _speedIndex = (_speedIndex + 1) % Speeds.Length;
            UiKit.SetButtonText(_speedButton, T("ui.battle.speed", Speeds[_speedIndex]));
        }

        private void Skip()
        {
            if (_tick < _setup.Rules.SkipAvailableAfterTicks) { return; }
            _replay.SkipToEnd(_floats);
            _tick = _replay.Result.EndTick;
            AppendFloats();
            Finish();
        }

        public void Tick(float dt)
        {
            if (!_active || _replay == null || _replay.Finished && _backButton.gameObject.activeSelf) { return; }
            _tickAcc += dt * TicksPerSecond * Speeds[_speedIndex];
            int steps = (int)_tickAcc;
            if (steps > 0)
            {
                _tickAcc -= steps;
                _tick = Math.Min(_tick + steps, _replay.Result.EndTick);
                _replay.AdvanceTo(_tick, _floats);
                AppendFloats();
            }
            _skipButton.interactable = _tick >= _setup.Rules.SkipAvailableAfterTicks;
            UpdateView();
            if (_tick >= _replay.Result.EndTick && !_backButton.gameObject.activeSelf) { Finish(); }
        }

        private void AppendFloats()
        {
            foreach (FloatText f in _floats)
            {
                ReplayUnit u = _replay.Units[f.Unit];
                string who = UnitName(u);
                switch (f.Kind)
                {
                    case FloatKind.Heal: _log.Add(who + " +" + Num(f.Value)); break;
                    case FloatKind.Miss: _log.Add(who + " MISS"); break;
                    case FloatKind.Immune: _log.Add(who + " IMMUNE"); break;
                    default: _log.Add(who + " -" + Num(f.Value) + (f.Kind == FloatKind.Crit ? " !" : "")); break;
                }
            }
            _floats.Clear();
            while (_log.Count > LogLines) { _log.RemoveAt(0); }
        }

        private string Num(double v) { return Mado.Core.Util.NumberFormat.Format(v, _app.Data.System.NumberUnits); }

        private void UpdateView()
        {
            foreach (Row row in _rows)
            {
                ReplayUnit u = _replay.Units[row.Unit];
                UiKit.SetBar(row.Fill, (float)BattleReplay.HpRatio(u));
                row.Name.color = u.Alive ? UiKit.TextColor : new Color(0.5f, 0.5f, 0.5f, 1f);
            }
            double limit = _setup.Rules.TimeLimitTicks / TicksPerSecond;
            _timeText.text = T("ui.battle.time", Math.Max(0, (int)Math.Ceiling(limit - _tick / TicksPerSecond)));
            _logText.text = string.Join("\n", _log);
        }

        private void Finish()
        {
            UpdateView();
            string head;
            switch (_replay.Result.Outcome)
            {
                case BattleOutcome.Win: head = T("ui.battle.win"); break;
                case BattleOutcome.TimeUp: head = T("ui.battle.timeup"); break;
                default: head = T("ui.battle.lose"); break;
            }
            string body = T("ui.battle.reward", _fight.EnemiesDefeated, Num(_fight.ExpDropped));
            if (_fight.AllCleared) { body += "\n" + T("ui.battle.cleared"); }
            else if (_fight.Advanced) { body += "\n" + T("ui.battle.advanced"); }
            _resultText.text = head + "\n" + body;
            _skipButton.gameObject.SetActive(false);
            _speedButton.gameObject.SetActive(false);
            _backButton.gameObject.SetActive(true);
        }
    }
}

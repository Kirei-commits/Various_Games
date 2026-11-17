using System;
using System.Collections.Generic;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>上にサブタブを並べて、中身の画面を切り替える入れ物（ガチャ／ルーレット／ショップ／実績。docs/01 3.7節）。</summary>
    public sealed class HubScreen : GameScreen
    {
        private readonly List<GameScreen> _children = new List<GameScreen>();
        private readonly string[] _labelKeys;
        private int _current;

        /// <summary>childFactory は、中身を作る関数（親の入れ物を受け取る）。</summary>
        public HubScreen(MadoApp app, Transform parent, string name, string[] labelKeys, Func<Transform, GameScreen>[] childFactories) : base(app, parent, name)
        {
            _labelKeys = labelKeys;
            RectTransform content = UiKit.Box(Root, "HubContent", 0f, 0f, 1f, 0.92f);
            foreach (Func<Transform, GameScreen> make in childFactories) { _children.Add(make(content)); }
            for (int i = 0; i < labelKeys.Length; i++)
            {
                int index = i;
                UiKit.Button(Root, "Sub" + i, T(labelKeys[i]), i / (float)labelKeys.Length, 0.92f, (i + 1) / (float)labelKeys.Length, 1f, UiKit.Panel, () => Select(index));
            }
        }

        private void Select(int index)
        {
            _children[_current].Hide();
            _current = index;
            _children[_current].Show();
        }

        public override void Show()
        {
            Root.gameObject.SetActive(true);
            Select(_current);
        }

        public override void Hide()
        {
            _children[_current].Hide();
            base.Hide();
        }

        public override void Refresh() { _children[_current].Refresh(); }

        public override void Tick(float unscaledDeltaTime) { _children[_current].Tick(unscaledDeltaTime); }
    }
}

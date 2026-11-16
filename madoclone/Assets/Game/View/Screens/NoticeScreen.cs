using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>まだ作っていない画面の置き場（タイトルと「準備中」の文）。</summary>
    public sealed class NoticeScreen : GameScreen
    {
        private readonly string _titleKey, _hintKey;

        public NoticeScreen(MadoApp app, Transform parent, string name, string titleKey, string hintKey) : base(app, parent, name)
        {
            _titleKey = titleKey; _hintKey = hintKey;
        }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T(_titleKey), 60, 0.05f, 0.85f, 0.95f, 0.97f, TextAnchor.MiddleCenter);
            UiKit.Label(Root, "Hint", T(_hintKey), 40, 0.08f, 0.4f, 0.92f, 0.7f, TextAnchor.MiddleCenter);
        }
    }
}

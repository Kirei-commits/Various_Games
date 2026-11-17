using Mado.Core.Session;
using Mado.Data;
using UnityEngine;

namespace Mado.View.Ui
{
    /// <summary>画面1つの土台。Show で出し、Hide で隠す。中身は Refresh で最新の GameState から作り直す（View は状態の写しを持たない）。</summary>
    public abstract class GameScreen
    {
        protected readonly MadoApp App;
        protected readonly RectTransform Root;

        protected GameSession Session { get { return App.Session; } }
        protected GameData Data { get { return App.Data; } }
        protected GameState State { get { return App.Session.State; } }

        protected GameScreen(MadoApp app, Transform parent, string name)
        {
            App = app;
            Root = UiKit.Fill(parent, name);
            Root.gameObject.SetActive(false);
        }

        public virtual void Show() { Root.gameObject.SetActive(true); Refresh(); }

        public virtual void Hide() { Root.gameObject.SetActive(false); }

        public abstract void Refresh();

        /// <summary>毎フレーム呼ばれる（表示中だけ）。戦闘の再生などが使う。</summary>
        public virtual void Tick(float unscaledDeltaTime) { }

        protected string T(string key) { return Data.Text.Get(key); }

        protected string T(string key, params object[] args) { return string.Format(Data.Text.Get(key), args); }

        /// <summary>大きな数を K・M・G… で短く（単位は system.json の numberUnits）。</summary>
        protected string Num(double value) { return Mado.Core.Util.NumberFormat.Format(value, Data.System.NumberUnits); }

        /// <summary>キャラの表示名（text/ja.json）。</summary>
        protected string NameOf(string characterId) { return Data.Text.Get(characterId + ".name"); }
    }
}

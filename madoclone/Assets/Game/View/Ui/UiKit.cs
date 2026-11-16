using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Mado.View.Ui
{
    /// <summary>
    /// 画面の部品を、コードだけで組み立てる小さな道具（シーンもプレハブも使わない）。位置はすべて親に対する割合（アンカー）で決めるので、
    /// どの解像度でも崩れない。見た目は仮（色の四角と文字）。絵が入ったら、ここだけ差し替える。
    /// </summary>
    public static class UiKit
    {
        public static readonly Color Background = new Color(0.08f, 0.09f, 0.13f, 1f);
        public static readonly Color Panel = new Color(0.15f, 0.17f, 0.24f, 1f);
        public static readonly Color PanelLight = new Color(0.22f, 0.25f, 0.34f, 1f);
        public static readonly Color Accent = new Color(0.25f, 0.55f, 0.95f, 1f);
        public static readonly Color Danger = new Color(0.85f, 0.3f, 0.3f, 1f);
        public static readonly Color Good = new Color(0.3f, 0.75f, 0.45f, 1f);
        public static readonly Color TextColor = new Color(0.95f, 0.96f, 1f, 1f);

        private static Font _font;

        /// <summary>組み込みの文字（日本語は端末の標準フォントに落ちる）。</summary>
        public static Font DefaultFont
        {
            get
            {
                if (_font == null) { _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
                return _font;
            }
        }

        /// <summary>画面全体の Canvas（縦 1080×1920 を基準に拡縮）と、入力を受ける EventSystem を作る。</summary>
        public static RectTransform CreateRoot(GameObject host)
        {
            var canvasObj = new GameObject("MadoCanvas");
            canvasObj.transform.SetParent(host.transform, false);
            var canvas = canvasObj.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasObj.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080f, 1920f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            canvasObj.AddComponent<GraphicRaycaster>();
            if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.transform.SetParent(host.transform, false);
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }
            return (RectTransform)canvasObj.transform;
        }

        /// <summary>空の入れ物。min・max は親に対する割合（0〜1）。</summary>
        public static RectTransform Box(Transform parent, string name, float minX, float minY, float maxX, float maxY)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = new Vector2(minX, minY);
            rt.anchorMax = new Vector2(maxX, maxY);
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
            return rt;
        }

        public static RectTransform Fill(Transform parent, string name) { return Box(parent, name, 0f, 0f, 1f, 1f); }

        /// <summary>色つきの四角。</summary>
        public static Image Rect(Transform parent, string name, float minX, float minY, float maxX, float maxY, Color color)
        {
            RectTransform rt = Box(parent, name, minX, minY, maxX, maxY);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            return img;
        }

        /// <summary>絵（ID は ledger/assets.json の id）。見つからなければ fallback の色の四角のまま。</summary>
        public static Image Icon(Transform parent, string name, string assetId, float minX, float minY, float maxX, float maxY, Color fallback)
        {
            Image img = Rect(parent, name, minX, minY, maxX, maxY, fallback);
            Sprite s = Mado.View.Platform.AssetLibrary.Sprite(assetId);
            if (s != null) { img.sprite = s; img.color = new Color(1f, 1f, 1f, 1f); img.preserveAspect = true; }
            return img;
        }

        /// <summary>文字。</summary>
        public static Text Label(Transform parent, string name, string text, int size, float minX, float minY, float maxX, float maxY, TextAnchor anchor = TextAnchor.MiddleLeft)
        {
            RectTransform rt = Box(parent, name, minX, minY, maxX, maxY);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = DefaultFont;
            t.fontSize = size;
            t.alignment = anchor;
            t.color = TextColor;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Truncate;
            t.raycastTarget = false;
            t.text = text ?? "";
            return t;
        }

        /// <summary>ボタン（色の四角＋文字）。押されたら onClick を呼ぶ。</summary>
        public static Button Button(Transform parent, string name, string text, float minX, float minY, float maxX, float maxY, Color color, Action onClick)
        {
            Image bg = Rect(parent, name, minX, minY, maxX, maxY, color);
            var button = bg.gameObject.AddComponent<Button>();
            button.targetGraphic = bg;
            button.onClick.AddListener(() => { Mado.View.Platform.AudioPlayer.Se("tap"); if (onClick != null) { onClick(); } });
            Text label = Label(bg.transform, "Label", text, 36, 0f, 0f, 1f, 1f, TextAnchor.MiddleCenter);
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            return button;
        }

        /// <summary>ボタンの文字を変える。</summary>
        public static void SetButtonText(Button button, string text)
        {
            Text t = button.GetComponentInChildren<Text>();
            if (t != null) { t.text = text; }
        }

        /// <summary>横棒（HP バーなど）。value は 0〜1。戻り値の Image の幅（アンカー）を変えて使う。</summary>
        public static Image Bar(Transform parent, string name, float minX, float minY, float maxX, float maxY, Color back, Color fill, out RectTransform fillRect)
        {
            Image bg = Rect(parent, name, minX, minY, maxX, maxY, back);
            Image f = Rect(bg.transform, "Fill", 0f, 0f, 1f, 1f, fill);
            fillRect = (RectTransform)f.transform;
            return bg;
        }

        /// <summary>棒の長さ（0〜1）を決める。</summary>
        public static void SetBar(RectTransform fillRect, float value)
        {
            fillRect.anchorMax = new Vector2(Mathf.Clamp01(value), 1f);
        }

        /// <summary>
        /// 縦にスクロールできる一覧。content の高さは contentHeight（ピクセル）で、中の行は content に対する割合（0〜1）で並べる。
        /// 行 i（全 n 行）は、縦の割合が 1 - (i+1)/n 〜 1 - i/n。
        /// </summary>
        public static RectTransform ScrollList(Transform parent, string name, float minX, float minY, float maxX, float maxY, float contentHeight)
        {
            Image viewport = Rect(parent, name, minX, minY, maxX, maxY, new Color(0f, 0f, 0f, 0.01f));   // ほぼ透明（ドラッグを受け取るため、描画は残す）
            viewport.gameObject.AddComponent<RectMask2D>();
            RectTransform content = Box(viewport.transform, "Content", 0f, 1f, 1f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(0f, contentHeight);
            content.anchoredPosition = Vector2.zero;
            var scroll = viewport.gameObject.AddComponent<ScrollRect>();
            scroll.content = content;
            scroll.viewport = (RectTransform)viewport.transform;
            scroll.horizontal = false;
            scroll.vertical = true;
            scroll.movementType = ScrollRect.MovementType.Clamped;
            return content;
        }

        /// <summary>子をすべて消す。</summary>
        public static void Clear(Transform parent)
        {
            for (int i = parent.childCount - 1; i >= 0; i--) { UnityEngine.Object.Destroy(parent.GetChild(i).gameObject); }
        }
    }
}

// UnityEngine.UI（uGUI）のスタブ。説明は UnityStubs.csproj。
using UnityEngine.Events;

namespace UnityEngine.UI
{
    public class UIBehaviour : MonoBehaviour { }

    public class Graphic : UIBehaviour
    {
        public Color color { get; set; }
        public bool raycastTarget { get; set; }
    }

    public class MaskableGraphic : Graphic { }

    public class Image : MaskableGraphic { }

    public class Text : MaskableGraphic
    {
        public Font font { get; set; }
        public int fontSize { get; set; }
        public TextAnchor alignment { get; set; }
        public HorizontalWrapMode horizontalOverflow { get; set; }
        public VerticalWrapMode verticalOverflow { get; set; }
        public string text { get; set; }
    }

    public class Selectable : UIBehaviour
    {
        public bool interactable { get; set; }
        public Graphic targetGraphic { get; set; }
    }

    public class Button : Selectable
    {
        public class ButtonClickedEvent : UnityEvent { }
        public ButtonClickedEvent onClick { get; set; }
    }

    public class CanvasScaler : UIBehaviour
    {
        public enum ScaleMode { ConstantPixelSize, ScaleWithScreenSize, ConstantPhysicalSize }
        public enum ScreenMatchMode { MatchWidthOrHeight, Expand, Shrink }
        public ScaleMode uiScaleMode { get; set; }
        public Vector2 referenceResolution { get; set; }
        public ScreenMatchMode screenMatchMode { get; set; }
        public float matchWidthOrHeight { get; set; }
    }

    public class GraphicRaycaster : UIBehaviour { }
}

namespace UnityEngine.EventSystems
{
    public class EventSystem : UnityEngine.UI.UIBehaviour { }

    public class StandaloneInputModule : UnityEngine.UI.UIBehaviour { }
}

using System.Collections.Generic;
using Mado.Data;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>ショップ（アイテム）と交換所。商品を1つ買う。購入回数の制限は無い。</summary>
    public sealed class ShopScreen : GameScreen
    {
        private string _tab = "item";

        public ShopScreen(MadoApp app, Transform parent) : base(app, parent, "Shop") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.shop.title"), 56, 0.04f, 0.9f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            UiKit.Button(Root, "TabItem", T("ui.shop.tab_item"), 0.04f, 0.82f, 0.48f, 0.9f, _tab == "item" ? UiKit.Accent : UiKit.Panel, () => { _tab = "item"; Refresh(); });
            UiKit.Button(Root, "TabEx", T("ui.shop.tab_exchange"), 0.52f, 0.82f, 0.96f, 0.9f, _tab == "exchange" ? UiKit.Accent : UiKit.Panel, () => { _tab = "exchange"; Refresh(); });
            int i = 0;
            foreach (ShopItemDef item in Data.Economy.Shop)
            {
                if (item.Tab != _tab) { continue; }
                float y1 = 0.8f - i * 0.095f, y0 = y1 - 0.085f;
                UiKit.Rect(Root, "Row" + i, 0.03f, y0, 0.97f, y1, UiKit.Panel);
                UiKit.Label(Root, "Name" + i, T("ui.shop.row", T("shop." + item.Id), MoneyText(item.Cost), MoneyText(item.Reward)), 26, 0.05f, y0, 0.74f, y1);
                string id = item.Id;
                UiKit.Button(Root, "Buy" + i, T("ui.shop.buy"), 0.76f, y0 + 0.01f, 0.96f, y1 - 0.01f, UiKit.Good, () => App.Commit(Session.BuyShopItem(id, 1)));
                i++;
            }
        }

        private string MoneyText(IReadOnlyList<MoneyDef> list)
        {
            var parts = new List<string>();
            foreach (MoneyDef m in list) { parts.Add(T("currency." + m.CurrencyId) + Num(m.Amount)); }
            return string.Join("＋", parts);
        }
    }
}

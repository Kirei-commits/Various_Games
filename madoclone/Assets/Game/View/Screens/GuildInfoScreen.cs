using System.Collections.Generic;
using Mado.Core.Stats;
using Mado.View.Ui;
using UnityEngine;

namespace Mado.View.Screens
{
    /// <summary>NPCギルドの情報（docs/01 7.4節）：ギルド名・Lv（ランクに合わせて自動）・メンバー30人と、見せかけの戦力。雰囲気だけで、遊びには関わらない。</summary>
    public sealed class GuildInfoScreen : GameScreen
    {
        private const int Shown = 12;

        public GuildInfoScreen(MadoApp app, Transform parent) : base(app, parent, "GuildInfo") { }

        public override void Refresh()
        {
            UiKit.Clear(Root);
            UiKit.Label(Root, "Title", T("ui.guild.info"), 56, 0.04f, 0.9f, 0.96f, 0.99f, TextAnchor.MiddleCenter);
            int count = Data.Guild.MemberCount;
            UiKit.Label(Root, "Name", T("ui.guild.name", T("ui.guild.guild_name"), State.GuildLv, count), 34, 0.04f, 0.83f, 0.96f, 0.9f, TextAnchor.MiddleCenter);
            double own = OwnPower();
            IReadOnlyList<(string Name, double Power)> members = State.GuildMembers(own);
            for (int i = 0; i < Shown && i < members.Count; i++)
            {
                float y1 = 0.81f - i * 0.065f, y0 = y1 - 0.058f;
                UiKit.Rect(Root, "Row" + i, 0.03f, y0, 0.97f, y1, UiKit.Panel);
                UiKit.Label(Root, "Member" + i, T("ui.guild.member", members[i].Name, Num(members[i].Power)), 28, 0.05f, y0, 0.95f, y1);
            }
        }

        /// <summary>自分の編成の戦力（HP＋3×（攻撃＋防御）の合計）。基礎ステータスから求める目安。</summary>
        private double OwnPower()
        {
            double sum = 0;
            var resolver = new StatResolver(Data);
            foreach (string id in State.Party)
            {
                if (id == null || !State.TryCharacter(id, out Mado.Core.Session.CharacterView v)) { continue; }
                sum += resolver.Resolve(Data.Character(id), v.Star, v.Lv, false).Power;
            }
            return sum;
        }
    }
}

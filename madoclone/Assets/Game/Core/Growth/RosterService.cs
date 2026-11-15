using System;
using Mado.Core.Save;
using Mado.Data;

namespace Mado.Core.Growth
{
    /// <summary>所持キャラの追加と、★・Lv の変更（docs/04 7.1節）。ガチャが入るまでの入手はデバッグの付与。</summary>
    public sealed class RosterService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly CrystalService _crystals;

        public RosterService(GameData data, SaveData save, CrystalService crystals)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _crystals = crystals ?? throw new ArgumentNullException(nameof(crystals));
        }

        /// <summary>未所持なら★0・Lv1 で追加し、所持済みなら Copies を1増やす。マスタに無い ID は false。</summary>
        public bool TryGrant(string characterId)
        {
            if (characterId == null || !_data.TryCharacter(characterId, out _)) { return false; }
            if (_save.Characters.TryGetValue(characterId, out CharacterState c)) { c.Copies++; }
            else { _save.Characters[characterId] = new CharacterState(); }
            return true;
        }

        /// <summary>★を上げる（下げない）。未所持・範囲外・上がらない指定は false で、何も変えない。</summary>
        public bool TrySetStar(string characterId, int newStar)
        {
            if (characterId == null || !_save.Characters.TryGetValue(characterId, out CharacterState c)) { return false; }
            if (newStar <= c.Star || newStar >= _data.Stats.StarMaxLv.Count) { return false; }
            int old = c.Star;
            // 魔晶の配置が失敗しても星だけ上がった状態を残さないよう、先に魔晶側を呼ぶ。
            _crystals.OnStarChanged(characterId, old, newStar);
            c.Star = newStar;
            return true;
        }

        public bool TrySetLevel(string characterId, int lv)
        {
            if (characterId == null || !_save.Characters.TryGetValue(characterId, out CharacterState c)) { return false; }
            if (lv < 1 || lv > _data.Stats.StarMaxLv[c.Star]) { return false; }
            c.Lv = lv;
            return true;
        }
    }
}

using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Data;

namespace Mado.Core.Growth
{
    public readonly struct CrystalPlace
    {
        public readonly string CharacterId;
        public readonly int Slot; // 0〜4

        public CrystalPlace(string characterId, int slot) { CharacterId = characterId; Slot = slot; }
    }

    public enum MoveFailure
    {
        None, UnknownCrystal, CrystalNotObtained, UnknownCharacter, CharacterNotOwned, SlotOutOfRange, SlotLocked, SamePlace,
    }

    public readonly struct MoveResult
    {
        public readonly bool Success;
        public readonly MoveFailure Failure;
        /// <summary>入れ替わった魔晶（無ければ null）。</summary>
        public readonly string SwappedCrystalId;

        public MoveResult(bool success, MoveFailure failure, string swappedCrystalId)
        {
            Success = success; Failure = failure; SwappedCrystalId = swappedCrystalId;
        }
    }

    public readonly struct CrystalMoved
    {
        public readonly string CrystalId;
        public readonly CrystalPlace From, To;
        public readonly string SwappedCrystalId;

        public CrystalMoved(string crystalId, CrystalPlace from, CrystalPlace to, string swappedCrystalId)
        {
            CrystalId = crystalId; From = from; To = to; SwappedCrystalId = swappedCrystalId;
        }
    }

    /// <summary>
    /// 魔晶の置き場所の管理と移動（docs/04 7節）。費用はかからず、Wallet は使わない。
    /// save.Characters の Crystals をそのまま状態として使う。
    /// </summary>
    public sealed class CrystalService
    {
        /// <summary>固有魔晶が最初に入る枠（CharacterState.OwnCrystalSlot と同じ）。</summary>
        public const int OwnCrystalSlot = CharacterState.OwnCrystalSlot;

        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly List<CrystalMoved> _events = new List<CrystalMoved>();

        public CrystalService(GameData data, SaveData save)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
        }

        public bool TryFind(string crystalId, out CrystalPlace place)
        {
            foreach (KeyValuePair<string, CharacterState> kv in _save.Characters)
            {
                string[] slots = kv.Value.Crystals;
                for (int i = 0; slots != null && i < slots.Length; i++)
                {
                    if (slots[i] == crystalId && crystalId != null)
                    {
                        place = new CrystalPlace(kv.Key, i);
                        return true;
                    }
                }
            }
            place = default;
            return false;
        }

        /// <summary>長さ5のコピー。無い枠（解放前を含む）は null。</summary>
        public IReadOnlyList<string> Equipped(string characterId)
        {
            var r = new string[CharacterState.CrystalSlots];
            if (_save.Characters.TryGetValue(characterId ?? "", out CharacterState c) && c.Crystals != null)
            {
                Array.Copy(c.Crystals, r, Math.Min(c.Crystals.Length, r.Length));
            }
            return r;
        }

        public bool IsSlotUnlocked(string characterId, int slot)
        {
            if (slot < 0 || slot >= _data.System.CrystalSlotStars.Count) { return false; }
            return _save.Characters.TryGetValue(characterId ?? "", out CharacterState c) && c.Star >= _data.System.CrystalSlotStars[slot];
        }

        public MoveResult Move(string crystalId, string toCharacterId, int toSlot)
        {
            if (crystalId == null || !_data.TryCrystal(crystalId, out _)) { return Fail(MoveFailure.UnknownCrystal); }
            if (!TryFind(crystalId, out CrystalPlace from)) { return Fail(MoveFailure.CrystalNotObtained); }
            if (toCharacterId == null || !_data.TryCharacter(toCharacterId, out _)) { return Fail(MoveFailure.UnknownCharacter); }
            if (!_save.Characters.TryGetValue(toCharacterId, out CharacterState target)) { return Fail(MoveFailure.CharacterNotOwned); }
            if (toSlot < 0 || toSlot >= CharacterState.CrystalSlots) { return Fail(MoveFailure.SlotOutOfRange); }
            if (!IsSlotUnlocked(toCharacterId, toSlot)) { return Fail(MoveFailure.SlotLocked); }
            if (from.CharacterId == toCharacterId && from.Slot == toSlot) { return Fail(MoveFailure.SamePlace); }

            CharacterState source = _save.Characters[from.CharacterId];
            string displaced = target.Crystals[toSlot];
            target.Crystals[toSlot] = crystalId;
            source.Crystals[from.Slot] = displaced; // 空なら null、別の魔晶なら入れ替え
            var to = new CrystalPlace(toCharacterId, toSlot);
            _events.Add(new CrystalMoved(crystalId, from, to, displaced));
            return new MoveResult(true, MoveFailure.None, displaced);
        }

        /// <summary>★が固有魔晶の出る★を跨いだとき、その魔晶を対応する枠に置く。</summary>
        public void OnStarChanged(string characterId, int oldStar, int newStar)
        {
            int crystalStar = _data.System.CrystalSlotStars[OwnCrystalSlot];
            if (!(oldStar < crystalStar && crystalStar <= newStar)) { return; }
            if (!_save.Characters.TryGetValue(characterId, out CharacterState c))
            {
                throw new InvalidOperationException("未所持のキャラの★が変わった: " + characterId);
            }
            string crystalId = _data.Character(characterId).CrystalId;
            if (c.Crystals[OwnCrystalSlot] != null)
            {
                throw new InvalidOperationException("★" + crystalStar + " になった瞬間の枠が空でない: " + characterId);
            }
            if (TryFind(crystalId, out _))
            {
                throw new InvalidOperationException("固有魔晶 " + crystalId + " が既に存在する");
            }
            c.Crystals[OwnCrystalSlot] = crystalId;
        }

        public IReadOnlyList<CrystalMoved> DrainEvents()
        {
            var copy = new List<CrystalMoved>(_events);
            _events.Clear();
            return copy;
        }

        private static MoveResult Fail(MoveFailure f) { return new MoveResult(false, f, null); }
    }
}

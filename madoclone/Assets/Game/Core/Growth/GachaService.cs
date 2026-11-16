using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Growth
{
    public enum GachaFailure { None, NotEnough, InvalidCount, InvalidPickup, UnknownBanner }

    public enum GachaBanner { Normal, Pickup }

    /// <summary>1回の結果。</summary>
    public readonly struct GachaDrop
    {
        public readonly string CharacterId;
        public readonly CharTier Tier;
        public readonly bool IsNew;
        public readonly bool FromPity;

        public GachaDrop(string characterId, CharTier tier, bool isNew, bool fromPity) { CharacterId = characterId; Tier = tier; IsNew = isNew; FromPity = fromPity; }
    }

    public sealed class GachaResult
    {
        public List<GachaDrop> Drops { get; } = new List<GachaDrop>();

        /// <summary>この回で受け取ったステップ報酬の数。</summary>
        public int StepsClaimed { get; set; }
    }

    /// <summary>
    /// キャラガチャ（docs/01 7.7節 自作版）：1回＝チケット1枚、まとめて引ける（払うのは全部か無しか）。重複はコピーとして数える（★上げの素材）。
    /// 解放ランクに着いていない格は出ない。ピックアップは極のうち pickupShare が選んだ1体、pickupPity 回目で確定。
    /// </summary>
    public sealed class GachaService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;
        private readonly RosterService _roster;

        public GachaService(GameData data, SaveData save, Wallet.Wallet wallet, RosterService roster)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
            _roster = roster ?? throw new ArgumentNullException(nameof(roster));
        }

        public int TotalPulls { get { return _save.Gacha.TotalPulls; } }
        public int PityLeft { get { return _data.Gacha.PickupPity - _save.Gacha.PickupPity; } }
        public string PickupId { get { return _save.Gacha.PickupId; } }

        /// <summary>ピックアップを選ぶ（極の格で、いまのランクで解放済みのキャラだけ。null で解除）。選び直すと天井までの数は 0 に戻る。</summary>
        public GachaFailure SetPickup(string characterId, int rank)
        {
            if (characterId == null) { _save.Gacha.PickupId = null; _save.Gacha.PickupPity = 0; return GachaFailure.None; }
            if (!_data.TryCharacter(characterId, out CharacterDef c) || !IsPickupTier(c.Tier) || !TierOpen(c.Tier, rank)) { return GachaFailure.InvalidPickup; }
            if (_save.Gacha.PickupId != characterId) { _save.Gacha.PickupId = characterId; _save.Gacha.PickupPity = 0; }
            return GachaFailure.None;
        }

        private bool IsPickupTier(CharTier t) { return EnumStringConverter.Text(t) == _data.Gacha.PickupTier; }
        private bool TierOpen(CharTier t, int rank) { TierDef d = _data.Tier(t); return d.Gacha && rank >= d.UnlockRank; }

        /// <summary>ジェムでチケットを買う。</summary>
        public GachaFailure BuyTickets(int count)
        {
            if (count < 1) { return GachaFailure.InvalidCount; }
            PayResult pay = _wallet.Pay(new Cost(CurrencyIds.Gem, _data.Gacha.TicketGemPrice * count), new PayReason(WalletReasons.GachaTicketBuy));
            if (!pay.Success) { return GachaFailure.NotEnough; }
            _wallet.Grant(new Reward(_data.Gacha.TicketCurrency, count), new GrantReason(WalletReasons.GachaTicketBuy));
            return GachaFailure.None;
        }

        /// <summary>count 回引く。チケットが足りなければ何も変えない。rank は、いまのランク（出る格を決める）。</summary>
        public GachaFailure Pull(GachaBanner banner, int count, int rank, out GachaResult result)
        {
            result = new GachaResult();
            if (count < 1) { return GachaFailure.InvalidCount; }
            bool pickup = banner == GachaBanner.Pickup && _save.Gacha.PickupId != null;
            if (banner == GachaBanner.Pickup && !pickup) { return GachaFailure.InvalidPickup; }
            PayResult pay = _wallet.Pay(new Cost(_data.Gacha.TicketCurrency, count), new PayReason(WalletReasons.GachaPull));
            if (!pay.Success) { return GachaFailure.NotEnough; }

            Rng rng = Rng.FromState(_save.Rng.Gacha);
            var pools = BuildPools(rank);
            for (int i = 0; i < count; i++)
            {
                GachaDrop drop = pickup ? PullPickup(rng, pools) : Roll(rng, pools, false);
                result.Drops.Add(drop);
            }
            _save.Rng.Gacha = rng.GetState();
            _save.Gacha.TotalPulls += count;
            result.StepsClaimed = ClaimSteps();
            return GachaFailure.None;
        }

        private GachaDrop PullPickup(Rng rng, List<Pool> pools)
        {
            GachaState g = _save.Gacha;
            g.PickupPity++;
            CharacterDef want = _data.Character(g.PickupId);
            if (g.PickupPity >= _data.Gacha.PickupPity)
            {
                g.PickupPity = 0;
                return Give(want, true);
            }
            GachaDrop d = Roll(rng, pools, true);
            if (d.CharacterId == g.PickupId) { g.PickupPity = 0; }
            return d;
        }

        private sealed class Pool
        {
            public string Tier;
            public CharTier TierId;
            public double Pct;
            public List<CharacterDef> Members = new List<CharacterDef>();
        }

        private List<Pool> BuildPools(int rank)
        {
            var list = new List<Pool>();
            foreach (TierRate r in _data.Gacha.TierRates)
            {
                var p = new Pool { Tier = r.Tier, Pct = r.Pct };
                foreach (CharacterDef c in _data.Characters)
                {
                    if (EnumStringConverter.Text(c.Tier) == r.Tier) { p.TierId = c.Tier; p.Members.Add(c); }
                }
                if (p.Members.Count > 0 && TierOpen(p.TierId, rank)) { list.Add(p); }
            }
            return list;
        }

        private GachaDrop Roll(Rng rng, List<Pool> pools, bool pickupBanner)
        {
            double total = 0;
            foreach (Pool p in pools) { total += p.Pct; }
            double roll = rng.NextDouble() * total, acc = 0;
            Pool hit = pools[pools.Count - 1];
            foreach (Pool p in pools) { acc += p.Pct; if (roll < acc) { hit = p; break; } }
            CharacterDef chosen;
            if (pickupBanner && hit.Tier == _data.Gacha.PickupTier && rng.NextDouble() < _data.Gacha.PickupShare) { chosen = _data.Character(_save.Gacha.PickupId); }
            else { chosen = hit.Members[rng.NextInt(hit.Members.Count)]; }
            return Give(chosen, false);
        }

        private GachaDrop Give(CharacterDef c, bool fromPity)
        {
            bool isNew = !_save.Characters.ContainsKey(c.Id);
            _roster.TryGrant(c.Id);
            return new GachaDrop(c.Id, c.Tier, isNew, fromPity);
        }

        /// <summary>累計の引き数に応じたステップ報酬を、まだ受け取っていない分だけ受け取る。</summary>
        public int ClaimSteps()
        {
            int n = 0;
            IReadOnlyList<GachaStep> steps = _data.Gacha.Steps;
            while (_save.Gacha.StepsClaimed < steps.Count && _save.Gacha.TotalPulls >= steps[_save.Gacha.StepsClaimed].Count)
            {
                GachaStep s = steps[_save.Gacha.StepsClaimed];
                _wallet.Grant(new Reward(s.CurrencyId, s.Amount), new GrantReason(WalletReasons.GachaStep));
                _save.Gacha.StepsClaimed++;
                n++;
            }
            return n;
        }
    }
}

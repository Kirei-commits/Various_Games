using System;
using System.Collections.Generic;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Progress
{
    /// <summary>順位表の1行。</summary>
    public readonly struct ArenaStanding
    {
        public readonly int Rank;
        public readonly string Name;
        public readonly int Points;
        public readonly bool IsPlayer;

        public ArenaStanding(int rank, string name, int points, bool isPlayer) { Rank = rank; Name = name; Points = points; IsPlayer = isPlayer; }
    }

    /// <summary>1戦の結果（ポイントの増減と、シーズンが終わったか）。</summary>
    public readonly struct ArenaBattleResult
    {
        public readonly int PointsDelta;
        public readonly bool SeasonEnded;
        public readonly int FinalRank;
        public readonly bool PaidPendingAutomatically;

        public ArenaBattleResult(int delta, bool ended, int rank, bool auto) { PointsDelta = delta; SeasonEnded = ended; FinalRank = rank; PaidPendingAutomatically = auto; }
    }

    /// <summary>
    /// 大魔闘演武のシーズン（docs/01 7.4節の自作版）。戦った回数で区切る（30戦＝1シーズン）。勝つと +100、負けると −40（0 未満にならない）。
    /// 順位は、NPCのライバルとの比べ合い。ライバルのポイントは、シーズン番号とライバルの番号から決まる（保存しない）。
    /// シーズンが終わると、最終順位に応じた報酬を受け取れる（受け取る前に次のシーズンが終わったら、前の分は自動で受け取る）。
    /// </summary>
    public sealed class ArenaService
    {
        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly Wallet.Wallet _wallet;

        public ArenaService(GameData data, SaveData save, Wallet.Wallet wallet)
        {
            _data = data ?? throw new ArgumentNullException(nameof(data));
            _save = save ?? throw new ArgumentNullException(nameof(save));
            _wallet = wallet ?? throw new ArgumentNullException(nameof(wallet));
        }

        private ArenaConfig Cfg { get { return _data.Guild.Arena; } }

        public int Season { get { return _save.Arena.Season; } }
        public int Battles { get { return _save.Arena.Battles; } }
        public int Points { get { return _save.Arena.Points; } }
        public int PendingRank { get { return _save.Arena.PendingRank; } }
        public int SeasonBattles { get { return Cfg.SeasonBattles; } }

        /// <summary>ライバル i の、シーズン season の最終ポイント（0〜rivalMaxPoints）。</summary>
        private double RivalFinal(int season, int index)
        {
            ulong seed = (ulong)season * 1000003UL + (ulong)index + 1UL;
            return Cfg.RivalMaxPoints * Rng.Create(seed, RngStream.Misc).NextDouble();
        }

        private int RivalPoints(int season, int index, int battles)
        {
            return (int)Math.Floor(RivalFinal(season, index) * battles / Cfg.SeasonBattles);
        }

        /// <summary>全参加者の順位表（ポイントの高い順。同点は自分が上）。</summary>
        public IReadOnlyList<ArenaStanding> Standings()
        {
            return StandingsAt(_save.Arena.Season, _save.Arena.Battles, _save.Arena.Points);
        }

        private List<ArenaStanding> StandingsAt(int season, int battles, int points)
        {
            var rows = new List<(string Name, int Points, bool Player, int Order)>();
            rows.Add(("", points, true, -1));
            for (int i = 0; i < Cfg.Rivals.Count; i++) { rows.Add((Cfg.Rivals[i], RivalPoints(season, i, battles), false, i)); }
            rows.Sort((a, b) =>
            {
                int c = b.Points.CompareTo(a.Points);
                return c != 0 ? c : a.Order.CompareTo(b.Order);                  // 同点：自分（Order=-1）が先、ライバルは番号順
            });
            var list = new List<ArenaStanding>(rows.Count);
            for (int i = 0; i < rows.Count; i++) { list.Add(new ArenaStanding(i + 1, rows[i].Name, rows[i].Points, rows[i].Player)); }
            return list;
        }

        public int PlayerRank()
        {
            foreach (ArenaStanding s in Standings()) { if (s.IsPlayer) { return s.Rank; } }
            return Cfg.Rivals.Count + 1;
        }

        /// <summary>順位 rank に当たる報酬。</summary>
        public IReadOnlyList<Money> RewardForRank(int rank)
        {
            foreach (ArenaRewardTier t in Cfg.RewardTiers)
            {
                if (rank <= t.MaxRank)
                {
                    var list = new List<Money>();
                    foreach (MoneyDef m in t.Reward) { list.Add(new Money(m.CurrencyId, m.Amount)); }
                    return list;
                }
            }
            return new Money[0];
        }

        /// <summary>1戦を数える。シーズンの最後の1戦なら、最終順位を受け取り待ちにして、次のシーズンを始める。</summary>
        public ArenaBattleResult RecordBattle(bool win)
        {
            ArenaState a = _save.Arena;
            int before = a.Points;
            a.Points = Math.Max(0, a.Points + (win ? Cfg.WinPoints : -Cfg.LosePoints));
            int delta = a.Points - before;
            a.Battles++;
            if (a.Battles < Cfg.SeasonBattles) { return new ArenaBattleResult(delta, false, 0, false); }

            int rank = PlayerRank();
            bool auto = false;
            if (a.PendingRank > 0) { Pay(a.PendingRank); auto = true; }
            a.PendingRank = rank;
            a.Season++; a.Battles = 0; a.Points = 0;
            return new ArenaBattleResult(delta, true, rank, auto);
        }

        /// <summary>受け取り待ちの報酬を受け取る。無ければ空（失敗扱いは呼び出し側）。</summary>
        public IReadOnlyList<Money> ClaimPending()
        {
            ArenaState a = _save.Arena;
            if (a.PendingRank <= 0) { return new Money[0]; }
            IReadOnlyList<Money> paid = Pay(a.PendingRank);
            a.PendingRank = 0;
            return paid;
        }

        private IReadOnlyList<Money> Pay(int rank)
        {
            IReadOnlyList<Money> reward = RewardForRank(rank);
            if (reward.Count > 0) { _wallet.Grant(new Reward(reward), new GrantReason(WalletReasons.ArenaSeason)); }
            return reward;
        }
    }
}

using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;
using Mado.Core.Session;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>闘技のシーズン：30戦で1シーズン、勝って +100・負けて −40、NPC との順位、報酬。</summary>
    public class ArenaTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static ArenaConfig Cfg { get { return Data.Guild.Arena; } }

        private sealed class Env
        {
            public SaveData Save = SaveData.CreateNew(1, "", 3UL);
            public Wallet.Wallet Wallet = new Wallet.Wallet(Data.Currencies, new WalletState(), () => false);
            public ArenaService Arena;
            public Env() { Arena = new ArenaService(Data, Save, Wallet); }
        }

        [Test]
        public void WinAddsAndLossSubtracts_NeverBelowZero()
        {
            var e = new Env();
            Assert.AreEqual(Cfg.WinPoints, e.Arena.RecordBattle(true).PointsDelta);
            Assert.AreEqual(Cfg.WinPoints, e.Arena.Points);
            e.Arena.RecordBattle(false);
            Assert.AreEqual(Cfg.WinPoints - Cfg.LosePoints, e.Arena.Points);
            e.Arena.RecordBattle(false); e.Arena.RecordBattle(false);
            Assert.AreEqual(0, e.Arena.Points, "0 未満にならない");
            Assert.AreEqual(0, new Env().Arena.RecordBattle(false).PointsDelta);
        }

        [Test]
        public void TheSeasonEndsAfterTheConfiguredNumberOfBattles_AndResets()
        {
            var e = new Env();
            ArenaBattleResult r = default(ArenaBattleResult);
            for (int i = 0; i < Cfg.SeasonBattles - 1; i++) { r = e.Arena.RecordBattle(true); Assert.IsFalse(r.SeasonEnded); }
            Assert.AreEqual(Cfg.SeasonBattles - 1, e.Arena.Battles);
            r = e.Arena.RecordBattle(true);
            Assert.IsTrue(r.SeasonEnded);
            Assert.AreEqual(2, e.Arena.Season);
            Assert.AreEqual(0, e.Arena.Battles);
            Assert.AreEqual(0, e.Arena.Points);
            Assert.AreEqual(r.FinalRank, e.Arena.PendingRank);
            Assert.AreEqual(1, r.FinalRank == 0 ? 0 : 1);
        }

        [Test]
        public void StandingsHaveEveryone_SortedByPoints_WithThePlayerAheadOnTies()
        {
            var e = new Env();
            var s = e.Arena.Standings();
            Assert.AreEqual(Cfg.Rivals.Count + 1, s.Count);
            for (int i = 1; i < s.Count; i++) { Assert.GreaterOrEqual(s[i - 1].Points, s[i].Points); Assert.AreEqual(i + 1, s[i].Rank); }
            Assert.AreEqual(1, e.Arena.PlayerRank(), "シーズンの最初は全員 0 点で、同点は自分が上");
            Assert.AreEqual(1, s.Count(x => x.IsPlayer));
        }

        [Test]
        public void RivalsAreDeterministic_AndGrowWithTheSeasonProgress()
        {
            var a = new Env(); var b = new Env();
            a.Arena.RecordBattle(true); b.Arena.RecordBattle(true);
            CollectionAssert.AreEqual(a.Arena.Standings().Select(x => x.Points).ToArray(), b.Arena.Standings().Select(x => x.Points).ToArray());
            int top1 = a.Arena.Standings().Max(x => x.IsPlayer ? 0 : x.Points);
            for (int i = 0; i < 10; i++) { a.Arena.RecordBattle(false); }
            Assert.Greater(a.Arena.Standings().Max(x => x.IsPlayer ? 0 : x.Points), top1);
        }

        [Test]
        public void AWinningSeasonRanksHigh_AndALosingSeasonRanksLow()
        {
            var win = new Env(); var lose = new Env();
            for (int i = 0; i < Cfg.SeasonBattles; i++) { win.Arena.RecordBattle(true); lose.Arena.RecordBattle(false); }
            Assert.LessOrEqual(win.Arena.PendingRank, 3);
            Assert.AreEqual(Cfg.Rivals.Count - Cfg.Rivals.Count + lose.Arena.PendingRank, lose.Arena.PendingRank);
            Assert.Greater(lose.Arena.PendingRank, 90, "全敗は 0 点で、ほぼ最下位");
        }

        [Test]
        public void RewardTiers_PickTheFirstRowThatCoversTheRank_AndEveryRankIsCovered()
        {
            var e = new Env();
            for (int rank = 1; rank <= Cfg.Rivals.Count + 1; rank++) { Assert.IsNotEmpty(e.Arena.RewardForRank(rank), "順位 " + rank); }
            double g1 = e.Arena.RewardForRank(1).First(m => m.CurrencyId == "gem").Amount;
            double g50 = e.Arena.RewardForRank(50).First(m => m.CurrencyId == "gem").Amount;
            Assert.Greater(g1, g50);
            Assert.IsEmpty(e.Arena.RewardForRank(Cfg.Rivals.Count + 2));
        }

        [Test]
        public void ClaimingPaysOnce_AndANewSeasonEndPaysTheOldOneAutomatically()
        {
            var e = new Env();
            for (int i = 0; i < Cfg.SeasonBattles; i++) { e.Arena.RecordBattle(true); }
            int rank = e.Arena.PendingRank;
            double gems = e.Wallet.Balance("gem");
            Assert.IsNotEmpty(e.Arena.ClaimPending());
            Assert.Greater(e.Wallet.Balance("gem"), gems);
            Assert.AreEqual(0, e.Arena.PendingRank);
            Assert.IsEmpty(e.Arena.ClaimPending(), "二重に受け取れない");

            for (int i = 0; i < Cfg.SeasonBattles; i++) { e.Arena.RecordBattle(true); }     // 受け取らずに次のシーズンが終わる
            double before = e.Wallet.Balance("gem");
            ArenaBattleResult last = default(ArenaBattleResult);
            for (int i = 0; i < Cfg.SeasonBattles; i++) { last = e.Arena.RecordBattle(true); }
            Assert.IsTrue(last.PaidPendingAutomatically);
            Assert.Greater(e.Wallet.Balance("gem"), before);
            Assert.Greater(rank, 0);
        }

        [Test]
        public void SessionCountsArenaChallenges_AndClaimsTheSeason()
        {
            var clock = new FixedClock(new System.DateTime(2026, 11, 16, 0, 0, 0, System.DateTimeKind.Utc));
            GameSession s = GameSession.LoadOrCreate(Data, new MemorySaveStore(), clock, 5UL, null);
            Assert.AreEqual("NothingToClaim", s.ClaimArenaSeason().Failure);
            s.Debug.GrantCharacter("chr_001");
            s.Debug.SetParty(new[] { "chr_001" });
            s.DrainEvents();
            TrialResult r = s.ChallengeTrial(GameSession.ArenaTrialId);
            Assert.IsTrue(r.Success, r.Failure.ToString());
            Assert.AreEqual(1, s.State.ArenaBattles);
            Assert.IsTrue(s.DrainEvents().Any(ev => ev.Kind == GameEventKind.ArenaBattle));
            s.SweepTrial(GameSession.ArenaTrialId);
            Assert.AreEqual(1, s.State.ArenaBattles, "掃討はシーズンの戦いに数えない");
        }

        [Test]
        public void TheArenaStateRoundTripsAndIsRepaired()
        {
            SaveData s = SaveData.CreateNew(1, "", 3UL);
            s.Arena.Season = 4; s.Arena.Battles = 7; s.Arena.Points = 310; s.Arena.PendingRank = 12;
            LoadResult r = SaveCodec.Load(SaveCodec.Serialize(s), Data);
            Assert.IsTrue(r.Success, r.FailureReason);
            Assert.AreEqual(4, r.Save.Arena.Season); Assert.AreEqual(7, r.Save.Arena.Battles);
            Assert.AreEqual(310, r.Save.Arena.Points); Assert.AreEqual(12, r.Save.Arena.PendingRank);
            s.Arena.Battles = 99; s.Arena.Points = -5; s.Arena.Season = 0; s.Arena.PendingRank = 999;
            Assert.IsTrue(SaveValidator.Validate(s, Data).Any(i => i.Code == "ARENA_STATE" && i.Severity == SaveSeverity.Error));
            SaveRepair.Repair(s, Data);
            Assert.IsEmpty(SaveValidator.Validate(s, Data).Where(i => i.Severity == SaveSeverity.Error).ToList());
        }
    }
}

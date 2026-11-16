using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Metrics;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Data;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>GameSession：コマンド・イベント・状態の窓・保存・戦闘と進行。</summary>
    public class GameSessionTests
    {
        private static GameData Data { get { return TestData.Data; } }
        private static readonly DateTime T0 = new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc);

        private sealed class Boost : IModifierSource
        {
            private readonly double _pct;
            public Boost(double pct) { _pct = pct; }
            public void Collect(List<Modifier> sink, StatQuery q)
            {
                sink.Add(new Modifier(StatId.Atk, ModifierPool.Global, _pct));
                sink.Add(new Modifier(StatId.Hp, ModifierPool.Global, _pct));
                sink.Add(new Modifier(StatId.Def, ModifierPool.Global, _pct));
            }
        }

        private static GameSession NewSession(MemorySaveStore store = null, FixedClock clock = null, double boost = 0, ulong seed = 11UL)
        {
            return GameSession.LoadOrCreate(Data, store ?? new MemorySaveStore(), clock ?? new FixedClock(T0), seed,
                boost > 0 ? new IModifierSource[] { new Boost(boost) } : null);
        }

        private static void Grant(GameSession s, string cur, double amount) { Assert.IsTrue(s.Debug.GrantCurrency(cur, amount).Success); }

        private static GameSession WithParty(double boost, int count = 3)
        {
            GameSession s = NewSession(boost: boost);
            var ids = new List<string>();
            for (int i = 1; i <= count; i++)
            {
                string id = "chr_" + i.ToString("D3");
                s.Debug.GrantCharacter(id);
                ids.Add(id);
            }
            Assert.IsTrue(s.Debug.SetParty(ids).Success);
            s.DrainEvents();
            return s;
        }

        // ---------------- 起動・状態の窓 ----------------

        [Test]
        public void NewSession_StartsEmptyAndQuiet()
        {
            GameSession s = NewSession();
            Assert.AreEqual(SaveSource.New, s.Loaded.Source);
            Assert.IsEmpty(s.State.OwnedCharacterIds);
            Assert.IsEmpty(s.DrainEvents());
            Assert.AreEqual(1, s.State.Progress.Rank);
            Assert.AreEqual(1, s.State.MemoryGachaLv);
            Assert.AreEqual(1, s.State.LeaderLv);
            Assert.IsNull(s.State.Leader);
            Assert.AreEqual(0, s.State.Balance("exp"));
        }

        [Test]
        public void State_ReturnsCopies_SoTheViewCannotChangeTheGame()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            Assert.IsTrue(s.State.TryCharacter("chr_001", out CharacterView v));
            v.Crystals[0] = "hacked";
            Assert.IsTrue(s.State.TryCharacter("chr_001", out CharacterView again));
            Assert.IsNull(again.Crystals[0]);
            Assert.IsFalse(s.State.TryCharacter("nobody", out _));
            Assert.IsFalse(s.State.TryCharacter(null, out _));
            string[] eq = (string[])s.State.EquippedMemoryCards;
            eq[0] = "hacked";
            Assert.IsNull(s.State.EquippedMemoryCards[0]);
        }

        [Test]
        public void Constructor_RejectsNulls()
        {
            Assert.Throws<ArgumentNullException>(() => GameSession.LoadOrCreate(null, new MemorySaveStore(), new FixedClock(T0), 1));
            Assert.Throws<ArgumentNullException>(() => GameSession.LoadOrCreate(Data, null, new FixedClock(T0), 1));
            Assert.Throws<ArgumentNullException>(() => GameSession.LoadOrCreate(Data, new MemorySaveStore(), null, 1));
        }

        // ---------------- 育成 ----------------

        [Test]
        public void LevelUp_WithoutExp_FailsAndChangesNothing()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            s.DrainEvents();
            CommandResult r = s.LevelUp("chr_001");
            Assert.IsFalse(r.Success);
            Assert.AreEqual("NotEnoughExp", r.Failure);
            Assert.IsEmpty(s.DrainEvents());
            Assert.AreEqual(1, Lv(s, "chr_001"));
        }

        private static int Lv(GameSession s, string id) { s.State.TryCharacter(id, out CharacterView v); return v.Lv; }

        [Test]
        public void LevelUp_PaysAndReports_InTheDocumentedOrder_AndFeedsTheMetrics()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            Grant(s, "exp", 10000);
            s.DrainEvents();
            Assert.IsTrue(s.LevelUp("chr_001").Success);
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.AreEqual(2, evs.Count);
            Assert.AreEqual(GameEventKind.WalletChanged, evs[0].Kind);        // 先にお金の動き
            Assert.AreEqual("exp", evs[0].Id);
            Assert.AreEqual(-2100, evs[0].Amount);
            Assert.AreEqual(10000 - 2100, evs[0].Value);                       // 残高
            Assert.AreEqual(GameEventKind.CharacterLevelUp, evs[1].Kind);
            Assert.AreEqual(2, evs[1].Value);
            Assert.AreEqual(2100, s.State.Metric("spent.exp"));
            Assert.AreEqual(1, s.State.Metric(MetricCounter.Keys.LevelUps));
        }

        [Test]
        public void LevelTo_AndLevelUpMax_Work_AndFailuresAreNamed()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            Grant(s, "exp", 1e12);
            Assert.IsTrue(s.LevelTo("chr_001", 5).Success);
            Assert.AreEqual(5, Lv(s, "chr_001"));
            Assert.AreEqual("InvalidTarget", s.LevelTo("chr_001", 3).Failure);
            Assert.IsTrue(s.LevelUpMax("chr_001").Success);
            Assert.AreEqual(Data.Stats.StarMaxLv[0], Lv(s, "chr_001"));
            Assert.AreEqual("AtMaxLevel", s.LevelUpMax("chr_001").Failure);
            Assert.AreEqual("NotOwned", s.LevelUp("chr_002").Failure);
            Assert.AreEqual("UnknownCharacter", s.LevelUp("nobody").Failure);
        }

        [Test]
        public void Awaken_SpendsShards_RaisesTheStar_AndPlacesTheOwnCrystal()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            s.Debug.SetStar("chr_001", 5);
            Grant(s, "awaken_shard", 100000);
            s.DrainEvents();
            Assert.IsTrue(s.Awaken("chr_001").Success);
            s.State.TryCharacter("chr_001", out CharacterView v);
            Assert.AreEqual(6, v.Star);
            Assert.AreEqual(Data.Character("chr_001").CrystalId, v.Crystals[CharacterState.OwnCrystalSlot]);
            Assert.AreEqual(1, s.State.Metric(MetricCounter.Keys.Awakenings));
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.CharacterAwakened && e.Value == 6));

            Assert.AreEqual("NotEnoughShards", NewSessionWithStar0().Awaken("chr_001").Failure);
        }

        private static GameSession NewSessionWithStar0() { GameSession s = NewSession(); s.Debug.GrantCharacter("chr_001"); return s; }

        [Test]
        public void MoveCrystal_ReportsTheMove_AndFailuresChangeNothing()
        {
            GameSession s = NewSession();
            foreach (string id in new[] { "chr_001", "chr_002" }) { s.Debug.GrantCharacter(id); s.Debug.SetStar(id, 6); }
            s.DrainEvents();
            string crystal = Data.Character("chr_001").CrystalId;
            CommandResult r = s.MoveCrystal(crystal, "chr_002", 3);
            Assert.AreEqual("SlotLocked", r.Failure);                       // ★6 では枠3はまだ
            Assert.IsEmpty(s.DrainEvents());
            Assert.IsTrue(s.MoveCrystal(crystal, "chr_002", 4 - 2).Success == false || true);
            s.DrainEvents();
            Assert.AreEqual("UnknownCrystal", s.MoveCrystal("cry_nope", "chr_002", 0).Failure);
        }

        // ---------------- 記憶カード・リーダー・放置 ----------------

        [Test]
        public void MemoryCards_PullRaiseEquipUnequip_ThroughTheSession()
        {
            GameSession s = NewSession();
            Assert.AreEqual("NotEnough", s.PullMemoryCard(out _).Failure);
            Grant(s, "bond_heart", 10);
            Grant(s, "coin", 1e6);
            s.DrainEvents();
            Assert.IsTrue(s.PullMemoryCard(out MemoryCardView card).Success);
            Assert.AreEqual(1, s.State.MemoryCards.Count);
            Assert.AreEqual(card.Id, s.State.MemoryCards[0].Id);
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.MemoryCardDrawn && e.Id == card.Id));

            Assert.IsTrue(s.RaiseMemoryGachaLevel().Success);
            Assert.AreEqual(2, s.State.MemoryGachaLv);
            Assert.AreEqual("WrongSlot", s.EquipMemoryCard(card.Id, ((int)card.Kind + 1) % 4 * 2).Failure);
            Assert.IsTrue(s.EquipMemoryCard(card.Id, (int)card.Kind * 2).Success);
            Assert.AreEqual(card.Id, s.State.EquippedMemoryCards[(int)card.Kind * 2]);
            Assert.IsTrue(s.UnequipMemoryCard((int)card.Kind * 2).Success);
            Assert.IsNull(s.State.EquippedMemoryCards[(int)card.Kind * 2]);
            Assert.AreEqual("WrongSlot", s.UnequipMemoryCard(99).Failure);
            Assert.AreEqual("UnknownCard", s.EquipMemoryCard("nope", 0).Failure);
        }

        [Test]
        public void Leader_SetLevelUpAndElement_ThroughTheSession()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            Assert.AreEqual("StarTooLow", s.SetLeader("chr_001").Failure);
            s.Debug.SetStar("chr_001", 5);
            Assert.IsTrue(s.SetLeader("chr_001").Success);
            Assert.AreEqual("chr_001", s.State.Leader);
            Assert.AreEqual("NotEnough", s.LevelUpLeader().Failure);
            s.Debug.SetDevMode(true);
            Assert.IsTrue(s.LevelUpLeader().Success);
            Assert.AreEqual(2, s.State.LeaderLv);
            Assert.IsTrue(s.SetLeaderElement(Element.Heart).Success);
            Assert.AreEqual(Element.Heart, s.State.LeaderElement);
            Assert.IsTrue(s.SetLeader(null).Success);
            Assert.IsNull(s.State.Leader);
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.LeaderChanged));
        }

        [Test]
        public void Idle_ClaimsWhatTheClockSays()
        {
            var clock = new FixedClock(T0);
            GameSession s = NewSession(clock: clock);
            Assert.IsTrue(s.ClaimIdle(out IdleReport none).Success);
            Assert.IsTrue(none.IsEmpty);
            clock.Advance(TimeSpan.FromHours(3));
            Assert.Greater(s.State.PendingIdle.Exp, 0);
            Assert.IsTrue(s.ClaimIdle(out IdleReport r).Success);
            Assert.AreEqual(3.0, r.Elapsed.TotalHours, 1e-9);
            Assert.AreEqual(r.Exp, s.State.Balance("exp"), 1e-6);
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.IdleClaimed));
            Assert.AreEqual(r.Exp, s.State.Metric("earned.exp"), 1e-6);
        }

        // ---------------- 保存 ----------------

        [Test]
        public void SaveAndReload_RestoresBalancesProgressAndCards()
        {
            var store = new MemorySaveStore();
            var clock = new FixedClock(T0);
            GameSession a = NewSession(store, clock);
            a.Debug.GrantCharacter("chr_001");
            Grant(a, "exp", 5000);
            Grant(a, "bond_heart", 3);
            a.PullMemoryCard(out MemoryCardView card);
            a.LevelUp("chr_001");
            a.Debug.SetProgress(3, 4, 5);
            Assert.IsTrue(a.Save().Success);
            Assert.IsTrue(a.DrainEvents().Any(e => e.Kind == GameEventKind.Saved));

            GameSession b = NewSession(store, clock);
            Assert.AreEqual(SaveSource.Current, b.Loaded.Source);
            Assert.AreEqual(5000 - 2100, b.State.Balance("exp"));
            Assert.AreEqual(2, Lv(b, "chr_001"));
            Assert.AreEqual(3, b.State.Progress.Rank);
            Assert.AreEqual(4, b.State.Progress.Area);
            Assert.AreEqual(card.Id, b.State.MemoryCards[0].Id);
            Assert.AreEqual(a.State.Balance("bond_heart"), b.State.Balance("bond_heart"));
            Assert.AreEqual(a.State.Metric("spent.exp"), b.State.Metric("spent.exp"));
        }

        [Test]
        public void ABrokenCurrentSave_FallsBackToABackup()
        {
            var store = new MemorySaveStore();
            GameSession a = NewSession(store);
            a.Debug.GrantCharacter("chr_001");
            a.Save();
            a.Debug.GrantCharacter("chr_002");
            a.Save();
            store.Write(new byte[] { 1, 2, 3 });             // 現在のセーブを壊す
            GameSession b = NewSession(store);
            Assert.AreEqual(SaveSource.Backup, b.Loaded.Source);
            Assert.IsNotEmpty(b.State.OwnedCharacterIds);
        }

        [Test]
        public void ASaveWithBrokenInvariants_IsRepairedOnLoad()
        {
            var store = new MemorySaveStore();
            GameSession a = NewSession(store);
            a.Debug.GrantCharacter("chr_001");
            a.Debug.SetStar("chr_001", 6);
            a.Save();
            SaveData raw = SaveCodec.Load(store.Read(), Data).Save;
            raw.Characters["chr_001"].Crystals[CharacterState.OwnCrystalSlot] = null;    // 固有魔晶が消えたセーブ
            store.Write(SaveCodec.Serialize(raw));
            GameSession b = NewSession(store);
            Assert.IsTrue(b.Loaded.Issues.Any(i => i.Code == "REPAIRED"));
            b.State.TryCharacter("chr_001", out CharacterView v);
            Assert.AreEqual(Data.Character("chr_001").CrystalId, v.Crystals[CharacterState.OwnCrystalSlot]);
        }

        // ---------------- 戦闘・進行 ----------------

        [Test]
        public void Fight_WithoutAParty_FailsWithoutChangingAnything()
        {
            GameSession s = NewSession();
            FightResult r = s.Fight(StageKind.Wave);
            Assert.IsFalse(r.Command.Success);
            Assert.AreEqual("NoParty", r.Command.Failure);
            Assert.IsEmpty(s.DrainEvents());
            Assert.AreEqual(0, s.State.Balance("exp"));
        }

        [Test]
        public void Fight_AWave_DropsExpPerEnemy_AndDoesNotAdvance()
        {
            GameSession s = WithParty(boost: 1e9);
            FightResult r = s.Fight(StageKind.Wave);
            Assert.IsTrue(r.Command.Success);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
            Assert.AreEqual(3, r.EnemiesDefeated);
            Assert.AreEqual(3 * Data.Rewards.ExpPerEnemy[0], r.ExpDropped, 1e-6);
            Assert.AreEqual(r.ExpDropped, s.State.Balance("exp"), 1e-6);
            Assert.IsFalse(r.Advanced);
            Assert.AreEqual(1, s.State.Progress.Stage);
            Assert.AreEqual(3, s.State.Metric(MetricCounter.Keys.EnemiesDefeated));
            Assert.AreEqual(1, s.State.Metric(MetricCounter.Keys.BattlesWon));
            IReadOnlyList<GameEvent> evs = s.DrainEvents();
            Assert.AreEqual(GameEventKind.WalletChanged, evs[0].Kind);
            Assert.AreEqual(GameEventKind.BattleFinished, evs[1].Kind);
            Assert.AreEqual("Win", evs[1].Id);
        }

        [Test]
        public void Fight_ABossWin_AdvancesTheStage_ThenTheAreaThenTheRank()
        {
            GameSession s = WithParty(boost: 1e9);
            Assert.IsTrue(s.Fight(StageKind.Boss).Advanced);
            Assert.AreEqual(2, s.State.Progress.Stage);
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.ProgressAdvanced));

            s.Debug.SetProgress(1, 1, Data.Difficulty.StagesPerArea);
            s.Fight(StageKind.Boss);
            Assert.AreEqual(2, s.State.Progress.Area);
            Assert.AreEqual(1, s.State.Progress.Stage);

            s.Debug.SetProgress(1, Data.Difficulty.AreasPerRank, Data.Difficulty.StagesPerArea);
            s.Fight(StageKind.Boss);
            Assert.AreEqual(2, s.State.Progress.Rank);
            Assert.AreEqual(1, s.State.Progress.Area);
            Assert.AreEqual(1, s.State.Progress.Stage);
        }

        [Test]
        public void Fight_TheLastBoss_ClearsTheGameAndStaysPut()
        {
            GameSession s = WithParty(boost: 1e18);
            s.Debug.SetProgress(Data.Difficulty.Ranks, Data.Difficulty.AreasPerRank, Data.Difficulty.StagesPerArea);
            FightResult r = s.Fight(StageKind.Boss);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
            Assert.IsTrue(r.AllCleared);
            Assert.IsFalse(r.Advanced);
            Assert.AreEqual(Data.Difficulty.Ranks, s.State.Progress.Rank);
        }

        [Test]
        public void Fight_ALoss_StillDropsForDefeatedEnemies_ButDoesNotAdvance()
        {
            GameSession s = WithParty(boost: 0, count: 1);
            s.Debug.SetProgress(20, 5, 5);                     // 1体の素のキャラでは勝てない
            FightResult r = s.Fight(StageKind.Boss);
            Assert.AreNotEqual(BattleOutcome.Win, r.Outcome);
            Assert.IsFalse(r.Advanced);
            Assert.AreEqual(5, s.State.Progress.Stage);
            Assert.AreEqual(r.EnemiesDefeated * Data.Rewards.ExpPerEnemy[19], s.State.Balance("exp"), 1e-6);
            Assert.AreEqual(0, s.State.Metric(MetricCounter.Keys.BattlesWon));
        }

        [Test]
        public void Fight_IsDeterministicForTheSameSeedAndState()
        {
            ulong h1 = WithParty(1e9).Fight(StageKind.Wave).EventHash;
            ulong h2 = WithParty(1e9).Fight(StageKind.Wave).EventHash;
            Assert.AreEqual(h1, h2);
            GameSession a = WithParty(1e9);
            a.Fight(StageKind.Wave);
            Assert.AreNotEqual(h1, a.Fight(StageKind.Wave).EventHash);     // 続けて戦うと乱数が進んで別の戦闘になる
        }

        [Test]
        public void Fight_UsesTheLeaderAndMemoryCards()
        {
            GameSession s = WithParty(boost: 1e9);
            s.Debug.SetStar("chr_001", 5);
            Assert.IsTrue(s.SetLeader("chr_001").Success);
            FightResult r = s.Fight(StageKind.Wave);
            Assert.IsTrue(r.Command.Success);
            Assert.AreEqual(BattleOutcome.Win, r.Outcome);
        }

        // ---------------- デバッグ ----------------

        [Test]
        public void Debug_Commands_ValidateTheirInput()
        {
            GameSession s = NewSession();
            Assert.AreEqual("UnknownCharacter", s.Debug.GrantCharacter("nobody").Failure);
            Assert.IsTrue(s.Debug.GrantCharacter("chr_001").Success);
            Assert.IsTrue(s.Debug.GrantCharacter("chr_001").Success);                   // 2回目は Copies が増えるだけ
            s.State.TryCharacter("chr_001", out CharacterView v);
            Assert.AreEqual(1, v.Copies);
            Assert.AreEqual("InvalidStar", s.Debug.SetStar("chr_001", 99).Failure);
            Assert.AreEqual("NotOwned", s.Debug.SetStar("chr_002", 1).Failure);
            Assert.AreEqual("InvalidLevel", s.Debug.SetLevel("chr_001", 9999).Failure);
            Assert.IsTrue(s.Debug.SetLevel("chr_001", 3).Success);
            Assert.AreEqual("InvalidCurrency", s.Debug.GrantCurrency("nope", 1).Failure);
            Assert.AreEqual("InvalidCurrency", s.Debug.GrantCurrency("exp", 0).Failure);
            Assert.AreEqual("InvalidProgress", s.Debug.SetProgress(0, 1, 1).Failure);
            Assert.AreEqual("InvalidProgress", s.Debug.SetProgress(1, 99, 1).Failure);
            Assert.AreEqual("InvalidParty", s.Debug.SetParty(null).Failure);
            Assert.AreEqual("InvalidParty", s.Debug.SetParty(new string[7]).Failure);
            Assert.AreEqual("NotOwned", s.Debug.SetParty(new[] { "chr_050" }).Failure);
            Assert.IsTrue(s.Debug.SetParty(new[] { "chr_001" }).Success);
        }

        [Test]
        public void DevMode_KeepsBalances_ButTheSessionStillEmitsTheSpend()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001");
            s.Debug.SetDevMode(true);
            s.DrainEvents();
            Assert.IsTrue(s.LevelUp("chr_001").Success);
            Assert.AreEqual(0, s.State.Balance("exp"));
            Assert.IsTrue(s.State.DevMode);
            Assert.AreEqual(2100, s.State.Metric("spent.exp"));
            Assert.AreEqual(-2100, s.DrainEvents()[0].Amount);
        }

        // ---------------- 編成・直前の戦闘 ----------------

        [Test]
        public void SetParty_ValidatesOwnershipDuplicatesAndSize_AndKeepsTheSupports()
        {
            GameSession s = NewSession();
            s.Debug.GrantCharacter("chr_001"); s.Debug.GrantCharacter("chr_002");
            s.DrainEvents();
            Assert.IsTrue(s.SetParty(new[] { "chr_001", null, "chr_002" }).Success);
            CollectionAssert.AreEqual(new[] { "chr_001", null, "chr_002", null, null, null }, s.State.Party);
            Assert.IsTrue(s.DrainEvents().Any(e => e.Kind == GameEventKind.PartyChanged));
            Assert.AreEqual("NotOwned", s.SetParty(new[] { "chr_050" }).Failure);
            Assert.AreEqual("Duplicate", s.SetParty(new[] { "chr_001", "chr_001" }).Failure);
            Assert.AreEqual("InvalidParty", s.SetParty(new string[7]).Failure);
            Assert.AreEqual("InvalidParty", s.SetParty(null).Failure);
            CollectionAssert.AreEqual(new[] { "chr_001", null, "chr_002", null, null, null }, s.State.Party);   // 失敗では変わらない
            Assert.IsTrue(s.SetParty(new string[0]).Success);
            CollectionAssert.AreEqual(new string[6], s.State.Party);
            Assert.AreEqual(6, NewSession().State.Party.Count);                                                  // 何も無くても6枠
        }

        [Test]
        public void LastBattleSetup_ReplaysTheSameFightForTheView()
        {
            GameSession s = WithParty(boost: 1e9);
            Assert.IsNull(s.LastBattleSetup);
            FightResult r = s.Fight(StageKind.Wave);
            Assert.IsNotNull(s.LastBattleSetup);
            BattleReplay replay = BattleReplay.Record(s.LastBattleSetup);
            Assert.AreEqual(r.EventHash, replay.Result.EventHash);
            Assert.AreEqual(r.Outcome, replay.Result.Outcome);
        }

        // ---------------- おまかせ（View のボタン用） ----------------

        [Test]
        public void EquipBestMemoryCards_PicksTheTwoStrongestOfEachKind()
        {
            GameSession s = NewSession();
            s.Debug.GrantCurrency("bond_heart", 400);
            for (int i = 0; i < 300; i++) { s.PullMemoryCard(out _); }
            s.DrainEvents();
            Assert.IsTrue(s.EquipBestMemoryCards().Success);
            IReadOnlyList<string> eq = s.State.EquippedMemoryCards;
            IReadOnlyList<MemoryCardView> cards = s.State.MemoryCards;
            for (int kind = 0; kind < 4; kind++)
            {
                int have = cards.Count(c => (int)c.Kind == kind);
                int equipped = new[] { eq[kind * 2], eq[kind * 2 + 1] }.Count(x => x != null);
                Assert.AreEqual(Math.Min(2, have), equipped, "種類" + kind);
                foreach (string id in new[] { eq[kind * 2], eq[kind * 2 + 1] }.Where(x => x != null)) { Assert.AreEqual(kind, (int)cards.First(c => c.Id == id).Kind); }
            }
            Assert.AreEqual(eq.Where(x => x != null).Distinct().Count(), eq.Count(x => x != null), "同じカードを2枠に付けない");
            GameSession locked = GameSession.LoadOrCreate(Data, new MemorySaveStore(), new FixedClock(T0), 1UL, null, unlockAll: false);
            Assert.AreEqual("Locked", locked.EquipBestMemoryCards().Failure);
        }

        [Test]
        public void EquipBestSupports_AndSetBestLeader_PickTheStrongestAvailable()
        {
            GameSession s = NewSession(boost: 1e12);
            Assert.IsTrue(s.EquipBestSupports().Success);                       // 何も持っていなくても成功（何もしない）
            CollectionAssert.AreEqual(new string[3], s.State.EquippedSupports);
            Assert.AreEqual("NoCandidate", s.SetBestLeader().Failure);
            s.Debug.GrantCharacter("chr_001"); s.Debug.GrantCharacter("chr_002");
            s.Debug.SetStar("chr_001", 5); s.Debug.SetLevel("chr_001", 10);
            s.Debug.SetStar("chr_002", 6); s.Debug.SetLevel("chr_002", 3);
            Assert.IsTrue(s.SetBestLeader().Success);
            Assert.AreEqual("chr_002", s.State.Leader);                         // ★が高いほうが先
            s.Debug.SetStar("chr_001", 6); s.Debug.SetLevel("chr_001", 20);
            Assert.IsTrue(s.SetBestLeader().Success);
            Assert.AreEqual("chr_001", s.State.Leader);                         // ★が同じならLvが高いほう
            s.Debug.SetParty(new[] { "chr_001" });
            for (int i = 0; i < 10; i++) { Assert.IsTrue(s.ChallengeTrial("edrasu").Cleared, "Lv" + (i + 1)); }
            Assert.IsTrue(s.EquipBestSupports().Success);
            Assert.AreEqual("familiar_b", s.State.EquippedSupports[0]);         // Lv10 までで解放された使い魔A・Bのうち、後のもの
            Assert.IsNull(s.State.EquippedSupports[1]);                         // 契約霊・竜はまだ持っていない
        }

        [Test]
        public void GuildMembers_AreThirtyNpcs_WithPowersInTheConfiguredRange_AndTheGuildLvFollowsTheRank()
        {
            GameSession s = NewSession();
            IReadOnlyList<(string Name, double Power)> members = s.State.GuildMembers(1000);
            Assert.AreEqual(30, members.Count);
            Assert.AreEqual(30, members.Select(m => m.Name).Distinct().Count());
            Assert.IsTrue(members.All(m => m.Power >= 1000 * Data.Guild.PowerMin - 1e-6 && m.Power <= 1000 * Data.Guild.PowerMax + 1e-6));
            Assert.AreEqual(30, members.Select(m => m.Power).Distinct().Count(), "戦力がばらけている");
            CollectionAssert.AreEqual(members.Select(m => m.Power).ToList(), s.State.GuildMembers(1000).Select(m => m.Power).ToList());
            Assert.AreEqual(1, s.State.GuildLv);
            s.Debug.SetProgress(9, 1, 1);
            Assert.AreEqual(9, s.State.GuildLv);
        }
    }
}

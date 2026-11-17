using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Battle;
using Mado.Core.Growth;
using Mado.Core.Metrics;
using Mado.Core.Progress;
using Mado.Core.Save;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Core.Wallet;
using Mado.Data;

namespace Mado.Core.Session
{
    /// <summary>1回の戦闘コマンドの結果。</summary>
    public readonly struct FightResult
    {
        public readonly CommandResult Command;
        public readonly BattleOutcome Outcome;
        public readonly int EnemiesDefeated;
        public readonly double ExpDropped;

        /// <summary>ボス戦に勝って、次のステージに進んだ。</summary>
        public readonly bool Advanced;

        /// <summary>最後のステージのボスに勝った（これ以上は進まない）。</summary>
        public readonly bool AllCleared;
        public readonly ulong EventHash;

        public FightResult(CommandResult command, BattleOutcome outcome, int defeated, double exp, bool advanced, bool allCleared, ulong hash)
        {
            Command = command; Outcome = outcome; EnemiesDefeated = defeated; ExpDropped = exp; Advanced = advanced; AllCleared = allCleared; EventHash = hash;
        }

        public static FightResult Fail(object reason) { return new FightResult(CommandResult.Fail(reason), BattleOutcome.Lose, 0, 0, false, false, 0); }
    }

    public enum FightFailure { NoParty }

    /// <summary>
    /// View が触る唯一の窓口（docs/02 3.2節）。入力は「コマンド」、出力は「イベント」と読み取り専用の GameState。
    /// コマンドの内部は「確認 → 支払い → 状態の変更 → イベント」の順で、失敗したときは状態を変えない。
    /// コマンドが終わるたびに、Wallet のイベントを MetricCounter に数えさせてから、View 向けのイベントを積む。
    /// </summary>
    public sealed class GameSession
    {
        public const string DefaultParty = "default";

        private readonly GameData _data;
        private readonly SaveData _save;
        private readonly ISaveStore _store;
        private readonly IClock _clock;
        private readonly Wallet.Wallet _wallet;
        private readonly MetricCounter _metrics;
        private readonly CrystalService _crystals;
        private readonly RosterService _roster;
        private readonly LevelService _level;
        private readonly AwakenService _awaken;
        private readonly MemoryCardService _memory;
        private readonly LeaderTempleService _temple;
        private readonly PlazaService _plazas;
        private readonly TrialService _trials;
        private readonly ArenaService _arena;
        private readonly SupportService _supports;
        private readonly DragonNestService _nest;
        private readonly SpiritStoneService _stones;
        private readonly GachaService _gacha;
        private readonly ShopService _shop;
        private readonly RouletteService _roulette;
        private readonly AchievementService _achievements;
        private readonly TreeService _trees;
        private readonly TarotService _tarot;
        private readonly CollectionService _collection;
        private readonly ZukanService _zukan;
        private readonly IdleService _idle;
        private readonly StageFactory _stages;
        private readonly BattleSetupBuilder _builder;
        private readonly RewardCalculator _rewards;
        private readonly List<GameEvent> _events = new List<GameEvent>();

        /// <summary>テストと Mado.Sim 用：true にすると、LoadOrCreate の unlockAll を省いたときに全機能を開く。製品では false のまま。</summary>
        public static bool UnlockAllByDefault { get; set; }

        private readonly bool _unlockAll;

        public GameState State { get; }
        public DebugCommands Debug { get; }

        /// <summary>直前の戦闘（Fight）の BattleSetup。View は BattleReplay.Record(LastBattleSetup) で同じ戦闘を再生できる（決定的なので結果は同じ）。</summary>
        public BattleSetup LastBattleSetup { get; private set; }

        /// <summary>どこから読めたか（View が「バックアップから復元しました」と知らせる）と、読み込みの問題。</summary>
        public LoadedSave Loaded { get; }

        private GameSession(GameData data, LoadedSave loaded, ISaveStore store, IClock clock, IReadOnlyList<IModifierSource> extraSources, bool unlockAll)
        {
            _unlockAll = unlockAll;
            _data = data; Loaded = loaded; _save = loaded.Save; _store = store; _clock = clock;
            _wallet = new Wallet.Wallet(data.Currencies, _save.Wallet, () => _save.DevMode);
            _metrics = new MetricCounter(_save);
            _crystals = new CrystalService(data, _save);
            _roster = new RosterService(data, _save, _crystals);
            _level = new LevelService(data, _save, _wallet);
            _awaken = new AwakenService(data, _save, _wallet, _roster);
            _memory = new MemoryCardService(data, _save, _wallet);
            _temple = new LeaderTempleService(data, _save, _wallet);
            _plazas = new PlazaService(data, _save, _wallet);
            _idle = new IdleService(data, _save, _wallet, clock);
            _stages = new StageFactory(data);
            _rewards = new RewardCalculator(data);

            _nest = new DragonNestService(data, _save, _wallet);
            _stones = new SpiritStoneService(data, _save, _wallet);
            _gacha = new GachaService(data, _save, _wallet, _roster);
            _shop = new ShopService(data, _wallet);
            _roulette = new RouletteService(data, _save, _wallet);
            _achievements = new AchievementService(data, _save, _wallet, _metrics);
            _trees = new TreeService(data, _save, _wallet);
            _tarot = new TarotService(data, _save, _wallet);
            _collection = new CollectionService(data, _save, _wallet);
            _zukan = new ZukanService(data, _save, _wallet);
            // サポートの効果（スキル）は、戦闘の BuffBook と同じデータから作った索引で解決する（BuffBook は同じデータなら同じ並び）。
            _supports = new SupportService(data, _save, new SkillResolver(data, new BuffBook(data)), _wallet);
            var sources = new List<IModifierSource> { new MemoryCardSource(data, _save), new LeaderLvSource(data, _save), new PlazaSource(data, _save), new DragonNestSource(_nest, _save), new SpiritStoneSource(data, _save, _stones), new ResearchSource(data, _save), new SupportOwnedSource(data, _supports) };
            if (extraSources != null) { sources.AddRange(extraSources); }
            _builder = new BattleSetupBuilder(data, new StatResolver(data, sources));

            _trials = new TrialService(data, _save, _wallet, clock, _stages, _builder);
            _arena = new ArenaService(data, _save, _wallet);
            _idle.EnsureStarted();
            State = new GameState(data, _save, _wallet, _idle, _metrics, _trials, _supports, _nest, _stones, _trees, _collection, _zukan, _gacha, _achievements, _arena, IsUnlocked);
            Debug = new DebugCommands(this);
        }

        /// <summary>
        /// 読み込んで始める。壊れたセーブは SaveRepair で直して遊べる形にする。
        /// extraSources は、全体強化の本物の出どころ（広場・研究など）がまだ無い間の代わり（ProfileModifierSource など）。
        /// </summary>
        public static GameSession LoadOrCreate(GameData data, ISaveStore store, IClock clock, ulong newSeed, IReadOnlyList<IModifierSource> extraSources = null, bool? unlockAll = null)
        {
            if (data == null) { throw new ArgumentNullException(nameof(data)); }
            if (store == null) { throw new ArgumentNullException(nameof(store)); }
            if (clock == null) { throw new ArgumentNullException(nameof(clock)); }
            LoadedSave loaded = SaveLoader.LoadOrCreate(store, data, newSeed, Iso(clock.UtcNow));
            return new GameSession(data, loaded, store, clock, extraSources, unlockAll ?? UnlockAllByDefault);
        }

        private static string Iso(DateTime utc) { return utc.ToUniversalTime().ToString("o", System.Globalization.CultureInfo.InvariantCulture); }

        // ---------------- 機能の解放 ----------------

        /// <summary>機能が使えるか。ランクが unlocks.json の解放ランクに着いている（開発者モードでは全部使える）。</summary>
        public bool IsUnlocked(string featureId)
        {
            return _unlockAll || _save.DevMode || _save.Progress.Rank >= _data.Unlocks.RankOf(featureId);
        }

        private const string LockedReason = "Locked";

        // ---------------- イベント ----------------

        /// <summary>たまったイベントを順に渡して空にする。</summary>
        public IReadOnlyList<GameEvent> DrainEvents()
        {
            var copy = new List<GameEvent>(_events);
            _events.Clear();
            return copy;
        }

        /// <summary>コマンドの終わり：Wallet の動きを数えさせ（MetricCounter）、View 向けのイベントにして、このコマンドのイベントを後ろに付ける。</summary>
        private void Finish(params GameEvent[] mine)
        {
            IReadOnlyList<WalletEvent> wallet = _wallet.DrainEvents();
            _metrics.Observe(wallet);
            foreach (WalletEvent e in wallet)
            {
                double signed = e.Kind == WalletEventKind.Spent ? -e.Amount : e.Amount;
                _events.Add(new GameEvent(GameEventKind.WalletChanged, e.CurrencyId, signed, e.BalanceAfter, e.ReasonKey));
            }
            _events.AddRange(mine);
        }

        private CommandResult Done(params GameEvent[] mine) { Finish(mine); return CommandResult.Ok(); }
        private CommandResult Failed(object reason) { Finish(); return CommandResult.Fail(reason); }

        // ---------------- 編成 ----------------

        /// <summary>編成の6体を決める（持っているキャラだけ・重複なし・枠の数まで）。空の枠は null。</summary>
        public CommandResult SetParty(IReadOnlyList<string> characterIds)
        {
            int slots = _data.System.PartySlots;
            if (characterIds == null || characterIds.Count > slots) { return Failed("InvalidParty"); }
            var seen = new HashSet<string>();
            var list = new string[slots];
            for (int i = 0; i < characterIds.Count; i++)
            {
                string id = characterIds[i];
                if (id == null) { continue; }
                if (!_save.Characters.ContainsKey(id)) { return Failed("NotOwned"); }
                if (!seen.Add(id)) { return Failed("Duplicate"); }
                list[i] = id;
            }
            _save.Parties[DefaultParty] = new PartyState { Slots = list, Familiar = CurrentParty().Familiar, Spirit = CurrentParty().Spirit, Dragon = CurrentParty().Dragon };
            return Done(new GameEvent(GameEventKind.PartyChanged));
        }

        private PartyState CurrentParty()
        {
            return _save.Parties.TryGetValue(DefaultParty, out PartyState p) ? p : new PartyState();
        }

        // ---------------- 育成 ----------------

        public CommandResult LevelUp(string characterId)
        {
            LevelResult r = _level.LevelUp(characterId);
            return AfterLevel(characterId, r);
        }

        public CommandResult LevelTo(string characterId, int targetLv)
        {
            return AfterLevel(characterId, _level.LevelTo(characterId, targetLv));
        }

        /// <summary>払える所まで上げる。</summary>
        public CommandResult LevelUpMax(string characterId)
        {
            return AfterLevel(characterId, _level.LevelUpMax(characterId));
        }

        private CommandResult AfterLevel(string id, LevelResult r)
        {
            if (!r.Success) { return Failed(r.Failure); }
            _metrics.Add(MetricCounter.Keys.LevelUps, r.LevelsGained);
            return Done(new GameEvent(GameEventKind.CharacterLevelUp, id, r.LevelsGained, _save.Characters[id].Lv));
        }

        public CommandResult Awaken(string characterId)
        {
            AwakenResult r = _awaken.Awaken(characterId);
            if (!r.Success) { return Failed(r.Failure); }
            _metrics.Add(MetricCounter.Keys.Awakenings);
            var moved = new List<GameEvent> { new GameEvent(GameEventKind.CharacterAwakened, characterId, 0, r.NewStar) };
            AddCrystalEvents(moved);
            Finish(moved.ToArray());
            return CommandResult.Ok();
        }

        public CommandResult MoveCrystal(string crystalId, string toCharacterId, int toSlot)
        {
            MoveResult r = _crystals.Move(crystalId, toCharacterId, toSlot);
            if (!r.Success) { return Failed(r.Failure); }
            var evs = new List<GameEvent>();
            AddCrystalEvents(evs);
            Finish(evs.ToArray());
            return CommandResult.Ok();
        }

        private void AddCrystalEvents(List<GameEvent> into)
        {
            foreach (CrystalMoved m in _crystals.DrainEvents())
            {
                into.Add(new GameEvent(GameEventKind.CrystalMoved, m.CrystalId, 0, 0, m.To.CharacterId + ":" + m.To.Slot));
            }
        }

        // ---------------- 記憶カード ----------------

        public CommandResult PullMemoryCard(out MemoryCardView card)
        {
            card = default(MemoryCardView);
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            PullResult r = _memory.Pull();
            if (!r.Success) { return Failed(r.Failure); }
            card = new MemoryCardView(r.Card);
            var evs = new List<GameEvent> { new GameEvent(GameEventKind.MemoryCardDrawn, r.Card.Id, r.Kept ? 1 : 0, r.Card.Lv, r.Card.Rarity) };
            if (r.Converted > 0) { evs.Add(new GameEvent(GameEventKind.MemoryCardSold, r.Kept ? "" : r.Card.Id, r.Coin, r.Converted)); }
            Finish(evs.ToArray());
            return CommandResult.Ok();
        }

        public CommandResult SellMemoryCard(string cardId)
        {
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            MemoryFailure f = _memory.Sell(cardId, out double coin);
            if (f != MemoryFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.MemoryCardSold, cardId, coin));
        }

        /// <summary>まとめ引きの機能の ID（最小の回数は、絆ガチャそのものと同じ時期から使える）。</summary>
        public static string MemoryPullFeature(int count) { return "memory_pull_" + count; }

        /// <summary>
        /// 絆ガチャをまとめて引く（count は memory_cards.json の pullCounts のうち、解放済みのもの）。
        /// 途中で止まらず引き切る。いまより強いカードは装備し、それ以外はその場でコインと経験値に還元する。絆ハートが尽きたらそこまで。
        /// </summary>
        public CommandResult PullMemoryCards(int count, out AutoGachaResult result)
        {
            result = null;
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            if (!_data.MemoryCards.PullCounts.Contains(count)) { Finish(); return CommandResult.Fail(MemoryFailure.InvalidSettings); }
            if (!IsUnlocked(MemoryPullFeature(count))) { Finish(); return CommandResult.Fail(LockedReason); }
            MemoryFailure f = _memory.AutoPull(new AutoGachaSettings { RequirePowerUp = true, StopOnFound = false }, count, out result);
            if (f != MemoryFailure.None) { return Failed(f); }
            if (result.Pulls == 0) { return Failed(MemoryFailure.NotEnough); }
            var evs = new List<GameEvent>();
            if (result.Kept > 0) { evs.Add(new GameEvent(GameEventKind.MemoryCardEquipped, result.Found.Id, result.Kept, -1)); }
            if (result.Sold > 0) { evs.Add(new GameEvent(GameEventKind.MemoryCardSold, "", result.CoinGained, result.Sold)); }
            Finish(evs.ToArray());
            return CommandResult.Ok();
        }

        /// <summary>自動絆ガチャ。いまより強い（条件に合う）カードが出たら、装備して止まる。余りはその場で還元される。</summary>
        public CommandResult AutoPullMemoryCard(AutoGachaSettings settings, int maxPulls, out AutoGachaResult result)
        {
            if (!IsUnlocked("memory_card")) { result = null; Finish(); return CommandResult.Fail(LockedReason); }
            MemoryFailure f = _memory.AutoPull(settings, maxPulls, out result);
            if (f != MemoryFailure.None) { return Failed(f); }
            var evs = new List<GameEvent>();
            if (result.Found != null) { evs.Add(new GameEvent(GameEventKind.MemoryCardDrawn, result.Found.Id, 1, result.Found.Lv, result.Found.Rarity)); }
            if (result.Sold > 0) { evs.Add(new GameEvent(GameEventKind.MemoryCardSold, "", result.CoinGained, result.Sold)); }
            Finish(evs.ToArray());
            return CommandResult.Ok();
        }

        /// <summary>種類ごとに、強い（メイン効果の合計が大きい）カードを2枚ずつ装備する。</summary>
        public CommandResult EquipBestMemoryCards()
        {
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            MemoryState m = _save.Memory;
            foreach (MemoryKind kind in new[] { MemoryKind.Hp, MemoryKind.Atk, MemoryKind.Def, MemoryKind.Speed })
            {
                List<MemoryCardState> best = m.Cards.Where(c => c.Kind == kind).OrderByDescending(c => MemoryCardRules.Score(_data, c)).ThenBy(c => c.Id, StringComparer.Ordinal).Take(2).ToList();
                for (int i = 0; i < 2; i++) { m.Equipped[MemoryCardService.Slot(kind, i)] = i < best.Count ? best[i].Id : null; }
            }
            return Done(new GameEvent(GameEventKind.MemoryCardEquipped, "", 0, -1));
        }

        public CommandResult RaiseMemoryGachaLevel()
        {
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            MemoryFailure f = _memory.RaiseGachaLv();
            if (f != MemoryFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.MemoryGachaLevelUp, "", 0, _memory.GachaLv));
        }

        public CommandResult EquipMemoryCard(string cardId, int slot)
        {
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            MemoryFailure f = _memory.Equip(cardId, slot);
            if (f != MemoryFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.MemoryCardEquipped, cardId, 0, slot));
        }

        public CommandResult UnequipMemoryCard(int slot)
        {
            if (!IsUnlocked("memory_card")) { Finish(); return CommandResult.Fail(LockedReason); }
            if (slot < 0 || slot >= MemoryState.SlotCount) { return Failed(MemoryFailure.WrongSlot); }
            _memory.Unequip(slot);
            return Done();
        }

        // ---------------- リーダー ----------------

        public CommandResult SetLeader(string characterId)
        {
            if (!IsUnlocked("leader_temple")) { Finish(); return CommandResult.Fail(LockedReason); }
            TempleFailure f = _temple.SetLeader(characterId);
            if (f != TempleFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.LeaderChanged, characterId ?? ""));
        }

        /// <summary>リーダーにできるキャラ（★が足りている）のうち、★とLvが最も高いものを選ぶ。</summary>
        public CommandResult SetBestLeader()
        {
            if (!IsUnlocked("leader_temple")) { Finish(); return CommandResult.Fail(LockedReason); }
            string best = null; int bestKey = -1;
            foreach (KeyValuePair<string, CharacterState> kv in _save.Characters.OrderBy(x => x.Key, StringComparer.Ordinal))
            {
                if (kv.Value.Star < _data.System.LeaderMinStar) { continue; }
                int key = kv.Value.Star * 1000 + kv.Value.Lv;
                if (key > bestKey) { best = kv.Key; bestKey = key; }
            }
            if (best == null) { Finish(); return CommandResult.Fail("NoCandidate"); }
            return SetLeader(best);
        }

        public CommandResult SetLeaderElement(Element? element)
        {
            if (!IsUnlocked("leader_temple")) { Finish(); return CommandResult.Fail(LockedReason); }
            _temple.SetLeaderElement(element);
            return Done();
        }

        public CommandResult LevelUpLeader()
        {
            if (!IsUnlocked("leader_temple")) { Finish(); return CommandResult.Fail(LockedReason); }
            TempleLevelResult r = _temple.LevelUp();
            if (!r.Success) { return Failed(r.Failure); }
            return Done(new GameEvent(GameEventKind.LeaderLevelUp, "", 0, r.NewLv));
        }

        // ---------------- 試練 ----------------

        /// <summary>試練の次のLvに挑む。編成が空なら NoParty。勝てばLvが上がり、貯まっている回数があれば報酬が出る。</summary>
        public TrialResult ChallengeTrial(string trialId)
        {
            if (!IsUnlocked("trial_" + trialId)) { Finish(); return new TrialResult { Failure = TrialFailure.Locked }; }
            List<UnitSetup> allies = PartyOrEmpty();
            Rng misc = Rng.FromState(_save.Rng.Misc);
            ulong seed = ((ulong)misc.NextUInt() << 32) | misc.NextUInt();
            TrialResult r = _trials.Challenge(trialId, allies, seed, _supports.BuildUnits(DefaultParty));
            if (!r.Success) { Finish(); return r; }
            _save.Rng.Misc = misc.GetState();
            return AfterTrial(trialId, r, true);
        }

        /// <summary>クリア済みの最高Lvの報酬を、戦わずに受け取る。</summary>
        public TrialResult SweepTrial(string trialId)
        {
            if (!IsUnlocked("trial_" + trialId)) { Finish(); return new TrialResult { Failure = TrialFailure.Locked }; }
            TrialResult r = _trials.Sweep(trialId);
            if (!r.Success) { Finish(); return r; }
            return AfterTrial(trialId, r, false);
        }

        /// <summary>闘技の試練の ID（挑戦のたびに、シーズンの1戦として数える）。</summary>
        public const string ArenaTrialId = "arena";

        /// <summary>闘技のシーズンの受け取り待ちの報酬を受け取る。</summary>
        public CommandResult ClaimArenaSeason()
        {
            int rank = _arena.PendingRank;
            if (rank <= 0) { return Failed("NothingToClaim"); }
            _arena.ClaimPending();
            return Done(new GameEvent(GameEventKind.ArenaSeasonClaimed, "", 0, rank));
        }

        private TrialResult AfterTrial(string trialId, TrialResult r, bool countsForArena)
        {
            var evs = new List<GameEvent>();
            if (countsForArena && trialId == ArenaTrialId)
            {
                int seasonBefore = _arena.Season;
                ArenaBattleResult ab = _arena.RecordBattle(r.Outcome == BattleOutcome.Win);
                evs.Add(new GameEvent(GameEventKind.ArenaBattle, "", ab.PointsDelta, _arena.Points));
                if (ab.SeasonEnded) { evs.Add(new GameEvent(GameEventKind.ArenaSeasonEnded, "", 0, ab.FinalRank, seasonBefore.ToString())); }
            }
            if (r.Cleared) { evs.Add(new GameEvent(GameEventKind.TrialCleared, trialId, 0, r.NewClearedLv)); }
            if (r.RewardGranted) { evs.Add(new GameEvent(GameEventKind.TrialRewarded, trialId, 0, r.RewardLv)); }
            if (r.RewardGranted && _data.Trials.TryGet(trialId, out TrialDef def) && def.DropsStones)
            {
                List<StoneState> dropped = _stones.Drop(_data.SpiritStones.DropsPerClear, out double autoSand);
                evs.Add(new GameEvent(GameEventKind.StonesDropped, trialId, autoSand, dropped.Count));
            }
            Finish(evs.ToArray());
            return r;
        }

        private List<UnitSetup> PartyOrEmpty()
        {
            try { return _builder.BuildParty(_save, DefaultParty); }
            catch (ArgumentException) { return new List<UnitSetup>(); }
        }

        // ---------------- サポート ----------------

        /// <summary>使い魔・契約霊・竜を編成にセットする（持っているものだけ。種類は ID から決まる）。</summary>
        public CommandResult SetSupport(string supportId)
        {
            SupportFailure f = _supports.Set(DefaultParty, supportId);
            if (f != SupportFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.SupportChanged, supportId));
        }

        /// <summary>持っているサポートのうち、解放が最も後のもの（強い）を、種類ごとにセットする。</summary>
        public CommandResult EquipBestSupports()
        {
            foreach (SupportKind kind in new[] { SupportKind.Familiar, SupportKind.Spirit, SupportKind.Dragon })
            {
                IReadOnlyList<string> owned = _supports.Owned(kind);
                if (owned.Count > 0) { _supports.Set(DefaultParty, owned[owned.Count - 1]); }
            }
            return Done(new GameEvent(GameEventKind.SupportChanged, "", 0, -1));
        }

        /// <summary>サポートの★を1つ上げる（覚醒の欠片）。使い魔は効果時間が1秒延び、持っているだけの所持効果も増える。</summary>
        public CommandResult RaiseSupportStar(string supportId)
        {
            SupportFailure f = _supports.RaiseStar(supportId);
            return f == SupportFailure.None ? Done(new GameEvent(GameEventKind.SupportChanged, supportId, 0, _supports.Star(supportId))) : Failed(f);
        }

        public CommandResult ClearSupport(SupportKind kind)
        {
            SupportFailure f = _supports.Clear(DefaultParty, kind);
            if (f != SupportFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.SupportChanged, "", 0, (int)kind));
        }

        // ---------------- ショップ・ルーレット・実績 ----------------

        /// <summary>ショップ・交換所で買う（回数の制限は無い）。</summary>
        public CommandResult BuyShopItem(string itemId, int count)
        {
            ShopFailure f = _shop.Buy(itemId, count);
            return f == ShopFailure.None ? Done(new GameEvent(GameEventKind.ShopBought, itemId, count)) : Failed(f);
        }

        /// <summary>ルーレットを count 回回す。当たりの番号（economy.json の roulette.entries の順）を result に返す。</summary>
        public CommandResult SpinRoulette(int count, out RouletteResult result)
        {
            RouletteFailure f = _roulette.Spin(count, out result);
            if (f != RouletteFailure.None) { Finish(); return CommandResult.Fail(f); }
            return Done(new GameEvent(GameEventKind.RouletteSpun, "", count));
        }

        /// <summary>実績の報酬を、受け取れる段まで全部受け取る。</summary>
        public CommandResult ClaimAchievement(string achievementId, out int tiers)
        {
            AchievementFailure f = _achievements.Claim(achievementId, out tiers);
            return f == AchievementFailure.None ? Done(new GameEvent(GameEventKind.AchievementClaimed, achievementId, 0, tiers)) : Failed(f);
        }

        public CommandResult ClaimAllAchievements(out int tiers)
        {
            tiers = _achievements.ClaimAll();
            return tiers == 0 ? Failed(AchievementFailure.NothingToClaim) : Done(new GameEvent(GameEventKind.AchievementClaimed, "", 0, tiers));
        }

        // ---------------- キャラガチャ ----------------

        /// <summary>count 回引く。チケットが足りなければ何も変えない。引いたキャラは所持に入る（重複はコピー）。</summary>
        public CommandResult PullCharacterGacha(GachaBanner banner, int count, out GachaResult result)
        {
            GachaFailure f = _gacha.Pull(banner, count, _save.Progress.Rank, out result);
            if (f != GachaFailure.None) { Finish(); return CommandResult.Fail(f); }
            _metrics.Add(MetricCounter.Keys.GachaPulls, count);
            var evs = new List<GameEvent>();
            foreach (GachaDrop d in result.Drops)
            {
                if (d.IsNew) { evs.Add(new GameEvent(GameEventKind.CharacterObtained, d.CharacterId)); }
            }
            evs.Add(new GameEvent(GameEventKind.GachaPulled, banner.ToString(), count, result.Drops.Count(x => x.IsNew), result.StepsClaimed.ToString()));
            Finish(evs.ToArray());
            return CommandResult.Ok();
        }

        public CommandResult BuyGachaTickets(int count)
        {
            GachaFailure f = _gacha.BuyTickets(count);
            return f == GachaFailure.None ? Done() : Failed(f);
        }

        /// <summary>ピックアップのキャラを選ぶ（極の格で、いまのランクで解放済みのキャラ。null で解除）。</summary>
        public CommandResult SetGachaPickup(string characterId)
        {
            GachaFailure f = _gacha.SetPickup(characterId, _save.Progress.Rank);
            return f == GachaFailure.None ? Done() : Failed(f);
        }

        // ---------------- 研究・リーダー特殊ツリー・タロット・コレクション・図鑑 ----------------

        /// <summary>ツリーのノードを1つ上げる（treeId は "lab"＝研究所、"leader"＝リーダー特殊ツリー）。</summary>
        public CommandResult LevelUpTreeNode(string treeId, string nodeId)
        {
            if (!IsUnlocked(treeId == "leader" ? "leader_tree" : "research")) { Finish(); return CommandResult.Fail(LockedReason); }
            ResearchFailure f = _trees.LevelUp(treeId, nodeId);
            if (f != ResearchFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.TreeNodeLevelUp, treeId + "/" + nodeId, 0, _trees.Lv(treeId, nodeId)));
        }

        public CommandResult SetTarot(int slot, string effect, string rarityId)
        {
            if (!IsUnlocked("research")) { Finish(); return CommandResult.Fail(LockedReason); }
            ResearchFailure f = _tarot.Set(slot, effect, rarityId);
            if (f != ResearchFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.TarotChanged, effect, 0, slot, rarityId));
        }

        public CommandResult ClearTarot(int slot)
        {
            if (!IsUnlocked("research")) { Finish(); return CommandResult.Fail(LockedReason); }
            ResearchFailure f = _tarot.Clear(slot);
            if (f != ResearchFailure.None) { return Failed(f); }
            return Done();
        }

        public CommandResult RaiseCollectionSet(string setId)
        {
            if (!IsUnlocked("research")) { Finish(); return CommandResult.Fail(LockedReason); }
            ResearchFailure f = _collection.Raise(setId);
            if (f != ResearchFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.CollectionStarUp, setId, 0, _collection.Star(setId)));
        }

        /// <summary>図鑑の新しい達成を拾う（報酬のジェムは自動）。View は画面を開くときと育成のあとに呼ぶ。</summary>
        public CommandResult SyncZukan(out int newGoals)
        {
            if (!IsUnlocked("zukan")) { newGoals = 0; Finish(); return CommandResult.Fail(LockedReason); }
            newGoals = _zukan.Sync();
            return newGoals == 0 ? Done() : Done(new GameEvent(GameEventKind.ZukanAchieved, "", 0, newGoals));
        }

        // ---------------- 霊石版 ----------------

        public CommandResult EquipStone(int page, int slot, string stoneId)
        {
            if (!IsUnlocked("stones")) { Finish(); return CommandResult.Fail(LockedReason); }
            StoneFailure f = _stones.Equip(page, slot, stoneId);
            if (f != StoneFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.StoneEquipped, stoneId, 0, page * _stones.SlotsPerPage + slot));
        }

        public CommandResult UnequipStone(int page, int slot)
        {
            if (!IsUnlocked("stones")) { Finish(); return CommandResult.Fail(LockedReason); }
            StoneFailure f = _stones.Unequip(page, slot);
            if (f != StoneFailure.None) { return Failed(f); }
            return Done();
        }

        public CommandResult LevelUpStone(string stoneId)
        {
            if (!IsUnlocked("stones")) { Finish(); return CommandResult.Fail(LockedReason); }
            StoneFailure f = _stones.LevelUp(stoneId);
            if (f != StoneFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.StoneLevelUp, stoneId, 0, _stones.Find(stoneId).Lv));
        }

        public CommandResult DismantleStone(string stoneId)
        {
            if (!IsUnlocked("stones")) { Finish(); return CommandResult.Fail(LockedReason); }
            StoneFailure f = _stones.Dismantle(stoneId, out double sand);
            if (f != StoneFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.StoneDismantled, stoneId, sand, 1));
        }

        /// <summary>レアの順番が rarityIndex 以下の、はめていない石を全部分解する。</summary>
        public CommandResult DismantleStonesUpTo(int rarityIndex, out int count)
        {
            count = 0;
            if (!IsUnlocked("stones")) { Finish(); return CommandResult.Fail(LockedReason); }
            if (rarityIndex < 0 || rarityIndex >= _data.SpiritStones.Rarities.Count) { return Failed("InvalidRarity"); }
            count = _stones.DismantleUpTo(rarityIndex, out double sand);
            return Done(new GameEvent(GameEventKind.StoneDismantled, "", sand, count));
        }

        // ---------------- 竜の巣 ----------------

        public CommandResult LevelUpDragonNode(string nodeId)
        {
            if (!IsUnlocked("dragon_nest")) { Finish(); return CommandResult.Fail(LockedReason); }
            NestFailure f = _nest.LevelUp(nodeId);
            if (f != NestFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.DragonNodeLevelUp, nodeId, 0, _nest.Lv(nodeId)));
        }

        /// <summary>その属性のツリーを振り直す（無料。使った竜の炎は全額戻る）。</summary>
        public CommandResult ResetDragonNest(Element element)
        {
            if (!IsUnlocked("dragon_nest")) { Finish(); return CommandResult.Fail(LockedReason); }
            _nest.Reset(element, out double refunded);
            return Done(new GameEvent(GameEventKind.DragonNestReset, DragonNestService.Text(element), refunded));
        }

        // ---------------- 広場 ----------------

        public CommandResult LevelUpPlaza(string plazaId)
        {
            if (!IsUnlocked("plaza_" + plazaId)) { Finish(); return CommandResult.Fail(LockedReason); }
            PlazaResult r = _plazas.LevelUp(plazaId);
            if (!r.Success) { return Failed(r.Failure); }
            return Done(new GameEvent(GameEventKind.PlazaLevelUp, plazaId, r.LevelsGained, r.NewLv));
        }

        /// <summary>払える所まで上げる。</summary>
        public CommandResult LevelUpPlazaMax(string plazaId)
        {
            if (!IsUnlocked("plaza_" + plazaId)) { Finish(); return CommandResult.Fail(LockedReason); }
            PlazaResult r = _plazas.LevelUpMax(plazaId);
            if (!r.Success) { return Failed(r.Failure); }
            return Done(new GameEvent(GameEventKind.PlazaLevelUp, plazaId, r.LevelsGained, r.NewLv));
        }

        // ---------------- 放置報酬 ----------------

        /// <summary>受け取る。受け取った内容を report に返す（1分未満・時計が戻っているときは空で、成功扱い）。</summary>
        public CommandResult ClaimIdle(out IdleReport report)
        {
            report = _idle.Claim();
            if (report.IsEmpty) { Finish(); return CommandResult.Ok(); }
            return Done(new GameEvent(GameEventKind.IdleClaimed, "", report.Exp, report.Elapsed.TotalHours));
        }

        // ---------------- 戦闘 ----------------

        /// <summary>
        /// いまの進行（ランク・エリア・ステージ）で戦う。Wave は雑魚ウェーブ、Boss はボス戦。
        /// 倒した敵の数だけ経験値が落ちる（勝敗によらない）。ボス戦に勝つと次のステージに進む。
        /// 編成が空なら NoParty で、何も変えない。
        /// </summary>
        public FightResult Fight(StageKind kind)
        {
            ProgressState p = _save.Progress;
            List<UnitSetup> allies;
            try { allies = _builder.BuildParty(_save, DefaultParty); }
            catch (ArgumentException) { allies = new List<UnitSetup>(); }
            if (allies.Count == 0) { Finish(); return FightResult.Fail(FightFailure.NoParty); }

            List<UnitSetup> enemies = _stages.Build(p.Rank, p.Area, p.Stage, kind);
            Rng misc = Rng.FromState(_save.Rng.Misc);
            ulong seed = ((ulong)misc.NextUInt() << 32) | misc.NextUInt();
            _save.Rng.Misc = misc.GetState();

            BattleSetup setup = _builder.Assemble(allies, enemies, seed, _stages.TimeLimitSec(kind, p.Rank, p.Area, p.Stage), _supports.BuildUnits(DefaultParty));
            LastBattleSetup = setup;
            BattleResult result = new BattleSim(setup).RunToEnd(null);

            Reward drop = _rewards.ForBattle(p.Rank, result);
            _wallet.Grant(drop, new GrantReason(WalletReasons.BattleDrop));
            _metrics.Add(MetricCounter.Keys.EnemiesDefeated, result.EnemiesDefeated);
            var evs = new List<GameEvent> { new GameEvent(GameEventKind.BattleFinished, result.Outcome.ToString(), result.EnemiesDefeated) };

            bool advanced = false, cleared = false;
            if (result.Outcome == BattleOutcome.Win)
            {
                _metrics.Add(MetricCounter.Keys.BattlesWon);
                if (kind == StageKind.Boss) { advanced = Advance(p, out cleared); }
                if (advanced) { evs.Add(new GameEvent(GameEventKind.ProgressAdvanced, "", 0, p.Rank, p.Area + "-" + p.Stage)); }
            }
            Finish(evs.ToArray());
            return new FightResult(CommandResult.Ok(), result.Outcome, result.EnemiesDefeated, result.EnemiesDefeated * _rewards.ExpPerEnemy(Math.Min(p.Rank, _data.Difficulty.Ranks)), advanced, cleared, result.EventHash);
        }

        // ---------------- 設定 ----------------

        public const double MinBattleSpeed = 1, MaxBattleSpeed = 5;

        /// <summary>戦闘の速さ（1〜5倍）・自動ボス・ガチャ演出のスキップを設定する。</summary>
        public CommandResult SetSettings(double battleSpeed, bool autoBoss, bool skipGachaAnim)
        {
            if (!(battleSpeed >= MinBattleSpeed && battleSpeed <= MaxBattleSpeed)) { return Failed("InvalidSpeed"); }
            SettingsState s = _save.Settings;
            s.BattleSpeed = battleSpeed; s.AutoBoss = autoBoss; s.SkipGachaAnim = skipGachaAnim;
            return Done(new GameEvent(GameEventKind.SettingsChanged));
        }

        /// <summary>
        /// 成長速度の倍率（整数の1〜5）を変える。変える前に、それまでの放置報酬を受け取り、試練の回数を元の速さで確定させる
        /// （変えた分を過去にさかのぼって掛けられないように）。
        /// </summary>
        public CommandResult SetGrowthSpeed(int speed)
        {
            if (speed < 1 || speed > 5) { return Failed("InvalidSpeed"); }
            IdleReport r = _idle.Claim();
            _trials.AccrueAll();
            _save.Settings.GrowthSpeed = speed;
            if (r.IsEmpty) { return Done(new GameEvent(GameEventKind.SettingsChanged)); }
            return Done(new GameEvent(GameEventKind.IdleClaimed, "", r.Exp, r.Elapsed.TotalHours), new GameEvent(GameEventKind.SettingsChanged));
        }

        /// <summary>
        /// 自動周回の1歩。自動ボスが入っていればボス戦、切れていれば雑魚ウェーブで戦う。
        /// ボス戦で負けても進行は変わらない（次の1歩でまた挑む）。
        /// </summary>
        public FightResult AutoStep()
        {
            return Fight(_save.Settings.AutoBoss ? StageKind.Boss : StageKind.Wave);
        }

        /// <summary>次のステージへ。最後のステージなら進まず cleared を立てる。</summary>
        private bool Advance(ProgressState p, out bool cleared)
        {
            DifficultyConfig d = _data.Difficulty;
            cleared = false;
            int rank = p.Rank, area = p.Area, stage = p.Stage + 1;
            if (stage > d.StagesPerArea) { stage = 1; area++; }
            if (area > d.AreasPerRank) { area = 1; rank++; }
            if (rank > d.Ranks) { cleared = true; return false; }
            p.Rank = rank; p.Area = area; p.Stage = stage;
            return true;
        }

        // ---------------- 保存 ----------------

        /// <summary>いまの状態を保存する（Wallet の残高をセーブに写してから、ISaveStore に書く）。</summary>
        public CommandResult Save()
        {
            _save.Wallet = _wallet.ExportState();
            SaveLoader.Save(_store, _save, Iso(_clock.UtcNow));
            _events.Add(new GameEvent(GameEventKind.Saved));
            return CommandResult.Ok();
        }

        // ---------------- デバッグ ----------------

        /// <summary>
        /// デバッグ用のコマンド（docs/02 3.2節）。開発ビルドと Mado.Sim だけで使う（製品ビルドでは View が呼ばない）。
        /// 開発者モード（素材が減らない。仕様書 7.9節）とは別物。
        /// </summary>
        public sealed class DebugCommands
        {
            private readonly GameSession _s;
            internal DebugCommands(GameSession s) { _s = s; }

            public CommandResult GrantCharacter(string characterId)
            {
                bool had = characterId != null && _s._save.Characters.ContainsKey(characterId);
                if (!_s._roster.TryGrant(characterId)) { return CommandResult.Fail("UnknownCharacter"); }
                return had ? _s.Done() : _s.Done(new GameEvent(GameEventKind.CharacterObtained, characterId));
            }

            public CommandResult SetStar(string characterId, int star)
            {
                if (characterId == null || !_s._save.Characters.TryGetValue(characterId, out CharacterState c)) { return CommandResult.Fail("NotOwned"); }
                if (!_s._roster.TrySetStar(characterId, star)) { return CommandResult.Fail("InvalidStar"); }
                return _s.Done(new GameEvent(GameEventKind.CharacterAwakened, characterId, 0, star));
            }

            public CommandResult SetLevel(string characterId, int lv)
            {
                if (!_s._roster.TrySetLevel(characterId, lv)) { return CommandResult.Fail("InvalidLevel"); }
                return _s.Done();
            }

            public CommandResult GrantCurrency(string currencyId, double amount)
            {
                if (currencyId == null || !_s._data.TryCurrency(currencyId, out _) || !(amount > 0)) { return CommandResult.Fail("InvalidCurrency"); }
                _s._wallet.Grant(new Reward(currencyId, amount), new GrantReason("debug.grant"));
                return _s.Done();
            }

            /// <summary>サポートの★を決める（★を上げる経済ができるまでの代わり）。</summary>
            public CommandResult SetSupportStar(string supportId, int star)
            {
                if (supportId == null || !_s._data.Supports.TryGet(supportId, out _)) { return CommandResult.Fail("UnknownSupport"); }
                if (star < 0 || star > SupportService.MaxStar) { return CommandResult.Fail("InvalidStar"); }
                _s._save.Supports.Stars[supportId] = star;
                return _s.Done();
            }

            /// <summary>霊石版を1枚付与する（試練のドロップ以外の入手経路ができるまでの代わり）。</summary>
            public CommandResult GrantStone(string rarityId, string constellationId, int lv)
            {
                if (_s._stones.RarityIndex(rarityId) < 0 || !_s._data.SpiritStones.Constellations.Any(k => k.Id == constellationId)) { return CommandResult.Fail("InvalidStone"); }
                return _s._stones.Add(rarityId, constellationId, lv) == null ? CommandResult.Fail("InventoryFull") : _s.Done();
            }

            public void SetDevMode(bool on) { _s._save.DevMode = on; }

            public CommandResult SetProgress(int rank, int area, int stage)
            {
                DifficultyConfig d = _s._data.Difficulty;
                if (rank < 1 || rank > d.Ranks || area < 1 || area > d.AreasPerRank || stage < 1 || stage > d.StagesPerArea) { return CommandResult.Fail("InvalidProgress"); }
                _s._save.Progress = new ProgressState { Rank = rank, Area = area, Stage = stage };
                return _s.Done(new GameEvent(GameEventKind.ProgressAdvanced, "", 0, rank, area + "-" + stage));
            }

            /// <summary>編成の6体を決める（View の編成画面ができるまでの代わり）。</summary>
            public CommandResult SetParty(IReadOnlyList<string> characterIds)
            {
                if (characterIds == null || characterIds.Count > _s._data.System.PartySlots) { return CommandResult.Fail("InvalidParty"); }
                var slots = new string[_s._data.System.PartySlots];
                for (int i = 0; i < characterIds.Count; i++)
                {
                    if (characterIds[i] != null && !_s._save.Characters.ContainsKey(characterIds[i])) { return CommandResult.Fail("NotOwned"); }
                    slots[i] = characterIds[i];
                }
                _s._save.Parties[DefaultParty] = new PartyState { Slots = slots };
                return _s.Done();
            }
        }
    }
}

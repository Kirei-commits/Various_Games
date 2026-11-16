using System;
using System.Collections.Generic;
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
        private readonly IdleService _idle;
        private readonly StageFactory _stages;
        private readonly BattleSetupBuilder _builder;
        private readonly RewardCalculator _rewards;
        private readonly List<GameEvent> _events = new List<GameEvent>();

        public GameState State { get; }
        public DebugCommands Debug { get; }

        /// <summary>どこから読めたか（View が「バックアップから復元しました」と知らせる）と、読み込みの問題。</summary>
        public LoadedSave Loaded { get; }

        private GameSession(GameData data, LoadedSave loaded, ISaveStore store, IClock clock, IReadOnlyList<IModifierSource> extraSources)
        {
            _data = data; Loaded = loaded; _save = loaded.Save; _store = store; _clock = clock;
            _wallet = new Wallet.Wallet(data.Currencies, _save.Wallet, () => _save.DevMode);
            _metrics = new MetricCounter(_save);
            _crystals = new CrystalService(data, _save);
            _roster = new RosterService(data, _save, _crystals);
            _level = new LevelService(data, _save, _wallet);
            _awaken = new AwakenService(data, _save, _wallet, _roster);
            _memory = new MemoryCardService(data, _save, _wallet);
            _temple = new LeaderTempleService(data, _save, _wallet);
            _idle = new IdleService(data, _save, _wallet, clock);
            _stages = new StageFactory(data);
            _rewards = new RewardCalculator(data);

            var sources = new List<IModifierSource> { new MemoryCardSource(data, _save), new LeaderLvSource(data, _save) };
            if (extraSources != null) { sources.AddRange(extraSources); }
            _builder = new BattleSetupBuilder(data, new StatResolver(data, sources));

            _idle.EnsureStarted();
            State = new GameState(_save, _wallet, _idle, _metrics);
            Debug = new DebugCommands(this);
        }

        /// <summary>
        /// 読み込んで始める。壊れたセーブは SaveRepair で直して遊べる形にする。
        /// extraSources は、全体強化の本物の出どころ（広場・研究など）がまだ無い間の代わり（ProfileModifierSource など）。
        /// </summary>
        public static GameSession LoadOrCreate(GameData data, ISaveStore store, IClock clock, ulong newSeed, IReadOnlyList<IModifierSource> extraSources = null)
        {
            if (data == null) { throw new ArgumentNullException(nameof(data)); }
            if (store == null) { throw new ArgumentNullException(nameof(store)); }
            if (clock == null) { throw new ArgumentNullException(nameof(clock)); }
            LoadedSave loaded = SaveLoader.LoadOrCreate(store, data, newSeed, Iso(clock.UtcNow));
            return new GameSession(data, loaded, store, clock, extraSources);
        }

        private static string Iso(DateTime utc) { return utc.ToUniversalTime().ToString("o", System.Globalization.CultureInfo.InvariantCulture); }

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
            PullResult r = _memory.Pull();
            if (!r.Success) { return Failed(r.Failure); }
            card = new MemoryCardView(r.Card);
            return Done(new GameEvent(GameEventKind.MemoryCardDrawn, r.Card.Id, 0, r.Card.Lv, r.Card.Rarity));
        }

        public CommandResult SellMemoryCard(string cardId)
        {
            MemoryFailure f = _memory.Sell(cardId, out double coin);
            if (f != MemoryFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.MemoryCardSold, cardId, coin));
        }

        /// <summary>自動絆ガチャ。合うカードが出たら止まる（装備は View の確認のあと EquipMemoryCard）。</summary>
        public CommandResult AutoPullMemoryCard(AutoGachaSettings settings, int maxPulls, out AutoGachaResult result)
        {
            MemoryFailure f = _memory.AutoPull(settings, maxPulls, out result);
            if (f != MemoryFailure.None) { return Failed(f); }
            var evs = new List<GameEvent>();
            if (result.Found != null) { evs.Add(new GameEvent(GameEventKind.MemoryCardDrawn, result.Found.Id, 0, result.Found.Lv, result.Found.Rarity)); }
            if (result.Sold > 0) { evs.Add(new GameEvent(GameEventKind.MemoryCardSold, "", result.CoinGained, result.Sold)); }
            Finish(evs.ToArray());
            return CommandResult.Ok();
        }

        public CommandResult RaiseMemoryGachaLevel()
        {
            MemoryFailure f = _memory.RaiseGachaLv();
            if (f != MemoryFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.MemoryGachaLevelUp, "", 0, _memory.GachaLv));
        }

        public CommandResult EquipMemoryCard(string cardId, int slot)
        {
            MemoryFailure f = _memory.Equip(cardId, slot);
            if (f != MemoryFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.MemoryCardEquipped, cardId, 0, slot));
        }

        public CommandResult UnequipMemoryCard(int slot)
        {
            if (slot < 0 || slot >= MemoryState.SlotCount) { return Failed(MemoryFailure.WrongSlot); }
            _memory.Unequip(slot);
            return Done();
        }

        // ---------------- リーダー ----------------

        public CommandResult SetLeader(string characterId)
        {
            TempleFailure f = _temple.SetLeader(characterId);
            if (f != TempleFailure.None) { return Failed(f); }
            return Done(new GameEvent(GameEventKind.LeaderChanged, characterId ?? ""));
        }

        public CommandResult SetLeaderElement(Element? element)
        {
            _temple.SetLeaderElement(element);
            return Done();
        }

        public CommandResult LevelUpLeader()
        {
            TempleLevelResult r = _temple.LevelUp();
            if (!r.Success) { return Failed(r.Failure); }
            return Done(new GameEvent(GameEventKind.LeaderLevelUp, "", 0, r.NewLv));
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

            BattleSetup setup = _builder.Assemble(allies, enemies, seed, _stages.TimeLimitSec(kind, p.Rank, p.Area, p.Stage));
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

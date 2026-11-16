using System;
using System.Collections.Generic;
using System.Linq;
using Mado.Core.Growth;
using Mado.Core.Save;
using Mado.Core.Session;
using Mado.Core.Stats;
using Mado.Core.Util;
using Mado.Data;

namespace Mado.Sim
{
    /// <summary>経済シミュレーションの結果（1行ぶん）。</summary>
    public sealed class EconomyPoint
    {
        public int Minute { get; set; }
        public int Rank { get; set; }
        public int MaxStar { get; set; }
        public int PartyAvgLv { get; set; }
        public int GachaPulls { get; set; }
        public int Owned { get; set; }
        public double Exp { get; set; }
        public double Shards { get; set; }
        public double Gems { get; set; }
    }

    /// <summary>日単位の記録（1日の終わりの状態）。</summary>
    public sealed class DayPoint
    {
        public int Day { get; set; }
        public int Rank { get; set; }
        public string Stage { get; set; }
        public int MaxStar { get; set; }
        public int PartyAvgLv { get; set; }
        public int Owned { get; set; }
        public int GachaPulls { get; set; }
        public Dictionary<string, double> Balances { get; set; }
    }

    /// <summary>
    /// 経済シミュレーション用の遊び手（docs/02 6節・docs/01 第10章「1〜2時間で★6魔晶まで届く」の確かめ）。
    /// 毎分：雑魚戦1回とボス戦1回、5分ごとに放置報酬、持っている経験値・欠片でレベル上げと覚醒、チケットでガチャ、解放済みの試練、編成の入れ替え。
    /// 全部 GameSession の公開コマンドだけで遊ぶ（ゲーム本体と同じルール）。機能の解放は本物（ランクで開く）。
    /// </summary>
    public sealed class EconomyBot
    {
        private readonly GameData _data;
        private readonly GameSession _s;
        private readonly FixedClock _clock;
        private int _pulls;

        /// <summary>最初に渡すチケット（MadoHost と同じ値にする）。</summary>
        public const int StarterTickets = 30;

        private readonly bool _real;

        /// <summary>
        /// real が true なら、強さの代用品（RankProfileSource）を使わず、広場・竜の巣・研究・記憶カードなど本物の育成だけで強くなる。
        /// そのぶん育成に素材を使う（Invest）。長い遊びで、素材の入りと使い道が釣り合うかを見る。
        /// </summary>
        public EconomyBot(GameData data, IReadOnlyList<SimProfileDef> profiles, EnemySubstatFormulas allySubstats, ulong seed, bool real = false)
        {
            _real = real;
            _data = data;
            _clock = new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc));
            GameSession session = null;
            var sources = new List<IModifierSource>();
            if (!real) { sources.Add(new RankProfileSource(profiles, () => session == null ? 1 : session.State.Progress.Rank, allySubstats, data.System.BaseSubstats)); }
            session = GameSession.LoadOrCreate(data, new MemorySaveStore(), _clock, seed, sources, unlockAll: false);
            _s = session;
            GiveStarterSet();
        }

        public GameSession Session { get { return _s; } }

        private void GiveStarterSet()
        {
            var party = new List<string>();
            foreach (CharacterDef c in _data.Characters)
            {
                if (party.Count >= _data.System.PartySlots) { break; }
                if (c.Tier == CharTier.So || c.Tier == CharTier.Tou) { _s.Debug.GrantCharacter(c.Id); party.Add(c.Id); }
            }
            _s.SetParty(party);
            _s.Debug.GrantCurrency("gacha_ticket", StarterTickets);
            _s.DrainEvents();
        }

        /// <summary>minutes 分遊んで、10分ごとの記録を返す。</summary>
        public List<EconomyPoint> Run(int minutes)
        {
            var points = new List<EconomyPoint>();
            for (int m = 1; m <= minutes; m++)
            {
                _clock.Advance(TimeSpan.FromMinutes(1));
                if (m % 5 == 0) { _s.ClaimIdle(out _); }
                Play();
                Spend();
                if (m % 10 == 0 || m == minutes) { points.Add(Snapshot(m)); }
                _s.DrainEvents();
            }
            return points;
        }

        /// <summary>最終ボスを倒した日（まだなら 0）。</summary>
        public int FinalBossDay { get; private set; }

        private void Play()
        {
            _s.Fight(StageKind.Wave);
            FightResult r = _s.Fight(StageKind.Boss);
            if (r.AllCleared && FinalBossDay == 0) { FinalBossDay = _day; }
        }

        private int _day;
        public long PlayTicks, SpendTicks, InvestTicks;

        /// <summary>
        /// days 日遊ぶ。1日に activeHours 時間ぶんの「毎分の遊び」をして、残りの時間は放っておく（放置報酬は上限まで貯まる）。
        /// 1日の終わりに記録を取る。
        /// </summary>
        public List<DayPoint> RunDays(int days, double activeHours)
        {
            var points = new List<DayPoint>();
            int activeMinutes = (int)Math.Round(activeHours * 60);
            for (int d = 1; d <= days; d++)
            {
                _day = d;
                _clock.Advance(TimeSpan.FromMinutes(24 * 60 - activeMinutes));        // 遊んでいない時間
                _s.ClaimIdle(out _);
                for (int m = 1; m <= activeMinutes; m++)
                {
                    _clock.Advance(TimeSpan.FromMinutes(1));
                    if (m % 5 == 0) { _s.ClaimIdle(out _); }
                    long t0 = System.Diagnostics.Stopwatch.GetTimestamp();
                    Play();
                    long t1 = System.Diagnostics.Stopwatch.GetTimestamp();
                    Spend();
                    long t2 = System.Diagnostics.Stopwatch.GetTimestamp();
                    _s.DrainEvents();
                    PlayTicks += t1 - t0; SpendTicks += t2 - t1;
                }
                points.Add(Day(d));
            }
            return points;
        }

        private DayPoint Day(int day)
        {
            EconomyPoint p = Snapshot(day);
            var balances = new Dictionary<string, double>();
            foreach (CurrencyDef c in _data.Currencies) { balances[c.Id] = _s.State.Balance(c.Id); }
            ProgressView pv = _s.State.Progress;
            return new DayPoint { Day = day, Rank = pv.Rank, Stage = pv.Area + "-" + pv.Stage, MaxStar = p.MaxStar, PartyAvgLv = p.PartyAvgLv, Owned = p.Owned, GachaPulls = p.GachaPulls, Balances = balances };
        }

        /// <summary>通貨ごとの、これまでに入った量と使った量（MetricCounter の earned.／spent.）。</summary>
        public KeyValuePair<double, double> Flow(string currencyId)
        {
            return new KeyValuePair<double, double>(_s.State.Metric("earned." + currencyId), _s.State.Metric("spent." + currencyId));
        }


        private void Spend()
        {
            // 試練：解放済みで報酬を受け取れるものは掃討、そうでなければ挑戦（勝てばLvが上がる）
            bool trialsNow = ++_spendTick % 5 == 0;                // 試練は5分に1回（毎分だと長い遊びが遅すぎる。回数は日ごとに貯まるので結果はほぼ同じ）
            foreach (TrialDef t in _data.Trials.Trials)
            {
                if (!trialsNow || !_s.State.IsUnlocked("trial_" + t.Id)) { continue; }
                if (_s.State.TrialCharges(t.Id) >= 1 && _s.State.TrialClearedLv(t.Id) > 0) { _s.SweepTrial(t.Id); }
                else { _s.ChallengeTrial(t.Id); }
            }
            // ガチャ：チケットがあれば10連（まず所持を増やす）
            while (_s.State.Balance("gacha_ticket") >= 10 && _pulls < 600)
            {
                if (!_s.PullCharacterGacha(Mado.Core.Growth.GachaBanner.Normal, 10, out _).Success) { break; }
                _pulls += 10;
            }
            // ジェムは欠片に替える（覚醒の足し）
            while (_s.State.Balance("gem") >= 500) { if (!_s.BuyShopItem("gem_shard", 1).Success) { break; } }
            if (_real) { long t = System.Diagnostics.Stopwatch.GetTimestamp(); Invest(); InvestTicks += System.Diagnostics.Stopwatch.GetTimestamp() - t; }
            ChooseParty();
            foreach (string id in _s.State.OwnedCharacterIds)
            {
                _s.LevelUpMax(id);
                for (int i = 0; i < 11; i++) { if (!_s.Awaken(id).Success) { break; } }
            }
        }

        private static readonly Element[] Elements = { Element.Valor, Element.Skill, Element.Heart, Element.Wisdom };
        private static readonly string[] TarotEffects = { "hp", "atk", "def", "critDamagePct", "critDefensePct" };
        private int _investTick, _spendTick;

        /// <summary>箱庭の「おまかせ強化」と同じことを、払えるだけ行う（5分に1回）。</summary>
        private void Invest()
        {
            if (++_investTick % 5 != 1) { return; }
            _s.ClaimAllAchievements(out _);
            foreach (PlazaDef p in _data.Plazas.Plazas) { _s.LevelUpPlazaMax(p.Id); }
            foreach (Element el in Elements)
            {
                for (int i = 0; i < 100; i++)
                {
                    string next = _s.State.NextDragonNode(el);
                    if (next == null || !_s.LevelUpDragonNode(next).Success) { break; }
                }
            }
            foreach (string tree in new[] { "lab", "leader" })
            {
                for (int i = 0; i < 100; i++)
                {
                    string next = _s.State.NextTreeNode(tree);
                    if (next == null || !_s.LevelUpTreeNode(tree, next).Success) { break; }
                }
            }
            for (int slot = 0; slot < _data.Research.Tarot.Slots; slot++)
            {
                if (_s.State.TarotAt(slot).Effect != null) { continue; }
                for (int r = _data.Research.Tarot.Rarities.Count - 1; r >= 0; r--)
                {
                    if (_s.SetTarot(slot, TarotEffects[slot % TarotEffects.Length], _data.Research.Tarot.Rarities[r].Id).Success) { break; }
                }
            }
            foreach (CollectionSetDef set in _data.Research.Collection.Sets)
            {
                while (_s.State.CollectionStar(set.Id) < set.Values.Count && _s.RaiseCollectionSet(set.Id).Success) { }
            }
            _s.SyncZukan(out _);
            for (int i = 0; i < 200 && _s.PullMemoryCard(out _).Success; i++) { }
            _s.RaiseMemoryGachaLevel();
            _s.EquipBestMemoryCards();
            _s.SetBestLeader();
            for (int i = 0; i < 200 && _s.LevelUpLeader().Success; i++) { }
            _s.EquipBestSupports();
            foreach (string id in _s.State.EquippedSupports) { if (id != null) { _s.RaiseSupportStar(id); } }
            if (_s.State.Balance("roulette_coin") >= 10) { _s.SpinRoulette((int)_s.State.Balance("roulette_coin"), out _); }
            _s.DrainEvents();
        }

        /// <summary>強さの目安（格の倍率 × ★の倍率 × Lv）が高い順に6体を編成に入れる。</summary>
        private void ChooseParty()
        {
            var scored = new List<KeyValuePair<double, string>>();
            foreach (string id in _s.State.OwnedCharacterIds)
            {
                _s.State.TryCharacter(id, out CharacterView v);
                CharacterDef c = _data.Character(id);
                double score = _data.Tier(c.Tier).StatMultiplier * _data.Stats.StarMultipliers[v.Star] * v.Lv;
                scored.Add(new KeyValuePair<double, string>(score, id));
            }
            scored.Sort((a, b) => b.Key != a.Key ? b.Key.CompareTo(a.Key) : string.CompareOrdinal(a.Value, b.Value));
            _s.SetParty(scored.Take(_data.System.PartySlots).Select(x => x.Value).ToList());
        }

        private EconomyPoint Snapshot(int minute)
        {
            int maxStar = 0, lvSum = 0, n = 0;
            foreach (string id in _s.State.OwnedCharacterIds)
            {
                _s.State.TryCharacter(id, out CharacterView v);
                maxStar = Math.Max(maxStar, v.Star);
            }
            foreach (string id in _s.State.Party)
            {
                if (id == null) { continue; }
                _s.State.TryCharacter(id, out CharacterView v);
                lvSum += v.Lv; n++;
            }
            return new EconomyPoint
            {
                Minute = minute, Rank = _s.State.Progress.Rank, MaxStar = maxStar, PartyAvgLv = n == 0 ? 0 : lvSum / n,
                GachaPulls = _pulls, Owned = _s.State.OwnedCharacterIds.Count,
                Exp = _s.State.Balance("exp"), Shards = _s.State.Balance("awaken_shard"), Gems = _s.State.Balance("gem"),
            };
        }
    }
}

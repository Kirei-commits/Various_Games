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

        public EconomyBot(GameData data, IReadOnlyList<SimProfileDef> profiles, EnemySubstatFormulas allySubstats, ulong seed)
        {
            _data = data;
            _clock = new FixedClock(new DateTime(2026, 11, 16, 0, 0, 0, DateTimeKind.Utc));
            GameSession session = null;
            var sources = new List<IModifierSource>
            {
                new RankProfileSource(profiles, () => session == null ? 1 : session.State.Progress.Rank, allySubstats, data.System.BaseSubstats),
            };
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

        private void Play()
        {
            _s.Fight(StageKind.Wave);
            _s.Fight(StageKind.Boss);
        }

        private void Spend()
        {
            // 試練：解放済みで報酬を受け取れるものは掃討、そうでなければ挑戦（勝てばLvが上がる）
            foreach (TrialDef t in _data.Trials.Trials)
            {
                if (!_s.State.IsUnlocked("trial_" + t.Id)) { continue; }
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
            ChooseParty();
            foreach (string id in _s.State.OwnedCharacterIds)
            {
                _s.LevelUpMax(id);
                for (int i = 0; i < 11; i++) { if (!_s.Awaken(id).Success) { break; } }
            }
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

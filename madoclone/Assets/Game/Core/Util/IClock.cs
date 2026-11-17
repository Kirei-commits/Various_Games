using System;

namespace Mado.Core.Util
{
    /// <summary>現在時刻の窓口（放置報酬の計算用）。実装は View（本番）か、テスト・Mado.Sim（固定の時刻）が与える。Core は時計を直接読まない。</summary>
    public interface IClock
    {
        DateTime UtcNow { get; }
    }

    /// <summary>決めた時刻を返す時計。テスト・シミュレーション用。Advance で時間を進められる。</summary>
    public sealed class FixedClock : IClock
    {
        public DateTime UtcNow { get; private set; }

        public FixedClock(DateTime utcNow)
        {
            UtcNow = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc);
        }

        public void Advance(TimeSpan by) { UtcNow = UtcNow + by; }

        public void Set(DateTime utcNow) { UtcNow = DateTime.SpecifyKind(utcNow, DateTimeKind.Utc); }
    }
}

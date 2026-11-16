using System;
using Mado.Core.Util;

namespace Mado.View.Platform
{
    /// <summary>本番の IClock。Core は時計を読まないので、ここ（View）だけが現在時刻を渡す。</summary>
    public sealed class UnityClock : IClock
    {
        public DateTime UtcNow { get { return DateTime.UtcNow; } }
    }
}

using System;
using System.Globalization;
using Mado.Core.Save;
using Mado.Data;

namespace Mado.Core.Progress
{
    /// <summary>
    /// 繰り返せる収入の歯止め（docs/02 4.6節）。報酬を受け取れる回数が、1日に chargePerDay の速さで貯まり、cap（省略＝上限なし）まで持ち越せる。
    /// 受け取るたびに1回分を使う。挑戦そのものは何度でもできる。時刻は呼び出し側が渡す（Core は時計を読まない）。
    /// 時計が戻っても増えず、貯まった分も減らない。gate が null の試練は無制限（常に受け取れる）。
    /// </summary>
    public static class RepeatGate
    {
        /// <summary>時刻 now までの分を貯める。最初（時刻が空か壊れている）は、1日ぶんを満たして始める。</summary>
        public static void Accrue(GateState state, GateDef def, DateTime now, double speedMultiplier = 1.0)
        {
            if (def == null) { return; }
            if (!TryParse(state.LastUtc, out DateTime last))
            {
                state.Charges = def.Cap.HasValue ? Math.Min(def.ChargePerDay, def.Cap.Value) : def.ChargePerDay;
                state.LastUtc = Format(now);
                return;
            }
            if (now <= last) { return; }                                   // 時計が戻っている：増やさず、基準も動かさない
            double days = (now - last).TotalDays;
            state.Charges += days * def.ChargePerDay * speedMultiplier;
            if (def.Cap.HasValue) { state.Charges = Math.Min(state.Charges, def.Cap.Value); }
            state.LastUtc = Format(now);
        }

        /// <summary>1回分を使えるか（gate なしは常に true）。</summary>
        public static bool CanConsume(GateState state, GateDef def)
        {
            return def == null || state.Charges >= 1.0 - 1e-9;
        }

        public static void Consume(GateState state, GateDef def)
        {
            if (def == null) { return; }
            if (!CanConsume(state, def)) { throw new InvalidOperationException("貯まっている回数が足りない"); }
            state.Charges = Math.Max(0, state.Charges - 1.0);
        }

        private static bool TryParse(string text, out DateTime utc)
        {
            utc = default(DateTime);
            return !string.IsNullOrEmpty(text) && DateTime.TryParse(text, CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out utc);
        }

        private static string Format(DateTime utc) { return utc.ToUniversalTime().ToString("o", CultureInfo.InvariantCulture); }
    }
}

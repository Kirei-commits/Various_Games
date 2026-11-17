using System;
using System.Collections.Generic;
using System.Globalization;

namespace Mado.Core.Util
{
    /// <summary>
    /// 大きな数を K・M・G… の単位で短く表示する（単位は system.json の numberUnits）。
    /// 有効数字3桁（1.23K、12.3K、123K、1.23M）。1,000 未満は整数。単位が足りない大きさは指数表記。
    /// </summary>
    public static class NumberFormat
    {
        public static string Format(double value, IReadOnlyList<string> units)
        {
            if (double.IsNaN(value)) { return "NaN"; }
            if (double.IsInfinity(value)) { return value > 0 ? "∞" : "-∞"; }
            if (value < 0) { return "-" + Format(-value, units); }
            if (value < 999.5) { return Math.Round(value, MidpointRounding.AwayFromZero).ToString("0", CultureInfo.InvariantCulture); }

            double v = value;
            int unit = 0;
            while (v >= 999.5 && unit < units.Count - 1) { v /= 1000.0; unit++; }
            if (v >= 999.5) { return value.ToString("0.00E+0", CultureInfo.InvariantCulture); }   // 単位が足りない
            string digits = v < 9.995 ? v.ToString("0.00", CultureInfo.InvariantCulture)
                : v < 99.95 ? v.ToString("0.0", CultureInfo.InvariantCulture)
                : v.ToString("0", CultureInfo.InvariantCulture);
            return digits + units[unit];
        }
    }
}

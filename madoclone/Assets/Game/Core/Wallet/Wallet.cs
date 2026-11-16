using System;
using System.Collections.Generic;
using Mado.Data;

namespace Mado.Core.Wallet
{
    /// <summary>
    /// 素材の増減の唯一の入口（CLAUDE.md 不変条件3）。残高は private な配列（通貨マスタの並び）で、
    /// 外へ辞書・配列を返さない。仕様は docs/04 5節。
    /// </summary>
    public sealed class Wallet
    {
        // 浮動小数の誤差で「2.0000000001 枚」を3枚に切り上げないための許容。
        private const double Eps = 1e-9;

        private readonly string[] _ids;
        private readonly bool[] _integer;
        private readonly Dictionary<string, int> _index = new Dictionary<string, int>();
        private readonly double[] _balance;
        private readonly double[] _carry;
        private readonly Func<bool> _isDevMode;
        private readonly List<WalletEvent> _events = new List<WalletEvent>();

        public Wallet(IReadOnlyList<CurrencyDef> currencies, WalletState state, Func<bool> isDevMode)
        {
            if (currencies == null) { throw new ArgumentNullException(nameof(currencies)); }
            _isDevMode = isDevMode ?? (() => false);
            int n = currencies.Count;
            _ids = new string[n];
            _integer = new bool[n];
            _balance = new double[n];
            _carry = new double[n];
            for (int i = 0; i < n; i++)
            {
                _ids[i] = currencies[i].Id;
                _integer[i] = currencies[i].Integer;
                _index[_ids[i]] = i;
            }
            if (state != null)
            {
                foreach (KeyValuePair<string, double> kv in state.Balances ?? new Dictionary<string, double>())
                {
                    _balance[Index(kv.Key)] = Sanitize(kv.Value);
                }
                foreach (KeyValuePair<string, double> kv in state.Carry ?? new Dictionary<string, double>())
                {
                    _carry[Index(kv.Key)] = Sanitize(kv.Value);
                }
            }
        }

        public double Balance(string currencyId) { return _balance[Index(currencyId)]; }

        public PayResult Pay(Cost cost, PayReason reason)
        {
            if (cost == null) { throw new ArgumentNullException(nameof(cost)); }
            // 通貨マスタの並びに直し、個数の通貨は切り上げる（少なく見積もらない）。
            double[] need = new double[_ids.Length];
            foreach (Money m in cost.Items)
            {
                int i = Index(m.CurrencyId);
                need[i] += _integer[i] ? Math.Ceiling(m.Amount - Eps) : m.Amount;
            }
            bool dev = _isDevMode();
            if (!dev)
            {
                for (int i = 0; i < need.Length; i++)
                {
                    if (need[i] > 0 && _balance[i] < need[i])
                    {
                        return new PayResult(false, _ids[i], need[i] - _balance[i]);
                    }
                }
            }
            for (int i = 0; i < need.Length; i++)
            {
                if (need[i] <= 0) { continue; }
                if (!dev) { _balance[i] -= need[i]; }
                _events.Add(new WalletEvent(WalletEventKind.Spent, _ids[i], need[i], reason.Key, _balance[i]));
            }
            return PayResult.Ok();
        }

        public void Grant(Reward reward, GrantReason reason)
        {
            if (reward == null) { throw new ArgumentNullException(nameof(reward)); }
            double[] add = new double[_ids.Length];
            foreach (Money m in reward.Items) { add[Index(m.CurrencyId)] += m.Amount; }
            for (int i = 0; i < add.Length; i++)
            {
                if (add[i] <= 0) { continue; }
                // 個数の通貨は切り捨てて、端数を繰り越す。繰り越しが1以上たまったら、その整数分も渡す。
                double gained = _integer[i] ? TakeWhole(ref _carry[i], add[i]) : add[i];
                _balance[i] += gained;
                if (gained > 0)
                {
                    _events.Add(new WalletEvent(WalletEventKind.Granted, _ids[i], gained, reason.Key, _balance[i]));
                }
            }
        }

        /// <summary>たまったイベントを渡して空にする。</summary>
        public IReadOnlyList<WalletEvent> DrainEvents()
        {
            var copy = new List<WalletEvent>(_events);
            _events.Clear();
            return copy;
        }

        /// <summary>セーブ用のコピー（通貨マスタの並びで書き出す）。以後 Wallet とは共有しない。</summary>
        public WalletState ExportState()
        {
            var s = new WalletState();
            for (int i = 0; i < _ids.Length; i++)
            {
                s.Balances[_ids[i]] = _balance[i];
                s.Carry[_ids[i]] = _carry[i];
            }
            return s;
        }

        /// <summary>carry に amount を足し、整数になった分を取り出して返す（carry には端数が残る）。</summary>
        private static double TakeWhole(ref double carry, double amount)
        {
            double total = carry + amount;
            double whole = Math.Floor(total + Eps);
            carry = Math.Max(0, total - whole);
            if (carry < Eps) { carry = 0; }
            return whole;
        }

        private int Index(string currencyId)
        {
            if (currencyId == null || !_index.TryGetValue(currencyId, out int i))
            {
                throw new ArgumentException("通貨マスタに無い通貨 ID: " + currencyId);
            }
            return i;
        }

        private static double Sanitize(double v)
        {
            if (double.IsNaN(v) || double.IsInfinity(v) || v < 0) { throw new ArgumentException("残高が不正: " + v); }
            return v;
        }
    }
}

namespace Mado.Core.Util
{
    /// <summary>
    /// SplitMix64。シードから別の乱数の種を作るためだけに使う（docs/02 5.5節）。
    /// 状態を持つ struct なので、ローカル変数として使うこと（readonly フィールドに置くとコピーに対して進む）。
    /// 参照実装：tools/bootstrap/rng_reference.py
    /// </summary>
    public struct SplitMix64
    {
        private ulong _state;

        public SplitMix64(ulong seed)
        {
            _state = seed;
        }

        public ulong Next()
        {
            unchecked
            {
                _state += 0x9E3779B97F4A7C15UL;
                ulong z = _state;
                z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
                z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
                return z ^ (z >> 31);
            }
        }
    }
}

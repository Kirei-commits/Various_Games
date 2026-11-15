using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace Mado.Core.Save
{
    /// <summary>古い版のセーブを最新に上げる。版ごとの関数（v → v+1）を順に適用する（docs/04 6.1節）。</summary>
    public sealed class SaveMigrator
    {
        /// <summary>いま書き出す版。S4 の時点では 1。意味を変えるときに上げ、古いフィクスチャを残す。</summary>
        public const int LatestVersion = 1;

        private readonly int _current;
        private readonly IDictionary<int, Func<JObject, JObject>> _steps;

        public SaveMigrator() : this(LatestVersion, new Dictionary<int, Func<JObject, JObject>>()) { }

        public SaveMigrator(int currentVersion, IDictionary<int, Func<JObject, JObject>> steps)
        {
            _current = currentVersion;
            _steps = steps ?? throw new ArgumentNullException(nameof(steps));
        }

        public int CurrentVersion { get { return _current; } }

        /// <summary>入力は書き換えない。失敗したら null を返し、理由を error に入れる。</summary>
        public JObject Migrate(JObject root, int version, out string error)
        {
            error = null;
            if (version < 1) { error = "saveVersion が 1 未満"; return null; }
            if (version > _current) { error = "saveVersion " + version + " は、このアプリ（" + _current + "）より新しい"; return null; }
            JObject work = (JObject)root.DeepClone();
            for (int v = version; v < _current; v++)
            {
                if (!_steps.TryGetValue(v, out Func<JObject, JObject> step))
                {
                    error = "v" + v + " → v" + (v + 1) + " の移行が無い";
                    return null;
                }
                try
                {
                    work = step(work);
                }
                catch (Exception e)
                {
                    error = "v" + v + " → v" + (v + 1) + " の移行で失敗: " + e.Message;
                    return null;
                }
                if (work == null) { error = "v" + v + " の移行が null を返した"; return null; }
                work["saveVersion"] = v + 1;
            }
            return work;
        }
    }
}

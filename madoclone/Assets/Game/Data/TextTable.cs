using System.Collections.Generic;

namespace Mado.Data
{
    /// <summary>表示する文字の表（text/ja.json）。無いキーはキーそのものを返すので、画面に出て気づける。</summary>
    public sealed class TextTable
    {
        private readonly IReadOnlyDictionary<string, string> _texts;

        public TextTable(IReadOnlyDictionary<string, string> texts)
        {
            _texts = texts ?? new Dictionary<string, string>();
        }

        public int Count
        {
            get { return _texts.Count; }
        }

        public bool Contains(string key)
        {
            return key != null && _texts.ContainsKey(key);
        }

        public string Get(string key)
        {
            string value;
            if (key != null && _texts.TryGetValue(key, out value))
            {
                return value;
            }
            return key;
        }
    }
}

using Mado.Data;
using UnityEngine;

namespace Mado.View.Platform
{
    /// <summary>
    /// マスタ JSON を Resources から読む IDataSource。エディタの「Mado/データを同期」（DataSync）が、
    /// Assets/Game/Data/Json の中身を Assets/Game/View/Resources/MadoData にコピーする（ビルドの前にも自動で走る）。
    /// relativePath は "characters.json"・"text/ja.json" のような形で、拡張子を除いたものが Resources のパス。
    /// </summary>
    public sealed class ResourcesDataSource : IDataSource
    {
        public const string Root = "MadoData/";

        public string ReadText(string relativePath)
        {
            string path = Root + System.IO.Path.ChangeExtension(relativePath, null).Replace('\\', '/');
            TextAsset asset = Resources.Load<TextAsset>(path);
            if (asset == null) { throw DataLoader.FileMissing(relativePath, "Resources/" + path); }
            return asset.text;
        }
    }
}

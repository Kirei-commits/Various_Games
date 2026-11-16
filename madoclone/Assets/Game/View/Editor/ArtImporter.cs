using UnityEditor;

namespace Mado.View.Editor
{
    /// <summary>
    /// Resources/MadoArt の画像を、取り込み時に自動で Sprite として扱う（.meta を手で作らなくてよいように）。
    /// 実行時に Resources.Load&lt;Sprite&gt; で引ける。
    /// </summary>
    public sealed class ArtImporter : AssetPostprocessor
    {
        private const string Folder = "/Resources/MadoArt/";

        private void OnPreprocessTexture()
        {
            if (!assetPath.Contains(Folder)) { return; }
            var importer = (TextureImporter)assetImporter;
            importer.textureType = TextureImporterType.Sprite;
            importer.mipmapEnabled = false;
        }
    }
}

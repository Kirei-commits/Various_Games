using Mado.Core.Session;
using NUnit.Framework;

namespace Mado.Core.Tests
{
    /// <summary>テスト全体の設定：GameSession は、ことわりが無ければ全機能を開いた状態で作る（解放のテストだけ unlockAll: false を渡す）。</summary>
    [SetUpFixture]
    public sealed class TestSetup
    {
        [OneTimeSetUp]
        public void OpenEverything() { GameSession.UnlockAllByDefault = true; }
    }
}

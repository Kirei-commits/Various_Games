// UnityEditor のスタブ（DataSync が使う分だけ）。説明は UnityStubs.csproj。
using System;

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Method)]
    public sealed class MenuItemAttribute : Attribute
    {
        public MenuItemAttribute(string itemName) { }
    }

    public static class AssetDatabase
    {
        public static void Refresh() { }
    }
}

namespace UnityEditor.Build.Reporting
{
    public class BuildReport { public BuildSummary summary { get { return null; } } }
}

namespace UnityEditor.Build
{
    public interface IOrderedCallback { int callbackOrder { get; } }

    public interface IPreprocessBuildWithReport : IOrderedCallback
    {
        void OnPreprocessBuild(UnityEditor.Build.Reporting.BuildReport report);
    }
}

namespace UnityEngine
{
    public enum UIOrientation { Portrait, PortraitUpsideDown, LandscapeRight, LandscapeLeft, AutoRotation }
}

namespace UnityEditor
{
    public enum BuildTarget { Android = 13, StandaloneWindows64 = 19 }

    [Flags]
    public enum BuildOptions { None = 0, Development = 1 }

    public enum ScriptingImplementation { Mono2x = 0, IL2CPP = 1 }

    [Flags]
    public enum AndroidArchitecture : uint { None = 0, ARMv7 = 1, ARM64 = 2, X86 = 4, X86_64 = 8, All = 4294967295 }

    public struct BuildPlayerOptions
    {
        public string[] scenes { get; set; }
        public string locationPathName { get; set; }
        public BuildTarget target { get; set; }
        public BuildOptions options { get; set; }
    }

    public static class BuildPipeline
    {
        public static UnityEditor.Build.Reporting.BuildReport BuildPlayer(BuildPlayerOptions buildPlayerOptions) { return null; }
    }

    public static class PlayerSettings
    {
        public static string productName { get; set; }
        public static UnityEngine.UIOrientation defaultInterfaceOrientation { get; set; }
        public static void SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget buildTarget, string identifier) { }
        public static void SetScriptingBackend(UnityEditor.Build.NamedBuildTarget buildTarget, ScriptingImplementation backend) { }

        public static class Android
        {
            public static AndroidArchitecture targetArchitectures { get; set; }
        }
    }

    public class EditorBuildSettingsScene
    {
        public EditorBuildSettingsScene(string path, bool enabled) { }
    }

    public static class EditorBuildSettings
    {
        public static EditorBuildSettingsScene[] scenes { get; set; }
    }
}

namespace UnityEditor.Build
{
    public struct NamedBuildTarget
    {
        public static NamedBuildTarget Android { get { return default(NamedBuildTarget); } }
    }
}

namespace UnityEditor.Build.Reporting
{
    public enum BuildResult { Unknown, Succeeded, Failed, Cancelled }

    public class BuildSummary
    {
        public BuildResult result { get { return BuildResult.Unknown; } }
        public ulong totalSize { get { return 0; } }
    }
}

namespace UnityEditor.SceneManagement
{
    public enum NewSceneSetup { EmptyScene, DefaultGameObjects }
    public enum NewSceneMode { Single, Additive }

    public static class EditorSceneManager
    {
        public static UnityEngine.SceneManagement.Scene NewScene(NewSceneSetup setup, NewSceneMode mode) { return default(UnityEngine.SceneManagement.Scene); }
        public static bool SaveScene(UnityEngine.SceneManagement.Scene scene, string dstScenePath) { return true; }
    }
}

namespace UnityEngine.SceneManagement
{
    public struct Scene { }
}

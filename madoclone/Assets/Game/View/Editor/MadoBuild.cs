using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Mado.View.Editor
{
    /// <summary>
    /// Android の APK を作る（メニュー「Mado/Android ビルド」、または CI から
    /// <c>Unity -batchmode -quit -executeMethod Mado.View.Editor.MadoBuild.BuildAndroid</c>）。
    /// 画面は MadoHost が起動時に自動で作るので、シーンは空でよい（このスクリプトが空のシーンを作ってビルド設定に入れる）。
    /// </summary>
    public static class MadoBuild
    {
        private const string ScenePath = "Assets/Scenes/Main.unity";
        private const string Output = "Builds/madoclone.apk";

        [MenuItem("Mado/Android ビルド")]
        public static void BuildAndroid()
        {
            DataSync.Sync();
            EnsureScene();

            PlayerSettings.productName = "madoclone";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "jp.local.madoclone");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;

            Directory.CreateDirectory(Path.GetDirectoryName(Output));
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = Output,
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new Exception("Android ビルドに失敗: " + report.summary.result);
            }
            Debug.Log("Android ビルドに成功: " + Output + "（" + report.summary.totalSize + " バイト）");
        }

        private static void EnsureScene()
        {
            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }
    }
}

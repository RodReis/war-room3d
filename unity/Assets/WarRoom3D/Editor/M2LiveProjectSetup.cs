using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;
using WarRoom3D;

namespace WarRoom3D.Editor
{
    public static class M2LiveProjectSetup
    {
        public const string ScenePath = "Assets/WarRoom3D/Scenes/QuartelM2Live.unity";

        [MenuItem("War-Room3D/Criar cena M2 live")]
        public static void CreateScene()
        {
            AgentAssetBuilder.EnsurePrefabs();
            M0ProjectSetup.CreateScene();
            var scene = SceneManager.GetActiveScene();
            Object.DestroyImmediate(GameObject.Find("Demonstração"));
            Object.DestroyImmediate(GameObject.Find("Demonstração M2"));
            var hud = GameObject.Find("HUD");
            Object.DestroyImmediate(hud.GetComponent<HudPresenter>());
            var document = hud.GetComponent<UIDocument>();
            var client = hud.AddComponent<LiveStateClient>();
            var presenter = hud.AddComponent<LiveHudPresenter>();
            var serialized = new SerializedObject(presenter);
            serialized.FindProperty("document").objectReferenceValue = document;
            serialized.FindProperty("styleSheet").objectReferenceValue = AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/WarRoom3D/UI/Hud.uss");
            serialized.FindProperty("client").objectReferenceValue = client;
            serialized.FindProperty("sector").objectReferenceValue = Object.FindAnyObjectByType<SectorBuilder>();
            serialized.FindProperty("orbit").objectReferenceValue = Object.FindAnyObjectByType<OrbitCamera>();
            serialized.ApplyModifiedPropertiesWithoutUndo();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] {
                new EditorBuildSettingsScene("Assets/WarRoom3D/Scenes/QuartelM0.unity", true),
                new EditorBuildSettingsScene(ScenePath, true)
            };
            AssetDatabase.SaveAssets();
            Debug.Log("Cena M2 live criada: " + ScenePath);
        }

        [MenuItem("War-Room3D/Build Windows M2 live")]
        public static void BuildWindowsM2Live()
        {
            CreateScene();
            var priorProductName = PlayerSettings.productName;
            try
            {
                PlayerSettings.productName = "War-Room3D M2 Live";
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                    scenes = new[] { ScenePath },
                    locationPathName = "Builds/WarRoom3D-M2-Live/WarRoom3D.exe",
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.Development
                });
                if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                    throw new System.Exception("Build Windows M2 live falhou: " + report.summary.result);
                Debug.Log("Build Windows M2 live concluído: " + report.summary.totalSize + " bytes");
            }
            finally { PlayerSettings.productName = priorProductName; }
        }

        [MenuItem("War-Room3D/Build Windows M3 histórico")]
        public static void BuildWindowsM3History()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(ScenePath) == null) CreateScene();
            var priorProductName = PlayerSettings.productName;
            try
            {
                PlayerSettings.productName = "War-Room3D M3 Histórico";
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                    scenes = new[] { ScenePath },
                    locationPathName = "Builds/WarRoom3D-M3-History/WarRoom3D.exe",
                    target = BuildTarget.StandaloneWindows64,
                    options = BuildOptions.Development
                });
                if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                    throw new System.Exception("Build Windows M3 histórico falhou: " + report.summary.result);
                Debug.Log("Build Windows M3 histórico concluído: " + report.summary.totalSize + " bytes");
            }
            finally { PlayerSettings.productName = priorProductName; }
        }

        public static void BuildWindowsM4Commands()
        {
            CreateScene();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/WarRoom3D-M4/WarRoom3D.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.Development
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build Windows M4 falhou: " + report.summary.result);
            Debug.Log("Build Windows M4 concluído: " + report.summary.totalSize + " bytes");
        }

        public static void BuildWindowsM5Operations()
        {
            CreateScene();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/WarRoom3D-M5/WarRoom3D.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.Development
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build Windows M5 falhou: " + report.summary.result);
            Debug.Log("Build Windows M5 concluído: " + report.summary.totalSize + " bytes");
        }

        // Candidato isolado para ensaio G3; preserva o build cujo manifesto e métricas já foram publicados.
        public static void BuildWindowsM5Continuation()
        {
            CreateScene();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath, "Assets/WarRoom3D/Scenes/QuartelM0.unity" },
                locationPathName = "Builds/WarRoom3D-M5-G3/WarRoom3D.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.Development
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build Windows M5 G3 falhou: " + report.summary.result);
            Debug.Log("Build Windows M5 G3 concluído: " + report.summary.totalSize + " bytes");
        }
    }
}

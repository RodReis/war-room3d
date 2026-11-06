using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;
using WarRoom3D;

namespace WarRoom3D.Editor
{
    public static class M0ProjectSetup
    {
        private const string ScenePath = "Assets/WarRoom3D/Scenes/QuartelM0.unity";

        [MenuItem("War-Room3D/Criar cena M0/M2 demo")]
        public static void CreateScene()
        {
            PlayerSettings.companyName = "RodReis";
            PlayerSettings.productName = "War-Room3D M2 Demo";
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var sector = new GameObject("Setor 01").AddComponent<SectorBuilder>();
            if (!AssetDatabase.IsValidFolder("Assets/WarRoom3D/Materials"))
                AssetDatabase.CreateFolder("Assets/WarRoom3D", "Materials");
            var sectorObject = new SerializedObject(sector);
            sectorObject.FindProperty("graphiteMaterial").objectReferenceValue = Palette("Graphite", new Color(0.055f, 0.095f, 0.15f));
            sectorObject.FindProperty("floorMaterial").objectReferenceValue = Palette("Floor", new Color(0.12f, 0.19f, 0.26f));
            sectorObject.FindProperty("cyanMaterial").objectReferenceValue = Palette("Cyan", new Color(0.06f, 0.72f, 0.83f), true);
            sectorObject.FindProperty("glassMaterial").objectReferenceValue = Palette("Glass", new Color(0.12f, 0.30f, 0.38f));
            sectorObject.FindProperty("goldMaterial").objectReferenceValue = Palette("Gold", new Color(0.88f, 0.58f, 0.18f), true);
            sectorObject.ApplyModifiedPropertiesWithoutUndo();
            var loader = new GameObject("Demonstração").AddComponent<DemoLoader>();
            var fixture = AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/WarRoom3D/Demo/m0-demo.v1.json");
            if (fixture == null) throw new System.Exception("Fixture M0 não encontrada");
            var loaderObject = new SerializedObject(loader);
            loaderObject.FindProperty("fixture").objectReferenceValue = fixture;
            loaderObject.ApplyModifiedPropertiesWithoutUndo();
            var infrastructureLoader = new GameObject("Demonstração M2").AddComponent<InfrastructureDemoLoader>();
            var infrastructureFixture = AssetDatabase.LoadAssetAtPath<TextAsset>("Assets/WarRoom3D/Demo/m2-infrastructure.v1.json");
            if (infrastructureFixture == null) throw new System.Exception("Fixture M2 não encontrada");
            var infrastructureObject = new SerializedObject(infrastructureLoader);
            infrastructureObject.FindProperty("fixture").objectReferenceValue = infrastructureFixture;
            infrastructureObject.ApplyModifiedPropertiesWithoutUndo();

            var cameraObject = new GameObject("Câmera orbital");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.025f, 0.055f, 0.085f);
            camera.fieldOfView = 55;
            camera.farClipPlane = 160;
            var orbit = cameraObject.AddComponent<OrbitCamera>();

            var lightObject = new GameObject("Luz principal");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.6f;
            lightObject.transform.rotation = Quaternion.Euler(55, -30, 0);
            RenderSettings.ambientLight = new Color(0.45f, 0.58f, 0.66f);

            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>("Assets/WarRoom3D/UI/M0PanelSettings.asset");
            if (panel == null)
            {
                panel = ScriptableObject.CreateInstance<PanelSettings>();
                AssetDatabase.CreateAsset(panel, "Assets/WarRoom3D/UI/M0PanelSettings.asset");
            }
            var ui = new GameObject("HUD").AddComponent<UIDocument>();
            ui.panelSettings = panel;
            ui.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>("Assets/WarRoom3D/UI/Hud.uxml");
            if (ui.visualTreeAsset == null) throw new System.Exception("HUD UXML não encontrado");
            var presenter = ui.gameObject.AddComponent<HudPresenter>();
            var presenterObject = new SerializedObject(presenter);
            presenterObject.FindProperty("document").objectReferenceValue = ui;
            presenterObject.FindProperty("styleSheet").objectReferenceValue = AssetDatabase.LoadAssetAtPath<StyleSheet>("Assets/WarRoom3D/UI/Hud.uss");
            presenterObject.FindProperty("loader").objectReferenceValue = loader;
            presenterObject.FindProperty("infrastructureLoader").objectReferenceValue = infrastructureLoader;
            presenterObject.FindProperty("sector").objectReferenceValue = sector;
            presenterObject.FindProperty("orbit").objectReferenceValue = orbit;
            presenterObject.ApplyModifiedPropertiesWithoutUndo();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("Cena M0 criada: " + ScenePath);
        }

        private static Material Palette(string name, Color color, bool emissive = false)
        {
            string path = $"Assets/WarRoom3D/Materials/{name}.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material != null) return material;
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new System.Exception("Shader URP/Lit indisponível no Editor");
            material = new Material(shader) { color = color };
            if (emissive) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color * 1.2f); }
            AssetDatabase.CreateAsset(material, path);
            return material;
        }

        [MenuItem("War-Room3D/Build Windows M0")]
        public static void BuildWindows()
        {
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/WarRoom3D-M0/WarRoom3D.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.Development
            };
            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build Windows M0 falhou: " + report.summary.result);
            Debug.Log("Build Windows M0 concluído: " + report.summary.totalSize + " bytes");
        }

        [MenuItem("War-Room3D/Build Windows M2 demo")]
        public static void BuildWindowsM2()
        {
            CreateScene();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = "Builds/WarRoom3D-M2-Demo/WarRoom3D.exe",
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.Development
            });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                throw new System.Exception("Build Windows M2 demo falhou: " + report.summary.result);
            Debug.Log("Build Windows M2 demo concluído: " + report.summary.totalSize + " bytes");
        }
    }
}

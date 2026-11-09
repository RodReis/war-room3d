#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Acesso opt-in à cena de demonstração incluída no mesmo build candidato G4.
    public sealed class Issue35DemoPlayerProof : MonoBehaviour
    {
        private string directory;

        [Serializable]
        private sealed class Result
        {
            public string status;
            public string scene;
            public string seal;
            public bool commandPresenterAbsent;
            public bool commandButtonHidden;
            public int width;
            public int height;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var path = Environment.GetEnvironmentVariable("WR3D_35_DEMO_PROOF_DIR");
            if (string.IsNullOrWhiteSpace(path) || FindAnyObjectByType<LiveStateClient>() == null) return;
            var host = new GameObject("Issue35DemoPlayerProof");
            DontDestroyOnLoad(host);
            host.AddComponent<Issue35DemoPlayerProof>().directory = path;
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(directory);
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return new WaitForEndOfFrame();
            var root = FindAnyObjectByType<UIDocument>()?.rootVisualElement;
            var report = new Result
            {
                scene = SceneManager.GetActiveScene().name,
                seal = root?.Q<Label>("demo-seal")?.text ?? "",
                commandPresenterAbsent = FindAnyObjectByType<CommandPresenter>() == null,
                commandButtonHidden = root?.Q<Button>("command-button")?.resolvedStyle.display == DisplayStyle.None,
                width = Screen.width,
                height = Screen.height
            };
            var passed = report.scene == "QuartelM0" &&
                report.seal == "CONCEITO · DADOS ILUSTRATIVOS" &&
                report.commandPresenterAbsent && report.commandButtonHidden;
            report.status = passed ? "pass" : "fail";
            File.WriteAllText(Path.Combine(directory, "demo-result.json"), JsonUtility.ToJson(report, true));
            if (root != null)
            {
                var texture = ScreenCapture.CaptureScreenshotAsTexture();
                if (texture != null)
                {
                    try { File.WriteAllBytes(Path.Combine(directory, "demo-quartel.png"), texture.EncodeToPNG()); }
                    finally { Destroy(texture); }
                }
            }
            Application.Quit(passed ? 0 : 35);
        }
    }
}
#endif

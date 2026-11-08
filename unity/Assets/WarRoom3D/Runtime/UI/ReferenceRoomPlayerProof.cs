#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Opt-in, demo-only proof. Never attaches to a live service scene.
    public sealed class ReferenceRoomPlayerProof : MonoBehaviour
    {
        private string directory;
        private int width;
        private int height;
        private float scale;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WR3D_30_PROOF_DIR"))) return;
            var demo = FindAnyObjectByType<HudPresenter>();
            if (demo != null) demo.gameObject.AddComponent<ReferenceRoomPlayerProof>();
        }

        private IEnumerator Start()
        {
            directory = Environment.GetEnvironmentVariable("WR3D_30_PROOF_DIR");
            if (!int.TryParse(Environment.GetEnvironmentVariable("WR3D_30_WIDTH"), out width) ||
                !int.TryParse(Environment.GetEnvironmentVariable("WR3D_30_HEIGHT"), out height) ||
                !float.TryParse(Environment.GetEnvironmentVariable("WR3D_30_SCALE"), System.Globalization.NumberStyles.Float,
                    System.Globalization.CultureInfo.InvariantCulture, out scale) ||
                (width != 1920 && width != 1440 && width != 1366) ||
                (height != 1080 && height != 900 && height != 768) ||
                (scale != 1f && scale != 1.25f && scale != 1.5f))
            { Fail("parametros_invalidos"); yield break; }
            Directory.CreateDirectory(directory);
            var document = GetComponent<UIDocument>();
            var root = document.rootVisualElement;
            if (root.Q<Label>("demo-seal").text != "CONCEITO · DADOS ILUSTRATIVOS")
            { Fail("cena_nao_sintetica"); yield break; }
            Screen.SetResolution(width, height, false);
            document.panelSettings.scale = scale;
            for (var i = 0; i < 8; i++) yield return new WaitForEndOfFrame();
            if (Screen.width != width || Screen.height != height)
            { Fail("resolucao_nao_aplicada"); yield break; }
            var navigator = new ReferenceRoomNavigation(root, () => GetComponent<HudPresenter>().SendMessage("ReturnToSector"));
            yield return Capture("quartel");
            GetComponent<HudPresenter>().SendMessage("EnterRoom");
            yield return new WaitForEndOfFrame();
            yield return Capture("sala");
            navigator.SetView(true, root.Q<Label>("project-name").text);
            navigator.OpenEvidence();
            yield return Capture("detalhe");
            navigator.CloseEvidence();
            navigator.SetSummaryCollapsed(true);
            yield return Capture("resumo-recolhido");
            var result = "{\"status\":\"pass\",\"synthetic\":true,\"width\":" + Screen.width +
                ",\"height\":" + Screen.height + ",\"uiScale\":" + scale.ToString(System.Globalization.CultureInfo.InvariantCulture) + "}";
            File.WriteAllText(Path.Combine(directory, "resultado.json"), result);
            Application.Quit(0);
        }

        private IEnumerator Capture(string view)
        {
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(directory, view + ".png"), texture.EncodeToPNG()); }
            finally { Destroy(texture); }
        }

        private void Fail(string reason)
        {
            if (!string.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
                File.WriteAllText(Path.Combine(directory, "resultado.json"), "{\"status\":\"fail\",\"reason\":\"" + reason + "\"}");
            }
            Application.Quit(30);
        }
    }
}
#endif

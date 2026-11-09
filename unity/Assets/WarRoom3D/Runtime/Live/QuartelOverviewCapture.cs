#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class QuartelOverviewCapture : MonoBehaviour
    {
        private string output;
        private UIDocument document;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var args = Environment.GetCommandLineArgs();
            if (Array.IndexOf(args, "-wr3d-quartel-demo") < 0) return;
            var index = Array.IndexOf(args, "-wr3d-quartel-capture");
            if (index < 0 || index + 1 >= args.Length) return;
            var hud = FindAnyObjectByType<LiveHudPresenter>();
            if (hud == null) return;
            var capture = hud.gameObject.AddComponent<QuartelOverviewCapture>();
            capture.document = hud.GetComponent<UIDocument>();
            capture.output = args[index + 1];
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var root = document.rootVisualElement;
            var deadline = Time.realtimeSinceStartup + 20f;
            while (root.Q<Button>("overview-card-slot-02") == null && Time.realtimeSinceStartup < deadline)
                yield return null;
            yield return null;
            yield return null;

            var left = root.Q<Button>("overview-card-slot-01");
            var right = root.Q<Button>("overview-card-slot-02");
            var surface = root.Q("surface").worldBound;
            var seal = root.Q<Label>("demo-seal").text;
            if (left == null || right == null || !seal.Contains("DADOS ILUSTRATIVOS") ||
                !Contains(surface, left.worldBound) || !Contains(surface, right.worldBound) ||
                left.worldBound.Overlaps(right.worldBound) ||
                !Contains(right.worldBound, right.Q<Label>("overview-alert").worldBound) ||
                !Contains(root.Q<ScrollView>("overview-scroll").contentViewport.worldBound, right.Q<Label>("overview-alert").worldBound))
            { Fail("cartões fora da área visível, sobrepostos ou sem selo"); yield break; }

            yield return Capture("quartel");
            Activate(left);
            yield return null;
            if (root.Q<Label>("project-name").text != "Plataforma Atlas" || root.ClassListContains("quartel-mode"))
            { Fail("cartão Atlas não abriu a sala"); yield break; }

            yield return Capture("interior");
            Activate(root.Q<Button>("back-button"));
            yield return null;
            if (!root.ClassListContains("quartel-mode") || !left.ClassListContains("overview-selected"))
            { Fail("retorno perdeu a vista ou seleção"); yield break; }
            Activate(right);
            yield return null;
            if (root.Q<Label>("project-name").text != "Aplicativo Orion" || root.ClassListContains("quartel-mode"))
            { Fail("cartão Orion não abriu a sala"); yield break; }

            File.WriteAllText(Path.Combine(output, "resultado.txt"),
                $"pass | Player {Application.unityVersion} | {Screen.width}x{Screen.height} | {seal}");
            Application.Quit(0);
        }

        private static bool Contains(Rect outer, Rect inner) => inner.width > 0 && inner.height > 0 &&
            outer.Contains(inner.min) && outer.Contains(inner.max - Vector2.one);

        private static void Activate(Button button)
        {
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = button;
                button.SendEvent(submit);
            }
        }

        private IEnumerator Capture(string name)
        {
            yield return null;
            yield return new WaitForEndOfFrame();
            var image = ScreenCapture.CaptureScreenshotAsTexture();
            if (image == null) { Fail("textura do Player indisponível"); yield break; }
            try { File.WriteAllBytes(Path.Combine(output, name + ".png"), image.EncodeToPNG()); }
            finally { Destroy(image); }
        }

        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(output, "resultado.txt"), "fail | " + reason);
            Application.Quit(2);
        }
    }
}
#endif

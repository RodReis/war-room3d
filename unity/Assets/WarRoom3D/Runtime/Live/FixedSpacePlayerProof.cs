#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Prova opt-in com fixture local. Não habilita transporte, sessões nem comandos reais.
    public sealed class FixedSpacePlayerProof : MonoBehaviour
    {
        private string output;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, "-wr3d-fixed-spaces-capture");
            if (index < 0 || index + 1 >= args.Length || Array.IndexOf(args, "-wr3d-quartel-demo") < 0) return;
            var hud = FindAnyObjectByType<LiveHudPresenter>();
            if (hud != null) hud.gameObject.AddComponent<FixedSpacePlayerProof>().output = args[index + 1];
        }

        private IEnumerator Start()
        {
            Application.runInBackground = true;
            Directory.CreateDirectory(output);
            yield return null;
            yield return null;
            var hud = GetComponent<LiveHudPresenter>();
            var root = GetComponent<UIDocument>().rootVisualElement;
            var sector = FindAnyObjectByType<SectorBuilder>();
            var orbit = FindAnyObjectByType<OrbitCamera>();
            var fixture = LiveSnapshot.Parse(Resources.Load<TextAsset>("QuartelPreview").text, "demo");
            var empty = LiveSnapshot.Parse("{\"schemaVersion\":\"1.0\",\"mode\":\"demo\",\"streamSequence\":0," +
                "\"projects\":[],\"roomPlacements\":[],\"sessions\":[],\"agents\":[],\"feed\":[]," +
                "\"resources\":[],\"projectResources\":[],\"resourceStates\":[],\"incidents\":[]}", "demo");
            if (sector.FixedSpaces.Count != 2 || sector.Rooms.Count != 6) { Fail("espaços ou slots ausentes"); yield break; }
            hud.SendMessage("Render", empty);
            yield return Capture("quartel-sem-projetos");
            foreach (var entry in new[] { "cafeteria", "pi-meeting" })
            {
                var button = root.Q<Button>("visit-" + entry);
                if (!Visible(root, button)) { Fail("entrada não visível: " + entry); yield break; }
                Activate(button);
                yield return null;
                var space = sector.FixedSpaces[entry];
                var originalPosition = space.transform.position;
                var focus = orbit.Focus;
                if (root.Q<Label>("fixed-space-title").text != space.Title ||
                    root.Q("project-panel").resolvedStyle.display != DisplayStyle.None ||
                    !Visible(root, root.Q<Button>("fixed-space-back")))
                { Fail("visita sem projetos: " + entry); yield break; }
                yield return Capture(entry + "-visual");
                space.GetComponent<ReferenceRoomView>().SetReduced(true);
                yield return Capture(entry + "-reduzido");
                space.GetComponent<ReferenceRoomView>().SetReduced(false);
                Activate(root.Q<Button>("fixed-space-angle"));
                yield return Capture(entry + "-oposto");
                Activate(root.Q<Button>("fixed-space-reset"));
                foreach (var state in new[] { fixture, empty, fixture })
                {
                    hud.SendMessage("Render", state);
                    yield return null;
                    if (orbit.Focus != focus || space.transform.position != originalPosition || !space.gameObject.activeInHierarchy ||
                        root.Q<Label>("breadcrumb").text != "Quartel / " + space.Title ||
                        root.Q("project-panel").resolvedStyle.display != DisplayStyle.None)
                    { Fail("atualização alterou visita: " + entry); yield break; }
                }
                Activate(root.Q<Button>("fixed-space-back"));
                yield return null;
                if (!root.ClassListContains("quartel-mode") || root.panel.focusController.focusedElement != button)
                { Fail("retorno ou foco: " + entry); yield break; }
            }
            yield return Capture("quartel-com-projetos");
            if (!root.Q<Label>("demo-seal").text.Contains("DADOS ILUSTRATIVOS")) { Fail("selo sintético ausente"); yield break; }
            File.WriteAllText(Path.Combine(output, "resultado.txt"),
                $"pass | Unity {Application.unityVersion} | {Screen.width}x{Screen.height} | fixture local, zero/dois projetos, " +
                "visita, submit de teclado, retorno/foco, câmera, dois ângulos e reduzido; sem prova de fonte ou aceite humano.");
            Application.Quit(0);
        }

        private static bool Visible(VisualElement root, VisualElement item) => item != null && item.resolvedStyle.display != DisplayStyle.None &&
            item.worldBound.width > 0 && root.worldBound.Contains(item.worldBound.min) && root.worldBound.Contains(item.worldBound.max - Vector2.one);

        private static void Activate(Button button)
        {
            button.Focus();
            using (var submit = NavigationSubmitEvent.GetPooled()) { submit.target = button; button.SendEvent(submit); }
        }

        private IEnumerator Capture(string name)
        {
            yield return null;
            yield return new WaitForEndOfFrame();
            var screenshot = ScreenCapture.CaptureScreenshotAsTexture();
            if (screenshot == null) { Fail("captura indisponível"); yield break; }
            try { File.WriteAllBytes(Path.Combine(output, name + ".png"), screenshot.EncodeToPNG()); }
            finally { Destroy(screenshot); }
        }

        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(output, "resultado.txt"), "fail | " + reason);
            Debug.LogError("Prova #53: " + reason);
            Application.Quit(2);
        }
    }
}
#endif

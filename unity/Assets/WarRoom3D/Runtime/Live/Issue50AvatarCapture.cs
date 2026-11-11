#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Captura uma sequência sintética no Player; não liga fontes nem emite comandos.
    public sealed class Issue50AvatarCapture : MonoBehaviour
    {
        private static readonly string[] Keys = {
            "preview-atlas-agent", "preview-atlas-agent-2", "preview-atlas-agent-4", "preview-atlas-agent-5"
        };
        private string output;
        private UIDocument document;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var args = Environment.GetCommandLineArgs();
            if (Array.IndexOf(args, "-wr3d-quartel-demo") < 0) return;
            var index = Array.IndexOf(args, "-wr3d-avatar-capture");
            if (index < 0 || index + 1 >= args.Length) return;
            var hud = FindAnyObjectByType<LiveHudPresenter>();
            if (hud == null) return;
            var capture = hud.gameObject.AddComponent<Issue50AvatarCapture>();
            capture.document = hud.GetComponent<UIDocument>();
            capture.output = args[index + 1];
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var root = document.rootVisualElement;
            var deadline = Time.realtimeSinceStartup + 20f;
            Button atlas;
            while ((atlas = root.Q<Button>("overview-card-slot-01")) == null && Time.realtimeSinceStartup < deadline)
                yield return null;
            if (atlas == null) { Fail("cartão da fixture ausente"); yield break; }
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = atlas;
                atlas.SendEvent(submit);
            }
            yield return null;
            var presenter = GetComponent<AgentPresenter>();
            if (presenter == null || presenter.VisibleCount != 4 || root.Q<Label>("project-name").text != "Plataforma Atlas" ||
                !root.Q<Label>("demo-seal").text.Contains("DADOS ILUSTRATIVOS"))
            { Fail("quatro avatares e selo de demonstração não encontrados"); yield break; }
            var styles = new HashSet<int>();
            var first = presenter.FindAgent(Keys[0]);
            var start = first != null ? first.localPosition : Vector3.zero;
            for (var frame = 0; frame < 18; frame++)
            {
                yield return new WaitForEndOfFrame();
                var image = ScreenCapture.CaptureScreenshotAsTexture();
                if (image == null) { Fail("captura indisponível"); yield break; }
                try { File.WriteAllBytes(Path.Combine(output, $"quadro-{frame:D3}.png"), image.EncodeToPNG()); }
                finally { Destroy(image); }
                yield return new WaitForSecondsRealtime(.09f);
            }
            foreach (var key in Keys)
            {
                var agent = presenter.FindAgent(key);
                var view = agent != null ? agent.GetComponent<AgentView>() : null;
                if (view == null || string.IsNullOrEmpty(view.LabelText))
                { Fail("avatar ou rótulo ausente: " + key); yield break; }
                styles.Add(view.Style);
            }
            var end = presenter.FindAgent(Keys[0]);
            if (styles.Count != 4 || end == null || Vector3.Distance(start, end.localPosition) < .5f)
            { Fail("roupas ou trajeto insuficientes"); yield break; }
            var reduced = root.Q<Button>("effects-toggle");
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = reduced;
                reduced.SendEvent(submit);
            }
            yield return new WaitForEndOfFrame();
            if (reduced == null || !reduced.text.Contains("sim"))
            { Fail("modo reduzido não ativado"); yield break; }
            foreach (var key in Keys)
            {
                var view = presenter.FindAgent(key)?.GetComponent<AgentView>();
                if (view == null || string.IsNullOrEmpty(view.LabelText))
                { Fail("rótulo ausente no modo reduzido"); yield break; }
            }
            var still = ScreenCapture.CaptureScreenshotAsTexture();
            if (still == null) { Fail("captura reduzida indisponível"); yield break; }
            try { File.WriteAllBytes(Path.Combine(output, "reduzido.png"), still.EncodeToPNG()); }
            finally { Destroy(still); }
            File.WriteAllText(Path.Combine(output, "resultado.txt"),
                $"pass | Player {Application.unityVersion} | {Screen.width}x{Screen.height} | fixture | estilos=4 | deslocamento={Vector3.Distance(start, end.localPosition):F2}m");
            Application.Quit(0);
        }

        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(output, "resultado.txt"), "fail | " + reason);
            Application.Quit(2);
        }
    }
}
#endif

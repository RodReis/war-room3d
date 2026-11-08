#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Captura opt-in do Player de desenvolvimento com serviço local sintético.
    public sealed class M5VisualPlayerProof : MonoBehaviour
    {
        private string directory;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            if (Environment.GetEnvironmentVariable("WR3D_M5_VISUAL_PROOF") != "1") return;
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client != null) client.gameObject.AddComponent<M5VisualPlayerProof>();
        }

        private IEnumerator Start()
        {
            Application.runInBackground = true;
            directory = Environment.GetEnvironmentVariable("WR3D_M5_PROOF_DIR");
            if (string.IsNullOrWhiteSpace(directory)) { Application.Quit(20); yield break; }
            Directory.CreateDirectory(directory);

            var client = GetComponent<LiveStateClient>();
            var presenter = GetComponent<OperationsHudPresenter>();
            var root = GetComponent<UIDocument>()?.rootVisualElement;
            var deadline = Time.realtimeSinceStartup + 20f;
            while ((client == null || !client.Connected || client.Snapshot == null || presenter == null || root == null) &&
                   Time.realtimeSinceStartup < deadline)
            {
                yield return null;
                client = GetComponent<LiveStateClient>();
                presenter = GetComponent<OperationsHudPresenter>();
                root = GetComponent<UIDocument>()?.rootVisualElement;
            }
            if (client == null || !client.Connected || client.Snapshot == null || presenter == null || root == null)
            { Fail("snapshot_or_panel_missing"); yield break; }
            if (root.Q<Button>("operations-open-button") == null || root.Q<ScrollView>("operations-results") == null)
            { Fail("operations_controls_missing"); yield break; }

            root.Q<TextField>("operations-environment").value = "m5-lab";
            presenter.SendMessage("Open");
            yield return WaitForResponse(root);
            if (!ResponseReady(root, "m5-synthetic-source")) { Fail("coverage_missing"); yield break; }
            yield return Capture("01-coverage");

            presenter.SendMessage("QuerySignals");
            yield return WaitForResponse(root);
            if (!ResponseReady(root, "m5-log-01") || !root.Q<Button>("operations-next").enabledSelf)
            { Fail("logs_first_page_missing"); yield break; }
            yield return Capture("02-logs-first-page");

            presenter.SendMessage("NextPage");
            yield return WaitForResponse(root);
            if (!ResponseReady(root, "m5-log-13")) { Fail("logs_second_page_missing"); yield break; }
            yield return Capture("03-logs-second-page");

            root.Q<DropdownField>("operations-category").value = "Rastros";
            root.Q<TextField>("operations-trace").value = "req-m5-lab";
            presenter.SendMessage("QuerySignals");
            yield return WaitForResponse(root);
            if (!ResponseReady(root, "m5-trace-01")) { Fail("trace_result_missing"); yield break; }
            yield return Capture("04-trace-explicit-id");

            presenter.SendMessage("LoadIncidents");
            yield return WaitForResponse(root);
            if (!ResponseReady(root, "m5-visual-alert")) { Fail("incident_result_missing"); yield break; }
            yield return Capture("05-incidents");

            presenter.SetReplayMode(true);
            yield return new WaitForEndOfFrame();
            if (root.Q<Button>("operations-open-button").enabledSelf ||
                root.Q<VisualElement>("operations-panel").resolvedStyle.display != DisplayStyle.None)
            { Fail("replay_did_not_block_operations"); yield break; }
            yield return Capture("06-replay-blocked");

            File.WriteAllText(Path.Combine(directory, "result.json"),
                "{\"status\":\"pass\",\"synthetic\":true,\"coverage\":true,\"logsPages\":2,\"trace\":true,\"incidents\":true,\"replayBlocked\":true}");
            Application.Quit(0);
        }

        private static bool ResponseReady(VisualElement root, string expectedContent = null)
        {
            if (root.Q<Label>("operations-status")?.text != "Resposta da API local · conteúdo redigido pelo serviço.") return false;
            if (expectedContent == null) return true;
            var results = root.Q<ScrollView>("operations-results");
            return results?.Q<Label>()?.text?.Contains(expectedContent) == true;
        }

        private static IEnumerator WaitForResponse(VisualElement root)
        {
            var deadline = Time.realtimeSinceStartup + 10f;
            while (!ResponseReady(root) && Time.realtimeSinceStartup < deadline) yield return null;
            yield return new WaitForEndOfFrame();
        }

        private IEnumerator Capture(string name)
        {
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(directory, name + ".png"), texture.EncodeToPNG()); }
            finally { Destroy(texture); }
        }

        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(directory, "result.json"),
                "{\"status\":\"fail\",\"reason\":\"" + reason + "\"}");
            Application.Quit(21);
        }
    }
}
#endif

#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Harness opt-in do próprio produto, exclusivo do laboratório sintético.
    public sealed class M4SyntheticPlayerProof : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            if (Environment.GetEnvironmentVariable("WR3D_M4_SYNTHETIC_PROOF") != "1") return;
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client != null) client.gameObject.AddComponent<M4SyntheticPlayerProof>();
        }

        private string directory;
        private IEnumerator Start()
        {
            Application.runInBackground = true;
            directory = Environment.GetEnvironmentVariable("WR3D_M4_PROOF_DIR");
            if (string.IsNullOrWhiteSpace(directory)) { Application.Quit(20); yield break; }
            Directory.CreateDirectory(directory);
            var client = GetComponent<LiveStateClient>();
            var limit = Time.realtimeSinceStartup + 20;
            while ((!client.Connected || client.Snapshot == null) && Time.realtimeSinceStartup < limit) yield return null;
            if (!client.Connected || Array.Find(client.Snapshot.projects, p => p.projectId == "m4-lab" && p.name == "LABORATÓRIO SINTÉTICO M4") == null ||
                Array.Find(client.Snapshot.sessions, s => s.sessionKey == "session-m4-synthetic") == null)
            { Fail("lab_identity_missing"); yield break; }
            var presenter = GetComponent<CommandPresenter>();
            var root = GetComponent<UIDocument>().rootVisualElement;
            presenter.SendMessage("Open");
            limit = Time.realtimeSinceStartup + 15;
            while (root.Q<DropdownField>("command-session").value != "session-m4-synthetic" && Time.realtimeSinceStartup < limit) yield return null;
            root.Q<TextField>("command-message").value = "Mensagem de teste sintético; nenhum comando real.";
            yield return null;
            if (!root.Q<Button>("command-review").enabledSelf) { Fail("review_unavailable"); yield break; }
            yield return presenter.StartCoroutine("Review", "deny");
            if (!root.Q<Button>("command-confirm").enabledSelf || !presenter.HasPendingConfirmation) { Fail("preview_missing"); yield break; }
            yield return Capture(root, "01-message-preview-top", false);
            yield return Capture(root, "02-message-preview-confirm", true);
            presenter.SendMessage("Confirm"); presenter.SendMessage("Confirm");
            limit = Time.realtimeSinceStartup + 15;
            while (!root.Q<Button>("command-inspect").enabledSelf && Time.realtimeSinceStartup < limit) yield return null;
            if (!root.Q<Label>("command-result").text.Contains("Recebimento confirmado")) { Fail("receipt_missing"); yield break; }
            yield return Capture(root, "03-message-confirmed", false);
            root.Q<DropdownField>("command-action").index = 2;
            limit = Time.realtimeSinceStartup + 15;
            while (!root.Q<Button>("command-review").enabledSelf && Time.realtimeSinceStartup < limit) yield return null;
            yield return presenter.StartCoroutine("Review", "deny");
            if (!presenter.HasPendingConfirmation || !root.Q<Label>("command-context").text.Contains("Ferramenta fictícia")) { Fail("permission_context_missing"); yield break; }
            if (root.Q<Label>("command-status").text.Contains("Recebimento confirmado")) { Fail("previous_result_confused_with_current"); yield break; }
            yield return Capture(root, "04-permission-preview", true);
            presenter.SendMessage("ReplayChanged", true);
            if (presenter.HasPendingConfirmation || root.Q<Button>("command-confirm").enabledSelf) { Fail("replay_did_not_invalidate"); yield break; }
            presenter.SendMessage("ReplayChanged", false);
            presenter.SelectProject("outro-projeto-sintetico");
            if (root.Q<Button>("command-review").enabledSelf) { Fail("project_scope_leak"); yield break; }
            File.WriteAllText(Path.Combine(directory, "player-result.json"), "{\"status\":\"pass\",\"synthetic\":true,\"messageReceipt\":true,\"permissionPreview\":true,\"doubleClickAttempted\":true,\"replayBlocked\":true,\"projectChangeBlocked\":true}");
            Application.Quit(0);
        }
        private IEnumerator Capture(VisualElement root, string name, bool bottom)
        {
            var scroll = root.Q<ScrollView>("command-panel"); scroll.scrollOffset = bottom ? new Vector2(0, 100000) : Vector2.zero;
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(directory, name + ".png"), texture.EncodeToPNG()); }
            finally { Destroy(texture); }
        }
        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(directory, "player-result.json"), "{\"status\":\"fail\",\"reason\":\"" + reason + "\"}");
            Application.Quit(21);
        }
    }
}
#endif

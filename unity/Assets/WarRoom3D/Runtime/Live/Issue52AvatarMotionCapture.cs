#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Captura somente quadros do Player conectado ao serviço local; não lê conversas.
    public sealed class Issue52AvatarMotionCapture : MonoBehaviour
    {
        private const int FrameCount = 20;
        private string output;
        private LiveStateClient client;

        [Serializable]
        private sealed class Result
        {
            public string status;
            public string reason;
            public int processId;
            public int projectCount;
            public int visibleAgents;
            public int feminineStyles;
            public int masculineStyles;
            public int frames;
            public float maxTravelMeters;
            public int width;
            public int height;
            public string capturedAt;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var output = Environment.GetEnvironmentVariable("WR3D_ISSUE52_AVATAR_DIR");
            if (string.IsNullOrWhiteSpace(output)) return;
            if (!Path.IsPathRooted(output)) { Application.Quit(7); return; }
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client == null) { Application.Quit(7); return; }
            var capture = client.gameObject.AddComponent<Issue52AvatarMotionCapture>();
            capture.output = output;
            capture.client = client;
            Application.runInBackground = true;
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var result = new Result { processId = System.Diagnostics.Process.GetCurrentProcess().Id,
                width = Screen.width, height = Screen.height, capturedAt = DateTimeOffset.UtcNow.ToString("O") };
            var deadline = Time.realtimeSinceStartup + 30f;
            LiveHudPresenter hud = null;
            VisualElement root = null;
            while (Time.realtimeSinceStartup < deadline)
            {
                hud = GetComponent<LiveHudPresenter>();
                root = GetComponent<UIDocument>()?.rootVisualElement;
                if (client.Connected && client.Snapshot?.mode == "live" && hud != null &&
                    root?.Q<Button>("overview-card-slot-02") != null) break;
                yield return null;
            }
            if (!client.Connected || client.Snapshot?.mode != "live" ||
                root?.Q<Button>("overview-card-slot-02") == null)
            { Fail(result, "duas salas live não chegaram"); yield break; }
            result.projectCount = client.Snapshot.projects?.Length ?? 0;
            yield return new WaitForEndOfFrame();
            SaveFrame("overview.png");

            hud.SendMessage("SelectProjectForValidation", "issue52-arenahub");
            hud.SendMessage("EnterRoom");
            yield return null;
            var presenter = GetComponent<AgentPresenter>();
            var views = FindObjectsByType<AgentView>(FindObjectsSortMode.None);
            if (presenter == null || presenter.VisibleCount < 2 || views.Length < 2)
            { Fail(result, "avatares reais insuficientes na sala ArenaHub"); yield break; }
            result.visibleAgents = presenter.VisibleCount;
            var initial = new Dictionary<string, Vector3>();
            foreach (var view in views)
            {
                if (string.IsNullOrEmpty(view.AgentKey) || string.IsNullOrEmpty(view.LabelText)) continue;
                initial[view.AgentKey] = view.transform.localPosition;
                if (view.Style % 2 == 0) result.feminineStyles++;
                else result.masculineStyles++;
            }
            if (result.feminineStyles == 0 || result.masculineStyles == 0)
            { Fail(result, "estilos femininos e masculinos não apareceram juntos"); yield break; }

            for (var frame = 0; frame < FrameCount; frame++)
            {
                yield return new WaitForEndOfFrame();
                SaveFrame($"quadro-{frame:D3}.png");
                result.frames++;
                yield return new WaitForSecondsRealtime(.09f);
            }
            foreach (var pair in initial)
            {
                var current = presenter.FindAgent(pair.Key);
                if (current != null)
                    result.maxTravelMeters = Mathf.Max(result.maxTravelMeters,
                        Vector3.Distance(pair.Value, current.localPosition));
            }
            if (result.maxTravelMeters < .5f)
            { Fail(result, "deslocamento visível inferior a 0,5 m"); yield break; }
            result.status = "pass";
            File.WriteAllText(Path.Combine(output, "result.json"), JsonUtility.ToJson(result, true));
            Application.Quit(0);
        }

        private void SaveFrame(string name)
        {
            var image = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(output, name), image.EncodeToPNG()); }
            finally { Destroy(image); }
        }

        private void Fail(Result result, string reason)
        {
            result.status = "fail";
            result.reason = reason;
            File.WriteAllText(Path.Combine(output, "result.json"), JsonUtility.ToJson(result, true));
            Application.Quit(2);
        }
    }
}
#endif

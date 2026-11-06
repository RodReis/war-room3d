#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Opt-in proof for a development Player. No capture code runs in release builds.
    public sealed class M2PlayerValidationCapture : MonoBehaviour
    {
        private const int FrameSamples = 120;
        private const float ConnectionTimeoutSeconds = 20f;
        private string captureDirectory;
        private string captureName;
        private string captureView;

        [Serializable]
        private sealed class CaptureReport
        {
            public bool connected;
            public int resourceCount;
            public int sessionCount;
            public int incidentCount;
            public string health;
            public string coverage;
            public string freshness;
            public int sampledFrames;
            public float meanFrameMs;
            public float p95FrameMs;
            public double snapshotToHudMs;
            public int imageWidth;
            public int imageHeight;
            public string view;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var directory = Environment.GetEnvironmentVariable("WR3D_VALIDATION_CAPTURE_DIR");
            if (string.IsNullOrWhiteSpace(directory)) return;
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client == null) return;
            var name = Environment.GetEnvironmentVariable("WR3D_VALIDATION_CAPTURE_NAME") ?? "player-connected";
            if (!Regex.IsMatch(name, "^[A-Za-z0-9_-]{1,40}$"))
            {
                Debug.LogError("M2 Player: nome de captura inválido");
                Application.Quit(7);
                return;
            }
            var capture = client.gameObject.AddComponent<M2PlayerValidationCapture>();
            capture.captureDirectory = directory;
            capture.captureName = name;
            var requestedView = Environment.GetEnvironmentVariable("WR3D_VALIDATION_VIEW");
            capture.captureView = requestedView == "project" || requestedView == "project-bottom" ? requestedView : "center";
        }

        private IEnumerator Start()
        {
            var client = GetComponent<LiveStateClient>();
            var deadline = Time.realtimeSinceStartup + ConnectionTimeoutSeconds;
            while ((client == null || !client.Connected || client.Snapshot == null) && Time.realtimeSinceStartup < deadline)
                yield return null;
            if (client == null || !client.Connected || client.Snapshot == null)
            {
                Debug.LogError("M2 Player: snapshot live não chegou antes do limite");
                Application.Quit(2);
                yield break;
            }

            var presenter = GetComponent<LiveHudPresenter>();
            if (presenter == null)
            {
                Debug.LogError("M2 Player: painel live indisponível");
                Application.Quit(3);
                yield break;
            }
            if (captureView == "center") presenter.SendMessage("ShowDataCenter");
            yield return new WaitForEndOfFrame();
            if (captureView == "project-bottom")
            {
                var panel = GetComponent<UIDocument>()?.rootVisualElement.Q<VisualElement>("project-panel");
                var scroll = panel?.Q<ScrollView>();
                if (scroll != null) scroll.scrollOffset = new Vector2(0, 100000);
                yield return new WaitForEndOfFrame();
            }

            var report = new CaptureReport();
            try
            {
                Directory.CreateDirectory(captureDirectory);
                var texture = ScreenCapture.CaptureScreenshotAsTexture();
                try
                {
                    report.imageWidth = texture.width;
                    report.imageHeight = texture.height;
                    File.WriteAllBytes(Path.Combine(captureDirectory, captureName + ".png"), texture.EncodeToPNG());
                }
                finally { Destroy(texture); }
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                Application.Quit(4);
                yield break;
            }

            var frameTimes = new float[FrameSamples];
            float sum = 0;
            yield return null;
            yield return null;
            for (var index = 0; index < frameTimes.Length; index++)
            {
                yield return null;
                frameTimes[index] = Time.unscaledDeltaTime * 1000f;
                sum += frameTimes[index];
            }
            Array.Sort(frameTimes);
            var snapshot = client.Snapshot;
            var state = snapshot.resourceStates.Length > 0 ? snapshot.resourceStates[0] : null;
            report.connected = client.Connected;
            report.resourceCount = snapshot.resources.Length;
            report.sessionCount = snapshot.sessions.Length;
            report.incidentCount = snapshot.incidents.Length;
            report.health = state?.health ?? "sem_dados";
            report.coverage = state?.coverage ?? "sem_dados";
            report.freshness = state?.freshness ?? "sem_dados";
            report.sampledFrames = frameTimes.Length;
            report.meanFrameMs = sum / frameTimes.Length;
            report.p95FrameMs = frameTimes[Mathf.CeilToInt(frameTimes.Length * 0.95f) - 1];
            report.snapshotToHudMs = client.LastSnapshotToHudMs;
            report.view = captureView;
            try { File.WriteAllText(Path.Combine(captureDirectory, captureName + ".json"), JsonUtility.ToJson(report, true)); }
            catch (Exception error)
            {
                Debug.LogException(error);
                Application.Quit(5);
                yield break;
            }
            Application.Quit(report.connected ? 0 : 6);
        }
    }
}
#endif

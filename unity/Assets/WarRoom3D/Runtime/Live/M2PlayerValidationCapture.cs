#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
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
        private int captureDurationSeconds;
        private bool previousRunInBackground;
        private bool vSyncOverridden;
        private int previousVSyncCount;
        private readonly List<RenderObservation> renderObservations = new List<RenderObservation>();
        private int disconnectCount;

        [Serializable]
        private sealed class RenderObservation
        {
            public long sequence;
            public long utcUnixMs;
        }

        [Serializable]
        private sealed class CaptureReport
        {
            public bool connected;
            public int resourceCount;
            public int sessionCount;
            public int agentCount;
            public int linkedChildCount;
            public int avatarCount;
            public int groupedAgentCount;
            public bool parentLinkVisible;
            public string selectedAgentKey;
            public int incidentCount;
            public string health;
            public string coverage;
            public string freshness;
            public int sampledFrames;
            public float meanFrameMs;
            public float p95FrameMs;
            public float maxFrameMs;
            public int framesOver16Ms;
            public int framesOver33Ms;
            public int framesOver100Ms;
            public double snapshotToHudMs;
            public int imageWidth;
            public int imageHeight;
            public string view;
            public float sampledDurationSeconds;
            public int renderTraceCount;
            public int disconnectCount;
            public int vSyncCount;
            public int targetFrameRate;
            public bool runInBackground;
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
            capture.captureView = requestedView == "project" || requestedView == "project-bottom" ||
                requestedView == "room" || requestedView == "room-opposite" || requestedView == "room-reduced" ||
                requestedView == "agent" || requestedView == "agent-focus" ? requestedView : "center";
            var requestedVSync = Environment.GetEnvironmentVariable("WR3D_VALIDATION_VSYNC_COUNT");
            if (!string.IsNullOrEmpty(requestedVSync))
            {
                if (requestedVSync != "0" && requestedVSync != "1")
                {
                    Debug.LogError("M2 Player: VSync de validação inválido");
                    Application.Quit(11);
                    return;
                }
                capture.previousVSyncCount = QualitySettings.vSyncCount;
                capture.vSyncOverridden = true;
                QualitySettings.vSyncCount = int.Parse(requestedVSync);
            }
            var duration = Environment.GetEnvironmentVariable("WR3D_VALIDATION_DURATION_SECONDS");
            if (!string.IsNullOrEmpty(duration))
            {
                if (!int.TryParse(duration, out var seconds) || seconds < 5 || seconds > 900)
                {
                    Debug.LogError("M2 Player: duração de validação inválida");
                    Application.Quit(8);
                    return;
                }
                capture.captureDurationSeconds = seconds;
                capture.previousRunInBackground = Application.runInBackground;
                Application.runInBackground = true;
            }
        }

        private void OnDestroy()
        {
            var client = GetComponent<LiveStateClient>();
            if (client != null)
            {
                client.SnapshotChanged -= ObserveSnapshot;
                client.ConnectionChanged -= ObserveConnection;
            }
            if (captureDurationSeconds > 0) Application.runInBackground = previousRunInBackground;
            if (vSyncOverridden) QualitySettings.vSyncCount = previousVSyncCount;
        }

        private void ObserveSnapshot(LiveSnapshot snapshot)
        {
            StartCoroutine(RecordRendered(snapshot.streamSequence));
        }

        private IEnumerator RecordRendered(long sequence)
        {
            yield return new WaitForEndOfFrame();
            renderObservations.Add(new RenderObservation { sequence = sequence, utcUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() });
        }

        private void ObserveConnection(bool connected, string _)
        {
            if (!connected) disconnectCount++;
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
            if (captureView == "room" || captureView == "room-opposite" || captureView == "room-reduced" ||
                captureView == "agent" || captureView == "agent-focus")
            {
                var projectId = Environment.GetEnvironmentVariable("WR3D_VALIDATION_PROJECT_ID");
                if (!string.IsNullOrEmpty(projectId)) presenter.SendMessage("SelectProjectForValidation", projectId);
                presenter.SendMessage("EnterRoom");
                if (captureView == "room-opposite") FindAnyObjectByType<OrbitCamera>()?.Orbit(180f, 0);
                if (captureView == "room-reduced")
                {
                    FindAnyObjectByType<ReferenceRoomView>()?.SetReduced(true);
                    FindAnyObjectByType<EffectDirector>()?.SetReduced(true);
                }
                if (captureView == "agent" || captureView == "agent-focus")
                {
                    var key = Environment.GetEnvironmentVariable("WR3D_VALIDATION_AGENT_KEY");
                    if (!string.IsNullOrEmpty(key)) presenter.SendMessage("SelectAgentForValidation", key);
                    if (captureView == "agent") presenter.SendMessage("OpenEvidenceForValidation");
                }
            }
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

            var frameTimes = new List<float>(captureDurationSeconds > 0 ? 36000 : FrameSamples);
            float sum = 0;
            int framesOver16Ms = 0;
            int framesOver33Ms = 0;
            int framesOver100Ms = 0;
            yield return null;
            yield return null;
            if (captureDurationSeconds > 0)
            {
                client.SnapshotChanged += ObserveSnapshot;
                client.ConnectionChanged += ObserveConnection;
                try { File.WriteAllText(Path.Combine(captureDirectory, captureName + ".ready"), "ready"); }
                catch (Exception error)
                {
                    Debug.LogException(error);
                    Application.Quit(9);
                    yield break;
                }
            }
            var startedAt = Time.realtimeSinceStartup;
            while (captureDurationSeconds > 0
                ? Time.realtimeSinceStartup - startedAt < captureDurationSeconds
                : frameTimes.Count < FrameSamples)
            {
                yield return null;
                var milliseconds = Time.unscaledDeltaTime * 1000f;
                frameTimes.Add(milliseconds);
                sum += milliseconds;
                if (milliseconds > 1000f / 60f) framesOver16Ms++;
                if (milliseconds > 1000f / 30f) framesOver33Ms++;
                if (milliseconds > 100f) framesOver100Ms++;
            }
            report.sampledDurationSeconds = Time.realtimeSinceStartup - startedAt;
            if (captureDurationSeconds > 0)
            {
                yield return new WaitForEndOfFrame();
                client.SnapshotChanged -= ObserveSnapshot;
                client.ConnectionChanged -= ObserveConnection;
                var trace = new StringBuilder();
                foreach (var observation in renderObservations) trace.AppendLine(JsonUtility.ToJson(observation));
                try { File.WriteAllText(Path.Combine(captureDirectory, captureName + ".trace.jsonl"), trace.ToString()); }
                catch (Exception error)
                {
                    Debug.LogException(error);
                    Application.Quit(10);
                    yield break;
                }
            }
            frameTimes.Sort();
            var snapshot = client.Snapshot;
            var state = snapshot.resourceStates.Length > 0 ? snapshot.resourceStates[0] : null;
            report.connected = client.Connected;
            report.resourceCount = snapshot.resources.Length;
            report.sessionCount = snapshot.sessions.Length;
            report.agentCount = snapshot.agents.Length;
            var avatarPresenter = GetComponent<AgentPresenter>();
            report.avatarCount = avatarPresenter != null ? avatarPresenter.VisibleCount : 0;
            report.groupedAgentCount = avatarPresenter != null ? avatarPresenter.OverflowCount : 0;
            report.parentLinkVisible = avatarPresenter != null && avatarPresenter.ParentLinkVisible;
            report.selectedAgentKey = presenter.SelectedAgentKeyForValidation;
            foreach (var agent in snapshot.agents)
                if (agent.parentStatus == "vinculado") report.linkedChildCount++;
            report.incidentCount = snapshot.incidents.Length;
            report.health = state?.health ?? "sem_dados";
            report.coverage = state?.coverage ?? "sem_dados";
            report.freshness = state?.freshness ?? "sem_dados";
            report.sampledFrames = frameTimes.Count;
            report.meanFrameMs = sum / frameTimes.Count;
            report.p95FrameMs = frameTimes[Mathf.CeilToInt(frameTimes.Count * 0.95f) - 1];
            report.maxFrameMs = frameTimes[frameTimes.Count - 1];
            report.framesOver16Ms = framesOver16Ms;
            report.framesOver33Ms = framesOver33Ms;
            report.framesOver100Ms = framesOver100Ms;
            report.snapshotToHudMs = client.LastSnapshotToHudMs;
            report.view = captureView;
            report.renderTraceCount = renderObservations.Count;
            report.disconnectCount = disconnectCount;
            report.vSyncCount = QualitySettings.vSyncCount;
            report.targetFrameRate = Application.targetFrameRate;
            report.runInBackground = Application.runInBackground;
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

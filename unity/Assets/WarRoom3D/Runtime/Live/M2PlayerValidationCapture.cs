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
            public int chatMessageCount;
            public string chatSessionKey;
            public bool chatExpectedMarkerVisible;
            public bool activityExpectedMarkerVisible;
            public int logResultCount;
            public bool logRequestIdVisible;
            public bool logRedacted;
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
                requestedView == "agent" || requestedView == "agent-focus" || requestedView == "chat" ||
                requestedView == "logs" ? requestedView : "center";
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
                captureView == "agent" || captureView == "agent-focus" || captureView == "chat" ||
                captureView == "logs")
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
                if (captureView == "agent" || captureView == "agent-focus" || captureView == "chat")
                {
                    var key = Environment.GetEnvironmentVariable("WR3D_VALIDATION_AGENT_KEY");
                    if (!string.IsNullOrEmpty(key)) presenter.SendMessage("SelectAgentForValidation", key);
                    if (captureView == "agent") presenter.SendMessage("OpenEvidenceForValidation");
                    if (captureView == "chat") presenter.SendMessage("OpenChatForValidation");
                }
            }
            if (captureView == "chat")
            {
                var chat = GetComponent<ChatPresenter>();
                var until = Time.realtimeSinceStartup + 10f;
                while (chat != null && !chat.LoadedPage && Time.realtimeSinceStartup < until) yield return null;
                if (chat == null || !chat.LoadedPage)
                {
                    Debug.LogError("M2 Player: histórico de chat não chegou antes do limite");
                    Application.Quit(12);
                    yield break;
                }
                var roomScroll = GetComponent<UIDocument>()?.rootVisualElement.Q<ScrollView>("room-content");
                if (roomScroll != null) roomScroll.scrollOffset = new Vector2(0, 90);
            }
            if (captureView == "logs")
            {
                presenter.SendMessage("OpenLogsForValidation");
                yield return new WaitForEndOfFrame();
                var root = GetComponent<UIDocument>()?.rootVisualElement;
                var logs = GetComponent<RoomLogPresenter>();
                var category = root?.Q<DropdownField>("log-category");
                var request = root?.Q<TextField>("log-request");
                var expectedRequest = Environment.GetEnvironmentVariable("WR3D_VALIDATION_REQUEST_ID") ?? "";
                if (logs == null || category == null || request == null || string.IsNullOrWhiteSpace(expectedRequest))
                {
                    Debug.LogError("M2 Player: filtro de log indisponível");
                    Application.Quit(14);
                    yield break;
                }
                category.value = "Logs de aplicação / infraestrutura";
                request.value = expectedRequest;
                logs.SendMessage("Query");
                var until = Time.realtimeSinceStartup + 10f;
                var results = root.Q<VisualElement>("log-results");
                while (results.childCount == 0 && Time.realtimeSinceStartup < until) yield return null;
                if (results.childCount == 0)
                {
                    Debug.LogError("M2 Player: log da fonte não chegou antes do limite");
                    Application.Quit(15);
                    yield break;
                }
                logs.OpenFirstForValidation();
                until = Time.realtimeSinceStartup + 10f;
                while (!(root.Q<Label>("evidence-body")?.text?.Contains(expectedRequest) ?? false) &&
                    Time.realtimeSinceStartup < until) yield return null;
            }
            yield return new WaitForEndOfFrame();
            if (captureView == "agent")
            {
                var evidenceScroll = GetComponent<UIDocument>()?.rootVisualElement.Q<ScrollView>("evidence-scroll");
                if (evidenceScroll != null) evidenceScroll.scrollOffset = new Vector2(0, 100000);
                yield return new WaitForEndOfFrame();
            }
            if (captureView == "project-bottom")
            {
                var panel = GetComponent<UIDocument>()?.rootVisualElement.Q<VisualElement>("project-panel");
                var scroll = panel?.Q<ScrollView>();
                if (scroll != null) scroll.scrollOffset = new Vector2(0, 100000);
                yield return new WaitForEndOfFrame();
            }
            if (captureView == "project" && client.Snapshot.mode == "live")
            {
                var activity = GetComponent<ActivityChartPresenter>();
                var until = Time.realtimeSinceStartup + 10f;
                while (activity != null && activity.CurrentHour == null && Time.realtimeSinceStartup < until)
                    yield return null;
                if (activity == null || activity.CurrentHour == null)
                {
                    Debug.LogError("M2 Player: série de atividade não chegou antes do limite");
                    Application.Quit(16);
                    yield break;
                }
            }
            yield return new WaitForEndOfFrame();

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
                var startSignal = Environment.GetEnvironmentVariable("WR3D_VALIDATION_START_SIGNAL");
                if (!string.IsNullOrWhiteSpace(startSignal))
                {
                    var signalDeadline = Time.realtimeSinceStartup + 120f;
                    while (!File.Exists(startSignal) && Time.realtimeSinceStartup < signalDeadline) yield return null;
                    if (!File.Exists(startSignal))
                    {
                        Debug.LogError("M2 Player: sinal de início da medição não chegou");
                        Application.Quit(13);
                        yield break;
                    }
                }
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
            var chatPresenter = GetComponent<ChatPresenter>();
            report.chatMessageCount = chatPresenter != null ? chatPresenter.VisibleMessageCount : 0;
            report.chatSessionKey = chatPresenter != null ? chatPresenter.CurrentSessionKey : null;
            if (captureView == "chat")
            {
                var marker = Environment.GetEnvironmentVariable("WR3D_VALIDATION_CHAT_MARKER") ?? "";
                var messages = GetComponent<UIDocument>()?.rootVisualElement.Q<VisualElement>("chat-messages");
                foreach (var item in messages?.Children() ?? Array.Empty<VisualElement>())
                    if (item is Label label && marker.Length > 0 && label.ClassListContains("chat-assistant") &&
                        label.text.Contains(marker)) report.chatExpectedMarkerVisible = true;
            }
            if (captureView == "agent")
            {
                var marker = Environment.GetEnvironmentVariable("WR3D_VALIDATION_ACTIVITY_MARKER") ?? "";
                var evidence = GetComponent<UIDocument>()?.rootVisualElement.Q<Label>("evidence-body")?.text ?? "";
                report.activityExpectedMarkerVisible = marker.Length > 0 && evidence.Contains(marker);
            }
            if (captureView == "logs")
            {
                var root = GetComponent<UIDocument>()?.rootVisualElement;
                var evidence = root?.Q<Label>("evidence-body")?.text ?? "";
                var request = Environment.GetEnvironmentVariable("WR3D_VALIDATION_REQUEST_ID") ?? "";
                report.logResultCount = root?.Q<VisualElement>("log-results")?.childCount ?? 0;
                report.logRequestIdVisible = request.Length > 0 && evidence.Contains(request);
                report.logRedacted = evidence.Contains("[REDACTED]") && !evidence.Contains("synthetic-secret");
            }
            try { File.WriteAllText(Path.Combine(captureDirectory, captureName + ".json"), JsonUtility.ToJson(report, true)); }
            catch (Exception error)
            {
                Debug.LogException(error);
                Application.Quit(5);
                yield break;
            }
            if (captureView == "chat" && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WR3D_VALIDATION_CHAT_MARKER")) &&
                !report.chatExpectedMarkerVisible) { Application.Quit(16); yield break; }
            if (captureView == "agent" && !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WR3D_VALIDATION_ACTIVITY_MARKER")) &&
                !report.activityExpectedMarkerVisible) { Application.Quit(18); yield break; }
            if (captureView == "logs" && (!report.logRequestIdVisible || !report.logRedacted))
            { Application.Quit(17); yield break; }
            Application.Quit(report.connected ? 0 : 6);
        }
    }
}
#endif

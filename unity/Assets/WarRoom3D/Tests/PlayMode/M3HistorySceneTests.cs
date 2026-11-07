using System.Collections;
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M3HistorySceneTests
    {
        private static string Snapshot(int sequence) =>
            "{\"schemaVersion\":\"1.0\",\"mode\":\"live\",\"revision\":1,\"streamSequence\":" + sequence +
            ",\"projects\":[{\"projectId\":\"p1\",\"name\":\"Projeto\"}],\"roomPlacements\":[{\"projectId\":\"p1\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-01\"}],\"sessions\":[],\"agents\":[],\"feed\":[],\"resources\":[],\"resourceStates\":[],\"incidents\":[]}";

        [UnityTest]
        public IEnumerator DemoSceneDoesNotExposeOperationalHistory()
        {
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var root = UnityEngine.Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            Assert.That(UnityEngine.Object.FindAnyObjectByType<HistoryHudPresenter>(), Is.Null);
            Assert.That(root.Q<Button>("history-button").resolvedStyle.display, Is.EqualTo(DisplayStyle.None));
            Assert.That(root.Q<VisualElement>("history-panel").resolvedStyle.display, Is.EqualTo(DisplayStyle.None));
            Assert.That(root.Q<VisualElement>("history-mask").resolvedStyle.display, Is.EqualTo(DisplayStyle.None));
        }

        [UnityTest]
        public IEnumerator LiveSceneOpensHistoryPanelAndKeepsReplayMaskSeparate()
        {
            var oldUrl = System.Environment.GetEnvironmentVariable("WR3D_SERVICE_URL");
            var oldToken = System.Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN");
            System.Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", null);
            System.Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", null);
            try
            {
                SceneManager.LoadScene("QuartelM2Live");
                yield return null;
                yield return null;
                var history = UnityEngine.Object.FindAnyObjectByType<HistoryHudPresenter>();
                var root = UnityEngine.Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
                Assert.That(history, Is.Not.Null);
                Assert.That(root.Q<Button>("history-button").style.display.value, Is.EqualTo(DisplayStyle.Flex));
                history.SendMessage("Open");
                Assert.That(root.Q<VisualElement>("history-panel").style.display.value, Is.EqualTo(DisplayStyle.Flex));
                Assert.That(root.Q<VisualElement>("history-mask").style.display.value, Is.EqualTo(DisplayStyle.None));
                history.SendMessage("Close");
                Assert.That(root.Q<VisualElement>("history-panel").style.display.value, Is.EqualTo(DisplayStyle.None));
            }
            finally
            {
                System.Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", oldUrl);
                System.Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", oldToken);
            }
        }

        [UnityTest]
        public IEnumerator HistoryPanelReadsDayAndReplayFromLocalService()
        {
            var oldUrl = Environment.GetEnvironmentVariable("WR3D_SERVICE_URL");
            var oldToken = Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN");
            Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", null);
            Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", null);
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var token = new string('h', 64);
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var running = true;
            var server = Task.Run(async () =>
            {
                while (running)
                {
                    TcpClient connection;
                    try { connection = await listener.AcceptTcpClientAsync(); }
                    catch (SocketException) { break; }
                    _ = Respond(connection, token);
                }
            });
            try
            {
                SceneManager.LoadScene("QuartelM2Live");
                yield return null;
                yield return null;
                var client = UnityEngine.Object.FindAnyObjectByType<LiveStateClient>();
                var history = UnityEngine.Object.FindAnyObjectByType<HistoryHudPresenter>();
                var root = UnityEngine.Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
                client.Configure($"http://127.0.0.1:{port}", token);
                client.AcceptSnapshot(Snapshot(1));
                var projectSelect = root.Q<DropdownField>("history-project");
                Assert.That(projectSelect.choices, Does.Contain("Projeto (p1)"));
                projectSelect.value = "Projeto (p1)";
                history.SendMessage("Open");
                var deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && !root.Q<Label>("history-metrics").text.Contains("Tempo decorrido")) yield return null;
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("Tempo decorrido"));
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("Projeto: p1"));
                Assert.That(root.Q<Label>("history-metrics").text, Does.Match("Espera observada: 0[.,]5 h"));
                Assert.That(root.Q<ScrollView>("history-timeline").contentContainer.childCount, Is.EqualTo(3));
                Assert.That(root.Q<ScrollView>("history-timeline").contentContainer.Q<Label>().text, Does.StartWith("CI ativo desde"));
                Assert.That(root.Q<Label>("history-coverage").text, Does.Contain("lacuna"));
                projectSelect.value = "Todos os projetos";
                history.SendMessage("Open");
                projectSelect.value = "Projeto (p1)";
                yield return new WaitForSecondsRealtime(0.3f);
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("Filtro alterado"));
                history.SendMessage("Open");
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && !root.Q<Label>("history-metrics").text.Contains("Projeto: p1")) yield return null;
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("Projeto: p1"));
                history.SendMessage("BeginReplay");
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && root.Q<VisualElement>("history-mask").style.display.value != DisplayStyle.Flex) yield return null;
                Assert.That(root.Q<Label>("history-seal").text, Does.StartWith("REPRODUÇÃO"));
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("sequência 1"));
                while (Time.realtimeSinceStartup < deadline && GameObject.Find("ReplayMarker:p1") == null) yield return null;
                Assert.That(GameObject.Find("ReplayMarker:p1"), Is.Not.Null);
                Assert.That(root.Q<Label>("demo-seal").text, Does.StartWith("REPRODUÇÃO"));
                root.Q<TextField>("history-seek").value = "2026-11-06T15:10:00Z";
                history.SendMessage("Seek");
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && !root.Q<Label>("history-coverage").text.Contains("15:10:00Z")) yield return null;
                Assert.That(GameObject.Find("ReplayMarker:p1"), Is.Not.Null);
                Assert.That(root.Q<Label>("history-coverage").text, Does.StartWith("LACUNA"));
                Assert.That(root.Q<Label>("history-coverage").text, Does.Contain("Layout atual como referência"));
                Assert.That(root.Q<Label>("history-coverage").text, Does.Contain("Infraestrutura sem inventário histórico"));
                Assert.That(root.Q<Label>("history-coverage").text, Does.Contain("CI: 1 incidente(s) ativo(s)"));
                history.SendMessage("CycleSpeed");
                Assert.That(root.Q<Button>("history-speed").text, Is.EqualTo("60×"));
                history.SendMessage("TogglePlayback");
                Assert.That(root.Q<Button>("history-play").text, Is.EqualTo("Pausar"));
                history.SendMessage("TogglePlayback");
                Assert.That(root.Q<Label>("effect-banner").style.display.value, Is.EqualTo(DisplayStyle.None));
                history.SendMessage("ExitReplay");
                Assert.That(root.Q<VisualElement>("history-mask").style.display.value, Is.EqualTo(DisplayStyle.None));
                yield return null;
                Assert.That(GameObject.Find("ReplayMarker:p1"), Is.Null);
                client.AcceptSnapshot(Snapshot(2));
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && root.Q<Label>("effect-banner").style.display.value != DisplayStyle.Flex) yield return null;
                Assert.That(root.Q<Label>("effect-banner").text, Does.Contain("PR mergeado"));
                Assert.That(GameObject.Find("EffectBeacon:p1"), Is.Not.Null);
                client.AcceptSnapshot(Snapshot(3));
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && !root.Q<Label>("effect-banner").text.Contains("CI falhou")) yield return null;
                Assert.That(root.Q<Label>("effect-banner").text, Does.Contain("CI falhou"));
                Assert.That(GameObject.Find("EffectBeacon:p1"), Is.Not.Null);
            }
            finally
            {
                Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", oldUrl);
                Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", oldToken);
                running = false;
                listener.Stop();
                try { server.Wait(1000); } catch (AggregateException) { }
            }
        }

        private static async Task Respond(TcpClient connection, string token)
        {
            using (connection)
            {
                try
                {
                    var stream = connection.GetStream();
                    using var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true);
                    var first = await reader.ReadLineAsync();
                    var authorized = false;
                    string line;
                    while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync()))
                        if (line == "Authorization: Bearer " + token) authorized = true;
                    var status = authorized ? "200 OK" : "401 Unauthorized";
                    var body = first != null && first.Contains("/v1/history/replay/state?at=") ?
                        "{\"schemaVersion\":\"1.0\",\"mode\":\"replay\",\"layoutReference\":\"current\",\"infrastructureReference\":\"unavailable\",\"revision\":1,\"streamSequence\":1,\"projects\":[{\"projectId\":\"p1\",\"name\":\"Projeto\"}],\"roomPlacements\":[{\"projectId\":\"p1\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-01\"}],\"sessions\":[{\"sessionKey\":\"s1\",\"projectId\":\"p1\",\"provider\":\"codex\",\"presence\":\"observada\",\"freshness\":\"atual\"}],\"agents\":[],\"feed\":[],\"resources\":[],\"resourceStates\":[],\"incidents\":[],\"coverage\":{\"status\":\"unknown\",\"gaps\":[]}}" :
                        first != null && first.Contains("/v1/history/replay?cursor=2") ?
                        "{\"viewMode\":\"replay\",\"fromSequence\":2,\"throughSequence\":3,\"nextCursor\":null,\"hasMore\":false,\"events\":[{\"kind\":\"github.milestone\",\"streamSequence\":3,\"entityType\":\"workflow\",\"transition\":\"attempt-1-failure\",\"projectId\":\"p1\",\"ingestionMode\":\"live\",\"effects\":[{\"causationId\":\"ci-3\",\"effectType\":\"ci.alarm\",\"projectId\":\"p1\",\"ingestionMode\":\"live\",\"durationMs\":5000}]}]}" :
                        first != null && first.Contains("/v1/history/replay?cursor=1") ?
                        "{\"viewMode\":\"replay\",\"fromSequence\":1,\"throughSequence\":2,\"nextCursor\":null,\"hasMore\":false,\"events\":[{\"kind\":\"github.milestone\",\"streamSequence\":2,\"entityType\":\"pull_request\",\"transition\":\"merged\",\"projectId\":\"p1\",\"ingestionMode\":\"live\",\"effects\":[{\"causationId\":\"merge-2\",\"effectType\":\"merge.celebration\",\"projectId\":\"p1\",\"ingestionMode\":\"live\",\"durationMs\":8000}]}]}" :
                        first != null && first.Contains("/v1/history/replay?") ?
                        "{\"viewMode\":\"replay\",\"fromSequence\":0,\"throughSequence\":1,\"nextCursor\":null,\"hasMore\":false,\"events\":[{\"kind\":\"github.milestone\",\"streamSequence\":1,\"entityType\":\"pull_request\",\"transition\":\"merged\",\"projectId\":\"p1\",\"occurredAt\":\"2026-11-06T15:00:00Z\",\"ingestionMode\":\"backfill\",\"effects\":[]}]}" :
                        "{\"date\":\"2026-11-06\",\"timeZone\":\"America/Sao_Paulo\",\"elapsedDurationMs\":3600000,\"elapsedDurationKnown\":true,\"agentHours\":1,\"agentHoursKnown\":true,\"waitingDurationMs\":1800000,\"waitingDurationKnown\":true,\"coverage\":{\"status\":\"unknown\",\"observedEventCount\":2,\"gaps\":[{\"sourceId\":\"source1\",\"start\":\"2026-11-06T15:00:00Z\",\"end\":\"2026-11-06T15:05:00Z\",\"reason\":\"source_unavailable\"}]},\"githubCoverage\":{\"status\":\"partial\",\"attempts\":2,\"successfulAttempts\":1,\"failedAttempts\":1,\"gaps\":[{\"repositoryId\":\"42\",\"start\":\"2026-11-06T15:01:00Z\",\"end\":\"2026-11-06T15:06:00Z\",\"reason\":\"rate_limited\"}]},\"milestones\":[],\"incidentMarkers\":[]}";
                    if (first != null && first.Contains("/v1/history/replay/state?at="))
                        body = body.Replace("\"incidents\":[],\"coverage\"", "\"incidents\":[],\"ciIncidents\":[],\"coverage\"");
                    if (first != null && first.Contains("15%3A10%3A00Z"))
                    {
                        body = body.Replace("\"status\":\"unknown\",\"gaps\":[]", "\"status\":\"gap\",\"gaps\":[{\"sourceId\":\"source1\",\"reason\":\"source_unavailable\"}]");
                        body = body.Replace("\"ciIncidents\":[]", "\"ciIncidents\":[{\"incidentId\":\"ci-1\",\"projectId\":\"p1\",\"repositoryId\":\"42\",\"workflowId\":7,\"ref\":\"main\",\"openedAt\":\"2026-11-05T15:00:00Z\"}]");
                    }
                    if (first != null && first.Contains("/v1/history/day?"))
                        body = body.Replace("\"incidentMarkers\":[]", "\"incidentMarkers\":[{\"workflowId\":7,\"ref\":\"main\",\"openedAt\":\"2026-11-05T15:00:00Z\",\"openedBeforeDay\":true,\"resolvedAt\":null,\"activeAtEnd\":true}]");
                    if (first != null && first.Contains("/v1/history/day?") && first.Contains("projectId=p1"))
                        body = body.Replace("\"timeZone\":\"America/Sao_Paulo\"", "\"timeZone\":\"America/Sao_Paulo\",\"projectId\":\"p1\"");
                    if (first != null && first.Contains("/v1/history/day?")) await Task.Delay(150);
                    var bytes = Encoding.UTF8.GetBytes(authorized ? body : "");
                    var header = Encoding.ASCII.GetBytes($"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");
                    await stream.WriteAsync(header, 0, header.Length);
                    if (bytes.Length > 0) await stream.WriteAsync(bytes, 0, bytes.Length);
                }
                catch (Exception error) when (error is IOException || error is SocketException || error is ObjectDisposedException) { }
            }
        }
    }
}

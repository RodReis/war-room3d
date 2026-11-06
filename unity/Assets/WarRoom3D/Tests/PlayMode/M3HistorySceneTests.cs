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
                history.SendMessage("Open");
                var deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && !root.Q<Label>("history-metrics").text.Contains("Tempo decorrido")) yield return null;
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("Tempo decorrido"));
                Assert.That(root.Q<ScrollView>("history-timeline").contentContainer.childCount, Is.GreaterThan(0));
                history.SendMessage("BeginReplay");
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && root.Q<VisualElement>("history-mask").style.display.value != DisplayStyle.Flex) yield return null;
                Assert.That(root.Q<Label>("history-seal").text, Does.StartWith("REPRODUÇÃO"));
                Assert.That(root.Q<Label>("history-metrics").text, Does.Contain("sequência 1"));
                history.SendMessage("ExitReplay");
                Assert.That(root.Q<VisualElement>("history-mask").style.display.value, Is.EqualTo(DisplayStyle.None));
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
                    var body = first != null && first.Contains("/v1/history/replay?") ?
                        "{\"viewMode\":\"replay\",\"fromSequence\":0,\"throughSequence\":1,\"nextCursor\":null,\"hasMore\":false,\"events\":[{\"kind\":\"github.milestone\",\"streamSequence\":1,\"entityType\":\"pull_request\",\"transition\":\"merged\",\"projectId\":\"p1\",\"occurredAt\":\"2026-11-06T15:00:00Z\",\"ingestionMode\":\"backfill\",\"effects\":[]}]}" :
                        "{\"date\":\"2026-11-06\",\"timeZone\":\"America/Sao_Paulo\",\"elapsedDurationMs\":3600000,\"elapsedDurationKnown\":true,\"agentHours\":1,\"agentHoursKnown\":true,\"coverage\":{\"status\":\"unknown\",\"observedEventCount\":2},\"milestones\":[],\"incidentMarkers\":[]}";
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

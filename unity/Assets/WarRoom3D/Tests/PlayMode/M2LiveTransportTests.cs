using System;
using System.Collections;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M2LiveTransportTests
    {
        private static string Snapshot(string health, int sequence) =>
            "{\"schemaVersion\":\"1.0\",\"mode\":\"live\",\"revision\":1,\"streamSequence\":" + sequence + "," +
            "\"projects\":[{\"projectId\":\"p1\",\"name\":\"Projeto sintético\"}]," +
            "\"roomPlacements\":[{\"projectId\":\"p1\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-01\"}]," +
            "\"sessions\":[],\"agents\":[],\"feed\":[]," +
            "\"resources\":[{\"resourceId\":\"r1\",\"environmentId\":\"lab\",\"kind\":\"database\",\"name\":\"Banco sintético\",\"sourceId\":\"s1\"}]," +
            "\"resourceStates\":[{\"resourceId\":\"r1\",\"dependentProjectIds\":[\"p1\"],\"health\":\"" + health + "\",\"freshness\":\"atual\",\"coverage\":\"atual\",\"observedAt\":\"2026-11-06T16:00:00Z\"}]," +
            "\"incidents\":[]}";

        [UnityTest]
        public IEnumerator LiveSceneReceivesSnapshotAndSseRefreshFromLoopback()
        {
            var oldUrl = Environment.GetEnvironmentVariable("WR3D_SERVICE_URL");
            var oldToken = Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN");
            var token = new string('b', 64);
            var listener = new TcpListener(IPAddress.Loopback, 0);
            var cancellation = new CancellationTokenSource();
            int snapshots = 0;
            int streams = 0;
            listener.Start();
            var port = ((IPEndPoint)listener.LocalEndpoint).Port;
            var serverTask = Task.Run(async () =>
            {
                while (!cancellation.IsCancellationRequested)
                {
                    TcpClient connection;
                    try { connection = await listener.AcceptTcpClientAsync(); }
                    catch (SocketException) { break; }
                    _ = Handle(connection, token, cancellation.Token, () => Interlocked.Increment(ref snapshots), () => Interlocked.Increment(ref streams));
                }
            });
            Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", $"http://127.0.0.1:{port}");
            Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", token);
            try
            {
                SceneManager.LoadScene("QuartelM2Live");
                yield return null;
                yield return null;
                var client = UnityEngine.Object.FindAnyObjectByType<LiveStateClient>();
                var hud = UnityEngine.Object.FindAnyObjectByType<LiveHudPresenter>();
                var root = UnityEngine.Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
                float deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && (!client.Connected || client.Snapshot == null)) yield return null;
                Assert.That(client.Connected, Is.True, client.ConnectionMessage);
                hud.SendMessage("ShowDataCenter");
                Assert.That(root.Q<Label>("resource-status").text, Is.EqualTo("Degradado"));
                deadline = Time.realtimeSinceStartup + 5f;
                while (Time.realtimeSinceStartup < deadline && (client.Snapshot.streamSequence < 2 || root.Q<Label>("resource-status").text != "Saudável")) yield return null;
                Assert.That(client.Snapshot.streamSequence, Is.EqualTo(2));
                Assert.That(root.Q<Label>("resource-status").text, Is.EqualTo("Saudável"));
                Assert.That(snapshots, Is.GreaterThanOrEqualTo(2));
                deadline = Time.realtimeSinceStartup + 8f;
                while (Time.realtimeSinceStartup < deadline &&
                    (client.Snapshot.streamSequence < 3 || root.Q<Label>("resource-status").text != "Sem dados")) yield return null;
                Assert.That(client.Snapshot.streamSequence, Is.GreaterThanOrEqualTo(3), "Heartbeat não substitui atualização de frescor");
                Assert.That(root.Q<Label>("resource-status").text, Is.EqualTo("Sem dados"));
            }
            finally
            {
                Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", oldUrl);
                Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", oldToken);
                cancellation.Cancel();
                listener.Stop();
                try { serverTask.Wait(1000); } catch (AggregateException) { }
                cancellation.Dispose();
            }
        }

        private static async Task Handle(TcpClient connection, string token, CancellationToken cancellation, Func<int> nextSnapshot, Func<int> nextStream)
        {
            using (connection)
            {
                try
                {
                    var stream = connection.GetStream();
                    using var reader = new StreamReader(stream, Encoding.ASCII, false, 1024, true);
                    var first = await reader.ReadLineAsync();
                    bool authorized = false;
                    string line;
                    while (!string.IsNullOrEmpty(line = await reader.ReadLineAsync()))
                        if (line == "Authorization: Bearer " + token) authorized = true;
                    if (!authorized) { await Write(stream, "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n"); return; }
                    if (first != null && first.StartsWith("GET /v1/snapshot ", StringComparison.Ordinal))
                    {
                        int count = nextSnapshot();
                        string body = Snapshot(count == 1 ? "degradado" : count == 2 ? "saudavel" : "sem_dados", count);
                        var bytes = Encoding.UTF8.GetBytes(body);
                        await Write(stream, $"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");
                        await stream.WriteAsync(bytes, 0, bytes.Length);
                    }
                    else if (first != null && first.StartsWith("GET /v1/events ", StringComparison.Ordinal))
                    {
                        await Write(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\nConnection: keep-alive\r\n\r\n: connected\n\n");
                        if (nextStream() == 1)
                        {
                            await Task.Delay(150, cancellation);
                            await Write(stream, "id: 2\nevent: resource.changed\ndata: {\"streamSequence\":2,\"resourceId\":\"r1\"}\n\n");
                        }
                        await Task.Delay(10000, cancellation);
                    }
                }
                catch (Exception exception) when (exception is IOException || exception is ObjectDisposedException || exception is OperationCanceledException || exception is SocketException) { }
            }
        }

        private static Task Write(NetworkStream stream, string text)
        {
            var bytes = Encoding.UTF8.GetBytes(text);
            return stream.WriteAsync(bytes, 0, bytes.Length);
        }
    }
}

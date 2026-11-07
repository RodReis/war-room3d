using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace WarRoom3D
{
    public sealed class LiveStateClient : MonoBehaviour
    {
        private const float SnapshotRefreshSeconds = 5f;
        private string baseUrl;
        private string token;
        private bool configured;
        private bool refreshRequested;
        private UnityWebRequest activeRequest;

        public LiveSnapshot Snapshot { get; private set; }
        public bool Connected { get; private set; }
        public double LastSnapshotToHudMs { get; private set; }
        public string ConnectionMessage { get; private set; } = "Aguardando configuração live";
        public event Action<LiveSnapshot> SnapshotChanged;
        public event Action<bool, string> ConnectionChanged;

        public void Configure(string serviceUrl, string bearerToken)
        {
            if (!Uri.TryCreate(serviceUrl, UriKind.Absolute, out var uri) || uri.Scheme != "http" || uri.Host != "127.0.0.1" ||
                uri.Port < 1 || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment) ||
                !string.IsNullOrEmpty(uri.UserInfo) || string.IsNullOrEmpty(bearerToken) || Encoding.UTF8.GetByteCount(bearerToken) < 32)
                throw new ArgumentException("Serviço live exige loopback e token válido");
            baseUrl = uri.GetLeftPart(UriPartial.Authority);
            token = bearerToken;
            configured = true;
        }

        private void Start()
        {
            if (!configured)
            {
                try { Configure(Environment.GetEnvironmentVariable("WR3D_SERVICE_URL"), Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN")); }
                catch (ArgumentException) { SetConnection(false, "Serviço live não configurado"); return; }
            }
            StartCoroutine(Run());
        }

        private IEnumerator Run()
        {
            while (isActiveAndEnabled)
            {
                yield return FetchSnapshot();
                if (!Connected) { yield return new WaitForSecondsRealtime(2); continue; }
                refreshRequested = false;
                float refreshAt = Time.realtimeSinceStartup + SnapshotRefreshSeconds;
                using (var request = UnityWebRequest.Get(baseUrl + "/v1/events"))
                {
                    activeRequest = request;
                    request.redirectLimit = 0;
                    request.timeout = 0;
                    var stream = new SseDownloadHandler(_ => { refreshRequested = true; });
                    request.downloadHandler = stream;
                    request.SetRequestHeader("Authorization", "Bearer " + token);
                    request.SetRequestHeader("Last-Event-ID", Snapshot.streamSequence.ToString());
                    var operation = request.SendWebRequest();
                    bool timedOut = false;
                    while (!operation.isDone && !refreshRequested && !timedOut)
                    {
                        refreshRequested = Time.realtimeSinceStartup >= refreshAt;
                        timedOut = Time.realtimeSinceStartup - stream.LastDataAt > 45f;
                        if (!refreshRequested && !timedOut) yield return null;
                    }
                    if (refreshRequested) request.Abort();
                    else
                    {
                        if (timedOut) request.Abort();
                        SetConnection(false, timedOut ? "Fluxo de eventos sem resposta" : "Fluxo de eventos indisponível");
                    }
                    activeRequest = null;
                }
                if (!refreshRequested) yield return new WaitForSecondsRealtime(2);
            }
        }

        private IEnumerator FetchSnapshot()
        {
            using (var request = UnityWebRequest.Get(baseUrl + "/v1/snapshot"))
            {
                activeRequest = request;
                request.redirectLimit = 0;
                request.timeout = 5;
                request.SetRequestHeader("Authorization", "Bearer " + token);
                LastSnapshotToHudMs = 0;
                var startedAt = System.Diagnostics.Stopwatch.GetTimestamp();
                yield return request.SendWebRequest();
                activeRequest = null;
                if (request.result != UnityWebRequest.Result.Success || request.responseCode != 200)
                {
                    SetConnection(false, "Snapshot live indisponível");
                    yield break;
                }
                try
                {
                    AcceptSnapshot(request.downloadHandler.text);
                    LastSnapshotToHudMs = (System.Diagnostics.Stopwatch.GetTimestamp() - startedAt) * 1000.0 /
                        System.Diagnostics.Stopwatch.Frequency;
                }
                catch (ArgumentException) { SetConnection(false, "Contrato live incompatível"); }
            }
        }

        public void AcceptSnapshot(string json)
        {
            var parsed = LiveSnapshot.Parse(json);
            Snapshot = parsed;
            SetConnection(true, "Atualizado pelo serviço local");
            SnapshotChanged?.Invoke(parsed);
        }

        public UnityWebRequest CreateHistoryRequest(string path)
        {
            if (!configured || string.IsNullOrEmpty(path) || !path.StartsWith("/v1/history/", StringComparison.Ordinal) ||
                path.Contains("//") || path.Contains(".."))
                throw new ArgumentException("Consulta histórica inválida");
            var request = UnityWebRequest.Get(baseUrl + path);
            request.redirectLimit = 0;
            request.timeout = 10;
            request.SetRequestHeader("Authorization", "Bearer " + token);
            return request;
        }

        public void RefreshNow() { refreshRequested = true; }

        private void OnDisable()
        {
            activeRequest?.Abort();
            StopAllCoroutines();
            SetConnection(false, "Conexão encerrada");
        }

        private void SetConnection(bool value, string message)
        {
            if (Connected == value && ConnectionMessage == message) return;
            Connected = value;
            ConnectionMessage = message;
            ConnectionChanged?.Invoke(value, message);
        }

        private sealed class SseDownloadHandler : DownloadHandlerScript
        {
            private readonly SseFrameParser parser = new SseFrameParser();
            private readonly Action<SseFrame> onFrame;
            public float LastDataAt { get; private set; }
            public SseDownloadHandler(Action<SseFrame> onFrame) : base(new byte[8192])
            {
                this.onFrame = onFrame;
                LastDataAt = Time.realtimeSinceStartup;
            }

            protected override bool ReceiveData(byte[] data, int dataLength)
            {
                try
                {
                    LastDataAt = Time.realtimeSinceStartup;
                    foreach (var frame in parser.Push(Encoding.ASCII.GetString(data, 0, dataLength))) onFrame(frame);
                    return true;
                }
                catch (ArgumentException) { return false; }
            }
        }
    }
}

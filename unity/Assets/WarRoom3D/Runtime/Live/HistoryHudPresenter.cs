using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class HistoryHudPresenter : MonoBehaviour
    {
        private VisualElement root;
        private VisualElement panel;
        private VisualElement mask;
        private LiveStateClient client;
        private TextField dateField;
        private TextField zoneField;
        private ScrollView timeline;
        private Label metrics;
        private Label coverage;
        private Label seal;
        private HistoryDayData day;
        private HistoryReplayPage page;
        private int replayIndex;
        private long currentPageCursor;
        private readonly Stack<long> previousPageCursors = new Stack<long>();
        private bool replaying;
        public bool IsReplaying => replaying;
        public event Action<bool> ReplayChanged;

        public void Configure(VisualElement documentRoot, LiveStateClient liveClient)
        {
            root = documentRoot ?? throw new ArgumentNullException(nameof(documentRoot));
            client = liveClient ?? throw new ArgumentNullException(nameof(liveClient));
            panel = root.Q<VisualElement>("history-panel");
            mask = root.Q<VisualElement>("history-mask");
            dateField = root.Q<TextField>("history-date");
            zoneField = root.Q<TextField>("history-zone");
            timeline = root.Q<ScrollView>("history-timeline");
            metrics = root.Q<Label>("history-metrics");
            coverage = root.Q<Label>("history-coverage");
            seal = root.Q<Label>("history-seal");
            if (panel == null || mask == null || dateField == null || zoneField == null || timeline == null ||
                metrics == null || coverage == null || seal == null) throw new ArgumentException("HUD histórico incompleto");
            panel.style.display = DisplayStyle.None;
            mask.style.display = DisplayStyle.None;
            root.Q<VisualElement>("history-replay-controls").style.display = DisplayStyle.None;
            dateField.value = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            zoneField.value = "America/Sao_Paulo";
            var open = root.Q<Button>("history-button");
            open.style.display = DisplayStyle.Flex;
            open.clicked += Open;
            root.Q<Button>("history-close").clicked += Close;
            root.Q<Button>("history-load").clicked += () => StartCoroutine(LoadDay());
            root.Q<Button>("history-replay").clicked += BeginReplay;
            root.Q<Button>("history-previous").clicked += Previous;
            root.Q<Button>("history-next").clicked += Next;
            root.Q<Button>("history-live").clicked += ExitReplay;
        }

        private void Open()
        {
            panel.style.display = DisplayStyle.Flex;
            if (day == null) StartCoroutine(LoadDay());
        }

        private void Close()
        {
            if (replaying) ExitReplay();
            panel.style.display = DisplayStyle.None;
        }

        private IEnumerator LoadDay()
        {
            if (replaying) yield break;
            if (!DateTime.TryParseExact(dateField.value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) ||
                string.IsNullOrWhiteSpace(zoneField.value))
            {
                metrics.text = "Informe data e fuso válidos.";
                yield break;
            }
            var path = "/v1/history/day?date=" + Uri.EscapeDataString(dateField.value) + "&timeZone=" + Uri.EscapeDataString(zoneField.value);
            UnityWebRequest request;
            try { request = client.CreateHistoryRequest(path); }
            catch (ArgumentException) { metrics.text = "Serviço histórico não configurado."; yield break; }
            using (request)
            {
                metrics.text = "Consultando histórico...";
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success || request.responseCode != 200)
                {
                    metrics.text = "Histórico indisponível. Confira data, fuso e serviço local.";
                    yield break;
                }
                try { day = HistoryDayData.Parse(request.downloadHandler.text); }
                catch (ArgumentException) { metrics.text = "Resposta histórica incompatível."; yield break; }
            }
            RenderDay();
        }

        private void RenderDay()
        {
            if (day == null) return;
            metrics.text = (day.elapsedDurationKnown ? $"Tempo decorrido: {day.elapsedDurationMs / 3600000:0.##} h" : "Tempo decorrido: indisponível") +
                "\n" + (day.agentHoursKnown ? $"Horas-agente: {day.agentHours:0.##} h" : "Horas-agente: indisponível");
            coverage.text = day.coverage.status == "none" ? "Sem observações de sessão neste dia. Cobertura incompleta." :
                "Cobertura de sessão não comprovada; janelas esperadas não registradas.";
            timeline.Clear();
            foreach (var milestone in day.milestones)
            {
                var text = milestone.entityType == "pull_request" ? "PR " : "CI ";
                timeline.Add(new Label(milestone.occurredAt + " · " + text + milestone.transition +
                    " · projeto " + milestone.projectId + (milestone.ingestionMode == "backfill" ? " · histórico importado" : "")));
            }
            foreach (var incident in day.incidentMarkers)
                timeline.Add(new Label(incident.openedAt + " · CI com falha · workflow " + incident.workflowId +
                    " · " + incident.@ref + (string.IsNullOrEmpty(incident.resolvedAt) ? " · sem recuperação registrada" : " · recuperado " + incident.resolvedAt)));
            if (day.milestones.Length == 0 && day.incidentMarkers.Length == 0) timeline.Add(new Label("Nenhum marco registrado neste dia."));
        }

        private IEnumerator LoadReplay(long cursor, long? previousCursor = null, bool backward = false)
        {
            UnityWebRequest request;
            try { request = client.CreateHistoryRequest("/v1/history/replay?cursor=" + cursor + "&limit=200"); }
            catch (ArgumentException) { metrics.text = "Serviço histórico não configurado."; yield break; }
            using (request)
            {
                metrics.text = "Carregando eventos...";
                yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success || request.responseCode != 200)
                {
                    metrics.text = "Reprodução indisponível. O histórico pode ter expirado.";
                    yield break;
                }
                try { page = HistoryReplayPage.Parse(request.downloadHandler.text); }
                catch (ArgumentException) { metrics.text = "Resposta de reprodução incompatível."; yield break; }
            }
            if (previousCursor.HasValue) previousPageCursors.Push(previousCursor.Value);
            if (backward) previousPageCursors.Pop();
            currentPageCursor = cursor;
            replayIndex = backward ? Math.Max(0, page.events.Length - 1) : 0;
            replaying = true;
            ReplayChanged?.Invoke(true);
            mask.style.display = DisplayStyle.Flex;
            seal.text = "REPRODUÇÃO · HISTÓRICO DE EVENTOS";
            root.Q<VisualElement>("history-replay-controls").style.display = DisplayStyle.Flex;
            root.Q<Button>("history-replay").style.display = DisplayStyle.None;
            RenderReplayItem();
        }

        private void BeginReplay() { previousPageCursors.Clear(); StartCoroutine(LoadReplay(0)); }

        private void RenderReplayItem()
        {
            timeline.Clear();
            if (page.events.Length == 0)
            {
                metrics.text = "Sem eventos nesta página.";
                return;
            }
            var item = page.events[replayIndex];
            metrics.text = "Evento " + (replayIndex + 1) + " de " + page.events.Length + " nesta página · sequência " + item.streamSequence;
            timeline.Add(new Label(item.occurredAt ?? item.observedAt ?? "Horário indisponível"));
            timeline.Add(new Label(item.kind == "github.milestone" ?
                (item.entityType == "pull_request" ? "PR · " : "CI · ") + item.transition : item.type ?? "Evento sem tipo"));
            timeline.Add(new Label("Projeto: " + (item.projectId ?? "sem vínculo") + " · origem: " + (item.ingestionMode ?? "desconhecida")));
            if (item.effects != null)
                foreach (var effect in item.effects)
                    timeline.Add(new Label(effect.effectType == "merge.celebration" ? "Marco: merge confirmado" :
                        effect.effectType == "ci.alarm" ? "Alerta: falha de CI" : "Efeito: " + effect.effectType));
            coverage.text = "Histórico completo por sequência. Cena ao vivo oculta; comandos indisponíveis.";
        }

        private void Previous()
        {
            if (!replaying) return;
            if (replayIndex > 0) { replayIndex--; RenderReplayItem(); return; }
            if (previousPageCursors.Count > 0) StartCoroutine(LoadReplay(previousPageCursors.Peek(), null, true));
        }

        private void Next()
        {
            if (!replaying) return;
            if (replayIndex + 1 < page.events.Length) { replayIndex++; RenderReplayItem(); return; }
            if (page.hasMore) StartCoroutine(LoadReplay(page.nextCursor, currentPageCursor));
        }

        private void ExitReplay()
        {
            replaying = false;
            ReplayChanged?.Invoke(false);
            page = null;
            previousPageCursors.Clear();
            mask.style.display = DisplayStyle.None;
            seal.text = "MEU DIA · LEITURA";
            root.Q<VisualElement>("history-replay-controls").style.display = DisplayStyle.None;
            root.Q<Button>("history-replay").style.display = DisplayStyle.Flex;
            client.RefreshNow();
            RenderDay();
        }

        private void OnDisable()
        {
            StopAllCoroutines();
            if (replaying && root != null) ExitReplay();
        }
    }

    [Serializable]
    public sealed class HistoryDayData
    {
        public string date;
        public string timeZone;
        public double elapsedDurationMs;
        public bool elapsedDurationKnown;
        public double agentHours;
        public bool agentHoursKnown;
        public HistoryCoverage coverage;
        public HistoryMilestone[] milestones;
        public HistoryIncident[] incidentMarkers;

        public static HistoryDayData Parse(string json)
        {
            HistoryDayData value;
            try { value = JsonUtility.FromJson<HistoryDayData>(json); }
            catch (Exception) { throw new ArgumentException("Meu dia inválido"); }
            if (value == null || string.IsNullOrEmpty(value.date) || string.IsNullOrEmpty(value.timeZone) ||
                value.coverage == null || value.milestones == null || value.incidentMarkers == null)
                throw new ArgumentException("Contrato Meu dia incompatível");
            return value;
        }
    }
    [Serializable] public sealed class HistoryCoverage { public string status; public int observedEventCount; }
    [Serializable] public sealed class HistoryMilestone { public string projectId; public string entityType; public string transition; public string occurredAt; public string ingestionMode; }
    [Serializable] public sealed class HistoryIncident { public long workflowId; public string @ref; public string openedAt; public string resolvedAt; }
    [Serializable]
    public sealed class HistoryReplayPage
    {
        public string viewMode;
        public long fromSequence;
        public long throughSequence;
        public long nextCursor;
        public bool hasMore;
        public HistoryReplayItem[] events;

        public static HistoryReplayPage Parse(string json)
        {
            HistoryReplayPage value;
            try { value = JsonUtility.FromJson<HistoryReplayPage>(json); }
            catch (Exception) { throw new ArgumentException("Replay inválido"); }
            if (value == null || value.viewMode != "replay" || value.events == null || value.throughSequence < value.fromSequence ||
                (value.hasMore && value.nextCursor <= value.fromSequence))
                throw new ArgumentException("Contrato replay incompatível");
            return value;
        }
    }
    [Serializable] public sealed class HistoryReplayItem
    {
        public string kind;
        public string type;
        public string projectId;
        public string entityType;
        public string transition;
        public string occurredAt;
        public string observedAt;
        public string ingestionMode;
        public long streamSequence;
        public HistoryEffect[] effects;
    }
    [Serializable] public sealed class HistoryEffect
    {
        public string causationId;
        public string effectType;
        public string projectId;
        public string occurredAt;
        public string ingestionMode;
        public int durationMs;
    }
}

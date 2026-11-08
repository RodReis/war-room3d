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
        private DropdownField projectField;
        private readonly Dictionary<string, string> projectIds = new Dictionary<string, string>();
        private int dayRequestVersion;
        private ScrollView timeline;
        private Label metrics;
        private Label coverage;
        private Label seal;
        private TextField seekField;
        private Button playButton;
        private Button speedButton;
        private HistoryDayData day;
        private HistoryReplayPage page;
        private int replayIndex;
        private long currentPageCursor;
        private readonly Stack<long> previousPageCursors = new Stack<long>();
        private bool replaying;
        private int projectionRequestVersion;
        private bool projectionInFlight;
        private string pendingProjectionAt;
        private DateTime playbackAt;
        private bool hasPlaybackAt;
        private bool playing;
        private int speedIndex;
        private float nextProjectionAt;
        private static readonly double[] PlaybackSpeeds = { 1, 60, 180, 600 };
        public bool IsReplaying => replaying;
        public event Action<bool> ReplayChanged;
        public event Action<LiveSnapshot> ReplayStateChanged;

        public void Configure(VisualElement documentRoot, LiveStateClient liveClient)
        {
            root = documentRoot ?? throw new ArgumentNullException(nameof(documentRoot));
            client = liveClient ?? throw new ArgumentNullException(nameof(liveClient));
            panel = root.Q<VisualElement>("history-panel");
            mask = root.Q<VisualElement>("history-mask");
            dateField = root.Q<TextField>("history-date");
            zoneField = root.Q<TextField>("history-zone");
            projectField = root.Q<DropdownField>("history-project");
            timeline = root.Q<ScrollView>("history-timeline");
            metrics = root.Q<Label>("history-metrics");
            coverage = root.Q<Label>("history-coverage");
            seal = root.Q<Label>("history-seal");
            seekField = root.Q<TextField>("history-seek");
            playButton = root.Q<Button>("history-play");
            speedButton = root.Q<Button>("history-speed");
            if (panel == null || mask == null || dateField == null || zoneField == null || projectField == null || timeline == null ||
                metrics == null || coverage == null || seal == null || seekField == null || playButton == null || speedButton == null) throw new ArgumentException("HUD histórico incompleto");
            panel.style.display = DisplayStyle.None;
            mask.style.display = DisplayStyle.None;
            root.Q<VisualElement>("history-replay-controls").style.display = DisplayStyle.None;
            root.Q<VisualElement>("history-time-controls").style.display = DisplayStyle.None;
            dateField.value = DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            zoneField.value = "America/Sao_Paulo";
            client.SnapshotChanged += OnSnapshotChanged;
            RefreshProjectChoices(client.Snapshot);
            projectField.RegisterValueChangedCallback(_ => InvalidateDay());
            dateField.RegisterValueChangedCallback(_ => InvalidateDay());
            zoneField.RegisterValueChangedCallback(_ => InvalidateDay());
            var open = root.Q<Button>("history-button");
            open.style.display = DisplayStyle.Flex;
            open.clicked += Open;
            root.Q<Button>("history-close").clicked += Close;
            root.Q<Button>("history-load").clicked += () => StartCoroutine(LoadDay());
            root.Q<Button>("history-replay").clicked += BeginReplay;
            root.Q<Button>("history-previous").clicked += Previous;
            root.Q<Button>("history-next").clicked += Next;
            root.Q<Button>("history-live").clicked += ExitReplay;
            root.Q<Button>("history-seek-button").clicked += Seek;
            playButton.clicked += TogglePlayback;
            speedButton.clicked += CycleSpeed;
        }

        private void Open()
        {
            RefreshProjectChoices(client.Snapshot);
            panel.style.display = DisplayStyle.Flex;
            if (day == null) StartCoroutine(LoadDay());
        }

        private void OnSnapshotChanged(LiveSnapshot snapshot) { RefreshProjectChoices(snapshot); }

        private void RefreshProjectChoices(LiveSnapshot snapshot)
        {
            var selected = projectField.value;
            var choices = new List<string> { "Todos os projetos" };
            projectIds.Clear();
            if (snapshot?.projects != null)
                foreach (var project in snapshot.projects)
                {
                    var label = project.name + " (" + project.projectId + ")";
                    choices.Add(label);
                    projectIds.Add(label, project.projectId);
                }
            projectField.choices = choices;
            var next = choices.Contains(selected) ? selected : choices[0];
            projectField.SetValueWithoutNotify(next);
            if (selected != null && selected != next) InvalidateDay();
        }

        private void InvalidateDay()
        {
            dayRequestVersion++;
            day = null;
            if (replaying) return;
            metrics.text = "Filtro alterado. Consulte o dia.";
            coverage.text = "Cobertura ainda não consultada.";
            timeline.Clear();
        }

        private void Close()
        {
            if (replaying) ExitReplay();
            panel.style.display = DisplayStyle.None;
        }

        public bool HandleEscape()
        {
            if (panel == null || panel.style.display == DisplayStyle.None) return false;
            Close();
            return true;
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
            if (projectIds.TryGetValue(projectField.value, out var projectId)) path += "&projectId=" + Uri.EscapeDataString(projectId);
            var requestVersion = dayRequestVersion;
            UnityWebRequest request;
            try { request = client.CreateHistoryRequest(path); }
            catch (ArgumentException) { metrics.text = "Serviço histórico não configurado."; yield break; }
            using (request)
            {
                metrics.text = "Consultando histórico...";
                yield return request.SendWebRequest();
                if (requestVersion != dayRequestVersion) yield break;
                if (request.result != UnityWebRequest.Result.Success || request.responseCode != 200)
                {
                    metrics.text = request.responseCode == 410 ? "Agregados expirados após 90 dias. Evidência indisponível." :
                        "Histórico indisponível. Confira data, fuso e serviço local.";
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
            metrics.text = (string.IsNullOrEmpty(day.projectId) ? "Todos os projetos" : "Projeto: " + day.projectId) + "\n" +
                (day.elapsedDurationKnown ? $"Tempo decorrido: {day.elapsedDurationMs / 3600000:0.##} h" : "Tempo decorrido: indisponível") +
                "\n" + (day.agentHoursKnown ? $"Horas-agente: {day.agentHours:0.##} h" : "Horas-agente: indisponível") +
                "\n" + (day.waitingDurationKnown ? $"Espera observada: {day.waitingDurationMs / 3600000:0.##} h" : "Espera observada: indisponível");
            coverage.text = day.coverage.status == "none" ? "Sem observações de sessão neste dia. Cobertura incompleta." :
                "Cobertura de sessão não comprovada; janelas esperadas não registradas.";
            if (day.retention != null && day.retention.evidenceStatus == "expired")
                coverage.text += " Evidência detalhada expirada após 7 dias; apenas agregados disponíveis.";
            var sourceGapCount = 0;
            foreach (var gap in day.coverage.gaps)
                if (gap.reason == "source_unavailable") sourceGapCount++;
            if (sourceGapCount > 0)
                coverage.text += " " + sourceGapCount + " lacuna(s) de fonte registrada(s).";
            coverage.text += day.githubCoverage.status == "none" ? " GitHub: sem coletas registradas neste dia." :
                day.githubCoverage.status == "gap" ? " GitHub: janela esperada sem coleta; cobertura indisponível." :
                day.githubCoverage.status == "failed" ? " GitHub: coletas falharam; cobertura indisponível." :
                day.githubCoverage.status == "partial" ? " GitHub: " + day.githubCoverage.successfulAttempts + " coleta(s), " + day.githubCoverage.failedAttempts + " falha(s); cobertura contínua não comprovada." :
                " GitHub: " + day.githubCoverage.successfulAttempts + " coleta(s) pontuais; cobertura contínua não comprovada.";
            timeline.Clear();
            foreach (var milestone in day.milestones)
            {
                var text = milestone.entityType == "pull_request" ? "PR " : "CI ";
                timeline.Add(new Label(milestone.occurredAt + " · " + text + milestone.transition +
                    " · projeto " + milestone.projectId + (milestone.ingestionMode == "backfill" ? " · histórico importado" : "")));
            }
            if (day.milestoneCounts != null)
                foreach (var count in day.milestoneCounts)
                    timeline.Add(new Label(count.count + " marco(s) " + count.entityType + " / " + count.transition +
                        " · detalhe expirado após 7 dias"));
            foreach (var incident in day.incidentMarkers)
                timeline.Add(new Label((incident.openedBeforeDay ? "CI ativo desde " : "CI com falha em ") + incident.openedAt +
                    " · workflow " + incident.workflowId + " · " + incident.@ref +
                    (string.IsNullOrEmpty(incident.resolvedAt) ? " · sem recuperação no período" : " · recuperado " + incident.resolvedAt)));
            foreach (var gap in day.coverage.gaps)
                if (gap.reason == "source_unavailable")
                    timeline.Add(new Label(gap.start + "–" + gap.end + " · fonte " + gap.sourceId + " indisponível"));
            foreach (var gap in day.githubCoverage.gaps)
                timeline.Add(new Label(gap.start + "–" + gap.end + " · janela GitHub sem coleta · repositório " + gap.repositoryId));
            if (timeline.contentContainer.childCount == 0) timeline.Add(new Label("Nenhum marco registrado neste dia."));
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
            root.Q<VisualElement>("history-time-controls").style.display = DisplayStyle.Flex;
            root.Q<Button>("history-replay").style.display = DisplayStyle.None;
            RenderReplayItem();
        }

        private void BeginReplay() { previousPageCursors.Clear(); StartCoroutine(LoadReplay(0)); }

        private void RenderReplayItem()
        {
            playing = false;
            playButton.text = "Reproduzir";
            timeline.Clear();
            if (page.events.Length == 0)
            {
                metrics.text = "Sem eventos nesta página.";
                ReplayStateChanged?.Invoke(null);
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
            coverage.text = "Projeção histórica em consulta. Comandos indisponíveis.";
            var at = item.occurredAt ?? item.observedAt;
            if (!string.IsNullOrEmpty(at) && TryParseUtc(at, out playbackAt))
            {
                hasPlaybackAt = true;
                seekField.value = playbackAt.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
                QueueProjection(at);
            }
            else
            {
                hasPlaybackAt = false;
                ReplayStateChanged?.Invoke(null);
                coverage.text = "Instante ausente: projeção histórica indisponível.";
            }
        }

        private static bool TryParseUtc(string value, out DateTime at) => DateTime.TryParseExact(value,
            new[] { "yyyy-MM-dd'T'HH:mm:ss'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'" }, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out at);

        private void QueueProjection(string at)
        {
            projectionRequestVersion++;
            ReplayStateChanged?.Invoke(null);
            if (projectionInFlight) { pendingProjectionAt = at; return; }
            StartCoroutine(LoadProjection(at, projectionRequestVersion));
        }

        private void Seek()
        {
            if (!replaying) return;
            playing = false;
            playButton.text = "Reproduzir";
            if (!TryParseUtc(seekField.value, out var at)) { coverage.text = "Instante UTC inválido."; return; }
            playbackAt = at;
            hasPlaybackAt = true;
            timeline.Clear();
            timeline.Add(new Label("Busca temporal: " + seekField.value + ". Use Anterior/Próximo para voltar aos marcos."));
            metrics.text = "Projeção em " + seekField.value;
            QueueProjection(seekField.value);
        }

        private void TogglePlayback()
        {
            if (!replaying) return;
            if (!hasPlaybackAt) { Seek(); if (!hasPlaybackAt) return; }
            playing = !playing;
            playButton.text = playing ? "Pausar" : "Reproduzir";
            nextProjectionAt = Time.realtimeSinceStartup;
        }

        private void CycleSpeed()
        {
            speedIndex = (speedIndex + 1) % PlaybackSpeeds.Length;
            speedButton.text = PlaybackSpeeds[speedIndex].ToString(CultureInfo.InvariantCulture) + "×";
        }

        private void Update()
        {
            if (!replaying || !playing || !hasPlaybackAt) return;
            playbackAt = playbackAt.AddSeconds(Time.unscaledDeltaTime * PlaybackSpeeds[speedIndex]);
            if (playbackAt >= DateTime.UtcNow) { playbackAt = DateTime.UtcNow; playing = false; playButton.text = "Reproduzir"; }
            if (Time.realtimeSinceStartup < nextProjectionAt) return;
            nextProjectionAt = Time.realtimeSinceStartup + 1f;
            var at = playbackAt.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
            seekField.value = at;
            metrics.text = "Reprodução " + PlaybackSpeeds[speedIndex].ToString(CultureInfo.InvariantCulture) + "× · " + at;
            QueueProjection(at);
        }

        private IEnumerator LoadProjection(string at, int version)
        {
            projectionInFlight = true;
            UnityWebRequest request;
            try { request = client.CreateHistoryRequest("/v1/history/replay/state?at=" + Uri.EscapeDataString(at)); }
            catch (ArgumentException) { ReplayStateChanged?.Invoke(null); coverage.text = "Projeção histórica indisponível."; projectionInFlight = false; yield break; }
            using (request)
            {
                yield return request.SendWebRequest();
                if (replaying && version == projectionRequestVersion &&
                    (request.result != UnityWebRequest.Result.Success || request.responseCode != 200))
                {
                    ReplayStateChanged?.Invoke(null);
                    coverage.text = request.responseCode == 410 ? "Evidência expirada após 7 dias; projeção indisponível." :
                        "Projeção histórica indisponível para este instante.";
                }
                else if (replaying && version == projectionRequestVersion)
                {
                    try
                    {
                        var state = LiveSnapshot.Parse(request.downloadHandler.text, "replay");
                        ReplayStateChanged?.Invoke(state);
                        coverage.text = state.coverage.status == "gap"
                            ? "LACUNA · fonte indisponível em " + at + ". Estado exibido com incerteza."
                            : "Cena projetada em " + at + ". Cobertura de coleta não comprovada.";
                        if (state.layoutReference == "current")
                            coverage.text += " Layout atual como referência.";
                        else if (state.layoutReference == "recorded")
                            coverage.text += " Layout registrado neste instante.";
                        else if (state.layoutReference == "partial")
                            coverage.text += " Parte do layout sem posição histórica.";
                        else if (state.layoutReference == "unavailable")
                            coverage.text += " Layout histórico indisponível.";
                        if (state.infrastructureReference == "unavailable")
                            coverage.text += " Infraestrutura sem inventário histórico.";
                        else if (state.infrastructureReference == "recorded")
                            coverage.text += " Infraestrutura do inventário registrado; núcleo 3D resume recursos por tipo.";
                        if (state.ciIncidents.Length > 0)
                            coverage.text += " CI: " + state.ciIncidents.Length + " incidente(s) ativo(s) neste instante.";
                    }
                    catch (ArgumentException) { ReplayStateChanged?.Invoke(null); coverage.text = "Estado histórico incompatível."; }
                }
            }
            projectionInFlight = false;
            if (replaying && pendingProjectionAt != null)
            {
                var nextAt = pendingProjectionAt;
                pendingProjectionAt = null;
                StartCoroutine(LoadProjection(nextAt, projectionRequestVersion));
            }
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
            StopAllCoroutines();
            replaying = false;
            playing = false;
            hasPlaybackAt = false;
            projectionInFlight = false;
            pendingProjectionAt = null;
            playButton.text = "Reproduzir";
            projectionRequestVersion++;
            ReplayStateChanged?.Invoke(null);
            ReplayChanged?.Invoke(false);
            page = null;
            previousPageCursors.Clear();
            mask.style.display = DisplayStyle.None;
            seal.text = "MEU DIA · LEITURA";
            root.Q<VisualElement>("history-replay-controls").style.display = DisplayStyle.None;
            root.Q<VisualElement>("history-time-controls").style.display = DisplayStyle.None;
            root.Q<Button>("history-replay").style.display = DisplayStyle.Flex;
            client.RefreshNow();
            RenderDay();
            if (day == null) InvalidateDay();
        }

        private void OnDisable()
        {
            StopAllCoroutines();
            if (replaying && root != null) ExitReplay();
        }

        private void OnDestroy()
        {
            if (client != null) client.SnapshotChanged -= OnSnapshotChanged;
        }
    }

    [Serializable]
    public sealed class HistoryDayData
    {
        public string date;
        public string timeZone;
        public string projectId;
        public double elapsedDurationMs;
        public bool elapsedDurationKnown;
        public double agentHours;
        public bool agentHoursKnown;
        public double waitingDurationMs;
        public bool waitingDurationKnown;
        public HistoryCoverage coverage;
        public HistoryGithubCoverage githubCoverage;
        public HistoryMilestone[] milestones;
        public HistoryMilestoneCount[] milestoneCounts;
        public HistoryRetention retention;
        public HistoryIncident[] incidentMarkers;

        public static HistoryDayData Parse(string json)
        {
            HistoryDayData value;
            try { value = JsonUtility.FromJson<HistoryDayData>(json); }
            catch (Exception) { throw new ArgumentException("Meu dia inválido"); }
            if (value == null || string.IsNullOrEmpty(value.date) || string.IsNullOrEmpty(value.timeZone) ||
                value.coverage == null || value.coverage.gaps == null || value.githubCoverage == null || value.githubCoverage.gaps == null ||
                value.milestones == null || value.incidentMarkers == null)
                throw new ArgumentException("Contrato Meu dia incompatível");
            return value;
        }
    }
    [Serializable] public sealed class HistoryCoverage { public string status; public int observedEventCount; public HistoryGap[] gaps; }
    [Serializable] public sealed class HistoryGithubCoverage { public string status; public int attempts; public int successfulAttempts; public int failedAttempts; public HistoryGap[] gaps; }
    [Serializable] public sealed class HistoryGap { public string sourceId; public string repositoryId; public string start; public string end; public string reason; }
    [Serializable] public sealed class HistoryMilestone { public string projectId; public string entityType; public string transition; public string occurredAt; public string ingestionMode; }
    [Serializable] public sealed class HistoryMilestoneCount { public string entityType; public string transition; public int count; }
    [Serializable] public sealed class HistoryRetention { public string evidenceStatus; public string detailCutoffAt; public string aggregateCutoffAt; }
    [Serializable] public sealed class HistoryIncident { public long workflowId; public string @ref; public string openedAt; public bool openedBeforeDay; public string resolvedAt; public bool activeAtEnd; }
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

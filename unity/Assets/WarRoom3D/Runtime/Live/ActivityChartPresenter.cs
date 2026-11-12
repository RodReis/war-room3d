using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    [Serializable] public sealed class ActivityHourView
    {
        public string schemaVersion;
        public string mode;
        public string unit;
        public int intervalMinutes;
        public string from;
        public string to;
        public ActivitySeriesView[] series;
    }
    [Serializable] public sealed class ActivitySeriesView
    {
        public string projectId;
        public string name;
        public string lastUpdatedAt;
        public ActivityBucketView[] buckets;
    }
    [Serializable] public sealed class ActivityBucketView
    {
        public string start;
        public string end;
        public int count;
        public string coverage;
    }
    [Serializable] public sealed class ActivityEventPageView
    {
        public string projectId;
        public string from;
        public string to;
        public bool hasMore;
        public ActivityEventView[] items;
    }
    [Serializable] public sealed class ActivityEventView
    {
        public string eventId;
        public string projectId;
        public string sessionKey;
        public string agentKey;
        public string type;
        public string sourceId;
        public string observedAt;
        public string provenance;
    }

    // Projeção visual independente do snapshot da sala; nenhuma contagem vem da animação.
    public sealed class ActivityChartPresenter : MonoBehaviour
    {
        private VisualElement root;
        private LiveStateClient client;
        private LiveSnapshot snapshot;
        private ActivityHourView hour;
        private string sectorId;
        private bool connected;
        private long lastSequence = -1;
        private float lastRequestAt = -100f;
        private int requestId;
        private int detailRequestId;

        public ActivityHourView CurrentHour => hour;

        public void Configure(VisualElement visualRoot, LiveStateClient stateClient)
        {
            root = visualRoot;
            client = stateClient;
            root.Q<Button>("activity-detail-close").clicked += CloseDetail;
            CloseDetail();
        }

        public void Refresh(LiveSnapshot next, string sector, bool isConnected)
        {
            if (root == null) return;
            snapshot = next;
            sectorId = sector;
            connected = isConnected;
            if (snapshot == null) { hour = null; ShowStatus("Sem projetos observados."); return; }
            if (snapshot.mode == "demo") { hour = DemoHour(snapshot); Render(); return; }
            if (!connected) { ShowStatus("Serviço local indisponível; série sem atualização."); Render(); return; }
            Render();
            if (lastSequence == snapshot.streamSequence && Time.realtimeSinceStartup - lastRequestAt < 30f) return;
            lastSequence = snapshot.streamSequence;
            lastRequestAt = Time.realtimeSinceStartup;
            var expected = ++requestId;
            client.GetActivity("/v1/activity", (status, json) =>
            {
                if (this == null || expected != requestId) return;
                if (status != 200) { Debug.LogWarning("Atividade: resposta HTTP " + status); ShowStatus("Série indisponível no serviço local."); return; }
                AcceptActivity(json);
            });
        }

        public bool AcceptActivity(string json)
        {
            ActivityHourView parsed;
            try { parsed = JsonUtility.FromJson<ActivityHourView>(json); }
            catch (Exception error) { Debug.LogWarning("Atividade: JSON inválido (" + error.GetType().Name + ")"); ShowStatus("Contrato de atividade inválido."); return false; }
            if (!Valid(parsed)) { Debug.LogWarning("Atividade: contrato inválido; séries=" + (parsed?.series?.Length ?? -1)); ShowStatus("Contrato de atividade inválido."); return false; }
            hour = parsed;
            Render();
            return true;
        }

        private static bool Valid(ActivityHourView value)
        {
            if (value == null || value.schemaVersion != "1.0" || value.mode != "live" ||
                value.unit != "eventos observados" || value.intervalMinutes != 5 || value.series == null) return false;
            foreach (var series in value.series)
            {
                if (series == null || string.IsNullOrEmpty(series.projectId) || series.buckets == null ||
                    series.buckets.Length != 12) return false;
                foreach (var bucket in series.buckets)
                    if (bucket == null || (bucket.coverage != "covered" && bucket.coverage != "partial" && bucket.coverage != "gap") ||
                        !DateTimeOffset.TryParse(bucket.start, out _) || !DateTimeOffset.TryParse(bucket.end, out _)) return false;
            }
            return true;
        }

        private void Render()
        {
            var rows = root.Q<ScrollView>("activity-series");
            rows.Clear();
            if (hour == null || snapshot?.roomPlacements == null)
            { ShowStatus("Aguardando série do serviço local."); return; }
            root.Q<Label>("activity-period").text = $"Última hora · 5 min · {hour.unit} · {Clock(hour.from)}–{Clock(hour.to)}";
            var displayed = 0;
            foreach (var placement in snapshot.roomPlacements)
            {
                if (placement == null || placement.sectorId != sectorId) continue;
                var series = Array.Find(hour.series, item => item.projectId == placement.projectId);
                if (series == null) continue;
                var row = new VisualElement();
                row.AddToClassList("activity-row");
                var title = new Label(series.name + "\nAtualizado " + Clock(series.lastUpdatedAt));
                title.AddToClassList("activity-series-name");
                row.Add(title);
                for (var index = 0; index < series.buckets.Length; index++)
                {
                    var bucket = series.buckets[index];
                    var projectId = series.projectId;
                    var projectName = series.name;
                    var selected = bucket;
                    var symbol = bucket.coverage == "gap" ? "—" :
                        bucket.count.ToString(CultureInfo.InvariantCulture) + (bucket.coverage == "partial" ? "*" : "");
                    var button = new Button(() => OpenInterval(projectId, projectName, selected)) { text = symbol,
                        name = "activity-" + projectId + "-" + index,
                        tooltip = projectName + " · " + Clock(bucket.start) + "–" + Clock(bucket.end) +
                            " · " + (bucket.coverage == "gap" ? "lacuna" : symbol + " eventos observados") };
                    button.AddToClassList("activity-cell");
                    button.EnableInClassList("activity-gap", bucket.coverage == "gap");
                    button.EnableInClassList("activity-partial", bucket.coverage == "partial");
                    button.style.borderBottomWidth = bucket.coverage == "gap" ? 2 :
                        Mathf.Clamp(2 + bucket.count * 4, 2, 22);
                    row.Add(button);
                }
                rows.Add(row);
                displayed++;
            }
            ShowStatus(displayed == 0 ? "Nenhuma série deste setor." :
                snapshot.mode == "demo" ? "Demonstração · série ilustrativa" :
                connected ? "Série do serviço local · horário da origem" : "Serviço local indisponível · valores anteriores");
        }

        private void OpenInterval(string projectId, string projectName, ActivityBucketView bucket)
        {
            detailRequestId++;
            root.Q("activity-detail").style.display = DisplayStyle.Flex;
            root.Q<Label>("activity-detail-title").text = projectName + " · " + Clock(bucket.start) + "–" + Clock(bucket.end);
            root.Q<Label>("activity-detail-status").text = bucket.coverage == "gap" ? "Cobertura ausente ou desatualizada" :
                bucket.coverage == "partial" ? "Cobertura parcial · contagem observada" : "Intervalo coberto";
            root.Q<Label>("activity-event-info").text = "";
            var list = root.Q<ScrollView>("activity-detail-events");
            list.Clear();
            root.Q<Button>("activity-detail-close").Focus();
            if (snapshot.mode == "demo")
            { list.Add(new Label("Demonstração ilustrativa. Eventos auditáveis não estão disponíveis nesta fixture.")); return; }
            if (!connected) { list.Add(new Label("Serviço local indisponível.")); return; }
            var expected = detailRequestId;
            var route = "/v1/activity/events?projectId=" + Uri.EscapeDataString(projectId) +
                "&from=" + Uri.EscapeDataString(bucket.start) + "&to=" + Uri.EscapeDataString(bucket.end);
            client.GetActivity(route, (status, json) =>
            {
                if (this == null || expected != detailRequestId) return;
                list.Clear();
                if (status != 200) { list.Add(new Label("Eventos indisponíveis.")); return; }
                ActivityEventPageView page;
                try { page = JsonUtility.FromJson<ActivityEventPageView>(json); }
                catch (Exception) { list.Add(new Label("Resposta de eventos inválida.")); return; }
                if (page == null || page.projectId != projectId || page.from != bucket.start || page.to != bucket.end ||
                    page.items == null) { list.Add(new Label("Resposta de eventos inválida.")); return; }
                if (page.items.Length == 0) list.Add(new Label(bucket.coverage == "covered" ?
                    "Zero eventos observados neste intervalo coberto." : "Nenhum evento observado; cobertura sem confirmação."));
                foreach (var item in page.items)
                {
                    var selected = item;
                    var button = new Button(() => root.Q<Label>("activity-event-info").text =
                        "Evento " + selected.eventId + "\nFonte " + selected.sourceId + "\nHorário da origem " + selected.observedAt +
                        "\nSessão " + (selected.sessionKey ?? "não informada") + "\nAgente " + (selected.agentKey ?? "não informado"))
                    {
                        text = Clock(item.observedAt) + " · " + EventName(item.type) + "\nFonte: " + item.sourceId
                    };
                    list.Add(button);
                }
                if (page.hasMore) list.Add(new Label("Mostrando os 100 eventos mais recentes deste intervalo."));
            });
        }

        private void CloseDetail()
        {
            detailRequestId++;
            root.Q("activity-detail").style.display = DisplayStyle.None;
        }

        private void ShowStatus(string value) => root.Q<Label>("activity-status").text = value;
        private static string Clock(string value) => DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var at) ? at.ToLocalTime().ToString("HH:mm", CultureInfo.InvariantCulture) : "sem sinal";
        private static string EventName(string type)
        {
            if (type.StartsWith("tool.")) return "Ferramenta observada";
            if (type.StartsWith("task.")) return "Tarefa observada";
            if (type.StartsWith("skill.")) return "Skill observada";
            if (type.StartsWith("message.")) return "Mensagem observada";
            if (type.StartsWith("request.")) return "Solicitação observada";
            return "Estado de sessão observado";
        }

        private static ActivityHourView DemoHour(LiveSnapshot state)
        {
            var end = (long)Math.Ceiling(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 300000.0) * 300000;
            var start = end - 12 * 300000;
            var series = new List<ActivitySeriesView>();
            foreach (var project in state.projects ?? Array.Empty<LiveProject>())
            {
                var buckets = new ActivityBucketView[12];
                for (var index = 0; index < 12; index++)
                {
                    var count = project.projectId == "preview-atlas" ? new[] { 0, 1, 2, 0, 3, 1, 0, 2, 4, 1, 2, 1 }[index] :
                        new[] { 1, 0, 1, 2, 0, 0, 1, 0, 2, 1, 0, 0 }[index];
                    buckets[index] = new ActivityBucketView { start = DateTimeOffset.FromUnixTimeMilliseconds(start + index * 300000).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        end = DateTimeOffset.FromUnixTimeMilliseconds(start + (index + 1) * 300000).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        count = count, coverage = index == 11 ? "partial" : "covered" };
                }
                series.Add(new ActivitySeriesView { projectId = project.projectId, name = project.name,
                    lastUpdatedAt = DateTimeOffset.UtcNow.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), buckets = buckets });
            }
            return new ActivityHourView { schemaVersion = "1.0", mode = "demo", unit = "eventos ilustrativos",
                intervalMinutes = 5, from = DateTimeOffset.FromUnixTimeMilliseconds(start).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                to = DateTimeOffset.FromUnixTimeMilliseconds(end).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), series = series.ToArray() };
        }
    }
}

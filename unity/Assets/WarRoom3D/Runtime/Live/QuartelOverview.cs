using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class QuartelOverview
    {
        private readonly VisualElement container;
        private readonly Action<string> openProject;
        private readonly Dictionary<string, Button> cards = new Dictionary<string, Button>();

        public QuartelOverview(VisualElement container, Action<string> openProject)
        {
            this.container = container;
            this.openProject = openProject;
        }

        public void Render(LiveSnapshot state, bool current, string selectedProject, string sectorId = "setor-01")
        {
            var placements = new List<LiveRoomPlacement>();
            foreach (var placement in state?.roomPlacements ?? Array.Empty<LiveRoomPlacement>())
                if (placement != null && placement.sectorId == sectorId) placements.Add(placement);
            placements.Sort((left, right) => string.CompareOrdinal(left.slotId, right.slotId));

            var active = new HashSet<string>();
            var index = 0;
            foreach (var placement in placements)
            {
                var project = Array.Find(state.projects, item => item.projectId == placement.projectId);
                if (project == null || !active.Add(project.projectId)) continue;
                if (!cards.TryGetValue(project.projectId, out var card))
                {
                    card = CreateCard(project.projectId);
                    container.Insert(index, card);
                    cards.Add(project.projectId, card);
                }
                else if (container.IndexOf(card) != index)
                {
                    card.RemoveFromHierarchy();
                    container.Insert(index, card);
                }
                card.name = "overview-card-" + placement.slotId;
                card.EnableInClassList("overview-selected", project.projectId == selectedProject);
                UpdateCard(card, project, state, current, placement);
                index++;
            }
            foreach (var key in new List<string>(cards.Keys))
            {
                if (active.Contains(key)) continue;
                cards[key].RemoveFromHierarchy();
                cards.Remove(key);
            }
        }

        public static List<LiveProject> FindProjects(LiveSnapshot state, string query)
        {
            var found = new List<LiveProject>();
            if (state?.projects == null || state.roomPlacements == null) return found;
            var visible = new HashSet<string>();
            foreach (var placement in state.roomPlacements)
                if (placement != null) visible.Add(placement.projectId);
            foreach (var project in state.projects)
                if (project != null && visible.Contains(project.projectId) &&
                    (project.name.IndexOf(query ?? "", StringComparison.OrdinalIgnoreCase) >= 0 ||
                     project.projectId.IndexOf(query ?? "", StringComparison.OrdinalIgnoreCase) >= 0)) found.Add(project);
            return found;
        }

        public static string SourceLabel(LiveSnapshot state, bool connected, bool replay)
        {
            if (replay) return "Dados históricos";
            if (state?.mode == "demo") return "Dados ilustrativos";
            if (!connected) return "Fonte indisponível";
            foreach (var source in state?.sources ?? Array.Empty<LiveSource>())
                if (source.status == "atual" && !string.IsNullOrEmpty(source.lastEvidenceAt))
                    return "Sinal recebido · origem não verificada";
            return "Fonte sem confirmação";
        }

        private Button CreateCard(string projectId)
        {
            var card = new Button(() => openProject(projectId));
            card.AddToClassList("overview-card");
            AddLabel(card, "overview-index", "overview-kicker");
            AddLabel(card, "overview-project", "overview-project");
            AddLabel(card, "overview-status", "overview-status");
            AddLabel(card, "overview-agents", "overview-meta");
            AddLabel(card, "overview-signal", "overview-meta");
            AddLabel(card, "overview-alert", "overview-alert");
            return card;
        }

        private static void AddLabel(Button card, string name, string style)
        {
            var label = new Label { name = name, pickingMode = PickingMode.Ignore };
            label.AddToClassList(style);
            card.Add(label);
        }

        private static void UpdateCard(Button card, LiveProject project, LiveSnapshot state, bool current, LiveRoomPlacement placement)
        {
            var workingAgents = 0;
            var workingSession = false;
            var waiting = false;
            var unknown = false;
            var present = false;
            DateTimeOffset? latest = null;
            if (DateTimeOffset.TryParse(placement.lastSignalAt, CultureInfo.InvariantCulture, DateTimeStyles.None, out var roomSignal))
                latest = roomSignal;
            foreach (var session in state.sessions)
            {
                if (session.projectId != project.projectId) continue;
                if (DateTimeOffset.TryParse(session.lastSeen, CultureInfo.InvariantCulture, DateTimeStyles.None, out var stamp) &&
                    (!latest.HasValue || stamp > latest.Value)) latest = stamp;
                if (session.presence == "encerrada") continue;
                if (session.freshness != "atual" || session.presence == "desconhecida") { unknown = true; continue; }
                present = true;
                workingSession |= session.presence == "trabalhando";
                waiting |= session.presence == "aguardando";
            }
            foreach (var agent in AgentProjection.ForProject(state, project.projectId, current))
                if (!agent.Uncertain && !agent.Ended && agent.Presence == "trabalhando") workingAgents++;
            var status = !current || placement.status == "uncertain" ? "◇ Dados desatualizados" :
                workingAgents > 0 ? "● Trabalhando" :
                workingSession ? "● Sessão em atividade" :
                waiting ? "○ Aguardando" :
                unknown && !present ? "◇ Fonte indisponível" :
                present ? "○ Sessão observada" : "○ Workspace aberto";
            var incidents = 0;
            foreach (var incident in state.incidents ?? Array.Empty<LiveIncident>())
                if (Array.IndexOf(incident.projectIds, project.projectId) >= 0) incidents++;

            card.Q<Label>("overview-index").text = $"SALA {placement.slotId.Replace("slot-", "")}   /   {project.projectId}";
            card.Q<Label>("overview-project").text = project.name;
            var statusLabel = card.Q<Label>("overview-status");
            statusLabel.text = status;
            statusLabel.EnableInClassList("status-waiting", waiting && !workingSession && workingAgents == 0 && current);
            statusLabel.EnableInClassList("status-inactive", !current || placement.status == "uncertain" || (!present && !unknown));
            card.Q<Label>("overview-agents").text = !current || (unknown && !present) ? "Atividade sem confirmação" :
                workingAgents == 1 ? "1 agente trabalhando" : $"{workingAgents} agentes trabalhando";
            card.Q<Label>("overview-signal").text = latest.HasValue
                ? "Último sinal  " + latest.Value.ToLocalTime().ToString("HH:mm:ss", CultureInfo.InvariantCulture)
                : "Sem sinal registrado";
            var alert = card.Q<Label>("overview-alert");
            alert.text = incidents > 0 ? $"!  {incidents} incidente(s) observado(s)" : (unknown && !present) || !current ? "!  Verificar fonte" : "Sem alertas observados";
            alert.EnableInClassList("status-attention", incidents > 0 || (unknown && !present) || !current);
            card.tooltip = project.name + " · " + project.projectId + " · " + status;
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class LiveHudPresenter : MonoBehaviour, IHudPointerArea
    {
        [SerializeField] private UIDocument document;
        [SerializeField] private StyleSheet styleSheet;
        [SerializeField] private LiveStateClient client;
        [SerializeField] private SectorBuilder sector;
        [SerializeField] private OrbitCamera orbit;
        private VisualElement root;
        private LiveSnapshot snapshot;
        private string selectedProjectId;
        private string selectedResourceId;
        private bool insideRoom;
        private bool insideDataCenter;
        private bool filterProject;
        private bool replayMode;
        private Transform replayMarkers;
        private Material replayActiveMaterial;
        private Material replayUnknownMaterial;

        private void Start()
        {
            root = document.rootVisualElement;
            if (styleSheet != null) root.styleSheets.Add(styleSheet);
            orbit.SetHud(this);
            sector.GetComponentInChildren<DataCenterBuilder>().UseNeutralIndicators();
            root.Q<Label>("stage-eyebrow").text = "WAR-ROOM3D / M2 · AO VIVO";
            root.Q<Label>("project-list-heading").text = "PROJETOS OBSERVADOS";
            root.Q<Label>("activity-heading").text = "ATIVIDADE OBSERVADA";
            root.Q<Label>("agents-heading").text = "AGENTES OBSERVADOS";
            root.Q<Label>("feed-heading").text = "FEED · EVENTOS OBSERVADOS";
            root.Q<Label>("resource-list-heading").text = "RECURSOS OBSERVADOS";
            root.Q<Button>("enter-button").clicked += EnterRoom;
            root.Q<Button>("back-button").clicked += ReturnToSector;
            root.Q<Button>("center-button").clicked += ShowDataCenter;
            root.Q<Button>("resource-back-button").clicked += ReturnToSector;
            root.Q<Button>("resource-all-button").clicked += () => SetResourceFilter(false);
            root.Q<Button>("resource-project-button").clicked += () => SetResourceFilter(true);
            root.Q<Button>("angle-button").clicked += () => orbit.Orbit(180f, 0);
            root.Q<Button>("reset-button").clicked += () => { if (insideDataCenter) orbit.FocusCore(); else FocusSelectedRoom(); };
            var history = gameObject.AddComponent<HistoryHudPresenter>();
            history.Configure(root, client);
            history.ReplayChanged += OnReplayChanged;
            history.ReplayStateChanged += RenderReplayState;
            gameObject.AddComponent<EffectDirector>().Configure(root, client, history, sector);
            client.SnapshotChanged += Render;
            client.ConnectionChanged += OnConnection;
            if (client.Snapshot != null) Render(client.Snapshot);
            else ShowEmpty();
            ReturnToSector();
            OnConnection(client.Connected, client.ConnectionMessage);
        }

        private void OnDestroy()
        {
            var history = GetComponent<HistoryHudPresenter>();
            if (history != null) { history.ReplayChanged -= OnReplayChanged; history.ReplayStateChanged -= RenderReplayState; }
            ClearReplayMarkers();
            if (replayActiveMaterial != null) Destroy(replayActiveMaterial);
            if (replayUnknownMaterial != null) Destroy(replayUnknownMaterial);
            if (client == null) return;
            client.SnapshotChanged -= Render;
            client.ConnectionChanged -= OnConnection;
        }

        private void ShowEmpty()
        {
            root.Q<Label>("project-name").text = "Aguardando estado live";
            root.Q<Label>("status").text = "Sem dados";
            root.Q<Label>("provider").text = "Sem dados";
            root.Q<Label>("agents").text = "Sem dados";
            root.Q<Label>("activity").text = "O serviço local ainda não forneceu um snapshot válido.";
            root.Q<Label>("agent-tree").text = "Sem dados";
            root.Q<Label>("feed").text = "Sem eventos";
            root.Q<Label>("infrastructure-alert").text = "Sem dados de infraestrutura";
            ShowNoResource("O serviço local ainda não forneceu um snapshot válido.");
            root.Q<Button>("enter-button").SetEnabled(false);
        }

        private void OnConnection(bool connected, string message)
        {
            if (root == null) return;
            if (replayMode) return;
            root.Q<Label>("demo-seal").text = connected ? "AO VIVO · SERVIÇO LOCAL" : snapshot == null ? "SEM CONEXÃO · SEM DADOS" : "SEM CONEXÃO · ÚLTIMO SNAPSHOT";
            if (snapshot == null) root.Q<Label>("activity").text = message;
            else { RefreshProject(); RefreshResources(); }
        }

        private void Render(LiveSnapshot next)
        {
            if (replayMode) return;
            snapshot = next;
            if (root == null) return;
            var list = root.Q<ScrollView>("project-list");
            list.Clear();
            foreach (var project in snapshot.projects)
            {
                var entry = project;
                var button = new Button(() => SelectProject(entry.projectId)) { text = project.name };
                button.AddToClassList("project-button");
                list.Add(button);
            }
            if (snapshot.projects.Length == 0) selectedProjectId = null;
            else if (Array.Find(snapshot.projects, item => item.projectId == selectedProjectId) == null) selectedProjectId = snapshot.projects[0].projectId;
            RefreshProject();
            RefreshResources();
        }

        private void OnReplayChanged(bool active)
        {
            replayMode = active;
            if (!active)
            {
                ClearReplayMarkers();
                snapshot = client.Snapshot;
                if (snapshot != null) Render(snapshot);
                else ShowEmpty();
                OnConnection(client.Connected, client.ConnectionMessage);
            }
            else
            {
                snapshot = null;
                ShowReplayUnavailable();
            }
        }

        private void RenderReplayState(LiveSnapshot state)
        {
            if (!replayMode) return;
            ClearReplayMarkers();
            snapshot = state;
            if (state == null) { ShowReplayUnavailable(); return; }
            var list = root.Q<ScrollView>("project-list");
            list.Clear();
            foreach (var project in state.projects)
            {
                var entry = project;
                list.Add(new Button(() => SelectProject(entry.projectId)) { text = project.name });
            }
            if (state.projects.Length == 0) selectedProjectId = null;
            else if (Array.Find(state.projects, item => item.projectId == selectedProjectId) == null) selectedProjectId = state.projects[0].projectId;
            BuildReplayMarkers(state);
            RefreshProject();
            RefreshResources();
        }

        private void ShowReplayUnavailable()
        {
            root.Q<ScrollView>("project-list").Clear();
            root.Q<Label>("project-name").text = "Projeção histórica indisponível";
            root.Q<Label>("status").text = "Sem dados";
            root.Q<Label>("activity").text = "Aguardando estado do instante selecionado.";
            root.Q<Label>("demo-seal").text = "REPRODUÇÃO · SEM COMANDOS";
            root.Q<Button>("enter-button").SetEnabled(false);
        }

        private void BuildReplayMarkers(LiveSnapshot state)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            if (shader == null) return;
            replayActiveMaterial ??= new Material(shader) { color = new Color(0.08f, 0.78f, 0.9f) };
            replayUnknownMaterial ??= new Material(shader) { color = new Color(0.92f, 0.58f, 0.16f) };
            replayMarkers = new GameObject("Projeção histórica").transform;
            replayMarkers.SetParent(sector.transform, false);
            foreach (var placement in state.roomPlacements)
            {
                if (placement.sectorId != "setor-01" || !sector.Rooms.TryGetValue(placement.slotId, out var room)) continue;
                bool active = false, uncertain = false;
                foreach (var session in state.sessions)
                    if (session.projectId == placement.projectId && session.presence != "encerrada")
                    {
                        if (session.presence == "desconhecida" || session.freshness != "atual") uncertain = true;
                        else active = true;
                    }
                if (!active && !uncertain) continue;
                var marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                marker.name = "ReplayMarker:" + placement.projectId;
                marker.transform.SetParent(replayMarkers, false);
                marker.transform.position = room.position + new Vector3(0, 2.8f, 0);
                marker.transform.localScale = new Vector3(2.4f, 0.14f, 2.4f);
                marker.GetComponent<Renderer>().sharedMaterial = active ? replayActiveMaterial : replayUnknownMaterial;
                Destroy(marker.GetComponent<Collider>());
            }
            root.Q<Label>("demo-seal").text = "REPRODUÇÃO · CENA HISTÓRICA";
        }

        private void ClearReplayMarkers()
        {
            if (replayMarkers != null) { Destroy(replayMarkers.gameObject); replayMarkers = null; }
        }

        private void SelectProject(string projectId)
        {
            selectedProjectId = projectId;
            RefreshProject();
            if (insideDataCenter) SetResourceFilter(true);
            if (insideRoom) FocusSelectedRoom();
        }

        private void RefreshProject()
        {
            if (snapshot == null) { ShowEmpty(); return; }
            var project = Array.Find(snapshot.projects, item => item.projectId == selectedProjectId);
            if (project == null) { ShowEmpty(); return; }
            root.Q<Label>("project-name").text = project.name;
            var sessions = new List<LiveSession>();
            var sessionKeys = new HashSet<string>();
            var providers = new HashSet<string>();
            foreach (var session in snapshot.sessions)
                if (session.projectId == project.projectId)
                {
                    sessions.Add(session);
                    sessionKeys.Add(session.sessionKey);
                    providers.Add(session.provider);
                }
            int presentAgents = 0;
            int workingAgents = 0;
            int uncertainAgents = 0;
            foreach (var agent in snapshot.agents)
            {
                if (!sessionKeys.Contains(agent.sessionKey) || agent.presence == "encerrada") continue;
                var session = sessions.Find(item => item.sessionKey == agent.sessionKey);
                bool sourceCurrent = (replayMode || client.Connected) && session != null && session.freshness == "atual" && session.presence != "desconhecida" && session.presence != "encerrada";
                if (!sourceCurrent || agent.presence == "desconhecida") uncertainAgents++;
                else if (agent.presence == "observada" || agent.presence == "trabalhando" || agent.presence == "aguardando")
                {
                    presentAgents++;
                    if (agent.presence == "trabalhando") workingAgents++;
                }
            }
            string status = !replayMode && !client.Connected ? "Sem dados · conexão perdida" : SessionStatus(sessions);
            var statusLabel = root.Q<Label>("status");
            statusLabel.text = status;
            statusLabel.EnableInClassList("status-attention", status == "Fonte indisponível");
            statusLabel.EnableInClassList("status-inactive", (!replayMode && !client.Connected) || sessions.Count == 0);
            statusLabel.EnableInClassList("status-waiting", status == "Aguardando");
            root.Q<Label>("provider").text = providers.Count == 0 ? "Sem sessão" : providers.Count > 1 ? "Ambos" : providers.Contains("codex") ? "Codex" : "Claude";
            root.Q<Label>("agents").text = $"{presentAgents} agentes presentes · {workingAgents} trabalhando" +
                (uncertainAgents > 0 ? $" · {uncertainAgents} incertos" : "");
            root.Q<Label>("activity").text = replayMode ? "Estado histórico de sessões; tarefas não disponíveis nesta fatia." : client.Connected ? "Estado de sessões observado; tarefas não disponíveis nesta fatia." : "Conexão perdida. O último snapshot não confirma atividade atual.";
            root.Q<Label>("agent-tree").text = presentAgents == 0 && uncertainAgents == 0 ? "Nenhum agente presente observado" :
                $"{presentAgents} agentes presentes" + (uncertainAgents > 0 ? $" · {uncertainAgents} incertos" : "");
            var lines = new List<string>();
            for (int i = snapshot.feed.Length - 1; i >= 0 && lines.Count < 3; i--)
                if (snapshot.feed[i].projectId == project.projectId) lines.Add($"{snapshot.feed[i].observedAt} · {snapshot.feed[i].type}");
            root.Q<Label>("feed").text = lines.Count == 0 ? "Sem eventos deste projeto" : string.Join("\n", lines);
            int incidents = 0;
            foreach (var incident in snapshot.incidents)
                if (Array.IndexOf(incident.projectIds, project.projectId) >= 0) incidents++;
            root.Q<Label>("infrastructure-alert").text = incidents > 0 ? $"Impacto potencial · {incidents} incidente(s) observado(s)" : "Sem incidente vinculado no último snapshot";
            root.Q<Label>("infrastructure-alert").EnableInClassList("status-attention", incidents > 0 && client.Connected);
            root.Q<Button>("enter-button").SetEnabled(PlacementFor(project.projectId) != null);
        }

        private static string SessionStatus(List<LiveSession> sessions)
        {
            bool waiting = false, unknown = false;
            foreach (var session in sessions)
            {
                if (session.presence == "trabalhando" && session.freshness == "atual") return "Trabalhando";
                if (session.presence == "aguardando" && session.freshness == "atual") waiting = true;
                if (session.presence == "desconhecida" || session.freshness != "atual") unknown = true;
            }
            return waiting ? "Aguardando" : unknown ? "Fonte indisponível" : sessions.Count == 0 ? "Sem sessão observada" : "Inativo";
        }

        private LiveRoomPlacement PlacementFor(string projectId)
        {
            return Array.Find(snapshot.roomPlacements, item => item.projectId == projectId && item.sectorId == "setor-01" && sector.Rooms.ContainsKey(item.slotId));
        }

        private void FocusSelectedRoom()
        {
            if (snapshot == null || selectedProjectId == null) { orbit.ResetView(); return; }
            var placement = PlacementFor(selectedProjectId);
            if (placement != null) orbit.FocusRoom(sector.Rooms[placement.slotId]);
            else orbit.ResetView();
        }

        private void EnterRoom()
        {
            if (snapshot == null || selectedProjectId == null || PlacementFor(selectedProjectId) == null) return;
            insideRoom = true;
            insideDataCenter = false;
            FocusSelectedRoom();
            root.Q<Label>("view-title").text = "Interior da sala";
            root.Q<Button>("back-button").style.display = DisplayStyle.Flex;
            root.Q<Button>("enter-button").style.display = DisplayStyle.None;
        }

        private void ReturnToSector()
        {
            insideRoom = false;
            insideDataCenter = false;
            root.Q<VisualElement>("project-panel").style.display = DisplayStyle.Flex;
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.None;
            root.Q<Label>("view-title").text = "Salas observadas e núcleo central";
            root.Q<Button>("back-button").style.display = DisplayStyle.None;
            root.Q<Button>("enter-button").style.display = DisplayStyle.Flex;
            orbit.ResetView();
        }

        private void ShowDataCenter()
        {
            insideRoom = false;
            insideDataCenter = true;
            orbit.FocusCore();
            root.Q<VisualElement>("project-panel").style.display = DisplayStyle.None;
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.Flex;
            SetResourceFilter(selectedProjectId != null);
        }

        private void SetResourceFilter(bool projectOnly)
        {
            filterProject = projectOnly;
            RefreshResources();
        }

        private void RefreshResources()
        {
            if (root == null) return;
            var list = root.Q<ScrollView>("resource-list");
            list.Clear();
            root.Q<Label>("resource-filter").text = filterProject && selectedProjectId != null ? "Filtro: projeto selecionado" : "Filtro: todos os recursos";
            if (snapshot == null) { ShowNoResource("Sem snapshot live"); return; }
            LiveResource first = null;
            bool selectedVisible = false;
            foreach (var resource in snapshot.resources)
            {
                var state = StateFor(resource.resourceId);
                if (filterProject && selectedProjectId != null && (state == null || Array.IndexOf(state.dependentProjectIds, selectedProjectId) < 0)) continue;
                var entry = resource;
                var button = new Button(() => SelectResource(entry.resourceId)) { text = $"{resource.name} · {HealthText(state)}" };
                button.AddToClassList("project-button");
                list.Add(button);
                if (first == null) first = resource;
                if (resource.resourceId == selectedResourceId) selectedVisible = true;
            }
            if (!selectedVisible) selectedResourceId = first != null ? first.resourceId : null;
            if (selectedResourceId == null) ShowNoResource("Nenhum recurso vinculado neste filtro");
            else SelectResource(selectedResourceId);
        }

        private LiveResourceState StateFor(string resourceId) => Array.Find(snapshot.resourceStates, item => item.resourceId == resourceId);

        private void SelectResource(string resourceId)
        {
            if (snapshot == null) return;
            var resource = Array.Find(snapshot.resources, item => item.resourceId == resourceId);
            if (resource == null) return;
            selectedResourceId = resourceId;
            var state = StateFor(resourceId);
            root.Q<Label>("resource-name").text = resource.name;
            var status = root.Q<Label>("resource-status");
            status.text = HealthText(state);
            status.EnableInClassList("status-attention", client.Connected && (state?.health == "degradado" || state?.health == "indisponivel"));
            status.EnableInClassList("status-inactive", !client.Connected || state == null || state.health == "sem_dados");
            var names = new List<string>();
            if (state?.dependentProjectIds != null)
                foreach (var id in state.dependentProjectIds)
                {
                    var project = Array.Find(snapshot.projects, item => item.projectId == id);
                    names.Add(project != null ? project.name : id);
                }
            var indicator = state != null && !string.IsNullOrEmpty(state.indicator) && !string.IsNullOrEmpty(state.unit)
                ? $"{state.indicator} = {state.value:0.##} {state.unit}" : "não disponível";
            root.Q<Label>("resource-detail").text = $"Tipo: {resource.kind}  ·  Ambiente: {resource.environmentId}\n" +
                $"Indicador: {indicator}\nFrescor: {state?.freshness ?? "sem_dados"}  ·  Cobertura: {state?.coverage ?? "sem_dados"}\n" +
                $"Fonte: {state?.sourceId ?? resource.sourceId}\nObservado: {state?.observedAt ?? "nunca"}\n" +
                $"Evidência: {state?.evidenceRef ?? "não disponível"}\n" +
                $"Projetos dependentes: {(names.Count == 0 ? "nenhum" : string.Join(", ", names))}";
        }

        private string HealthText(LiveResourceState state)
        {
            if (!client.Connected) return "Sem dados · conexão perdida";
            if (state == null || state.freshness != "atual" || state.coverage != "atual") return "Sem dados";
            switch (state.health)
            {
                case "saudavel": return "Saudável";
                case "degradado": return "Degradado";
                case "indisponivel": return "Indisponível";
                default: return "Sem dados";
            }
        }

        private void ShowNoResource(string message)
        {
            root.Q<Label>("resource-name").text = "Nenhum recurso";
            var status = root.Q<Label>("resource-status");
            status.text = "Sem dados";
            status.EnableInClassList("status-attention", false);
            status.EnableInClassList("status-inactive", true);
            root.Q<Label>("resource-detail").text = message;
        }

        public bool IsPointerOverHud(Vector2 screenPosition)
        {
            if (root == null || root.panel == null) return false;
            Vector2 point = RuntimePanelUtils.ScreenToPanel(root.panel, screenPosition);
            return Contains("header", point) || Contains("project-panel", point) || Contains("resource-panel", point) || Contains("control-panel", point) ||
                Contains("history-panel", point) || Contains("history-mask", point);
        }

        private bool Contains(string name, Vector2 point)
        {
            var element = root.Q<VisualElement>(name);
            return element != null && element.resolvedStyle.display != DisplayStyle.None && element.worldBound.Contains(point);
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
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
        [SerializeField] private GameObject seatedAgentPrefab;
        [SerializeField] private GameObject standingAgentPrefab;
        private VisualElement root;
        private LiveSnapshot snapshot;
        private string selectedProjectId;
        private string currentSectorId = "setor-01";
        private string selectedResourceId;
        private bool insideRoom;
        private bool insideDataCenter;
        private bool filterProject;
        private bool replayMode;
        private Transform replayMarkers;
        private Material replayActiveMaterial;
        private Material replayUnknownMaterial;
        private DataCenterBuilder dataCenter;
        private OperationsHudPresenter operations;
        private ReferenceRoomNavigation navigation;
        private AgentPresenter agentPresenter;
        private ChatPresenter chat;
        private RoomLogPresenter logs;
        private QuartelOverview overview;
        private ActivityChartPresenter activityChart;
        private string overviewRoomsKey;
        private string profileKey;
        private bool profileDirty;

        private bool IsPreview => snapshot?.mode == "demo";
        private bool AtOverview => !insideRoom && !insideDataCenter && !replayMode;
        private bool HasCurrentData => replayMode || IsPreview || client.Connected;

        private void Start()
        {
            root = document.rootVisualElement;
            if (styleSheet != null) root.styleSheets.Add(styleSheet);
            root.RegisterCallback<GeometryChangedEvent>(OnRootGeometryChanged);
            orbit.SetHud(this);
            dataCenter = sector.GetComponentInChildren<DataCenterBuilder>();
            dataCenter.UseNeutralIndicators();
            root.Q<Label>("stage-eyebrow").text = "WAR-ROOM3D   /   DESENVOLVIMENTO";
            overview = new QuartelOverview(root.Q("overview-cards"), OpenOverviewProject);
            activityChart = gameObject.AddComponent<ActivityChartPresenter>();
            activityChart.Configure(root, client);
            root.Q<Button>("overview-center").clicked += ShowDataCenter;
            root.Q<Button>("overview-tools").clicked += () =>
                root.EnableInClassList("overview-tools-open", !root.ClassListContains("overview-tools-open"));
            root.Q<TextField>("overview-search").RegisterValueChangedCallback(_ => RefreshOverview());
            root.Q<Label>("project-list-heading").text = "PROJETOS OBSERVADOS";
            root.Q<Label>("activity-heading").text = "ATIVIDADE OBSERVADA";
            root.Q<Label>("agents-heading").text = "AGENTES OBSERVADOS";
            root.Q<Label>("feed-heading").text = "LOGS E EVIDÊNCIAS";
            root.Q<Label>("resource-list-heading").text = "RECURSOS OBSERVADOS";
            root.Q<Button>("enter-button").clicked += EnterRoom;
            root.Q<Button>("back-button").clicked += ReturnToSector;
            root.Q<Button>("center-button").clicked += ShowDataCenter;
            root.Q<Button>("resource-back-button").clicked += ReturnToSector;
            root.Q<Button>("resource-all-button").clicked += () => SetResourceFilter(false);
            root.Q<Button>("resource-project-button").clicked += () => SetResourceFilter(true);
            root.Q<Button>("angle-button").clicked += () => orbit.Orbit(180f, 0);
            root.Q<Button>("reset-button").clicked += () =>
            {
                if (insideDataCenter) orbit.FocusCore();
                else if (AtOverview) FocusOverview();
                else FocusSelectedRoom();
            };
            navigation = new ReferenceRoomNavigation(root, ReturnToSector);
            navigation.AgentSelected += OnAgentSelected;
            root.Q<DropdownField>("agent-style").choices = new List<string>(AgentLocalProfile.Styles);
            root.Q<TextField>("agent-alias").RegisterValueChangedCallback(_ => profileDirty = true);
            root.Q<DropdownField>("agent-style").RegisterValueChangedCallback(_ => profileDirty = true);
            root.Q<Button>("agent-profile-save").clicked += SaveAgentProfile;
            root.Q<Button>("agent-profile-clear").clicked += ClearAgentProfile;
            root.Q<Button>("chat-open-agent").clicked += () => navigation.SelectTab(1);
            agentPresenter = gameObject.AddComponent<AgentPresenter>();
            agentPresenter.Configure(seatedAgentPrefab != null ? seatedAgentPrefab : Resources.Load<GameObject>("Agents/AgentSeated"),
                standingAgentPrefab != null ? standingAgentPrefab : Resources.Load<GameObject>("Agents/AgentStanding"));
            var history = gameObject.AddComponent<HistoryHudPresenter>();
            history.Configure(root, client);
            operations = gameObject.AddComponent<OperationsHudPresenter>();
            operations.Configure(root, client);
            var commands = gameObject.AddComponent<CommandPresenter>();
            commands.Configure(root, client, history);
            chat = gameObject.AddComponent<ChatPresenter>();
            chat.Configure(root, client, commands);
            logs = gameObject.AddComponent<RoomLogPresenter>();
            logs.Configure(root, client, navigation);
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
            if (root != null) root.UnregisterCallback<GeometryChangedEvent>(OnRootGeometryChanged);
            var history = GetComponent<HistoryHudPresenter>();
            if (history != null) { history.ReplayChanged -= OnReplayChanged; history.ReplayStateChanged -= RenderReplayState; }
            ClearReplayMarkers();
            if (dataCenter != null) dataCenter.ClearReplayInfrastructure();
            if (replayActiveMaterial != null) Destroy(replayActiveMaterial);
            if (replayUnknownMaterial != null) Destroy(replayUnknownMaterial);
            if (navigation != null) navigation.AgentSelected -= OnAgentSelected;
            if (client == null) return;
            client.SnapshotChanged -= Render;
            client.ConnectionChanged -= OnConnection;
        }

        private void OnRootGeometryChanged(GeometryChangedEvent evt)
        {
            if (evt.newRect.height <= 0) return;
            root.EnableInClassList("overview-compact", evt.newRect.height < 700f);
            root.EnableInClassList("overview-ultra", evt.newRect.height < 560f);
        }

        private void ShowEmpty()
        {
            root.Q<Label>("project-name").text = "Aguardando estado live";
            root.Q<Label>("status").text = "Sem dados";
            root.Q<Label>("provider").text = "Sem dados";
            root.Q<Label>("agents").text = "Sem dados";
            root.Q<Label>("activity").text = "O serviço local ainda não forneceu um snapshot válido.";
            root.Q<Label>("agent-tree").text = "Sem dados";
            navigation.SetAgents(Array.Empty<AgentEntry>());
            UpdateAgentProfileControls(null);
            ShowSessionSource(null);
            if (agentPresenter != null) agentPresenter.Show(null, null, null);
            root.Q<Label>("feed").text = "Sem eventos";
            root.Q<Label>("infrastructure-alert").text = "Sem dados de infraestrutura";
            ShowNoResource("O serviço local ainda não forneceu um snapshot válido.");
            root.Q<Button>("enter-button").SetEnabled(false);
        }

        private void OnConnection(bool connected, string message)
        {
            if (root == null) return;
            if (replayMode) return;
            if (snapshot == null) root.Q<Label>("activity").text = message;
            else { RefreshProject(); RefreshResources(); }
            RefreshOverview();
        }

        private void Render(LiveSnapshot next)
        {
            if (replayMode) return;
            snapshot = next;
            if (root == null) return;
            var list = root.Q<ScrollView>("project-list");
            list.Clear();
            foreach (var project in QuartelOverview.FindProjects(snapshot, ""))
            {
                var entry = project;
                var button = new Button(() => SelectProject(entry.projectId)) { text = project.name, tooltip = project.name, userData = project.projectId };
                button.AddToClassList("project-button");
                list.Add(button);
            }
            var activeProjects = QuartelOverview.FindProjects(snapshot, "");
            if (activeProjects.Count == 0) selectedProjectId = null;
            else if (activeProjects.Find(item => item.projectId == selectedProjectId) == null) selectedProjectId = activeProjects[0].projectId;
            SelectSectorForProject(selectedProjectId);
            RefreshProject();
            RefreshResources();
            RefreshOverview();
        }

        private void OnReplayChanged(bool active)
        {
            replayMode = active;
            if (chat != null) chat.SetReplayMode(active);
            if (logs != null) logs.SetReplayMode(active);
            if (operations != null) operations.SetReplayMode(active);
            if (dataCenter != null) dataCenter.ClearReplayInfrastructure();
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
                if (!insideRoom && !insideDataCenter)
                {
                    navigation.SetSummaryCollapsed(false);
                    navigation.SetView(false, null);
                }
                SetOverviewVisible();
            }
        }

        private void RenderReplayState(LiveSnapshot state)
        {
            if (!replayMode) return;
            ClearReplayMarkers();
            currentSectorId = "setor-01";
            snapshot = state;
            if (dataCenter != null) dataCenter.ShowReplayInfrastructure(state);
            if (state == null) { ShowReplayUnavailable(); return; }
            var list = root.Q<ScrollView>("project-list");
            list.Clear();
            foreach (var project in state.projects)
            {
                var entry = project;
                list.Add(new Button(() => SelectProject(entry.projectId)) { text = project.name, tooltip = project.name, userData = project.projectId });
            }
            if (state.projects.Length == 0) selectedProjectId = null;
            else if (Array.Find(state.projects, item => item.projectId == selectedProjectId) == null) selectedProjectId = state.projects[0].projectId;
            sector.ApplyOverviewPlacements(state.roomPlacements);
            BuildReplayMarkers(state);
            RefreshProject();
            RefreshResources();
        }

        private void ShowReplayUnavailable()
        {
            ShowEmpty();
            selectedResourceId = null;
            root.Q<ScrollView>("project-list").Clear();
            root.Q<ScrollView>("resource-list").Clear();
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
            SelectSectorForProject(projectId);
            RefreshProject();
            if (insideDataCenter) SetResourceFilter(true);
            if (insideRoom) FocusSelectedRoom();
            RefreshOverview();
        }

        private void SelectSectorForProject(string projectId)
        {
            var placement = Array.Find(snapshot?.roomPlacements ?? Array.Empty<LiveRoomPlacement>(), item => item.projectId == projectId);
            if (placement != null) currentSectorId = placement.sectorId;
            else if (snapshot?.roomPlacements != null &&
                     Array.Find(snapshot.roomPlacements, item => item.sectorId == currentSectorId) == null && snapshot.roomPlacements.Length > 0)
                currentSectorId = snapshot.roomPlacements[0].sectorId;
        }

        private void RefreshGlobalSearch()
        {
            var query = root.Q<TextField>("overview-search").value?.Trim() ?? "";
            var results = root.Q<ScrollView>("overview-search-results");
            results.Clear();
            results.style.display = query.Length == 0 ? DisplayStyle.None : DisplayStyle.Flex;
            if (query.Length == 0) return;
            foreach (var project in QuartelOverview.FindProjects(snapshot, query))
            {
                var entry = project;
                var placement = Array.Find(snapshot.roomPlacements, item => item.projectId == entry.projectId);
                results.Add(new Button(() => OpenOverviewProject(entry.projectId))
                {
                    text = $"{entry.name} · {placement?.sectorId} · {entry.projectId}",
                    tooltip = entry.projectId
                });
            }
            if (results.childCount == 0) results.Add(new Label("Nenhum projeto ativo encontrado."));
        }

        private void OpenOverviewProject(string projectId)
        {
            SelectProject(projectId);
            EnterRoom();
        }

        private void RefreshOverview()
        {
            if (replayMode) { SetOverviewVisible(); return; }
            var placements = snapshot?.roomPlacements;
            sector.ApplyOverviewPlacements(placements, currentSectorId);
            overview.Render(snapshot, HasCurrentData, selectedProjectId, currentSectorId);
            activityChart.Refresh(snapshot, currentSectorId, HasCurrentData);
            root.Q<Label>("overview-sector").text = currentSectorId.ToUpperInvariant().Replace("-", " ") + "   /   VISÃO DE OPERAÇÕES";
            RefreshGlobalSearch();
            var hasCards = root.Q("overview-cards").childCount > 0;
            root.Q("overview-empty").style.display = hasCards ? DisplayStyle.None : DisplayStyle.Flex;
            root.Q("overview-scroll").style.display = hasCards ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<Label>("overview-empty").text = snapshot == null
                ? client.ConnectionMessage : "Nenhum projeto vinculado neste setor.";
            root.Q<Label>("overview-service").text = IsPreview ? "Serviço local · fora da demonstração" :
                client.Connected ? "Serviço local · conectado" : "Serviço local · desconectado";
            root.Q<Label>("overview-source").text = QuartelOverview.SourceLabel(snapshot, client.Connected, replayMode);
            if (IsPreview)
            {
                root.Q("history-button").style.display = DisplayStyle.None;
                root.Q("command-button").style.display = DisplayStyle.None;
                root.Q("chat-interact").style.display = DisplayStyle.None;
                root.Q("chat-delete").style.display = DisplayStyle.None;
            }
            root.Q<Label>("demo-seal").text = IsPreview ? "DEMONSTRAÇÃO · DADOS ILUSTRATIVOS" :
                client.Connected ? "OBSERVAÇÃO LOCAL" : "SEM CONEXÃO";
            var key = sector.OverviewRoomsKey;
            if (key != overviewRoomsKey && AtOverview) FocusOverview();
            overviewRoomsKey = key;
            SetOverviewVisible();
        }

        private void SetOverviewVisible()
        {
            root.EnableInClassList("quartel-mode", AtOverview);
            if (AtOverview)
            {
                root.Q("project-panel").style.display = DisplayStyle.None;
                root.Q("summary-toggle").style.display = DisplayStyle.None;
            }
        }

        private void FocusOverview()
        {
            sector.GetOverviewBounds(out var center, out var width, out var depth);
            orbit.FocusOverview(center, width, depth);
        }

        private void RefreshProject()
        {
            GetComponent<CommandPresenter>()?.SelectProject(selectedProjectId);
            if (snapshot == null) { ShowEmpty(); return; }
            sector.ApplyOverviewPlacements(snapshot.roomPlacements, currentSectorId);
            var project = Array.Find(snapshot.projects, item => item.projectId == selectedProjectId);
            if (project == null) { ShowEmpty(); return; }
            root.Q<Label>("project-name").text = project.name;
            navigation.SetSelectedProject(project.projectId);
            navigation.SetView(insideRoom, project.name);
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
            var agentEntries = new List<AgentEntry>();
            var projection = AgentProjection.ForProject(snapshot, project.projectId, HasCurrentData);
            foreach (var agent in projection)
            {
                if (agent.Ended) continue;
                if (agent.Uncertain) uncertainAgents++;
                else if (agent.Presence == "observada" || agent.Presence == "trabalhando" || agent.Presence == "aguardando")
                {
                    presentAgents++;
                    if (agent.Presence == "trabalhando") workingAgents++;
                }
                agentEntries.Add(new AgentEntry(agent.AgentKey, agent.Label, agent.Detail));
            }
            navigation.SetAgents(agentEntries);
            var selectedAgent = projection.Find(item => item.AgentKey == navigation.SelectedAgentKey);
            UpdateAgentProfileControls(selectedAgent);
            ShowSessionSource(selectedAgent);
            chat?.SetTarget(project.projectId, selectedAgent?.SessionKey, selectedAgent?.AgentKey);
            logs?.SetTarget(snapshot, project.projectId, selectedAgent?.SessionKey, selectedAgent?.AgentKey);
            var placement = PlacementFor(project.projectId);
            var reference = placement != null && sector.Rooms.TryGetValue(placement.slotId, out var target) && target != null &&
                target.GetComponentInChildren<ReferenceRoomView>() != null ? target : null;
            agentPresenter.Show(reference, projection, navigation.SelectedAgentKey);
            if (agentPresenter.OverflowCount > 0)
                root.Q<Label>("agent-tree").text = "+" + agentPresenter.OverflowCount + " agentes agrupados · lista completa abaixo";
            string status = !HasCurrentData ? "Sem dados · conexão perdida" : SessionStatus(sessions);
            var statusLabel = root.Q<Label>("status");
            statusLabel.text = (status == "Trabalhando" ? "● " : status == "Aguardando" ? "○ " : "◇ ") + status;
            statusLabel.EnableInClassList("status-attention", status == "Fonte indisponível");
            statusLabel.EnableInClassList("status-inactive", (!HasCurrentData) || sessions.Count == 0);
            statusLabel.EnableInClassList("status-waiting", status == "Aguardando");
            root.Q<Label>("provider").text = providers.Count == 0 ? "Sem sessão" : providers.Count > 1 ? "Ambos" : providers.Contains("codex") ? "Codex" : "Claude";
            root.Q<Label>("agents").text = $"{presentAgents} agentes presentes · {workingAgents} trabalhando" +
                (uncertainAgents > 0 ? $" · {uncertainAgents} incertos" : "");
            bool hasActivity = false;
            if (snapshot.tasks != null) foreach (var task in snapshot.tasks)
                if (task != null && sessionKeys.Contains(task.sessionKey)) { hasActivity = true; break; }
            if (!hasActivity && snapshot.invocations != null) foreach (var invocation in snapshot.invocations)
                if (invocation != null && sessionKeys.Contains(invocation.sessionKey)) { hasActivity = true; break; }
            root.Q<Label>("activity").text = !HasCurrentData
                ? "Conexão perdida. O último snapshot não confirma atividade atual."
                : hasActivity
                    ? "Sessões e atividade observadas. Selecione um agente para ver tarefa, ferramenta e skill vinculadas."
                    : "Sessões observadas. Tarefa, ferramenta e skill sem evidência vinculada.";
            if (agentPresenter.OverflowCount == 0)
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
            root.Q<Label>("infrastructure-alert").EnableInClassList("status-attention", incidents > 0 && (HasCurrentData));
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
            return Array.Find(snapshot.roomPlacements, item => item.projectId == projectId && item.sectorId == currentSectorId &&
                sector.Rooms.TryGetValue(item.slotId, out var room) && room != null);
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
            var project = Array.Find(snapshot.projects, item => item.projectId == selectedProjectId);
            navigation.SetView(true, project?.name);
            root.Q<Button>("back-button").style.display = DisplayStyle.Flex;
            root.Q<Button>("enter-button").style.display = DisplayStyle.None;
            navigation.SetSummaryCollapsed(false);
            root.EnableInClassList("overview-tools-open", false);
            SetOverviewVisible();
        }

        private void ReturnToSector()
        {
            insideRoom = false;
            insideDataCenter = false;
            navigation.SetSummaryCollapsed(false);
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.None;
            root.Q<Label>("view-title").text = "Salas observadas e núcleo central";
            root.Q<Button>("back-button").style.display = DisplayStyle.None;
            root.Q<Button>("enter-button").style.display = DisplayStyle.Flex;
            if (AtOverview) FocusOverview();
            else orbit.ResetView();
            navigation.SetView(false, null);
            root.EnableInClassList("overview-tools-open", false);
            SetOverviewVisible();
        }

        private void ShowDataCenter()
        {
            insideRoom = false;
            insideDataCenter = true;
            orbit.FocusCore();
            root.Q<VisualElement>("project-panel").style.display = DisplayStyle.None;
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.Flex;
            navigation.SetView(false, null);
            root.EnableInClassList("overview-tools-open", false);
            SetOverviewVisible();
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
            if (operations != null) operations.SetResourceScope(resource.environmentId, resource.resourceId);
            var state = StateFor(resourceId);
            root.Q<Label>("resource-name").text = resource.name;
            var status = root.Q<Label>("resource-status");
            status.text = HealthText(state);
            status.EnableInClassList("status-attention", (HasCurrentData) && (state?.health == "degradado" || state?.health == "indisponivel"));
            status.EnableInClassList("status-inactive", (!HasCurrentData) || state == null || state.health == "sem_dados");
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
            if (!HasCurrentData) return "Sem dados · conexão perdida";
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
            Vector2 point = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(screenPosition.x, Screen.height - screenPosition.y));
            var picked = root.panel.Pick(point);
            for (var element = picked; element != null; element = element.parent)
                if (element.name == "header" || element.name == "project-panel" || element.name == "resource-panel" ||
                    element.name == "overview-heading" || element.name == "overview-dock" || element.name == "overview-actions" ||
                    element.name == "control-panel" || element.name == "summary-toggle" || element.name == "evidence-detail" ||
                    element.name == "history-panel" || element.name == "history-mask" || element.name == "operations-panel" ||
                    element.name == "operations-mask" || element.name == "command-panel" || element.name == "command-mask") return true;
            return Contains("header", point) || Contains("project-panel", point) || Contains("resource-panel", point) ||
                (AtOverview && (Contains("overview-heading", point) || Contains("overview-dock", point) || Contains("overview-actions", point))) || Contains("control-panel", point) ||
                Contains("summary-toggle", point) || Contains("evidence-detail", point) ||
                Contains("history-panel", point) || Contains("history-mask", point) ||
                Contains("operations-panel", point) || Contains("operations-mask", point) ||
                Contains("command-panel", point) || Contains("command-mask", point);
        }

#if DEVELOPMENT_BUILD && !UNITY_EDITOR
        public string PointerDiagnostic(Vector2 screenPosition)
        {
            if (root == null || root.panel == null) return "panel=unavailable";
            var point = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(screenPosition.x, Screen.height - screenPosition.y));
            var panel = root.Q<VisualElement>("project-panel");
            return $"panelPoint={point} projectBound={panel?.worldBound.ToString() ?? "null"} " +
                $"projectDisplay={panel?.resolvedStyle.display.ToString() ?? "null"} picked={root.panel.Pick(point)?.name ?? "null"}";
        }
#endif

        private void Update()
        {
            if (root == null) return;
            if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame)
            {
                if (GetComponent<CommandPresenter>()?.HandleEscape() == true) return;
                if (GetComponent<HistoryHudPresenter>()?.HandleEscape() == true) return;
                if (operations?.HandleEscape() == true) return;
                if (navigation.HandleEscape()) return;
            }
            if (insideRoom && Mouse.current != null && Mouse.current.leftButton.wasPressedThisFrame &&
                !IsPointerOverHud(Mouse.current.position.ReadValue()) &&
                agentPresenter.TryPick(Camera.main, Mouse.current.position.ReadValue(), out var picked))
            { navigation.SelectAgent(picked); return; }
            if (insideRoom || insideDataCenter || snapshot == null) return;
            if (!RoomSceneSelection.TryPickSlot(Camera.main, sector, this, out var slotId)) return;
            foreach (var placement in snapshot.roomPlacements)
                if (placement.slotId == slotId && placement.sectorId == currentSectorId)
                {
                    if (AtOverview) OpenOverviewProject(placement.projectId);
                    else SelectProject(placement.projectId);
                    break;
                }
        }

        private void OnAgentSelected(string key)
        {
            if (agentPresenter == null) return;
            var projection = AgentProjection.ForProject(snapshot, selectedProjectId, HasCurrentData);
            agentPresenter.Show(AgentPresenterRoom(), projection, key);
            var selected = projection.Find(item => item.AgentKey == key);
            UpdateAgentProfileControls(selected);
            ShowSessionSource(selected);
            chat?.SetTarget(selectedProjectId, selected?.SessionKey, selected?.AgentKey);
            logs?.SetTarget(snapshot, selectedProjectId, selected?.SessionKey, selected?.AgentKey);
            if (insideRoom)
            {
                var target = agentPresenter.FindAgent(key);
                if (target != null) orbit.FocusAgent(target);
            }
        }

        private void UpdateAgentProfileControls(AgentProjectionRecord selected)
        {
            var panel = root.Q<VisualElement>("agent-profile");
            panel.style.display = selected == null ? DisplayStyle.None : DisplayStyle.Flex;
            if (selected == null) { profileKey = null; profileDirty = false; return; }
            var key = selectedProjectId + "\0" + selected.SessionKey + "\0" + selected.AgentKey;
            if (profileKey != key) { profileKey = key; profileDirty = false; }
            var profile = AgentLocalProfile.Load(selectedProjectId, selected.SessionKey, selected.AgentKey);
            root.Q<Label>("agent-profile-origin").text = "Rótulo: " + selected.LabelOrigin +
                " · preferência guardada somente neste computador";
            if (!profileDirty)
            {
                root.Q<TextField>("agent-alias").SetValueWithoutNotify(profile.alias);
                root.Q<DropdownField>("agent-style").SetValueWithoutNotify(AgentLocalProfile.Styles[profile.style]);
            }
        }

        private void SaveAgentProfile()
        {
            var selected = SelectedAgentForProfile();
            if (selected == null) return;
            var style = root.Q<DropdownField>("agent-style");
            AgentLocalProfile.Save(selectedProjectId, selected.SessionKey, selected.AgentKey,
                root.Q<TextField>("agent-alias").value, Mathf.Max(0, style.index));
            profileDirty = false;
            RefreshProject();
        }

        private void ClearAgentProfile()
        {
            var selected = SelectedAgentForProfile();
            if (selected == null) return;
            AgentLocalProfile.Clear(selectedProjectId, selected.SessionKey, selected.AgentKey);
            profileDirty = false;
            RefreshProject();
        }

        private AgentProjectionRecord SelectedAgentForProfile()
        {
            if (snapshot == null || string.IsNullOrEmpty(selectedProjectId) || navigation == null) return null;
            return AgentProjection.ForProject(snapshot, selectedProjectId, HasCurrentData)
                .Find(item => item.AgentKey == navigation.SelectedAgentKey && !item.Ended);
        }

        private void ShowSessionSource(AgentProjectionRecord agent)
        {
            var label = root.Q<Label>("source-session-status");
            if (agent == null || snapshot?.sessions == null)
            {
                label.text = "Selecione um agente para consultar a fonte da sessão.";
                return;
            }
            var session = Array.Find(snapshot.sessions, item => item.sessionKey == agent.SessionKey);
            if (session == null || string.IsNullOrEmpty(session.sourceId))
            {
                label.text = "Fonte da sessão não informada; estado atual não verificável.";
                return;
            }
            var source = snapshot.sources == null ? null : Array.Find(snapshot.sources, item => item.sourceId == session.sourceId);
            var sourceState = source?.status == "indisponivel" ? "Fonte indisponível" :
                source?.status == "atual" ? "Fonte ativa" : "Estado da fonte não informado";
            var sessionState = agent.Uncertain ? "Sessão sem confirmação; nenhuma atividade atual inferida." :
                "Sessão confirmada pelo último sinal observado.";
            label.text = sourceState + " · " + session.sourceId + "\n" + sessionState;
        }

#if DEVELOPMENT_BUILD || UNITY_EDITOR
        public string SelectedAgentKeyForValidation => navigation?.SelectedAgentKey;
        private void SelectProjectForValidation(string projectId) => SelectProject(projectId);
        private void SelectAgentForValidation(string key) => navigation?.SelectAgent(key);
        private void OpenEvidenceForValidation() => navigation?.OpenEvidence();
        private void OpenChatForValidation() => navigation?.SelectTab(1);
        private void OpenLogsForValidation() => navigation?.SelectTab(2);
        private void CloseEvidenceForValidation() => navigation?.CloseEvidence();
#endif

        private Transform AgentPresenterRoom()
        {
            if (snapshot == null || selectedProjectId == null) return null;
            var placement = PlacementFor(selectedProjectId);
            return placement != null && sector.Rooms.TryGetValue(placement.slotId, out var target) && target != null &&
                target.GetComponentInChildren<ReferenceRoomView>() != null ? target : null;
        }

        private bool Contains(string name, Vector2 point)
        {
            var element = root.Q<VisualElement>(name);
            return element != null && element.resolvedStyle.display != DisplayStyle.None && element.worldBound.Contains(point);
        }
    }
}

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

        private void Start()
        {
            root = document.rootVisualElement;
            if (styleSheet != null) root.styleSheets.Add(styleSheet);
            orbit.SetHud(this);
            dataCenter = sector.GetComponentInChildren<DataCenterBuilder>();
            dataCenter.UseNeutralIndicators();
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
            navigation = new ReferenceRoomNavigation(root, ReturnToSector);
            navigation.AgentSelected += OnAgentSelected;
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
            if (dataCenter != null) dataCenter.ClearReplayInfrastructure();
            if (replayActiveMaterial != null) Destroy(replayActiveMaterial);
            if (replayUnknownMaterial != null) Destroy(replayUnknownMaterial);
            if (navigation != null) navigation.AgentSelected -= OnAgentSelected;
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
            navigation.SetAgents(Array.Empty<AgentEntry>());
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
                var button = new Button(() => SelectProject(entry.projectId)) { text = project.name, tooltip = project.name, userData = project.projectId };
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
            if (chat != null) chat.SetReplayMode(active);
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
            }
        }

        private void RenderReplayState(LiveSnapshot state)
        {
            if (!replayMode) return;
            ClearReplayMarkers();
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
            RefreshProject();
            if (insideDataCenter) SetResourceFilter(true);
            if (insideRoom) FocusSelectedRoom();
        }

        private void RefreshProject()
        {
            GetComponent<CommandPresenter>()?.SelectProject(selectedProjectId);
            if (snapshot == null) { ShowEmpty(); return; }
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
            var projection = AgentProjection.ForProject(snapshot, project.projectId, replayMode || client.Connected);
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
            chat?.SetTarget(project.projectId, selectedAgent?.SessionKey, selectedAgent?.AgentKey);
            var placement = PlacementFor(project.projectId);
            var reference = placement != null && sector.Rooms.TryGetValue(placement.slotId, out var target) && target != null &&
                target.GetComponentInChildren<ReferenceRoomView>() != null ? target : null;
            agentPresenter.Show(reference, projection, navigation.SelectedAgentKey);
            if (agentPresenter.OverflowCount > 0)
                root.Q<Label>("agent-tree").text = "+" + agentPresenter.OverflowCount + " agentes agrupados · lista completa abaixo";
            string status = !replayMode && !client.Connected ? "Sem dados · conexão perdida" : SessionStatus(sessions);
            var statusLabel = root.Q<Label>("status");
            statusLabel.text = (status == "Trabalhando" ? "● " : status == "Aguardando" ? "○ " : "◇ ") + status;
            statusLabel.EnableInClassList("status-attention", status == "Fonte indisponível");
            statusLabel.EnableInClassList("status-inactive", (!replayMode && !client.Connected) || sessions.Count == 0);
            statusLabel.EnableInClassList("status-waiting", status == "Aguardando");
            root.Q<Label>("provider").text = providers.Count == 0 ? "Sem sessão" : providers.Count > 1 ? "Ambos" : providers.Contains("codex") ? "Codex" : "Claude";
            root.Q<Label>("agents").text = $"{presentAgents} agentes presentes · {workingAgents} trabalhando" +
                (uncertainAgents > 0 ? $" · {uncertainAgents} incertos" : "");
            bool hasActivity = false;
            if (snapshot.tasks != null) foreach (var task in snapshot.tasks)
                if (task != null && sessionKeys.Contains(task.sessionKey)) { hasActivity = true; break; }
            if (!hasActivity && snapshot.invocations != null) foreach (var invocation in snapshot.invocations)
                if (invocation != null && sessionKeys.Contains(invocation.sessionKey)) { hasActivity = true; break; }
            root.Q<Label>("activity").text = !replayMode && !client.Connected
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
            root.Q<Label>("infrastructure-alert").EnableInClassList("status-attention", incidents > 0 && (replayMode || client.Connected));
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
            return Array.Find(snapshot.roomPlacements, item => item.projectId == projectId && item.sectorId == "setor-01" &&
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
            orbit.ResetView();
            navigation.SetView(false, null);
        }

        private void ShowDataCenter()
        {
            insideRoom = false;
            insideDataCenter = true;
            orbit.FocusCore();
            root.Q<VisualElement>("project-panel").style.display = DisplayStyle.None;
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.Flex;
            navigation.SetView(false, null);
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
            status.EnableInClassList("status-attention", (replayMode || client.Connected) && (state?.health == "degradado" || state?.health == "indisponivel"));
            status.EnableInClassList("status-inactive", (!replayMode && !client.Connected) || state == null || state.health == "sem_dados");
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
            if (!replayMode && !client.Connected) return "Sem dados · conexão perdida";
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
                Contains("summary-toggle", point) || Contains("evidence-detail", point) ||
                Contains("history-panel", point) || Contains("history-mask", point) ||
                Contains("operations-panel", point) || Contains("operations-mask", point) ||
                Contains("command-panel", point) || Contains("command-mask", point);
        }

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
                if (placement.slotId == slotId && placement.sectorId == "setor-01") { SelectProject(placement.projectId); break; }
        }

        private void OnAgentSelected(string key)
        {
            if (agentPresenter == null) return;
            var projection = AgentProjection.ForProject(snapshot, selectedProjectId, replayMode || client.Connected);
            agentPresenter.Show(AgentPresenterRoom(), projection, key);
            var selected = projection.Find(item => item.AgentKey == key);
            chat?.SetTarget(selectedProjectId, selected?.SessionKey, selected?.AgentKey);
            if (insideRoom)
            {
                var target = agentPresenter.FindAgent(key);
                if (target != null) orbit.FocusAgent(target);
            }
        }

#if DEVELOPMENT_BUILD && !UNITY_EDITOR
        public string SelectedAgentKeyForValidation => navigation?.SelectedAgentKey;
        private void SelectProjectForValidation(string projectId) => SelectProject(projectId);
        private void SelectAgentForValidation(string key) => navigation?.SelectAgent(key);
        private void OpenEvidenceForValidation() => navigation?.OpenEvidence();
        private void OpenChatForValidation() => navigation?.SelectTab(1);
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

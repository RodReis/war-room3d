using System;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class HudPresenter : MonoBehaviour, IHudPointerArea
    {
        [SerializeField] private UIDocument document;
        [SerializeField] private StyleSheet styleSheet;
        [SerializeField] private DemoLoader loader;
        [SerializeField] private InfrastructureDemoLoader infrastructureLoader;
        [SerializeField] private SectorBuilder sector;
        [SerializeField] private OrbitCamera orbit;
        private VisualElement root;
        private DemoProject selected;
        private bool insideRoom;
        private bool insideDataCenter;
        private bool projectResourceFilter;
        private ReferenceRoomNavigation navigation;

        private void Start()
        {
            root = document.rootVisualElement;
            if (styleSheet != null) root.styleSheets.Add(styleSheet);
            orbit.SetHud(this);
            root.Q<Label>("demo-seal").text = "CONCEITO · DADOS ILUSTRATIVOS";
            root.Q<Button>("enter-button").clicked += EnterRoom;
            root.Q<Button>("back-button").clicked += ReturnToSector;
            root.Q<Button>("reset-button").clicked += () => { if (insideDataCenter) orbit.FocusCore(); else if (insideRoom) orbit.FocusRoom(sector.Rooms[selected.slotId]); else orbit.ResetView(); };
            root.Q<Button>("angle-button").clicked += () => orbit.Orbit(180f, 0);
            root.Q<Button>("center-button").clicked += ShowDataCenter;
            root.Q<Button>("resource-back-button").clicked += ReturnToSector;
            root.Q<Button>("resource-all-button").clicked += () => SetResourceFilter(false);
            root.Q<Button>("resource-project-button").clicked += () => SetResourceFilter(true);
            navigation = new ReferenceRoomNavigation(root, ReturnToSector);
            if (loader.Snapshot == null)
            {
                root.Q<Label>("project-name").text = "Falha ao carregar demonstração";
                root.Q<Label>("activity").text = loader.Error ?? "Fixture indisponível";
                root.Q<Button>("enter-button").SetEnabled(false);
                return;
            }
            var list = root.Q<VisualElement>("project-list");
            foreach (var project in loader.Snapshot.projects)
            {
                var entry = project;
                var button = new Button(() => Select(entry)) { text = project.name, tooltip = project.name, userData = project.projectId };
                button.AddToClassList("project-button");
                list.Add(button);
            }
            foreach (var project in loader.Snapshot.projects)
                if (project.projectId == loader.Snapshot.selectedProjectId) { Select(project); break; }
            ReturnToSector();
        }

        private void Select(DemoProject project)
        {
            selected = project;
            navigation.SetSelectedProject(project.projectId);
            root.Q<Label>("project-name").text = project.name;
            root.Q<Label>("provider").text = project.provider;
            root.Q<Label>("agents").text = $"{project.activeAgents} agentes ilustrativos";
            var statusLabel = root.Q<Label>("status");
            statusLabel.text = StatusText(project.status);
            statusLabel.EnableInClassList("status-attention", project.status == "atencao");
            statusLabel.EnableInClassList("status-inactive", project.status == "inativo");
            statusLabel.EnableInClassList("status-waiting", project.status == "aguardando");
            root.Q<Label>("activity").text = project.activity;
            root.Q<Label>("agent-tree").text = AgentTree(project.activeAgents);
            navigation.SetAgents(ReferenceRoomDemoAgents.ForProject(project));
            root.Q<Label>("feed").text = $"09:41 · {project.activity}\n09:37 · {StatusText(project.status)}";
            bool incident = false;
            var infrastructure = infrastructureLoader != null ? infrastructureLoader.Snapshot : null;
            if (infrastructure != null)
                foreach (var item in infrastructure.incidents)
                    if (Array.IndexOf(item.projectIds, project.projectId) >= 0) { incident = true; break; }
            root.Q<Label>("infrastructure-alert").text = incident ? "Impacto potencial de infraestrutura · exemplo" : "Sem incidente vinculado neste exemplo";
            root.Q<Label>("infrastructure-alert").EnableInClassList("status-attention", incident);
            root.Q<Label>("breadcrumb").text = insideRoom ? $"Quartel-general / {project.name}" : "Quartel-general / Setor 01";
            navigation.SetView(insideRoom, project.name);
            if (insideRoom) orbit.FocusRoom(sector.Rooms[project.slotId]);
        }

        private void EnterRoom()
        {
            if (selected == null) return;
            insideRoom = true;
            insideDataCenter = false;
            orbit.FocusRoom(sector.Rooms[selected.slotId]);
            root.Q<Label>("breadcrumb").text = $"Quartel-general / {selected.name}";
            root.Q<Button>("back-button").style.display = DisplayStyle.Flex;
            root.Q<Button>("enter-button").style.display = DisplayStyle.None;
            root.Q<Label>("view-title").text = "Interior da sala";
            navigation.SetView(true, selected.name);
        }

        private void ReturnToSector()
        {
            insideRoom = false;
            insideDataCenter = false;
            navigation.SetSummaryCollapsed(false);
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.None;
            orbit.ResetView();
            root.Q<Label>("breadcrumb").text = "Quartel-general / Setor 01";
            root.Q<Button>("back-button").style.display = DisplayStyle.None;
            root.Q<Button>("enter-button").style.display = DisplayStyle.Flex;
            root.Q<Label>("view-title").text = "Seis salas e núcleo central";
            navigation.SetView(false, selected?.name);
        }

        private void ShowDataCenter()
        {
            insideRoom = false;
            insideDataCenter = true;
            orbit.FocusCore();
            root.Q<VisualElement>("project-panel").style.display = DisplayStyle.None;
            root.Q<VisualElement>("resource-panel").style.display = DisplayStyle.Flex;
            navigation.SetView(false, selected?.name);
            SetResourceFilter(selected != null);
        }

        private void SetResourceFilter(bool forProject)
        {
            projectResourceFilter = forProject;
            var list = root.Q<VisualElement>("resource-list");
            list.Clear();
            var infrastructure = infrastructureLoader != null ? infrastructureLoader.Snapshot : null;
            if (infrastructure == null)
            {
                root.Q<Label>("resource-name").text = "Demonstração indisponível";
                root.Q<Label>("resource-detail").text = infrastructureLoader != null ? infrastructureLoader.Error : "Fixture M2 ausente";
                return;
            }
            DemoInfrastructureResource first = null;
            foreach (var resource in infrastructure.resources)
            {
                if (projectResourceFilter && selected != null && Array.IndexOf(resource.dependentProjectIds, selected.projectId) < 0) continue;
                var entry = resource;
                var button = new Button(() => SelectResource(entry)) { text = $"{resource.name} · {HealthText(resource.health)}" };
                button.AddToClassList("project-button");
                list.Add(button);
                if (first == null) first = resource;
            }
            root.Q<Label>("resource-filter").text = forProject && selected != null ? $"Filtro: {selected.name}" : "Filtro: todos os recursos";
            if (first != null) SelectResource(first);
            else
            {
                root.Q<Label>("resource-name").text = "Nenhum recurso vinculado";
                var status = root.Q<Label>("resource-status");
                status.text = "Sem dados · exemplo";
                status.EnableInClassList("status-attention", false);
                status.EnableInClassList("status-inactive", true);
                root.Q<Label>("resource-detail").text = "Inventário ilustrativo sem vínculo para esta sala.";
            }
        }

        private void SelectResource(DemoInfrastructureResource resource)
        {
            root.Q<Label>("resource-name").text = resource.name;
            root.Q<Label>("resource-status").text = HealthText(resource.health);
            root.Q<Label>("resource-status").EnableInClassList("status-attention", resource.health == "degradado" || resource.health == "indisponivel");
            root.Q<Label>("resource-status").EnableInClassList("status-inactive", resource.health == "sem_dados");
            var projectNames = new string[resource.dependentProjectIds.Length];
            for (int i = 0; i < projectNames.Length; i++)
            {
                string projectId = resource.dependentProjectIds[i];
                var project = loader.Snapshot != null ? Array.Find(loader.Snapshot.projects, item => item.projectId == projectId) : null;
                projectNames[i] = project != null ? project.name : projectId;
            }
            root.Q<Label>("resource-detail").text = $"Tipo: {resource.kind}  ·  Ambiente: {resource.environmentId}\n" +
                $"Indicador: {(resource.hasValue ? $"{resource.indicator} = {resource.value:0.##} {resource.unit}" : "não disponível")}\n" +
                $"Frescor: {resource.freshness}  ·  Cobertura: {resource.coverage}\n" +
                $"Fonte: {resource.sourceId}\nObservado: {(string.IsNullOrEmpty(resource.observedAt) ? "nunca" : resource.observedAt)}\n" +
                $"Evidência: {(string.IsNullOrEmpty(resource.evidenceRef) ? "não disponível" : resource.evidenceRef)}\n" +
                $"Projetos dependentes: {(projectNames.Length == 0 ? "nenhum" : string.Join(", ", projectNames))}";
        }

        private static string HealthText(string health)
        {
            switch (health)
            {
                case "saudavel": return "Saudável · exemplo";
                case "degradado": return "Degradado · exemplo";
                case "indisponivel": return "Indisponível · exemplo";
                default: return "Sem dados · exemplo";
            }
        }

        public bool IsPointerOverHud(Vector2 screenPosition)
        {
            if (root == null || root.panel == null) return false;
            Vector2 point = RuntimePanelUtils.ScreenToPanel(root.panel, screenPosition);
            return Contains("header", point) || Contains("project-panel", point) || Contains("resource-panel", point) || Contains("control-panel", point) ||
                Contains("summary-toggle", point) || Contains("evidence-detail", point) || Contains("history-panel", point) || Contains("history-mask", point);
        }

        private void Update()
        {
            if (root == null) return;
            if (Keyboard.current != null && Keyboard.current.escapeKey.wasPressedThisFrame &&
                root.Q<VisualElement>("history-panel").resolvedStyle.display == DisplayStyle.None) navigation.HandleEscape();
            if (insideRoom || insideDataCenter || loader.Snapshot == null) return;
            if (!RoomSceneSelection.TryPickSlot(Camera.main, sector, this, out var slotId)) return;
            foreach (var project in loader.Snapshot.projects)
                if (project.slotId == slotId) { Select(project); break; }
        }

        private bool Contains(string name, Vector2 point)
        {
            var element = root.Q<VisualElement>(name);
            return element != null && element.resolvedStyle.display != DisplayStyle.None && element.worldBound.Contains(point);
        }

        private static string StatusText(string status)
        {
            switch (status)
            {
                case "trabalhando": return "● Trabalhando · exemplo";
                case "aguardando": return "○ Aguardando · exemplo";
                case "atencao": return "! Atenção · exemplo";
                default: return "◇ Sem dados · exemplo";
            }
        }

        private static string AgentTree(int count)
        {
            if (count == 0) return "Nenhum agente neste exemplo";
            var lines = new string[count];
            for (int i = 0; i < count; i++) lines[i] = $"└ Agente {i + 1} · exemplo";
            return string.Join("\n", lines);
        }
    }
}

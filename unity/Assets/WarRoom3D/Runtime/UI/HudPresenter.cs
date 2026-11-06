using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class HudPresenter : MonoBehaviour
    {
        [SerializeField] private UIDocument document;
        [SerializeField] private StyleSheet styleSheet;
        [SerializeField] private DemoLoader loader;
        [SerializeField] private SectorBuilder sector;
        [SerializeField] private OrbitCamera orbit;
        private VisualElement root;
        private DemoProject selected;
        private bool insideRoom;

        private void Start()
        {
            root = document.rootVisualElement;
            if (styleSheet != null) root.styleSheets.Add(styleSheet);
            orbit.SetHud(this);
            root.Q<Label>("demo-seal").text = "CONCEITO · DADOS ILUSTRATIVOS";
            root.Q<Button>("enter-button").clicked += EnterRoom;
            root.Q<Button>("back-button").clicked += ReturnToSector;
            root.Q<Button>("reset-button").clicked += () => { if (insideRoom) orbit.FocusRoom(sector.Rooms[selected.slotId]); else orbit.ResetView(); };
            root.Q<Button>("angle-button").clicked += () => orbit.Orbit(180f, 0);
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
                var button = new Button(() => Select(entry)) { text = project.name };
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
            root.Q<Label>("feed").text = $"09:41 · {project.activity}\n09:37 · {StatusText(project.status)}";
            root.Q<Label>("breadcrumb").text = insideRoom ? $"Quartel-general / {project.name}" : "Quartel-general / Setor 01";
            if (insideRoom) orbit.FocusRoom(sector.Rooms[project.slotId]);
        }

        private void EnterRoom()
        {
            if (selected == null) return;
            insideRoom = true;
            orbit.FocusRoom(sector.Rooms[selected.slotId]);
            root.Q<Label>("breadcrumb").text = $"Quartel-general / {selected.name}";
            root.Q<Button>("back-button").style.display = DisplayStyle.Flex;
            root.Q<Button>("enter-button").style.display = DisplayStyle.None;
            root.Q<Label>("view-title").text = "Interior da sala";
        }

        private void ReturnToSector()
        {
            insideRoom = false;
            orbit.ResetView();
            root.Q<Label>("breadcrumb").text = "Quartel-general / Setor 01";
            root.Q<Button>("back-button").style.display = DisplayStyle.None;
            root.Q<Button>("enter-button").style.display = DisplayStyle.Flex;
            root.Q<Label>("view-title").text = "Seis salas e núcleo central";
        }

        public bool IsPointerOverHud(Vector2 screenPosition)
        {
            if (root == null || root.panel == null) return false;
            Vector2 point = RuntimePanelUtils.ScreenToPanel(root.panel, screenPosition);
            return Contains("header", point) || Contains("project-panel", point) || Contains("control-panel", point);
        }

        private bool Contains(string name, Vector2 point)
        {
            var element = root.Q<VisualElement>(name);
            return element != null && element.worldBound.Contains(point);
        }

        private static string StatusText(string status)
        {
            switch (status)
            {
                case "trabalhando": return "Trabalhando · exemplo";
                case "aguardando": return "Aguardando · exemplo";
                case "atencao": return "Atenção · exemplo";
                default: return "Inativo · exemplo";
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

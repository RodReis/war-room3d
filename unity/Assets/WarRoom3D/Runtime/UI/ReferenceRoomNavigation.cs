using System;
using System.Collections.Generic;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // UI state only. The live presenter remains the source of project and session facts.
    public sealed class ReferenceRoomNavigation
    {
        private readonly VisualElement root;
        private readonly VisualElement panel;
        private readonly VisualElement detail;
        private readonly Button summaryToggle;
        private readonly Button expandToggle;
        private readonly Button[] tabs;
        private readonly VisualElement[] pages;
        private readonly Action returnToSector;
        private readonly Dictionary<string, Button> agentButtons = new Dictionary<string, Button>();
        private readonly Dictionary<string, string> agentDetails = new Dictionary<string, string>();
        private string selectedAgentKey;
        private int activeTab;
        private bool insideRoom;
        private bool collapsed;
        private bool expanded;

        public string SelectedAgentKey => selectedAgentKey;
        public event Action<string> AgentSelected;
        public bool DetailOpen => detail.style.display == DisplayStyle.Flex;

        public ReferenceRoomNavigation(VisualElement rootElement, Action onReturnToSector)
        {
            root = rootElement;
            returnToSector = onReturnToSector;
            panel = root.Q<VisualElement>("project-panel");
            detail = root.Q<VisualElement>("evidence-detail");
            summaryToggle = root.Q<Button>("summary-toggle");
            expandToggle = root.Q<Button>("expand-toggle");
            tabs = new[] { root.Q<Button>("tab-activity"), root.Q<Button>("tab-chat"), root.Q<Button>("tab-logs"), root.Q<Button>("tab-sources") };
            pages = new[] { root.Q<VisualElement>("page-activity"), root.Q<VisualElement>("page-chat"), root.Q<VisualElement>("page-logs"), root.Q<VisualElement>("page-sources") };
            summaryToggle.clicked += ToggleSummary;
            expandToggle.clicked += ToggleExpand;
            root.Q<Button>("evidence-open").clicked += OpenEvidence;
            root.Q<Button>("evidence-close").clicked += CloseEvidence;
            for (var i = 0; i < tabs.Length; i++)
            {
                var tab = i;
                tabs[i].clicked += () => SelectTab(tab);
            }
            SelectTab(0);
            SetView(false, null);
        }

        public void SetView(bool room, string projectName)
        {
            insideRoom = room;
            summaryToggle.style.display = root.Q<VisualElement>("resource-panel").style.display == DisplayStyle.Flex
                ? DisplayStyle.None : DisplayStyle.Flex;
            root.Q<Label>("breadcrumb").text = room ? "Quartel / Sala" : "Quartel / Setor 01";
            root.Q<Label>("room-label").text = room && !string.IsNullOrEmpty(projectName)
                ? "SALA · " + projectName : "SELECIONE UMA SALA";
            root.Q<VisualElement>("room-tabs").style.display = room ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<VisualElement>("agent-list-section").style.display = room ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<VisualElement>("room-summary").style.display = room ? DisplayStyle.None : DisplayStyle.Flex;
            root.Q<VisualElement>("room-content").style.display = room ? DisplayStyle.Flex : DisplayStyle.None;
            expandToggle.style.display = room && (activeTab == 1 || activeTab == 2) ? DisplayStyle.Flex : DisplayStyle.None;
            if (!room) { CloseEvidence(); SetExpanded(false); }
        }

        public void SelectTab(int index)
        {
            activeTab = index;
            for (var i = 0; i < tabs.Length; i++)
            {
                tabs[i].EnableInClassList("tab-selected", i == index);
                tabs[i].text = (i == index ? "● " : "○ ") + new[] { "Atividade", "Chat", "Logs", "Fontes" }[i];
                pages[i].style.display = i == index ? DisplayStyle.Flex : DisplayStyle.None;
            }
            expandToggle.style.display = insideRoom && (index == 1 || index == 2) ? DisplayStyle.Flex : DisplayStyle.None;
            panel.EnableInClassList("chat-active", index == 1);
            SetExpanded(index == 1);
            CloseEvidence();
        }

        public void SetAgents(IEnumerable<AgentEntry> entries)
        {
            agentButtons.Clear();
            agentDetails.Clear();
            var list = root.Q<VisualElement>("agent-list");
            list.Clear();
            var count = 0;
            foreach (var entry in entries)
            {
                if (string.IsNullOrEmpty(entry.Key) || agentButtons.ContainsKey(entry.Key)) continue;
                var agent = entry;
                var button = new Button(() => SelectAgent(agent.Key)) { name = "agent-" + count, text = agent.Label };
                button.AddToClassList("agent-button");
                button.tooltip = agent.Label;
                list.Add(button);
                agentButtons[agent.Key] = button;
                agentDetails[agent.Key] = agent.Detail;
                count++;
            }
            if (selectedAgentKey == null || !agentButtons.ContainsKey(selectedAgentKey)) selectedAgentKey = null;
            if (selectedAgentKey == null && count > 0)
                foreach (var key in agentButtons.Keys) { selectedAgentKey = key; break; }
            RefreshAgentSelection();
            root.Q<Label>("agent-empty").style.display = count == 0 ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public bool SelectAgent(string key)
        {
            if (!agentButtons.ContainsKey(key)) return false;
            selectedAgentKey = key;
            RefreshAgentSelection();
            SelectTab(0);
            AgentSelected?.Invoke(key);
            return true;
        }

        public void SetSelectedProject(string projectId)
        {
            var list = root.Q<ScrollView>("project-list");
            foreach (var item in list.contentContainer.Children())
            {
                if (!(item is Button button)) continue;
                var selected = (string)button.userData == projectId;
                button.EnableInClassList("project-selected", selected);
                button.text = (selected ? "▶ " : "  ") + button.tooltip;
            }
        }

        public bool HandleEscape()
        {
            if (DetailOpen) { CloseEvidence(); return true; }
            if (expanded) { SetExpanded(false); return true; }
            if (insideRoom) { returnToSector(); return true; }
            return false;
        }

        public void OpenEvidence()
        {
            detail.style.display = DisplayStyle.Flex;
            root.Q<Button>("evidence-close").Focus();
        }

        public void CloseEvidence()
        {
            detail.style.display = DisplayStyle.None;
        }

        private void RefreshAgentSelection()
        {
            foreach (var pair in agentButtons)
            {
                var selected = pair.Key == selectedAgentKey;
                pair.Value.EnableInClassList("agent-selected", selected);
                pair.Value.text = (selected ? "▶ " : "  ") + pair.Value.tooltip;
            }
            root.Q<Label>("selected-agent").text = selectedAgentKey == null ? "Selecione agente" :
                "Agente selecionado: " + agentButtons[selectedAgentKey].tooltip;
            root.Q<Label>("evidence-body").text = selectedAgentKey == null ? "○ Nenhum agente com evidência disponível." : agentDetails[selectedAgentKey];
        }

        private void ToggleSummary() => SetSummaryCollapsed(!collapsed);

        public void SetSummaryCollapsed(bool value)
        {
            collapsed = value;
            panel.style.display = collapsed ? DisplayStyle.None : DisplayStyle.Flex;
            summaryToggle.text = collapsed ? "Abrir resumo" : "Recolher resumo";
            summaryToggle.Focus();
        }

        private void ToggleExpand() => SetExpanded(!expanded);

        private void SetExpanded(bool value)
        {
            expanded = value;
            panel.EnableInClassList("panel-expanded", value);
            expandToggle.text = value ? "Reduzir painel" : "Ampliar leitura";
        }
    }

    public readonly struct AgentEntry
    {
        public readonly string Key;
        public readonly string Label;
        public readonly string Detail;
        public AgentEntry(string key, string label, string detail = "◇ Detalhe indisponível.")
        { Key = key; Label = label; Detail = detail; }
    }
}

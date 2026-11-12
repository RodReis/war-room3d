using NUnit.Framework;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class QuartelOverviewTests
    {
        [Test]
        public void ShowsTwoProjectsAndKeepsExistingCardOnUpdate()
        {
            var container = new VisualElement();
            var overview = new QuartelOverview(container, _ => { });
            var state = new LiveSnapshot
            {
                projects = new[]
                {
                    new LiveProject { projectId = "atlas", name = "Plataforma Atlas" },
                    new LiveProject { projectId = "orion", name = "Aplicativo Orion" }
                },
                roomPlacements = new[]
                {
                    new LiveRoomPlacement { projectId = "atlas", sectorId = "setor-01", slotId = "slot-01" },
                    new LiveRoomPlacement { projectId = "orion", sectorId = "setor-01", slotId = "slot-02" }
                },
                sessions = new[]
                {
                    new LiveSession { projectId = "atlas", sessionKey = "s1", presence = "trabalhando", freshness = "atual", lastSeen = "2026-11-09T20:00:00Z" },
                    new LiveSession { projectId = "orion", sessionKey = "s2", presence = "aguardando", freshness = "atual" }
                },
                agents = new[] { new LiveAgent { agentKey = "agent", sessionKey = "s1", presence = "trabalhando" } }
            };
            overview.Render(state, true, null);
            var atlas = container.Q<Button>("overview-card-slot-01");
            var orion = container.Q<Button>("overview-card-slot-02");
            Assert.That(atlas.Q<Label>("overview-project").text, Is.EqualTo("Plataforma Atlas"));
            Assert.That(atlas.Q<Label>("overview-agents").text, Is.EqualTo("1 agente trabalhando"));
            Assert.That(orion.Q<Label>("overview-status").text, Does.Contain("Aguardando"));
            Assert.That(orion.Q<Label>("overview-signal").text, Does.Contain("Sem sinal"));
            overview.Render(state, false, "orion");
            Assert.That(container.Q<Button>("overview-card-slot-01"), Is.SameAs(atlas));
            Assert.That(atlas.Q<Label>("overview-status").text, Does.Contain("Dados desatualizados"));
            Assert.That(atlas.Q<Label>("overview-agents").text, Is.EqualTo("Atividade sem confirmação"));
        }

        [Test]
        public void LocalServiceAloneNeverConfirmsRealSource()
        {
            Assert.That(QuartelOverview.SourceLabel(new LiveSnapshot(), true, false), Is.EqualTo("Fonte sem confirmação"));
            Assert.That(QuartelOverview.SourceLabel(new LiveSnapshot { mode = "demo" }, false, false), Is.EqualTo("Dados ilustrativos"));
            Assert.That(QuartelOverview.SourceLabel(new LiveSnapshot(), true, true), Is.EqualTo("Dados históricos"));
        }

        [Test]
        public void RecoveredProjectDoesNotKeepOldSessionSourceWarning()
        {
            var container = new VisualElement();
            var overview = new QuartelOverview(container, _ => { });
            var state = new LiveSnapshot
            {
                projects = new[] { new LiveProject { projectId = "forja", name = "ForjaOS" } },
                roomPlacements = new[]
                {
                    new LiveRoomPlacement { projectId = "forja", sectorId = "setor-01", slotId = "slot-01", status = "active" }
                },
                sessions = new[]
                {
                    new LiveSession { projectId = "forja", sessionKey = "antiga", presence = "desconhecida", freshness = "desatualizada" }
                },
                agents = new LiveAgent[0]
            };

            overview.Render(state, true, null);
            var card = container.Q<Button>("overview-card-slot-01");
            Assert.That(card.Q<Label>("overview-alert").text, Does.Contain("Verificar fonte"));
            state.sessions = new[]
            {
                state.sessions[0],
                new LiveSession { projectId = "forja", sessionKey = "nova", presence = "aguardando", freshness = "atual" }
            };
            overview.Render(state, true, null);
            Assert.That(card.Q<Label>("overview-status").text, Does.Contain("Aguardando"));
            Assert.That(card.Q<Label>("overview-alert").text, Is.EqualTo("Sem alertas observados"));
        }

        [Test]
        public void GlobalSearchFindsActiveProjectInSecondSectorAndKeepsHomonymsDistinct()
        {
            var state = new LiveSnapshot
            {
                projects = new[]
                {
                    new LiveProject { projectId = "api-a", name = "API" },
                    new LiveProject { projectId = "api-b", name = "API" },
                    new LiveProject { projectId = "inactive", name = "API" }
                },
                roomPlacements = new[]
                {
                    new LiveRoomPlacement { projectId = "api-a", sectorId = "setor-01", slotId = "slot-01", status = "active" },
                    new LiveRoomPlacement { projectId = "api-b", sectorId = "setor-02", slotId = "slot-01", status = "uncertain" }
                }
            };
            Assert.That(QuartelOverview.FindProjects(state, "api").ConvertAll(item => item.projectId),
                Is.EqualTo(new[] { "api-a", "api-b" }));
            Assert.That(QuartelOverview.FindProjects(state, "api-b").ConvertAll(item => item.projectId),
                Is.EqualTo(new[] { "api-b" }));
        }
    }
}

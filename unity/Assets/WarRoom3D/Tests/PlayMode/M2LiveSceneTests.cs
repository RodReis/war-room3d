using System.Collections;
using System.Text;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M2LiveSceneTests
    {
        private const string Snapshot = "{\"schemaVersion\":\"1.0\",\"mode\":\"live\",\"revision\":1,\"streamSequence\":4," +
            "\"projects\":[{\"projectId\":\"p1\",\"name\":\"Projeto sintético\"}]," +
            "\"roomPlacements\":[{\"projectId\":\"p1\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-01\"}]," +
            "\"sessions\":[],\"agents\":[],\"feed\":[]," +
            "\"resources\":[{\"resourceId\":\"r1\",\"environmentId\":\"lab\",\"kind\":\"database\",\"name\":\"Banco sintético\",\"sourceId\":\"s1\"}]," +
            "\"projectResources\":[{\"projectId\":\"p1\",\"resourceId\":\"r1\",\"origin\":\"configured\",\"confidence\":\"confirmed\"}]," +
            "\"resourceStates\":[{\"resourceId\":\"r1\",\"dependentProjectIds\":[\"p1\"],\"health\":\"degradado\",\"freshness\":\"atual\",\"coverage\":\"atual\",\"observedAt\":\"2026-11-06T16:00:00Z\"}]," +
            "\"incidents\":[{\"incidentId\":\"i1\",\"resourceId\":\"r1\",\"projectIds\":[\"p1\"]}]}";

        [UnityTest]
        public IEnumerator GlobalSearchFindsSeventhProjectAndShowsItsSecondSectorRoom()
        {
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var projects = new StringBuilder("[");
            var placements = new StringBuilder("[");
            for (var index = 1; index <= 7; index++)
            {
                if (index > 1) { projects.Append(','); placements.Append(','); }
                projects.Append($"{{\"projectId\":\"p{index}\",\"name\":\"API\"}}");
                placements.Append($"{{\"projectId\":\"p{index}\",\"sectorId\":\"setor-{(index <= 6 ? 1 : 2):00}\",\"slotId\":\"slot-{(index <= 6 ? index : 1):00}\",\"status\":\"active\"}}");
            }
            projects.Append(']');
            placements.Append(']');
            var data = Snapshot.Replace("\"projects\":[{\"projectId\":\"p1\",\"name\":\"Projeto sintético\"}]", "\"projects\":" + projects)
                .Replace("\"roomPlacements\":[{\"projectId\":\"p1\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-01\"}]", "\"roomPlacements\":" + placements);
            Object.FindAnyObjectByType<LiveStateClient>().AcceptSnapshot(data);
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            Assert.That(root.Q("overview-cards").childCount, Is.EqualTo(6));
            root.Q<TextField>("overview-search").value = "p7";
            var results = root.Q<ScrollView>("overview-search-results");
            Assert.That(results.contentContainer.childCount, Is.EqualTo(1));
            Assert.That(results.Q<Button>().text, Does.Contain("setor-02"));
            Object.FindAnyObjectByType<LiveHudPresenter>().SendMessage("SelectProjectForValidation", "p7");
            Assert.That(root.Q<Label>("overview-sector").text, Does.Contain("SETOR 02"));
            Assert.That(root.Q("overview-cards").childCount, Is.EqualTo(1));
            Assert.That(root.Q<Label>("overview-project").text, Is.EqualTo("API"));
        }

        [UnityTest]
        public IEnumerator LiveSceneHasNoDemoLoaderAndStartsUnknownWithoutService()
        {
            var oldUrl = System.Environment.GetEnvironmentVariable("WR3D_SERVICE_URL");
            var oldToken = System.Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN");
            System.Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", null);
            System.Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", null);
            try
            {
                SceneManager.LoadScene("QuartelM2Live");
                yield return null;
                yield return null;
                var client = Object.FindAnyObjectByType<LiveStateClient>();
                var hud = Object.FindAnyObjectByType<LiveHudPresenter>();
                var document = Object.FindAnyObjectByType<UIDocument>();
                Assert.That(client, Is.Not.Null);
                Assert.That(hud, Is.Not.Null);
                Assert.That(hud.IsPointerOverHud(new Vector2(40f, Screen.height - 35f)), Is.True,
                    "Cabeçalho deve bloquear input da câmera");
                Assert.That(hud.IsPointerOverHud(new Vector2(Screen.width - 40f, Screen.height * 0.5f)), Is.False,
                    "A vista geral deixa livre o espaço do painel recolhido");
                Assert.That(Object.FindAnyObjectByType<DemoLoader>(), Is.Null);
                Assert.That(Object.FindAnyObjectByType<InfrastructureDemoLoader>(), Is.Null);
                Assert.That(client.Snapshot, Is.Null);
                Assert.That(client.Connected, Is.False);
                Assert.That(document.rootVisualElement.Q<Label>("demo-seal").text, Does.Contain("SEM CONEXÃO"));
                Assert.That(document.rootVisualElement.Q<Label>("resource-status").text, Does.Contain("Sem dados"));
                Assert.That(document.rootVisualElement.Q<ScrollView>("project-list").contentContainer.childCount, Is.Zero);
            }
            finally
            {
                System.Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", oldUrl);
                System.Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", oldToken);
            }
        }

        [UnityTest]
        public IEnumerator LiveHudShowsSharedImpactAndLostCoverageWithoutAgents()
        {
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var client = Object.FindAnyObjectByType<LiveStateClient>();
            var hud = Object.FindAnyObjectByType<LiveHudPresenter>();
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            client.AcceptSnapshot(Snapshot);
            Assert.That(root.Q<Label>("demo-seal").text, Is.EqualTo("OBSERVAÇÃO LOCAL"));
            Assert.That(root.Q<Label>("overview-source").text, Is.EqualTo("Fonte sem confirmação"));
            Assert.That(root.Q<Button>("overview-card-slot-01").Q<Label>("overview-alert").text, Does.Contain("1 incidente"));
            Assert.That(root.Q<Label>("project-name").text, Is.EqualTo("Projeto sintético"));
            Assert.That(root.Q<Label>("agents").text, Does.Contain("0 agentes"));
            Assert.That(root.Q<Label>("infrastructure-alert").text, Does.Contain("Impacto potencial"));
            hud.SendMessage("ShowDataCenter");
            Assert.That(root.Q<ScrollView>("resource-list").contentContainer.childCount, Is.EqualTo(1));
            Assert.That(root.Q<Label>("resource-status").text, Is.EqualTo("Degradado"));
            client.AcceptSnapshot(Snapshot.Replace("\"coverage\":\"atual\"", "\"coverage\":\"perdida\""));
            Assert.That(root.Q<Label>("resource-status").text, Is.EqualTo("Sem dados"));
            var uncertain = Snapshot.Replace("\"sessions\":[],\"agents\":[]",
                "\"sessions\":[{\"sessionKey\":\"s1\",\"projectId\":\"p1\",\"provider\":\"codex\",\"sourceId\":\"source-codex\",\"presence\":\"desconhecida\",\"freshness\":\"desconhecido\",\"lastSeen\":\"2026-11-06T16:00:00Z\"}]," +
                "\"agents\":[{\"agentKey\":\"a1\",\"sessionKey\":\"s1\",\"presence\":\"desconhecida\",\"parentStatus\":\"principal\"}]")
                .Replace("\"feed\":[]", "\"sources\":[{\"sourceId\":\"source-codex\",\"status\":\"indisponivel\"}],\"feed\":[]")
                .Replace("\"coverage\":\"atual\"", "\"coverage\":\"perdida\"");
            client.AcceptSnapshot(uncertain);
            Assert.That(root.Q<Label>("agents").text, Does.Contain("0 agentes presentes"));
            Assert.That(root.Q<Label>("agents").text, Does.Contain("1 incertos"));
            Assert.That(root.Q<Label>("agent-tree").text, Does.Not.Contain("ativos"));
            Assert.That(root.Q<Label>("source-session-status").text, Does.Contain("Fonte indisponível"));
            client.AcceptSnapshot(uncertain.Replace("\"status\":\"indisponivel\"", "\"status\":\"atual\""));
            Assert.That(root.Q<Label>("source-session-status").text, Does.Contain("Fonte ativa"));
            Assert.That(root.Q<Label>("source-session-status").text, Does.Contain("Sessão sem confirmação"));
            Assert.Throws<System.ArgumentException>(() => client.AcceptSnapshot(Snapshot.Replace("\"mode\":\"live\"", "\"mode\":\"demo\"")));
            Assert.That(root.Q<Label>("resource-status").text, Is.EqualTo("Sem dados"));
        }
    }
}

using System.Collections;
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
                Assert.That(hud.IsPointerOverHud(new Vector2(Screen.width - 40f, Screen.height * 0.5f)), Is.True,
                    "Painel lateral live deve bloquear input da câmera");
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
            Assert.That(root.Q<Label>("demo-seal").text, Does.Contain("AO VIVO"));
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

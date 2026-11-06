using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M2SceneTests
    {
        [UnityTest]
        public IEnumerator DataCenterShowsResourceImpactWithoutActiveAgent()
        {
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            UIDocument document = null;
            for (int frame = 0; frame < 30 && document == null; frame++)
            {
                document = Object.FindAnyObjectByType<UIDocument>();
                if (document == null) yield return null;
            }
            Assert.That(document, Is.Not.Null, "Cena M2 sem UIDocument após carregar");
            var loader = Object.FindAnyObjectByType<InfrastructureDemoLoader>();
            var demo = Object.FindAnyObjectByType<DemoLoader>();
            var hud = Object.FindAnyObjectByType<HudPresenter>();
            var root = document.rootVisualElement;
            Assert.That(loader, Is.Not.Null, "Cena M2 sem InfrastructureDemoLoader");
            Assert.That(demo, Is.Not.Null, "Cena M2 sem DemoLoader");
            Assert.That(hud, Is.Not.Null, "Cena M2 sem HudPresenter");
            Assert.That(root, Is.Not.Null, "Cena M2 sem raiz UI");
            Assert.That(loader.Snapshot, Is.Not.Null);
            Assert.That(loader.Snapshot.incidents.Length, Is.EqualTo(1));

            var inactive = System.Array.Find(demo.Snapshot.projects, item => item.projectId == "design-system");
            Assert.That(inactive.activeAgents, Is.Zero);
            hud.SendMessage("Select", inactive);
            Assert.That(root.Q<Label>("infrastructure-alert").text, Does.Contain("Impacto potencial"));

            hud.SendMessage("ShowDataCenter");
            Assert.That(root.Q<VisualElement>("resource-panel").resolvedStyle.display, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(root.Q<Label>("resource-filter").text, Does.Contain("Design System"));
            Assert.That(root.Q<ScrollView>("resource-list").contentContainer.childCount, Is.EqualTo(3));
            hud.SendMessage("SetResourceFilter", false);
            Assert.That(root.Q<ScrollView>("resource-list").contentContainer.childCount, Is.EqualTo(5));
            hud.SendMessage("ReturnToSector");
            Assert.That(root.Q<VisualElement>("resource-panel").resolvedStyle.display, Is.EqualTo(DisplayStyle.None));
        }
    }
}

using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M5OperationsSceneTests
    {
        [UnityTest]
        public IEnumerator DemoHidesOperationalQueries()
        {
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            Assert.That(Object.FindAnyObjectByType<OperationsHudPresenter>(), Is.Null);
            Assert.That(root.Q<Button>("operations-open-button").resolvedStyle.display, Is.EqualTo(DisplayStyle.None));
        }

        [UnityTest]
        public IEnumerator LivePanelRequiresScopeAndClosesOnReplay()
        {
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            var presenter = Object.FindAnyObjectByType<OperationsHudPresenter>();
            Assert.That(presenter, Is.Not.Null);
            Assert.That(root.Q<Button>("operations-open-button").resolvedStyle.display, Is.EqualTo(DisplayStyle.Flex));
            presenter.SendMessage("Open");
            Assert.That(root.Q<VisualElement>("operations-panel").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            presenter.SendMessage("LoadCoverage");
            StringAssert.Contains("Informe ambiente", root.Q<Label>("operations-status").text);
            presenter.SetReplayMode(true);
            Assert.That(root.Q<Button>("operations-open-button").enabledSelf, Is.False);
            Assert.That(root.Q<VisualElement>("operations-panel").style.display.value, Is.EqualTo(DisplayStyle.None));
        }
    }
}

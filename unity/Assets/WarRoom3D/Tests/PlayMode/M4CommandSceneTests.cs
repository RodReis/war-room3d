using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class M4CommandSceneTests
    {
        [UnityTest]
        public IEnumerator DemoDoesNotExposeCommandPanel()
        {
            SceneManager.LoadScene("QuartelM0"); yield return null; yield return null;
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            Assert.That(Object.FindAnyObjectByType<CommandPresenter>(), Is.Null);
            Assert.That(root.Q<Button>("command-button").resolvedStyle.display, Is.EqualTo(DisplayStyle.None));
        }

        [UnityTest]
        public IEnumerator UnconfiguredLivePanelExplainsUnavailableAndPreventsConfirmation()
        {
            var oldUrl = System.Environment.GetEnvironmentVariable("WR3D_SERVICE_URL");
            var oldToken = System.Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN");
            System.Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", null);
            System.Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", null);
            try
            {
                SceneManager.LoadScene("QuartelM2Live"); yield return null; yield return null;
                var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
                var presenter = Object.FindAnyObjectByType<CommandPresenter>();
                Assert.That(presenter, Is.Not.Null);
                presenter.SendMessage("Open"); yield return null;
                Assert.That(root.Q<VisualElement>("command-panel").style.display.value, Is.EqualTo(DisplayStyle.Flex));
                Assert.That(root.Q<Button>("command-review").enabledSelf, Is.False);
                Assert.That(root.Q<Button>("command-confirm").enabledSelf, Is.False);
                StringAssert.Contains("indisponível", root.Q<Label>("command-status").text);
                presenter.SendMessage("ReplayChanged", true);
                StringAssert.Contains("REPLAY", root.Q<Label>("command-status").text);
                Assert.That(presenter.HasPendingConfirmation, Is.False);
                presenter.SendMessage("Close");
                Assert.That(root.Q<VisualElement>("command-mask").style.display.value, Is.EqualTo(DisplayStyle.None));
            }
            finally
            {
                System.Environment.SetEnvironmentVariable("WR3D_SERVICE_URL", oldUrl);
                System.Environment.SetEnvironmentVariable("WR3D_SERVICE_TOKEN", oldToken);
            }
        }
    }
}

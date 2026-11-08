using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class ReferenceRoomNavigationTests : InputTestFixture
    {
        [UnityTest]
        public IEnumerator DetailClosesBeforeLeavingRoomAndKeepsAgentSelection()
        {
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            var returns = 0;
            var navigation = new ReferenceRoomNavigation(root, () => returns++);
            navigation.SetView(true, "Projeto sintético");
            navigation.SetAgents(new[] { new AgentEntry("a1", "Principal · Codex · Aguardando"), new AgentEntry("a2", "Subagente · Codex · Trabalhando") });
            Assert.That(navigation.SelectAgent("a2"), Is.True);
            navigation.SelectTab(2);
            Assert.That(root.Q<VisualElement>("page-logs").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            navigation.SelectTab(0);
            navigation.OpenEvidence();
            Assert.That(navigation.DetailOpen, Is.True);
            Assert.That(root.panel.focusController.focusedElement, Is.EqualTo(root.Q<Button>("evidence-close")));
            Assert.That(navigation.HandleEscape(), Is.True);
            Assert.That(navigation.DetailOpen, Is.False);
            Assert.That(returns, Is.Zero);
            Assert.That(navigation.SelectedAgentKey, Is.EqualTo("a2"));
            navigation.SetSummaryCollapsed(true);
            Assert.That(root.Q<VisualElement>("project-panel").style.display.value, Is.EqualTo(DisplayStyle.None));
            navigation.SetSummaryCollapsed(false);
            Assert.That(root.Q<VisualElement>("project-panel").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(navigation.HandleEscape(), Is.True);
            Assert.That(returns, Is.EqualTo(1));
            Assert.That(navigation.SelectedAgentKey, Is.EqualTo("a2"));
        }

        [UnityTest]
        public IEnumerator EscapeKeyReturnsFromRoomAndKeepsProject()
        {
            var keyboard = InputSystem.AddDevice<Keyboard>();
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var hud = Object.FindAnyObjectByType<HudPresenter>();
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            var selectedProject = root.Q<Label>("project-name").text;
            Assert.That(root.Q<Button>("agent-0").text, Does.Contain("Principal · Codex"));
            Assert.That(root.Q<Button>("agent-1").text, Does.Contain("Principal · Claude"));
            Assert.That(root.Q<Button>("agent-2").text, Does.Contain("Subagente"));
            hud.SendMessage("EnterRoom");
            Press(keyboard.escapeKey);
            InputSystem.Update();
            hud.SendMessage("Update");
            Assert.That(root.Q<Button>("back-button").style.display.value, Is.EqualTo(DisplayStyle.None));
            Assert.That(root.Q<Label>("project-name").text, Is.EqualTo(selectedProject));
        }

        [UnityTest]
        public IEnumerator SceneSelectionFindsReferenceRoomWithoutPhysicsCollider()
        {
            var mouse = InputSystem.AddDevice<Mouse>();
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var sector = Object.FindAnyObjectByType<SectorBuilder>();
            var point = Camera.main.WorldToScreenPoint(sector.Rooms["slot-03"].position + Vector3.up);
            Move(mouse.position, new Vector2(point.x, point.y), Vector2.zero);
            InputSystem.Update();
            Press(mouse.leftButton);
            InputSystem.Update();
            Assert.That(RoomSceneSelection.TryPickSlot(Camera.main, sector, null, out var slotId), Is.True);
            Assert.That(slotId, Is.EqualTo("slot-03"));
        }
    }
}

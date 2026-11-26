using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class FixedSpaceTests : InputTestFixture
    {
        private static string EmptySnapshot => "{\"schemaVersion\":\"1.0\",\"mode\":\"live\",\"revision\":1,\"streamSequence\":1," +
            "\"projects\":[],\"roomPlacements\":[],\"sessions\":[],\"agents\":[],\"feed\":[]," +
            "\"resources\":[],\"projectResources\":[],\"resourceStates\":[],\"incidents\":[]}";

        [UnityTest]
        public IEnumerator FixedSpacesSurviveEmptyFullAndOtherSectorWithoutUsingProjectSlots()
        {
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var sector = Object.FindAnyObjectByType<SectorBuilder>();
            Assert.That(sector.Rooms.Count, Is.EqualTo(6));
            Assert.That(sector.FixedSpaces.Keys, Is.EquivalentTo(new[] { "cafeteria", "pi-meeting" }));
            var views = sector.FixedSpaces.Values.ToArray();
            var positions = views.Select(view => view.transform.position).ToArray();
            var full = Enumerable.Range(1, 6).Select(index => new LiveRoomPlacement
                { projectId = "p" + index, sectorId = "setor-01", slotId = $"slot-{index:00}" }).ToArray();
            foreach (var placements in new[] { full, new LiveRoomPlacement[0], full })
            {
                sector.ApplyOverviewPlacements(placements);
                for (var i = 0; i < views.Length; i++)
                {
                    Assert.That(sector.FixedSpaces[views[i].SpaceId], Is.SameAs(views[i]));
                    Assert.That(views[i].gameObject.activeInHierarchy, Is.True);
                    Assert.That(views[i].transform.position, Is.EqualTo(positions[i]));
                    Assert.That(views[i].GetComponentsInChildren<AgentView>(), Is.Empty);
                }
            }
            sector.ApplyOverviewPlacements(full, "setor-02");
            Assert.That(sector.Rooms.Values.Count(room => room.gameObject.activeSelf), Is.Zero);
            Assert.That(views.All(view => view.gameObject.activeInHierarchy), Is.True);
            Assert.That(sector.FixedSpaces["pi-meeting"].transform.Find("Lugar do PI"), Is.Not.Null);
            sector.GetOverviewBounds(out var center, out var width, out var depth);
            foreach (var view in views)
            {
                Assert.That(Mathf.Abs(view.transform.position.x - center.x) + 5f, Is.LessThanOrEqualTo(width / 2f));
                Assert.That(Mathf.Abs(view.transform.position.z - center.z) + 4f, Is.LessThanOrEqualTo(depth / 2f));
            }
        }

        [UnityTest]
        public IEnumerator SceneReloadDoesNotRenderDestroyedArchitectureOnConnectionShutdown()
        {
            for (var i = 0; i < 3; i++)
            {
                SceneManager.LoadScene("QuartelM2Live");
                yield return null;
                yield return null;
                Object.FindAnyObjectByType<LiveStateClient>().AcceptSnapshot(EmptySnapshot);
            }
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            Assert.That(Object.FindAnyObjectByType<LiveHudPresenter>(), Is.Null);
        }

        [UnityTest]
        public IEnumerator ScenePickingAndReducedModeKeepFixedSpaceIdentity()
        {
            var mouse = InputSystem.AddDevice<Mouse>();
            var keyboard = InputSystem.AddDevice<Keyboard>();
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var sector = Object.FindAnyObjectByType<SectorBuilder>();
            var orbit = Object.FindAnyObjectByType<OrbitCamera>();
            foreach (var space in sector.FixedSpaces.Values)
            {
                orbit.FocusFixedSpace(space);
                var p = Camera.main.WorldToScreenPoint(space.transform.position + Vector3.up * .1f);
                Move(mouse.position, new Vector2(p.x, p.y), Vector2.zero);
                InputSystem.Update();
                Press(mouse.leftButton);
                InputSystem.Update();
                Assert.That(RoomSceneSelection.TryPickTarget(Camera.main, sector, null, out var id, out var fixedSpace), Is.True);
                Assert.That(fixedSpace, Is.True);
                Assert.That(id, Is.EqualTo(space.SpaceId));
                Assert.That(RoomSceneSelection.TryPickSlot(Camera.main, sector, null, out _), Is.False);
                Release(mouse.leftButton);
            }
            Press(keyboard.f8Key);
            InputSystem.Update();
            foreach (var space in sector.FixedSpaces.Values)
            {
                space.GetComponent<ReferenceRoomView>().SendMessage("Update");
                Assert.That(space.GetComponent<ReferenceRoomView>().Reduced, Is.True);
                Assert.That(space.GetComponentsInChildren<MeshRenderer>().Length, Is.GreaterThan(20));
            }
            Release(keyboard.f8Key);
        }

        [UnityTest]
        public IEnumerator VisitWithoutProjectsKeepsContextAcrossSnapshotAndEscapeReturnsToFocusedEntry()
        {
            var keyboard = InputSystem.AddDevice<Keyboard>();
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var client = Object.FindAnyObjectByType<LiveStateClient>();
            var hud = Object.FindAnyObjectByType<LiveHudPresenter>();
            var orbit = Object.FindAnyObjectByType<OrbitCamera>();
            var sector = Object.FindAnyObjectByType<SectorBuilder>();
            var root = Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            client.AcceptSnapshot(EmptySnapshot);
            foreach (var id in new[] { "cafeteria", "pi-meeting" })
            {
                var entry = root.Q<Button>("visit-" + id);
                Assert.That(entry.focusable, Is.True);
                using (var submit = NavigationSubmitEvent.GetPooled()) { submit.target = entry; entry.SendEvent(submit); }
                yield return null;
                var focus = orbit.Focus;
                Assert.That(Vector3.Distance(focus, sector.FixedSpaces[id].transform.position), Is.LessThan(2));
                Assert.That(root.Q<Label>("fixed-space-title").text, Is.EqualTo(sector.FixedSpaces[id].Title));
                client.AcceptSnapshot(EmptySnapshot.Replace("\"revision\":1", "\"revision\":2"));
                Assert.That(orbit.Focus, Is.EqualTo(focus));
                Assert.That(root.Q("project-panel").style.display.value, Is.EqualTo(DisplayStyle.None));
                Assert.That(root.Q<Label>("breadcrumb").text, Does.Contain(sector.FixedSpaces[id].Title));
                Press(keyboard.escapeKey);
                InputSystem.Update();
                hud.SendMessage("Update");
                Release(keyboard.escapeKey);
                Assert.That(root.ClassListContains("quartel-mode"), Is.True);
                Assert.That(root.Q("fixed-space-panel").style.display.value, Is.EqualTo(DisplayStyle.None));
                Assert.That(root.panel.focusController.focusedElement, Is.EqualTo(root.Q<Button>("visit-" + id)));
            }
            Assert.That(hud.OpenFixedSpace("missing"), Is.False);
        }
    }
}

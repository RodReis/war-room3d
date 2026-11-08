using System.Collections;
using System.Linq;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace WarRoom3D.Tests
{
    public sealed class ReferenceRoomTests
    {
        [UnityTest]
        public IEnumerator OnlySlot03HasModularArtAndOppositeViewCutsRearWall()
        {
            SceneManager.LoadScene("QuartelM0");
            yield return null;
            yield return null;
            var sector = Object.FindAnyObjectByType<SectorBuilder>();
            Assert.That(sector.Rooms.Count, Is.EqualTo(6));
            var room = sector.Rooms["slot-03"];
            var view = room.GetComponentInChildren<ReferenceRoomView>();
            Assert.That(view, Is.Not.Null);
            Assert.That(sector.Rooms.Values.Count(r => r.GetComponentInChildren<ReferenceRoomView>() != null), Is.EqualTo(1));
            var names = view.GetComponentsInChildren<Transform>().Select(t => t.name).ToArray();
            Assert.That(names, Does.Contain("CameraAnchorInterior"));
            Assert.That(names, Does.Contain("CameraAnchorOpposite"));
            Assert.That(names, Does.Contain("AgentAnchor_4"));
            var rear = view.GetComponentsInChildren<Transform>().First(t => t.name == "CUTAWAY_Rear");
            var front = view.GetComponentsInChildren<Transform>().First(t => t.name == "CUTAWAY_Front");
            var rearRenderer = rear.GetComponentInChildren<Renderer>();
            var frontRenderer = front.GetComponentInChildren<Renderer>();
            Assert.That(rearRenderer, Is.Not.Null);
            var camera = Camera.main;
            camera.transform.position = room.TransformPoint(new Vector3(0, 3, 10));
            yield return null;
            Assert.That(rearRenderer.enabled, Is.False);
            Assert.That(frontRenderer.enabled, Is.True);
            camera.transform.position = room.TransformPoint(new Vector3(0, 3, -10));
            yield return null;
            Assert.That(rearRenderer.enabled, Is.True);
            Assert.That(frontRenderer.enabled, Is.False);
            view.SetReduced(true);
            Assert.That(view.Reduced, Is.True);
            Assert.That(view.GetComponentsInChildren<Light>().Count(l => l.enabled), Is.EqualTo(1));
        }
    }
}

using System;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace WarRoom3D.Tests
{
    public sealed class M0Tests
    {
        [Test]
        public void SectorHasSixStableRoomsAndOneCore()
        {
            var host = new GameObject("Sector");
            try
            {
                var sector = host.AddComponent<SectorBuilder>();
                sector.Build();
                Assert.That(host.transform.Find("Nucleo"), Is.Not.Null);
                Assert.That(host.transform.Find("Salas").childCount, Is.EqualTo(6));
                Assert.That(sector.Rooms.Keys.OrderBy(id => id), Is.EqualTo(Enumerable.Range(1, 6).Select(i => $"slot-{i:00}")));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }

        [Test]
        public void CameraCompletesOrbitAndRestoresOverview()
        {
            var host = new GameObject("Camera");
            try
            {
                var camera = host.AddComponent<OrbitCamera>();
                camera.ResetView();
                Vector3 first = host.transform.position;
                camera.Orbit(360, 0);
                Assert.That(Vector3.Distance(first, host.transform.position), Is.LessThan(0.001f));
                camera.Zoom(999);
                Assert.That(camera.Distance, Is.EqualTo(8));
                camera.ResetView();
                Assert.That(camera.Yaw, Is.EqualTo(45));
                Assert.That(camera.Pitch, Is.EqualTo(50));
                Assert.That(camera.Distance, Is.EqualTo(54));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }

        [Test]
        public void DemoRejectsOperationalModeAndDuplicateRooms()
        {
            string json = System.IO.File.ReadAllText(System.IO.Path.Combine(Application.dataPath, "WarRoom3D/Demo/m0-demo.v1.json"));
            var fixture = new TextAsset(json);
            try
            {
                Assert.That(DemoLoader.Parse(fixture).projects.Length, Is.EqualTo(6));
                var live = new TextAsset(json.Replace("\"mode\": \"demo\"", "\"mode\": \"live\""));
                Assert.Throws<ArgumentException>(() => DemoLoader.Parse(live));
                UnityEngine.Object.DestroyImmediate(live);
                var duplicate = new TextAsset(json.Replace("\"slot-02\"", "\"slot-01\""));
                Assert.Throws<ArgumentException>(() => DemoLoader.Parse(duplicate));
                UnityEngine.Object.DestroyImmediate(duplicate);
            }
            finally { UnityEngine.Object.DestroyImmediate(fixture); }
        }
    }
}

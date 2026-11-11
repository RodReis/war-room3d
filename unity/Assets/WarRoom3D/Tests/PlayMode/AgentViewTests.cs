using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace WarRoom3D.Tests
{
    public sealed class AgentViewTests
    {
        [UnityTest]
        public IEnumerator AvatarPickReturnsTheSameObservedAgentKey()
        {
            var seated = Resources.Load<GameObject>("Agents/AgentSeated");
            var standing = Resources.Load<GameObject>("Agents/AgentStanding");
            Assert.That(seated, Is.Not.Null);
            Assert.That(standing, Is.Not.Null);
            var room = new GameObject("Sala sintética");
            var anchor = new GameObject("AgentAnchor_1").transform;
            anchor.SetParent(room.transform, false);
            anchor.localPosition = new Vector3(0, .9f, 0);
            room.AddComponent<ReferenceRoomView>();
            var owner = new GameObject("Projeção sintética");
            var cameraObject = new GameObject("Câmera sintética");
            try
            {
                var presenter = owner.AddComponent<AgentPresenter>();
                presenter.Configure(seated, standing);
                presenter.Show(room.transform, new List<AgentProjectionRecord> {
                    new AgentProjectionRecord { AgentKey = "agent-pick", SessionKey = "session-pick", Provider = "codex", Presence = "observada" }
                }, "agent-pick");
                yield return null;
                Assert.That(presenter.VisibleCount, Is.EqualTo(1));
                var view = room.GetComponentInChildren<AgentView>();
                Assert.That(view, Is.Not.Null);
                var body = view.GetComponentInChildren<MeshRenderer>();
                Assert.That(body, Is.Not.Null);
                var camera = cameraObject.AddComponent<Camera>();
                camera.transform.position = new Vector3(0, 1.8f, -4);
                camera.transform.LookAt(body.bounds.center);
                var point = camera.WorldToScreenPoint(body.bounds.center);
                Assert.That(presenter.TryPick(camera, point, out var key), Is.True);
                Assert.That(key, Is.EqualTo("agent-pick"));
            }
            finally
            {
                Object.Destroy(owner);
                Object.Destroy(room);
                Object.Destroy(cameraObject);
            }
        }

        [UnityTest]
        public IEnumerator ObservedWorkMovesRigAndReducedMotionRestoresPose()
        {
            var prefab = Resources.Load<GameObject>("Agents/AgentSeated");
            Assert.That(prefab, Is.Not.Null);
            var instance = Object.Instantiate(prefab);
            try
            {
                var view = instance.GetComponent<AgentView>();
                Assert.That(view, Is.Not.Null);
                Transform forearm = null;
                foreach (var part in instance.GetComponentsInChildren<Transform>())
                    if (part.name == "Forearm_L") { forearm = part; break; }
                Assert.That(forearm, Is.Not.Null);
                var rest = forearm.localRotation;
                view.Bind("synthetic-agent", "synthetic-session", "Agente sintético", 0, "codex", "trabalhando", false, false, false, false);
                float maximum = 0;
                for (int frame = 0; frame < 8; frame++)
                {
                    yield return null;
                    maximum = Mathf.Max(maximum, Quaternion.Angle(rest, forearm.localRotation));
                }
                Assert.That(maximum, Is.GreaterThan(.1f));
                view.Bind("synthetic-agent", "synthetic-session", "Agente sintético", 0, "codex", "trabalhando", false, false, false, true);
                Assert.That(Quaternion.Angle(rest, forearm.localRotation), Is.LessThan(.01f));
                yield return null;
                Assert.That(Quaternion.Angle(rest, forearm.localRotation), Is.LessThan(.01f));
                view.Bind("synthetic-agent", "synthetic-session", "Agente sintético", 0, "codex", "trabalhando", true, false, false, false);
                yield return null;
                Assert.That(Quaternion.Angle(rest, forearm.localRotation), Is.LessThan(.01f));
                Assert.That(view.LabelText, Does.Contain("Sem confirmação"));
            }
            finally { Object.Destroy(instance); }
        }

        [UnityTest]
        public IEnumerator FourOutfitsHaveDistinctJacketsAndTwoSilhouettes()
        {
            var prefab = Resources.Load<GameObject>("Agents/AgentStanding");
            Assert.That(prefab, Is.Not.Null);
            var colors = new HashSet<Color>();
            var widths = new List<float>();
            for (var style = 0; style < 4; style++)
            {
                var instance = Object.Instantiate(prefab);
                try
                {
                    var view = instance.GetComponent<AgentView>();
                    view.Bind("synthetic-" + style, "session", "Pessoa " + style, style,
                        "claude", "aguardando", false, false, false, true);
                    var jacket = System.Array.Find(instance.GetComponentsInChildren<Renderer>(),
                        renderer => renderer.name == "Jaqueta facetada");
                    Assert.That(jacket, Is.Not.Null);
                    var block = new MaterialPropertyBlock();
                    jacket.GetPropertyBlock(block);
                    colors.Add(block.GetColor("_BaseColor"));
                    widths.Add(jacket.transform.localScale.x);
                    Assert.That(view.LabelText, Does.Contain("Pessoa " + style));
                    Assert.That(instance.transform.Find(new[] { "Lenço âmbar", "Alça do colete",
                        "Boina violeta", "Bolsa utilitária" }[style]), Is.Not.Null);
                }
                finally { Object.Destroy(instance); }
                yield return null;
            }
            Assert.That(colors.Count, Is.EqualTo(4));
            Assert.That(widths[0], Is.LessThan(widths[1]));
            Assert.That(widths[2], Is.LessThan(widths[3]));
        }

        [UnityTest]
        public IEnumerator ArrivalMovesFromEntranceToDeskBeforeSeatedPose()
        {
            var room = new GameObject("Sala sintética");
            var anchor = new GameObject("AgentAnchor_1").transform;
            anchor.SetParent(room.transform, false);
            anchor.localPosition = new Vector3(1, .9f, 0);
            room.AddComponent<ReferenceRoomView>();
            var owner = new GameObject("Projeção sintética");
            try
            {
                var presenter = owner.AddComponent<AgentPresenter>();
                presenter.Configure(Resources.Load<GameObject>("Agents/AgentSeated"),
                    Resources.Load<GameObject>("Agents/AgentStanding"));
                presenter.Show(room.transform, new List<AgentProjectionRecord> {
                    new AgentProjectionRecord { AgentKey = "agent-entry", SessionKey = "session-entry",
                        DisplayName = "Pessoa em trânsito", Style = 1, Provider = "claude", Presence = "trabalhando" }
                }, "agent-entry");
                var initial = room.GetComponentInChildren<AgentView>();
                Assert.That(initial.Seated, Is.False);
                Assert.That(initial.transform.localPosition.z, Is.LessThan(-3f));
                yield return new WaitForSecondsRealtime(1.5f);
                var arrived = room.GetComponentInChildren<AgentView>();
                Assert.That(arrived.Seated, Is.True);
                Assert.That(arrived.transform.localPosition.x, Is.EqualTo(1f).Within(.05f));
                Assert.That(arrived.AgentKey, Is.EqualTo("agent-entry"));
            }
            finally { Object.Destroy(owner); Object.Destroy(room); }
        }
    }
}

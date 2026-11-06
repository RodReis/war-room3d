using System;
using NUnit.Framework;
using UnityEngine;

namespace WarRoom3D.Tests
{
    public sealed class M2LiveTests
    {
        private const string Snapshot = "{\"schemaVersion\":\"1.0\",\"mode\":\"live\",\"revision\":1,\"streamSequence\":12," +
            "\"projects\":[{\"projectId\":\"p1\",\"name\":\"Projeto sintético\"}],\"roomPlacements\":[],\"sessions\":[],\"agents\":[],\"feed\":[]," +
            "\"resources\":[{\"resourceId\":\"r1\",\"environmentId\":\"lab\",\"kind\":\"database\",\"name\":\"Banco sintético\",\"sourceId\":\"s1\"}]," +
            "\"resourceStates\":[{\"resourceId\":\"r1\",\"dependentProjectIds\":[\"p1\"],\"health\":\"saudavel\",\"freshness\":\"atual\",\"coverage\":\"atual\",\"observedAt\":\"2026-11-06T16:00:00Z\"}]," +
            "\"incidents\":[{\"incidentId\":\"i1\",\"resourceId\":\"r1\",\"projectIds\":[\"p1\"]}]}";

        [Test]
        public void LiveSnapshotRejectsDemoAndUnprovenHealthyState()
        {
            Assert.That(LiveSnapshot.Parse(Snapshot).streamSequence, Is.EqualTo(12));
            Assert.Throws<ArgumentException>(() => LiveSnapshot.Parse(Snapshot.Replace("\"mode\":\"live\"", "\"mode\":\"demo\"")));
            Assert.Throws<ArgumentException>(() => LiveSnapshot.Parse(Snapshot.Replace("\"coverage\":\"atual\"", "\"coverage\":\"perdida\"")));
            Assert.Throws<ArgumentException>(() => LiveSnapshot.Parse(Snapshot.Replace("\"projectIds\":[\"p1\"]", "\"projectIds\":[\"outro\"]")));
        }

        [Test]
        public void SseParserHandlesSplitFramesAndRejectsOversize()
        {
            var parser = new SseFrameParser();
            Assert.That(parser.Push(": connected\n\nid: 12\nevent: resource."), Is.Empty);
            var frames = parser.Push("changed\ndata: {}\n\n");
            Assert.That(frames.Count, Is.EqualTo(1));
            Assert.That(frames[0].Id, Is.EqualTo(12));
            Assert.That(frames[0].Event, Is.EqualTo("resource.changed"));
            Assert.Throws<ArgumentException>(() => parser.Push(new string('x', 65537)));
        }

        [Test]
        public void LiveClientAcceptsOnlyLoopbackEndpoint()
        {
            var host = new GameObject("Client test");
            try
            {
                var client = host.AddComponent<LiveStateClient>();
                Assert.Throws<ArgumentException>(() => client.Configure("http://example.invalid:3000", new string('a', 64)));
                Assert.Throws<ArgumentException>(() => client.Configure("http://127.0.0.1:3000", "fraco"));
                client.Configure("http://127.0.0.1:3000", new string('a', 64));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }
    }
}

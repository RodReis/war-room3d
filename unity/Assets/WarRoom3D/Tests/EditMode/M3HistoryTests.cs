using System;
using NUnit.Framework;
using UnityEngine;

namespace WarRoom3D.Tests
{
    public sealed class M3HistoryTests
    {
        [Test]
        public void DaySnapshotPreservesUnknownDurationAndImportedMilestones()
        {
            const string json = "{\"date\":\"2026-11-06\",\"timeZone\":\"America/Sao_Paulo\",\"elapsedDurationMs\":null," +
                "\"elapsedDurationKnown\":false,\"agentHours\":null,\"agentHoursKnown\":false,\"waitingDurationMs\":null,\"waitingDurationKnown\":false," +
                "\"coverage\":{\"status\":\"none\",\"observedEventCount\":0,\"gaps\":[]}," +
                "\"githubCoverage\":{\"status\":\"none\",\"attempts\":0,\"successfulAttempts\":0,\"gaps\":[]}," +
                "\"milestones\":[{\"projectId\":\"p1\",\"entityType\":\"pull_request\",\"transition\":\"merged\",\"occurredAt\":\"2026-11-06T15:00:00Z\",\"ingestionMode\":\"backfill\"}]," +
                "\"incidentMarkers\":[]}";
            var day = HistoryDayData.Parse(json);
            Assert.That(day.elapsedDurationKnown, Is.False);
            Assert.That(day.waitingDurationKnown, Is.False);
            Assert.That(day.milestones[0].ingestionMode, Is.EqualTo("backfill"));
            Assert.Throws<ArgumentException>(() => HistoryDayData.Parse("{}"));
        }

        [Test]
        public void ReplayPageRequiresPersistentReplayModeAndAdvancingCursor()
        {
            const string json = "{\"viewMode\":\"replay\",\"fromSequence\":12,\"throughSequence\":13,\"nextCursor\":13,\"hasMore\":true," +
                "\"events\":[{\"kind\":\"github.milestone\",\"streamSequence\":13,\"ingestionMode\":\"backfill\",\"effects\":[{\"effectType\":\"merge.celebration\"}]}]}";
            var page = HistoryReplayPage.Parse(json);
            Assert.That(page.events[0].effects[0].effectType, Is.EqualTo("merge.celebration"));
            Assert.Throws<ArgumentException>(() => HistoryReplayPage.Parse(json.Replace("\"replay\"", "\"live\"")));
            Assert.Throws<ArgumentException>(() => HistoryReplayPage.Parse(json.Replace("\"nextCursor\":13", "\"nextCursor\":12")));
        }

        [Test]
        public void OnlyPersistedLiveEffectsCanAnimate()
        {
            var effect = new HistoryEffect { causationId = "merge-1", effectType = "merge.celebration", ingestionMode = "live" };
            Assert.That(EffectDirector.IsLiveEffect(effect), Is.True);
            effect.ingestionMode = "backfill";
            Assert.That(EffectDirector.IsLiveEffect(effect), Is.False);
            effect.ingestionMode = "live";
            effect.effectType = "unknown";
            Assert.That(EffectDirector.IsLiveEffect(effect), Is.False);
        }

        [Test]
        public void HistoryRequestUsesConfiguredLoopbackOnly()
        {
            var host = new GameObject("Cliente histórico sintético");
            try
            {
                var client = host.AddComponent<LiveStateClient>();
                client.Configure("http://127.0.0.1:8123", new string('a', 64));
                using (var request = client.CreateHistoryRequest("/v1/history/day?date=2026-11-06&timeZone=America%2FSao_Paulo"))
                    Assert.That(request.url, Does.StartWith("http://127.0.0.1:8123/v1/history/day"));
                Assert.Throws<ArgumentException>(() => client.CreateHistoryRequest("https://example.invalid/path"));
                Assert.Throws<ArgumentException>(() => client.CreateHistoryRequest("/v1/commands"));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }
    }
}

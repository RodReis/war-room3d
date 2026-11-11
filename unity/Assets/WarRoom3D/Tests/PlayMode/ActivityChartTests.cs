using System;
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace WarRoom3D.Tests
{
    public sealed class ActivityChartTests
    {
        private const string Snapshot = "{\"schemaVersion\":\"1.0\",\"mode\":\"live\",\"revision\":1,\"streamSequence\":4," +
            "\"projects\":[{\"projectId\":\"project-a\",\"name\":\"Projeto A\"},{\"projectId\":\"project-b\",\"name\":\"Projeto B\"}]," +
            "\"roomPlacements\":[{\"projectId\":\"project-a\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-01\"}," +
            "{\"projectId\":\"project-b\",\"sectorId\":\"setor-01\",\"slotId\":\"slot-02\"}]," +
            "\"sessions\":[],\"agents\":[],\"feed\":[],\"resources\":[],\"projectResources\":[],\"resourceStates\":[],\"incidents\":[]}";

        [UnityTest]
        public IEnumerator TwoProjectBucketsKeepCountsAndGapsDistinctAndOpenByKeyboard()
        {
            SceneManager.LoadScene("QuartelM2Live");
            yield return null;
            yield return null;
            var client = UnityEngine.Object.FindAnyObjectByType<LiveStateClient>();
            client.AcceptSnapshot(Snapshot);
            var chart = UnityEngine.Object.FindAnyObjectByType<ActivityChartPresenter>();
            var root = UnityEngine.Object.FindAnyObjectByType<UIDocument>().rootVisualElement;
            Assert.That(chart, Is.Not.Null);
            Assert.That(chart.AcceptActivity(JsonUtility.ToJson(Hour())), Is.True);
            Assert.That(root.Q<Button>("activity-project-a-4").text, Is.EqualTo("2"));
            Assert.That(root.Q<Button>("activity-project-b-4").text, Is.EqualTo("0"));
            Assert.That(root.Q<Button>("activity-project-a-5").text, Is.EqualTo("—"));
            var interval = root.Q<Button>("activity-project-a-4");
            Assert.That(interval.focusable, Is.True);
            interval.Focus();
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = interval;
                interval.SendEvent(submit);
            }
            yield return null;
            Assert.That(root.Q("activity-detail").style.display.value, Is.EqualTo(DisplayStyle.Flex));
            Assert.That(root.Q<Label>("activity-detail-title").text, Does.Contain("Projeto A"));
            Assert.That(root.Q<Button>("activity-detail-close").focusable, Is.True);
        }

        private static ActivityHourView Hour()
        {
            var start = new DateTimeOffset(2026, 11, 11, 11, 30, 0, TimeSpan.Zero);
            ActivitySeriesView Series(string id, string name, bool first)
            {
                var buckets = new ActivityBucketView[12];
                for (var index = 0; index < 12; index++)
                    buckets[index] = new ActivityBucketView {
                        start = start.AddMinutes(index * 5).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        end = start.AddMinutes((index + 1) * 5).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        count = first && index == 4 ? 2 : 0,
                        coverage = first && index == 5 ? "gap" : "covered"
                    };
                return new ActivitySeriesView { projectId = id, name = name, lastUpdatedAt = start.AddMinutes(25).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"), buckets = buckets };
            }
            return new ActivityHourView { schemaVersion = "1.0", mode = "live", unit = "eventos observados",
                intervalMinutes = 5, from = start.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                to = start.AddHours(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                series = new[] { Series("project-a", "Projeto A", true), Series("project-b", "Projeto B", false) } };
        }
    }
}

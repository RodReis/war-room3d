#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Captura dois estados de uma mesma execução live. Não produz eventos nem lê conversas.
    public sealed class Issue52LiveUpdateCapture : MonoBehaviour
    {
        private string output;
        private string changedProject;
        private string stableProject;
        private LiveStateClient client;
        private ActivityChartPresenter chart;

        [Serializable]
        private sealed class Result
        {
            public string status;
            public string reason;
            public string changedProject;
            public string stableProject;
            public long beforeSequence;
            public long afterSequence;
            public int beforeChangedCount;
            public int afterChangedCount;
            public int beforeStableCount;
            public int afterStableCount;
            public string beforeAt;
            public string afterAt;
            public int processId;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var output = Environment.GetEnvironmentVariable("WR3D_ISSUE52_WATCH_DIR");
            if (string.IsNullOrWhiteSpace(output)) return;
            if (!Path.IsPathRooted(output) ||
                string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WR3D_ISSUE52_CHANGED_PROJECT")) ||
                string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WR3D_ISSUE52_STABLE_PROJECT")))
            {
                Debug.LogError("Issue 52: parâmetros de captura inválidos");
                Application.Quit(7);
                return;
            }
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client == null) { Application.Quit(7); return; }
            var capture = client.gameObject.AddComponent<Issue52LiveUpdateCapture>();
            capture.output = output;
            capture.changedProject = Environment.GetEnvironmentVariable("WR3D_ISSUE52_CHANGED_PROJECT");
            capture.stableProject = Environment.GetEnvironmentVariable("WR3D_ISSUE52_STABLE_PROJECT");
            capture.client = client;
            Application.runInBackground = true;
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var deadline = Time.realtimeSinceStartup + 30f;
            while (Time.realtimeSinceStartup < deadline)
            {
                chart = GetComponent<ActivityChartPresenter>();
                if (client.Connected && client.Snapshot != null && chart?.CurrentHour != null &&
                    HasSeries(chart.CurrentHour, changedProject) && HasSeries(chart.CurrentHour, stableProject)) break;
                yield return null;
            }
            if (!client.Connected || client.Snapshot == null || chart?.CurrentHour == null ||
                !HasSeries(chart.CurrentHour, changedProject) || !HasSeries(chart.CurrentHour, stableProject))
            { Fail("duas séries live não chegaram"); yield break; }

            var result = new Result {
                status = "waiting", changedProject = changedProject, stableProject = stableProject,
                beforeSequence = client.Snapshot.streamSequence,
                beforeChangedCount = Count(chart.CurrentHour, changedProject),
                beforeStableCount = Count(chart.CurrentHour, stableProject),
                beforeAt = DateTimeOffset.UtcNow.ToString("O"),
                processId = System.Diagnostics.Process.GetCurrentProcess().Id
            };
            yield return new WaitForEndOfFrame();
            SaveFrame("before.png");
            File.WriteAllText(Path.Combine(output, "before.json"), JsonUtility.ToJson(result, true));
            File.WriteAllText(Path.Combine(output, "ready"), "ready");

            deadline = Time.realtimeSinceStartup + 300f;
            while (Time.realtimeSinceStartup < deadline)
            {
                yield return null;
                if (!client.Connected || client.Snapshot == null || chart?.CurrentHour == null) continue;
                var changed = Count(chart.CurrentHour, changedProject);
                var stable = Count(chart.CurrentHour, stableProject);
                if (client.Snapshot.streamSequence <= result.beforeSequence ||
                    changed <= result.beforeChangedCount) continue;
                result.afterSequence = client.Snapshot.streamSequence;
                result.afterChangedCount = changed;
                result.afterStableCount = stable;
                result.afterAt = DateTimeOffset.UtcNow.ToString("O");
                if (stable != result.beforeStableCount)
                { Fail("a série do outro projeto também mudou", result); yield break; }
                yield return new WaitForEndOfFrame();
                SaveFrame("after.png");
                result.status = "pass";
                File.WriteAllText(Path.Combine(output, "result.json"), JsonUtility.ToJson(result, true));
                Application.Quit(0);
                yield break;
            }
            Fail("nenhuma atualização isolada chegou em 300 segundos", result);
        }

        private static bool HasSeries(ActivityHourView hour, string projectId) =>
            Array.Exists(hour.series ?? Array.Empty<ActivitySeriesView>(), item => item?.projectId == projectId);

        private static int Count(ActivityHourView hour, string projectId)
        {
            var series = Array.Find(hour.series ?? Array.Empty<ActivitySeriesView>(), item => item?.projectId == projectId);
            if (series?.buckets == null) return -1;
            var count = 0;
            foreach (var bucket in series.buckets) count += bucket.count;
            return count;
        }

        private void SaveFrame(string name)
        {
            var image = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(output, name), image.EncodeToPNG()); }
            finally { Destroy(image); }
        }

        private void Fail(string reason, Result result = null)
        {
            result = result ?? new Result { changedProject = changedProject, stableProject = stableProject };
            result.status = "fail";
            result.reason = reason;
            File.WriteAllText(Path.Combine(output, "result.json"), JsonUtility.ToJson(result, true));
            Application.Quit(2);
        }
    }
}
#endif

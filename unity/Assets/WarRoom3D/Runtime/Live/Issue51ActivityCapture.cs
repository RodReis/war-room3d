#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Compara a resposta da API com as células no Player de laboratório sintético.
    public sealed class Issue51ActivityCapture : MonoBehaviour
    {
        private string output;
        private UIDocument document;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, "-wr3d-activity-capture");
            if (index < 0 || index + 1 >= args.Length) return;
            var hud = FindAnyObjectByType<LiveHudPresenter>();
            if (hud == null) return;
            var capture = hud.gameObject.AddComponent<Issue51ActivityCapture>();
            capture.document = hud.GetComponent<UIDocument>();
            capture.output = args[index + 1];
        }

        private IEnumerator Start()
        {
            Directory.CreateDirectory(output);
            var root = document.rootVisualElement;
            var chart = GetComponent<ActivityChartPresenter>();
            var deadline = Time.realtimeSinceStartup + 25f;
            while ((chart == null || chart.CurrentHour == null || root.Q<Button>("activity-lab-atlas-10") == null) &&
                Time.realtimeSinceStartup < deadline) yield return null;
            if (chart?.CurrentHour == null) { Fail("série da API não chegou ao Player"); yield break; }
            if (root.Q<Label>("demo-seal").text.Contains("DADOS ILUSTRATIVOS"))
            { Fail("Player entrou em modo demo em vez do serviço sintético"); yield break; }
            var atlas = Array.Find(chart.CurrentHour.series, item => item.projectId == "lab-atlas");
            var orion = Array.Find(chart.CurrentHour.series, item => item.projectId == "lab-orion");
            if (atlas == null || orion == null) { Fail("duas séries ausentes"); yield break; }
            var activeIndex = -1;
            var gap = false;
            for (var index = 0; index < 12; index++)
            {
                foreach (var series in new[] { atlas, orion })
                {
                    var bucket = series.buckets[index];
                    var button = root.Q<Button>("activity-" + series.projectId + "-" + index);
                    var expected = bucket.coverage == "gap" ? "—" : bucket.count +
                        (bucket.coverage == "partial" ? "*" : "");
                    if (button == null || button.text != expected)
                    { Fail("contagem do Player diverge da API: " + series.projectId + "/" + index); yield break; }
                    gap |= bucket.coverage == "gap";
                }
                if (atlas.buckets[index].count > 0 && atlas.buckets[index].coverage != "gap") activeIndex = index;
            }
            if (activeIndex < 0 || orion.buckets[activeIndex].count != 0 || !gap)
            { Fail("isolamento por projeto, zero ou lacuna ausente"); yield break; }
            yield return new WaitForEndOfFrame();
            SaveFrame("overview.png");
            var cell = root.Q<Button>("activity-lab-atlas-" + activeIndex);
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = cell;
                cell.SendEvent(submit);
            }
            var items = root.Q<ScrollView>("activity-detail-events");
            deadline = Time.realtimeSinceStartup + 10f;
            while (items.Q<Button>() == null && Time.realtimeSinceStartup < deadline) yield return null;
            if (items.Q<Button>() == null || !items.Q<Button>().text.Contains("Fonte: lab-source-0"))
            { Fail("drill-down não mostrou origem do evento"); yield break; }
            yield return new WaitForEndOfFrame();
            SaveFrame("detalhe.png");
            File.WriteAllText(Path.Combine(output, "resultado.txt"),
                "pass | Player " + Application.unityVersion + " | dois projetos | API=tela 24/24 intervalos | " +
                "ação isolada em Atlas | zero em Orion | lacuna | evento com fonte e horário");
            Application.Quit(0);
        }

        private void SaveFrame(string name)
        {
            var image = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(output, name), image.EncodeToPNG()); }
            finally { Destroy(image); }
        }
        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(output, "resultado.txt"), "fail | " + reason);
            Application.Quit(2);
        }
    }
}
#endif

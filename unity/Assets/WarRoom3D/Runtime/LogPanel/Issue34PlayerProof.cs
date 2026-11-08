#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Somente build de desenvolvimento, com serviço e dados sintéticos opt-in.
    public sealed class Issue34PlayerProof : MonoBehaviour
    {
        private string directory, control;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WR3D_34_PROOF_DIR"))) return;
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client != null) client.gameObject.AddComponent<Issue34PlayerProof>();
        }

        private IEnumerator Start()
        {
            directory = Environment.GetEnvironmentVariable("WR3D_34_PROOF_DIR");
            control = Environment.GetEnvironmentVariable("WR3D_34_LAB_CONTROL");
            if (string.IsNullOrWhiteSpace(directory)) { Fail("configuracao_ausente"); yield break; }
            Directory.CreateDirectory(directory);
            if (Environment.GetEnvironmentVariable("WR3D_34_PROOF_MODE") == "docker")
            { yield return DockerProof(); yield break; }
            if (string.IsNullOrWhiteSpace(control)) { Fail("controle_sintetico_ausente"); yield break; }
            var client = GetComponent<LiveStateClient>();
            var hud = GetComponent<LiveHudPresenter>();
            var logs = GetComponent<RoomLogPresenter>();
            var root = GetComponent<UIDocument>()?.rootVisualElement;
            float deadline = Time.realtimeSinceStartup + 20f;
            while ((client == null || !client.Connected || client.Snapshot == null || hud == null || logs == null || root == null) &&
                Time.realtimeSinceStartup < deadline)
            { yield return null; client = GetComponent<LiveStateClient>(); hud = GetComponent<LiveHudPresenter>();
                logs = GetComponent<RoomLogPresenter>(); root = GetComponent<UIDocument>()?.rootVisualElement; }
            if (client == null || !client.Connected || client.Snapshot == null || hud == null || logs == null || root == null)
            { Fail("snapshot_ou_painel_ausente"); yield break; }
            if (client.Snapshot.projects.Length != 1 || client.Snapshot.projects[0].projectId != "lab-34")
            { Fail("projeto_nao_sintetico"); yield break; }
            hud.SendMessage("EnterRoom");
            hud.SendMessage("OpenLogsForValidation");
            yield return new WaitForEndOfFrame();
            logs.SendMessage("Query");
            yield return WaitFor(root, "página recebida");
            if (root.Q<VisualElement>("log-results").childCount != 10 || !root.Q<Button>("log-more").enabledSelf)
            { Fail("eventos_primeira_pagina"); yield break; }
            yield return Capture("01-eventos-pagina-1");

            logs.SendMessage("More");
            yield return WaitFor(root, "página recebida", 13);
            if (root.Q<VisualElement>("log-results").childCount != 13)
            { Fail("eventos_segunda_pagina"); yield break; }
            root.Q<ScrollView>("room-content").ScrollTo(root.Q<VisualElement>("log-results")[12]);
            yield return new WaitForEndOfFrame();
            yield return Capture("02-eventos-pagina-2");
            logs.OpenFirstForValidation();
            yield return WaitForDetail(root, "evidence-34-13");
            if (!root.Q<Label>("evidence-body").text.Contains("evidence-34-13"))
            { Fail("detalhe_evento"); yield break; }
            yield return Capture("03-evento-evidencia");
            hud.SendMessage("CloseEvidenceForValidation");
            if (root.Q<VisualElement>("log-results").childCount != 13)
            { Fail("retorno_perdeu_contexto"); yield break; }

            root.Q<DropdownField>("log-category").value = "Logs de aplicação / infraestrutura";
            root.Q<TextField>("log-request").value = "req-34-lab";
            logs.SendMessage("Query");
            yield return WaitFor(root, "página recebida");
            if (root.Q<VisualElement>("log-results").childCount != 1 ||
                !root.Q<Button>(className:"log-entry").text.Contains("[prévia limitada"))
            { Fail("filtro_request_ou_linha_longa"); yield break; }
            logs.OpenFirstForValidation();
            yield return WaitForDetail(root, "TRUNCADO PELO SERVIÇO");
            if (!root.Q<Label>("evidence-body").text.Contains("[TRUNCADO PELO SERVIÇO]") ||
                root.Q<Label>("evidence-body").text.Contains("synthetic-canary"))
            { Fail("redacao_ou_truncamento"); yield break; }
            yield return Capture("04-log-detalhe-redigido");
            hud.SendMessage("CloseEvidenceForValidation");

            root.Q<TextField>("log-request").value = "";
            root.Q<DropdownField>("log-severity").value = "Crítica";
            logs.SendMessage("Query");
            yield return WaitFor(root, "nenhum log observado");
            if (root.Q<VisualElement>("log-results").childCount != 0)
            { Fail("filtro_sem_resultado"); yield break; }
            yield return Capture("05-sem-resultado");

            root.Q<DropdownField>("log-severity").value = "Todas";
            File.WriteAllText(Path.Combine(control,"source-unavailable"),"1");
            deadline = Time.realtimeSinceStartup + 10f;
            while (!File.Exists(Path.Combine(control,"source-unavailable-done")) && Time.realtimeSinceStartup < deadline) yield return null;
            logs.SendMessage("Query");
            yield return WaitFor(root, "fonte indisponível");
            if (!root.Q<Label>("log-status").text.Contains("fonte indisponível"))
            { Fail("perda_de_fonte"); yield break; }
            yield return Capture("06-fonte-indisponivel");
            File.WriteAllText(Path.Combine(directory,"issue-34-result.json"),
                "{\"status\":\"pass\",\"synthetic\":true,\"eventPages\":2,\"requestFilter\":true,\"redacted\":true,\"sourceLoss\":true}");
            Application.Quit(0);
        }

        private IEnumerator DockerProof()
        {
            var client = GetComponent<LiveStateClient>();
            var hud = GetComponent<LiveHudPresenter>();
            var logs = GetComponent<RoomLogPresenter>();
            var root = GetComponent<UIDocument>()?.rootVisualElement;
            float deadline = Time.realtimeSinceStartup + 20f;
            while ((client == null || !client.Connected || client.Snapshot == null || hud == null || logs == null || root == null) &&
                Time.realtimeSinceStartup < deadline)
            { yield return null; client = GetComponent<LiveStateClient>(); hud = GetComponent<LiveHudPresenter>();
                logs = GetComponent<RoomLogPresenter>(); root = GetComponent<UIDocument>()?.rootVisualElement; }
            var expectedProject = Environment.GetEnvironmentVariable("WR3D_34_EXPECTED_PROJECT");
            if (client?.Snapshot == null || hud == null || logs == null || root == null ||
                client.Snapshot.projects.Length != 1 || client.Snapshot.projects[0].projectId != expectedProject)
            { Fail("projeto_docker_ausente"); yield break; }
            hud.SendMessage("EnterRoom"); hud.SendMessage("OpenLogsForValidation");
            root.Q<DropdownField>("log-category").value = "Logs de aplicação / infraestrutura";
            logs.SendMessage("Query");
            yield return WaitFor(root,"página recebida");
            var results = root.Q<VisualElement>("log-results");
            var first = results.childCount > 0 ? results[0] as Button : null;
            if (first == null || !first.text.Contains("WR3D34_DOCKER_SOURCE") || first.text.Contains("synthetic-secret"))
            { Fail("log_docker_ausente_ou_nao_redigido"); yield break; }
            yield return Capture("07-fonte-docker-real");
            File.WriteAllText(Path.Combine(directory,"issue-34-docker-result.json"),
                "{\"status\":\"pass\",\"source\":\"docker-lab\",\"content\":\"synthetic\",\"player\":true}");
            Application.Quit(0);
        }

        private static IEnumerator WaitFor(VisualElement root, string fragment, int count = -1)
        {
            float deadline = Time.realtimeSinceStartup + 10f;
            while (Time.realtimeSinceStartup < deadline)
            {
                if (root.Q<Label>("log-status").text.Contains(fragment) &&
                    (count < 0 || root.Q<VisualElement>("log-results").childCount == count)) break;
                yield return null;
            }
            yield return new WaitForEndOfFrame();
        }

        private static IEnumerator WaitForDetail(VisualElement root, string fragment)
        {
            float deadline = Time.realtimeSinceStartup + 10f;
            while (Time.realtimeSinceStartup < deadline &&
                !(root.Q<Label>("evidence-body").text?.Contains(fragment) ?? false)) yield return null;
            yield return new WaitForEndOfFrame();
        }

        private IEnumerator Capture(string name)
        {
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            if (texture == null) { Fail("captura_de_tela_indisponivel"); yield break; }
            try { File.WriteAllBytes(Path.Combine(directory,name+".png"),texture.EncodeToPNG()); }
            finally { Destroy(texture); }
        }

        private void Fail(string reason)
        {
            if (!string.IsNullOrEmpty(directory))
            { Directory.CreateDirectory(directory); File.WriteAllText(Path.Combine(directory,"issue-34-result.json"),
                "{\"status\":\"fail\",\"reason\":\""+reason+"\"}"); }
            Application.Quit(21);
        }
    }
}
#endif

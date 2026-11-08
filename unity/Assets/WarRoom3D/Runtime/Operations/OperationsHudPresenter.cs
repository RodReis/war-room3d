using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class OperationsHudPresenter : MonoBehaviour
    {
        private VisualElement root;
        private LiveStateClient client;
        private bool replayMode;
        private string signalPath;
        private string nextCursor;
        private int requestVersion;

        public void Configure(VisualElement visualRoot, LiveStateClient stateClient)
        {
            root = visualRoot;
            client = stateClient;
            var category = root.Q<DropdownField>("operations-category");
            category.choices = new List<string> { "Logs", "Rastros", "Rede", "Detecções", "Relatórios" };
            category.value = "Logs";
            var severity = root.Q<DropdownField>("operations-severity");
            severity.choices = new List<string> { "Todas", "info", "low", "medium", "high", "critical" };
            severity.value = "Todas";
            var open = root.Q<Button>("operations-open-button");
            open.style.display = DisplayStyle.Flex;
            open.clicked += Open;
            root.Q<Button>("operations-close").clicked += Close;
            root.Q<Button>("operations-sources").clicked += LoadCoverage;
            root.Q<Button>("operations-query").clicked += QuerySignals;
            root.Q<Button>("operations-incidents").clicked += LoadIncidents;
            root.Q<Button>("operations-next").clicked += NextPage;
            root.Q<Button>("operations-next").SetEnabled(false);
            Close();
        }

        public void SetResourceScope(string environmentId, string resourceId)
        {
            if (root == null || string.IsNullOrWhiteSpace(environmentId)) return;
            root.Q<TextField>("operations-environment").value = environmentId;
            root.Q<TextField>("operations-resource").value = resourceId ?? string.Empty;
        }

        public void SetReplayMode(bool value)
        {
            replayMode = value;
            if (root == null) return;
            root.Q<Button>("operations-open-button").SetEnabled(!replayMode);
            if (replayMode) Close();
        }

        private void Open()
        {
            if (replayMode) return;
            root.Q<VisualElement>("operations-mask").style.display = DisplayStyle.Flex;
            root.Q<VisualElement>("operations-panel").style.display = DisplayStyle.Flex;
            LoadCoverage();
        }

        private void Close()
        {
            if (root == null) return;
            requestVersion++;
            ResetPage();
            root.Q<VisualElement>("operations-mask").style.display = DisplayStyle.None;
            root.Q<VisualElement>("operations-panel").style.display = DisplayStyle.None;
        }

        private string EnvironmentId => root.Q<TextField>("operations-environment").value.Trim();
        private string ProjectId => root.Q<TextField>("operations-project").value.Trim();
        private string ResourceId => root.Q<TextField>("operations-resource").value.Trim();

        private void LoadCoverage()
        {
            if (!Ready()) return;
            ResetPage();
            Request("/v1/operations/sources?environmentId=" + Escape(EnvironmentId), "Consultando cobertura…");
        }

        private void QuerySignals()
        {
            if (!Ready()) return;
            string category = root.Q<DropdownField>("operations-category").value;
            string route = category == "Logs" ? "/v1/logs" : category == "Rastros" ? "/v1/traces" : category == "Rede" ? "/v1/network" :
                category == "Detecções" ? "/v1/security" : "/v1/security/reports";
            var query = new List<string> { "environmentId=" + Escape(EnvironmentId), "limit=10" };
            if (!string.IsNullOrEmpty(ProjectId)) query.Add("projectId=" + Escape(ProjectId));
            if (!string.IsNullOrEmpty(ResourceId)) query.Add("resourceId=" + Escape(ResourceId));
            string from = root.Q<TextField>("operations-from").value.Trim();
            string to = root.Q<TextField>("operations-to").value.Trim();
            string correlation = root.Q<TextField>("operations-trace").value.Trim();
            if (!string.IsNullOrEmpty(from)) query.Add("from=" + Escape(from));
            if (!string.IsNullOrEmpty(to)) query.Add("to=" + Escape(to));
            if (category == "Rastros")
            {
                if (correlation.Length == 0) { SetStatus("Rastros exigem Trace ID ou Request ID explícito."); return; }
                query.Add((correlation.Length == 16 || correlation.Length == 32) && IsHex(correlation) ? "traceId=" : "requestId=" + Escape(correlation));
                if (query[query.Count - 1].EndsWith("=")) query[query.Count - 1] += Escape(correlation);
            }
            signalPath = route + "?" + string.Join("&", query);
            nextCursor = null;
            root.Q<Button>("operations-next").SetEnabled(false);
            Request(signalPath, "Consultando sinais…", true);
        }

        private void NextPage()
        {
            if (!Ready() || string.IsNullOrEmpty(signalPath) || string.IsNullOrEmpty(nextCursor)) return;
            string cursor = nextCursor;
            nextCursor = null;
            root.Q<Button>("operations-next").SetEnabled(false);
            Request(signalPath + "&cursor=" + Escape(cursor), "Consultando próxima página…", true);
        }

        private void LoadIncidents()
        {
            if (!Ready()) return;
            ResetPage();
            string severity = root.Q<DropdownField>("operations-severity").value;
            string path = "/v1/operations/incidents?environmentId=" + Escape(EnvironmentId);
            if (!string.IsNullOrEmpty(ProjectId)) path += "&projectId=" + Escape(ProjectId);
            if (severity != "Todas") path += "&severity=" + Escape(severity);
            Request(path, "Consultando incidentes…");
        }

        private bool Ready()
        {
            if (replayMode) { SetStatus("Consultas M5 ficam indisponíveis durante replay."); return false; }
            if (string.IsNullOrWhiteSpace(EnvironmentId)) { SetStatus("Informe ambiente. Sem escopo, consulta não é enviada."); return false; }
            return true;
        }

        private void ResetPage()
        {
            signalPath = null;
            nextCursor = null;
            root.Q<Button>("operations-next").SetEnabled(false);
        }

        private void Request(string path, string status, bool signalPage = false)
        {
            int version = ++requestVersion;
            SetStatus(status);
            root.Q<ScrollView>("operations-results").Clear();
            client.GetOperations(path, (code, body) =>
            {
                if (root == null || version != requestVersion) return;
                if (signalPage && code == 200)
                {
                    var match = Regex.Match(body ?? string.Empty, "\"nextCursor\"\\s*:\\s*(\\d+)");
                    nextCursor = match.Success ? match.Groups[1].Value : null;
                    root.Q<Button>("operations-next").SetEnabled(!string.IsNullOrEmpty(nextCursor));
                }
                SetStatus(code == 200 ? "Resposta da API local · conteúdo redigido pelo serviço." : "Consulta sem resultado operacional · HTTP " + code);
                var label = new Label(FormatJson(body));
                label.AddToClassList("activity");
                label.style.whiteSpace = WhiteSpace.Normal;
                root.Q<ScrollView>("operations-results").Add(label);
            });
        }

        private void SetStatus(string message)
        {
            if (root != null) root.Q<Label>("operations-status").text = message;
        }

        private static string Escape(string value) => UnityEngine.Networking.UnityWebRequest.EscapeURL(value ?? string.Empty);
        private static bool IsHex(string value)
        {
            foreach (char character in value) if (!Uri.IsHexDigit(character)) return false;
            return true;
        }

        private static string FormatJson(string value)
        {
            if (string.IsNullOrEmpty(value)) return "Sem evidência retornada.";
            string displayed=value.Replace("environmentId","ambiente").Replace("projectId","projeto").Replace("resourceId","recurso").Replace("sourceId","fonte")
                .Replace("sourceVersion","versão da fonte").Replace("observedAt","observado em").Replace("receivedAt","recebido em").Replace("evidenceRef","evidência")
                .Replace("ruleId","regra").Replace("ruleVersion","versão da regra").Replace("severity","severidade").Replace("acknowledged","reconhecido")
                .Replace("\"resolved\"","\"resolvido\"").Replace("\"open\"","\"aberto\"").Replace("\"covered\"","\"com cobertura\"").Replace("\"disabled\"","\"desligada · sem cobertura\"")
                .Replace("no_permission","sem permissão").Replace("unavailable","indisponível").Replace("stale","desatualizada").Replace("no_data","sem dados")
                .Replace("absent","fonte ausente · sem cobertura").Replace("security_detection","detecção de segurança").Replace("security_report","relatório de segurança")
                .Replace("\",\"", "\",\n  \"").Replace("},{", "},\n{");
            return displayed.Length > 12000 ? displayed.Substring(0, 12000) + "\n… resposta limitada na interface" : displayed;
        }
    }
}

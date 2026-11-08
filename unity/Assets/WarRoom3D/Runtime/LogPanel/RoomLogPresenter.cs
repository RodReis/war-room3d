using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class RoomLogPresenter : MonoBehaviour
    {
        private LiveStateClient client;
        private ReferenceRoomNavigation navigation;
        private VisualElement root, page, results;
        private ScrollView roomScroll;
        private Label scope, status;
        private DropdownField category, environment, resource, severity;
        private Toggle agentFilter;
        private Button more;
        private VisualElement filters;
        private Button filterToggle;
        private LiveSnapshot snapshot;
        private string projectId, sessionKey, agentKey, queryPath, detailEnvironment;
        private long nextCursor;
        private int generation;
        private bool replay, loading, olderPage;
        private float refreshAt;
        private SessionEventItem firstSession;
        private OperationLogItem firstOperation;

        public void Configure(VisualElement root, LiveStateClient stateClient, ReferenceRoomNavigation roomNavigation)
        {
            client = stateClient; navigation = roomNavigation; this.root = root;
            page = root.Q<VisualElement>("page-logs");
            roomScroll = root.Q<ScrollView>("room-content");
            results = root.Q<VisualElement>("log-results");
            scope = root.Q<Label>("log-scope"); status = root.Q<Label>("log-status");
            category = root.Q<DropdownField>("log-category");
            environment = root.Q<DropdownField>("log-environment");
            resource = root.Q<DropdownField>("log-resource");
            severity = root.Q<DropdownField>("log-severity");
            agentFilter = root.Q<Toggle>("log-agent-filter");
            more = root.Q<Button>("log-more");
            filters = root.Q<VisualElement>("log-filters");
            filterToggle = root.Q<Button>("log-filter-toggle");
            filterToggle.clicked += () =>
            {
                bool show = filters.style.display != DisplayStyle.Flex;
                filters.style.display = show ? DisplayStyle.Flex : DisplayStyle.None;
                filterToggle.text = show ? "Ocultar filtros adicionais" : "Mostrar filtros adicionais";
            };
            category.choices = new List<string> { "Eventos de sessão", "Logs de aplicação / infraestrutura", "Diagnóstico de fontes" };
            category.value = "Eventos de sessão";
            severity.choices = new List<string> { "Todas", "Informativa", "Baixa", "Média", "Alta", "Crítica" };
            severity.value = "Todas";
            category.RegisterValueChangedCallback(_ => { Reset(); SetFilterState(); });
            environment.RegisterValueChangedCallback(_ => RefreshResources());
            root.Q<Button>("log-query").clicked += Query;
            root.Q<Button>("log-refresh").clicked += () => { olderPage = false; Query(); };
            more.clicked += More;
            Reset(); SetFilterState();
        }

        public void SetTarget(LiveSnapshot state, string project, string session, string agent)
        {
            snapshot = state;
            bool changed = projectId != project || sessionKey != session || agentKey != agent;
            projectId = project; sessionKey = session; agentKey = agent;
            scope.text = string.IsNullOrEmpty(project) ? "Sem projeto selecionado" : "Projeto " + project +
                (string.IsNullOrEmpty(agent) ? " · nenhum agente selecionado" : " · agente " + agent);
            RefreshEnvironments();
            if (changed)
            {
                if (!string.IsNullOrEmpty(agent) && !string.IsNullOrEmpty(session) && category.value == "Eventos de sessão")
                    agentFilter.SetValueWithoutNotify(true);
                Reset(); if (!replay && Visible) Query();
            }
        }

        public void SetReplayMode(bool active)
        {
            replay = active; Reset();
            if (active) status.text = "REPRODUÇÃO · consulta live indisponível.";
            else if (Visible) Query();
        }

        private bool Visible => page != null && page.resolvedStyle.display != DisplayStyle.None;

        private void Update()
        {
            if (replay || !Visible || loading || olderPage || filters.style.display == DisplayStyle.Flex ||
                navigation.DetailOpen || roomScroll.scrollOffset.y > 20f ||
                !client.Connected || string.IsNullOrEmpty(projectId) ||
                Time.unscaledTime < refreshAt) return;
            refreshAt = Time.unscaledTime + 5f;
            Query();
        }

        private void Reset()
        {
            generation++; queryPath = null; nextCursor = 0; loading = false; olderPage = false;
            firstSession = null; firstOperation = null;
            results?.Clear(); more?.SetEnabled(false);
            if (status != null && !replay) status.text = "Consulta pendente. Fonte ausente significa sem cobertura.";
        }

        private void SetFilterState()
        {
            bool operations = category.value == "Logs de aplicação / infraestrutura";
            bool session = category.value == "Eventos de sessão";
            environment.style.display = operations ? DisplayStyle.Flex : DisplayStyle.None;
            resource.style.display = operations ? DisplayStyle.Flex : DisplayStyle.None;
            severity.style.display = operations ? DisplayStyle.Flex : DisplayStyle.None;
            agentFilter.style.display = session ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<TextField>("log-request").style.display = operations ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<TextField>("log-from").style.display = session || operations ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<TextField>("log-to").style.display = session || operations ? DisplayStyle.Flex : DisplayStyle.None;
            environment.SetEnabled(operations); resource.SetEnabled(operations); severity.SetEnabled(operations);
            agentFilter.SetEnabled(session);
        }

        private void RefreshEnvironments()
        {
            var choices = new List<string>();
            if (snapshot?.projectResources != null && snapshot.resources != null)
                foreach (var link in snapshot.projectResources)
                    if (link.projectId == projectId)
                        foreach (var item in snapshot.resources)
                            if (item.resourceId == link.resourceId && !choices.Contains(item.environmentId)) choices.Add(item.environmentId);
            choices.Sort(StringComparer.Ordinal);
            string previous = environment.value;
            environment.choices = choices;
            environment.SetValueWithoutNotify(choices.Contains(previous) ? previous : choices.Count > 0 ? choices[0] : string.Empty);
            RefreshResources();
        }

        private void RefreshResources()
        {
            var choices = new List<string> { "Todos" };
            if (snapshot?.projectResources != null && snapshot.resources != null)
                foreach (var link in snapshot.projectResources)
                    if (link.projectId == projectId)
                        foreach (var item in snapshot.resources)
                            if (item.resourceId == link.resourceId && item.environmentId == environment.value && !choices.Contains(item.resourceId))
                                choices.Add(item.resourceId);
            string previous = resource.value;
            resource.choices = choices;
            resource.SetValueWithoutNotify(choices.Contains(previous) ? previous : "Todos");
        }

        private void Query()
        {
            if (replay) { status.text = "REPRODUÇÃO · consulta live indisponível."; return; }
            if (string.IsNullOrEmpty(projectId)) { status.text = "Selecione um projeto."; return; }
            if (!client.Connected) { status.text = "Fonte local indisponível · sem cobertura atual."; return; }
            var query = new List<string> { "projectId=" + Escape(projectId), "limit=10" };
            if (category.value == "Diagnóstico de fontes") { ShowDiagnostics(); return; }
            string from = root.Q<TextField>("log-from").value.Trim();
            string to = root.Q<TextField>("log-to").value.Trim();
            if (!ValidTime(from) || !ValidTime(to) || (from.Length > 0 && to.Length > 0 &&
                DateTime.Parse(from, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal) >
                DateTime.Parse(to, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal)))
            { status.text = "Intervalo UTC inválido; use ISO 8601 com Z."; return; }
            if (from.Length > 0) query.Add("from=" + Escape(from));
            if (to.Length > 0) query.Add("to=" + Escape(to));
            if (category.value == "Eventos de sessão")
            {
                if (agentFilter.value)
                {
                    if (string.IsNullOrEmpty(agentKey) || string.IsNullOrEmpty(sessionKey))
                    { status.text = "Agente sem sessão observada · retire o filtro ou selecione outro agente."; return; }
                    query.Add("agentKey=" + Escape(agentKey)); query.Add("sessionKey=" + Escape(sessionKey));
                }
                queryPath = "/v1/session-events?" + string.Join("&", query);
                Load(queryPath, false);
                return;
            }
            if (string.IsNullOrEmpty(environment.value))
            { status.text = "Projeto sem recurso/ambiente associado · sem cobertura de logs M5."; results.Clear(); nextCursor=0; more.SetEnabled(false); return; }
            query.Add("environmentId=" + Escape(environment.value)); query.Add("order=desc");
            if (resource.value != "Todos" && !string.IsNullOrEmpty(resource.value)) query.Add("resourceId=" + Escape(resource.value));
            if (severity.value != "Todas") query.Add("severity=" + Escape(SeverityValue(severity.value)));
            string requestId = root.Q<TextField>("log-request").value.Trim();
            if (requestId.Length > 0) query.Add("requestId=" + Escape(requestId));
            detailEnvironment = environment.value;
            queryPath = "/v1/logs?" + string.Join("&", query);
            Load(queryPath, false);
        }

        private void More()
        {
            if (loading || nextCursor <= 0 || string.IsNullOrEmpty(queryPath)) return;
            olderPage = true;
            Load(queryPath + (category.value == "Eventos de sessão" ? "&before=" : "&cursor=") + nextCursor, true);
        }

        private void Load(string path, bool append)
        {
            if (loading) return;
            loading = true; int version = ++generation;
            if (!append) { nextCursor = 0; results.Clear(); firstSession = null; firstOperation = null; }
            more.SetEnabled(false); status.text = "Consultando fonte…";
            Action<long, string> complete = (code, body) =>
            {
                if (version != generation || page == null) return;
                loading = false;
                if (code != 200)
                {
                    status.text = "Fonte indisponível ou consulta recusada · HTTP " + code + " · sem cobertura confirmada.";
                    more.SetEnabled(nextCursor > 0); return;
                }
                try
                {
                    if (category.value == "Eventos de sessão")
                    {
                        var data = JsonUtility.FromJson<SessionEventPage>(body);
                        if (data?.items == null) throw new ArgumentException("Página inválida");
                        nextCursor = data.nextBefore;
                        foreach (var item in data.items) AddSessionEvent(item);
                        status.text = "Eventos · cobertura " + Coverage(data.coverage) + " · " +
                            (data.items.Length == 0 && !append ? "nenhum evento observado neste filtro" : "página recebida");
                    }
                    else
                    {
                        var data = JsonUtility.FromJson<OperationLogPage>(body);
                        if (data?.items == null) throw new ArgumentException("Página inválida");
                        nextCursor = data.nextCursor;
                        foreach (var item in data.items) AddOperation(item);
                        status.text = "Logs M5 · cobertura do ambiente " + Coverage(data.coverage) + " (não prova cobertura do recurso) · " +
                            (data.items.Length == 0 && !append ? "nenhum log observado neste filtro" : "página recebida");
                    }
                    more.SetEnabled(nextCursor > 0);
                    if (!append && results.childCount > 0)
                        results.schedule.Execute(() =>
                        {
                            if (version == generation && results.childCount > 0) roomScroll.ScrollTo(results[0]);
                        });
                    if (append) refreshAt = Time.unscaledTime + 3600f;
                    else refreshAt = Time.unscaledTime + 5f;
                }
                catch (Exception) { status.text = "Resposta inválida · cobertura desconhecida."; }
            };
            if (category.value == "Eventos de sessão") client.GetSessionEvents(path, complete);
            else client.GetOperations(path, complete);
        }

        private void AddSessionEvent(SessionEventItem item)
        {
            if (item == null) return;
            if (firstSession == null) firstSession = item;
            string label = item.observedAt + " · " + EventLabel(item.type) + "\nFonte " + item.sourceId + " · " +
                (string.IsNullOrEmpty(item.agentKey) ? "sem agente vinculado" : "agente " + item.agentKey) +
                " · " + ProvenanceLabel(item.provenance) + " · " + item.evidenceCount + " referência(s)";
            var button = new Button(() => OpenSessionDetail(item)) { text = label, tooltip = item.eventId };
            button.AddToClassList("log-entry"); results.Add(button);
        }

        private void AddOperation(OperationLogItem item)
        {
            if (item == null) return;
            if (firstOperation == null) firstOperation = item;
            string message = item.fields?.message ?? item.classification ?? "Sem mensagem";
            bool clipped = message.Length > 180;
            string preview = clipped ? message.Substring(0, 180) + "… [prévia limitada; abrir detalhe]" : message;
            var button = new Button(() => OpenOperationDetail(item))
            { text = item.observedAt + " · " + SeverityLabel(item.fields?.severity) + " · " + preview +
                "\nFonte " + item.sourceId + " · recurso " + (item.resourceId ?? "não informado") + " · sem agente vinculado" };
            button.AddToClassList("log-entry"); results.Add(button);
        }

        private void OpenSessionDetail(SessionEventItem item)
        {
            string path = "/v1/session-events/" + Escape(item.eventId) + "?projectId=" + Escape(projectId);
            status.text = "Revalidando evento no projeto…";
            int version = generation;
            client.GetSessionEvents(path, (code, body) =>
            {
                if (version != generation) return;
                if (code != 200) { status.text = "Evidência indisponível · HTTP " + code; return; }
                var detail = JsonUtility.FromJson<SessionEventItem>(body);
                if (detail == null || detail.eventId != item.eventId) { status.text = "Evidência incompatível."; return; }
                navigation.SetEvidence("Evento " + detail.eventId + "\n" + detail.observedAt + " · " + EventLabel(detail.type) +
                    "\nFonte " + detail.sourceId + " · proveniência " + ProvenanceLabel(detail.provenance) +
                    "\nSessão " + (detail.sessionKey ?? "sem vínculo") + " · agente " + (detail.agentKey ?? "sem vínculo") +
                    "\nReferências: " + (detail.evidenceRefs == null || detail.evidenceRefs.Length == 0 ? "nenhuma" : string.Join(", ", detail.evidenceRefs)) +
                    "\nConteúdo externo não aberto automaticamente.");
                status.text = "Detalhe do evento revalidado no projeto.";
            });
        }

        private void OpenOperationDetail(OperationLogItem item)
        {
            string path = "/v1/operations/evidence/" + Escape(item.observationId) + "?environmentId=" + Escape(detailEnvironment) +
                "&projectId=" + Escape(projectId);
            status.text = "Revalidando evidência no projeto e ambiente…";
            int version = generation;
            client.GetOperations(path, (code, body) =>
            {
                if (version != generation) return;
                if (code != 200) { status.text = "Evidência indisponível · HTTP " + code; return; }
                var detail = JsonUtility.FromJson<OperationLogItem>(body);
                if (detail == null || detail.observationId != item.observationId) { status.text = "Evidência incompatível."; return; }
                string message = detail.fields?.message ?? detail.classification ?? "Sem mensagem";
                navigation.SetEvidence("Log " + detail.observationId + "\n" + detail.observedAt + " · recebido " + detail.receivedAt +
                    "\nFonte " + detail.sourceId + " v" + detail.sourceVersion + " · ambiente " + detail.environmentId +
                    " · recurso " + (detail.resourceId ?? "não informado") + "\nSeveridade " + SeverityLabel(detail.fields?.severity) +
                    " · confiança " + ProvenanceLabel(detail.confidence) + "\nRequest ID " + (detail.correlation?.requestId ?? "sem correlação explícita") +
                    "\n" + message + "\nReferência externa registrada: " + detail.evidenceRef +
                    "\nO conteúdo externo exige acesso próprio; nenhum agente foi inferido por horário.");
                status.text = "Detalhe do log revalidado no projeto e ambiente.";
            });
        }

        private void ShowDiagnostics()
        {
            results.Clear(); nextCursor = 0; more.SetEnabled(false); olderPage = false;
            var sourceIds = new HashSet<string>();
            if (snapshot?.sessions != null)
                foreach (var session in snapshot.sessions) if (session.projectId == projectId) sourceIds.Add(session.sourceId);
            int count = 0;
            if (snapshot?.sources != null)
                foreach (var source in snapshot.sources)
                    if (sourceIds.Contains(source.sourceId))
                    {
                        results.Add(new Label(source.sourceId + " · " + source.status + " · última evidência " +
                            (source.lastEvidenceAt ?? "não informada") + " · erro " + (source.errorCode ?? "nenhum informado")));
                        count++;
                    }
            status.text = count == 0 ? "Sem fonte de sessão associada · sem cobertura diagnosticável." :
                count + " fonte(s) no último snapshot · diagnóstico pontual, não histórico de aplicação.";
        }

        private static string Escape(string value) => UnityWebRequest.EscapeURL(value ?? string.Empty);
        private static bool ValidTime(string value) => value.Length == 0 ||
            (Regex.IsMatch(value,@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$") &&
                DateTime.TryParse(value,CultureInfo.InvariantCulture,DateTimeStyles.AdjustToUniversal,out _));
        private static string Coverage(string value) => value == "covered" ? "atual" : value == "absent" ? "fonte ausente" :
            value == "unavailable" ? "fonte indisponível" : value == "stale" ? "desatualizada" :
            value == "disabled" ? "desligada" : value == "no_permission" ? "sem permissão" : "sem dados";
        private static string SeverityValue(string value) => value == "Informativa" ? "info" : value == "Baixa" ? "low" :
            value == "Média" ? "medium" : value == "Alta" ? "high" : "critical";
        private static string SeverityLabel(string value) => value == "info" ? "informativa" : value == "low" ? "baixa" :
            value == "medium" ? "média" : value == "high" ? "alta" : value == "critical" ? "crítica" : "não informada";
        private static string ProvenanceLabel(string value) => value == "observed" ? "observada" : value == "derived" ? "derivada" :
            value == "inferred" ? "inferida" : value == "user_asserted" ? "declarada pelo usuário" :
            value == "illustrative" ? "ilustrativa" : value;
        private static string EventLabel(string value) => value switch
        {
            "session.observed" => "Sessão observada", "session.working" => "Sessão trabalhando", "session.waiting" => "Sessão aguardando",
            "session.ended" => "Sessão encerrada", "agent.observed" => "Agente observado", "agent.working" => "Agente trabalhando",
            "agent.waiting" => "Agente aguardando", "agent.ended" => "Agente encerrado", "task.observed" => "Tarefa observada",
            "task.working" => "Tarefa em andamento", "task.waiting" => "Tarefa aguardando", "task.completed" => "Tarefa concluída",
            "tool.observed" => "Ferramenta observada", "tool.result" => "Resultado de ferramenta", "tool.failed" => "Falha de ferramenta",
            "skill.observed" => "Skill observada", "message.observed" => "Mensagem observada", "request.observed" => "Pedido observado",
            "source.unavailable" => "Fonte indisponível", "source.recovered" => "Fonte recuperada", "resource.observed" => "Recurso observado",
            "github.observed" => "Evento GitHub observado", _ => value
        };

#if DEVELOPMENT_BUILD && !UNITY_EDITOR
        public void OpenFirstForValidation()
        {
            if (category.value == "Eventos de sessão" && firstSession != null) OpenSessionDetail(firstSession);
            else if (category.value == "Logs de aplicação / infraestrutura" && firstOperation != null) OpenOperationDetail(firstOperation);
        }
#endif
    }
}

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class CommandPresenter : MonoBehaviour
    {
        private VisualElement panel, mask;
        private LiveStateClient client;
        private HistoryHudPresenter history;
        private DropdownField sessions, actions, requests;
        private TextField message;
        private Label status, context, resultStatus;
        private Button review, confirm, inspect;
        private CommandCapabilities capabilities;
        private CommandIntentFields pending;
        private CommandPreview preview;
        private string projectId, commandId;
        private string actionError;
        private readonly string[] actionIds = { "send_message", "answer_question", "decide_permission" };
        private bool busy, replay, rebuilding;
        private int generation;
        private readonly Dictionary<string, string> drafts = new Dictionary<string, string>();
        private string draftKey, preferredSessionKey;
        private float refreshAt;
        public bool HasPendingConfirmation => preview != null;

        public bool HasCredential => !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WR3D_COMMAND_TOKEN")) && Encoding.UTF8.GetByteCount(Environment.GetEnvironmentVariable("WR3D_COMMAND_TOKEN")) >= 32 &&
            Environment.GetEnvironmentVariable("WR3D_COMMAND_TOKEN") != Environment.GetEnvironmentVariable("WR3D_SERVICE_TOKEN");

        public void Configure(VisualElement root, LiveStateClient liveClient, HistoryHudPresenter historyPresenter)
        {
            client = liveClient; history = historyPresenter;
            panel = new VisualElement { name = "command-panel" }; panel.AddToClassList("command-panel");
            mask = new VisualElement { name = "command-mask" }; mask.AddToClassList("command-mask");
            root.Add(mask); root.Add(panel); panel.style.display = mask.style.display = DisplayStyle.None;
            var header = new VisualElement { name = "command-header" }; panel.Add(header);
            var title = new Label("Interação assistida") { name = "command-title" }; title.AddToClassList("history-title"); header.Add(title);
            var target = new Label("Alvo: selecione projeto e sessão") { name = "command-target" }; header.Add(target);
            var body = new ScrollView { name = "command-body" }; panel.Add(body);
            status = new Label("Aguardando capacidades comprovadas.") { name = "command-status", enableRichText = false }; status.AddToClassList("activity"); body.Add(status);
            resultStatus = new Label { name = "command-result", enableRichText = false }; resultStatus.AddToClassList("activity"); body.Add(resultStatus);
            sessions = new DropdownField("Sessão") { name = "command-session" }; body.Add(sessions);
            actions = new DropdownField("Ação", new List<string> { "Enviar mensagem", "Responder pergunta", "Decidir permissão" }, 0) { name = "command-action" }; body.Add(actions);
            requests = new DropdownField("Pedido original") { name = "command-request" }; body.Add(requests);
            message = new TextField("Mensagem / resposta") { name = "command-message", multiline = true, maxLength = 8000 }; body.Add(message);
            var decision = new DropdownField("Decisão", new List<string> { "Recusar", "Permitir" }, 0) { name = "command-decision" }; body.Add(decision);
            context = new Label { name = "command-context", enableRichText = false }; context.AddToClassList("activity"); body.Add(context);
            var footer = new VisualElement { name = "command-footer" }; panel.Add(footer);
            review = new Button(() => StartCoroutine(Review(decision.index == 1 ? "allow" : "deny"))) { name = "command-review", text = "Revisar intenção" }; footer.Add(review);
            confirm = new Button(Confirm) { name = "command-confirm", text = "Confirmar envio" }; footer.Add(confirm);
            inspect = new Button(() => StartCoroutine(Inspect())) { name = "command-inspect", text = "Consultar último comando" }; footer.Add(inspect); inspect.SetEnabled(false);
            footer.Add(new Button(Close) { name = "command-close", text = "Fechar" });
            var open = root.Q<Button>("command-button"); open.style.display = DisplayStyle.Flex; open.clicked += Open;
            sessions.RegisterValueChangedCallback(_ => { if (!rebuilding) { SwitchDraft(); Invalidate(); RebuildRequests(); Refresh(); } });
            actions.RegisterValueChangedCallback(_ => { SwitchDraft(); Invalidate(); RebuildRequests(); Refresh(); });
            requests.RegisterValueChangedCallback(_ => { if (!rebuilding) { Invalidate(); Refresh(); } });
            message.RegisterValueChangedCallback(_ => { if (draftKey != null) drafts[draftKey] = message.value; Invalidate(); Refresh(); });
            decision.RegisterValueChangedCallback(_ => { Invalidate(); Refresh(); });
            client.ConnectionChanged += ConnectionChanged;
            client.SnapshotChanged += SnapshotChanged;
            history.ReplayChanged += ReplayChanged;
            Refresh();
        }
        public void SelectProject(string value) { if (value == projectId) return; projectId = value; Invalidate(); Rebuild(); }
        public void OpenForSession(string project, string session)
        {
            if (string.IsNullOrEmpty(project) || string.IsNullOrEmpty(session)) return;
            preferredSessionKey = session;
            SelectProject(project);
            if (actions.index != 0) actions.index = 0;
            Rebuild(); Open();
        }
        private void SwitchDraft()
        {
            if (draftKey != null) drafts[draftKey] = message.value;
            draftKey = string.IsNullOrEmpty(projectId) || string.IsNullOrEmpty(sessions.value) ? null :
                projectId + "|" + sessions.value + "|" + ActionId;
            message.SetValueWithoutNotify(draftKey != null && drafts.TryGetValue(draftKey, out var saved) ? saved : "");
        }
        private void Invalidate() { generation++; pending = null; preview = null; actionError = null; if (context != null) context.text = ""; if (confirm != null) confirm.SetEnabled(false); }
        private void Open() { panel.style.display = mask.style.display = DisplayStyle.Flex; panel.Q<Button>("command-close").Focus(); StartCoroutine(LoadCapabilities()); }
        private void Close() { Invalidate(); panel.style.display = mask.style.display = DisplayStyle.None; }
        public bool HandleEscape() { if (panel == null || panel.style.display == DisplayStyle.None) return false; Close(); return true; }
        private void ConnectionChanged(bool connected, string reason) { if (!connected) { Invalidate(); capabilities = null; } Refresh(); }
        private void SnapshotChanged(LiveSnapshot snapshot)
        {
            var selected = SelectedSession();
            if (selected != null && Array.Find(snapshot.sessions, item => item.sessionKey == selected.sessionKey && item.projectId == selected.projectId && item.presence != "encerrada" && item.freshness == "atual") == null)
            { capabilities = null; Invalidate(); Rebuild(); }
        }
        private void ReplayChanged(bool value) { replay = value; Invalidate(); Refresh(); }
        private void Update()
        {
            if (panel == null || panel.style.display == DisplayStyle.None) return;
            if (preview != null && (!DateTime.TryParse(preview.expiresAt, null, DateTimeStyles.RoundtripKind, out var expiry) || expiry.ToUniversalTime() <= DateTime.UtcNow)) Invalidate();
            Refresh();
            if (!busy && Time.realtimeSinceStartup >= refreshAt) { refreshAt = Time.realtimeSinceStartup + 5; StartCoroutine(LoadCapabilities()); }
        }
        private string ActionId => actionIds[Mathf.Clamp(actions.index, 0, actionIds.Length - 1)];
        private CommandSession SelectedSession() => capabilities?.sessions == null ? null : Array.Find(capabilities.sessions, item => item.projectId == projectId && item.sessionKey == sessions.value);
        private CommandRequest SelectedRequest() => SelectedSession()?.requests == null ? null : Array.Find(SelectedSession().requests, item => item.requestId == requests.value && item.action == ActionId);
        private void Rebuild()
        {
            rebuilding = true;
            var choices = new List<string>();
            if (capabilities?.sessions != null) foreach (var session in capabilities.sessions) if (session.projectId == projectId) choices.Add(session.sessionKey);
            var prior = sessions.value; sessions.choices = choices;
            var preferred = !string.IsNullOrEmpty(preferredSessionKey) && choices.Contains(preferredSessionKey) ? preferredSessionKey : null;
            sessions.SetValueWithoutNotify(preferred ?? (choices.Contains(prior) ? prior : choices.Count > 0 ? choices[0] : ""));
            if (preferred != null) preferredSessionKey = null;
            rebuilding = false; SwitchDraft(); RebuildRequests(); Refresh();
        }
        private void RebuildRequests()
        {
            rebuilding = true;
            var choices = new List<string>(); var selected = SelectedSession();
            if (selected?.requests != null) foreach (var request in selected.requests) if (request.action == ActionId) choices.Add(request.requestId);
            var prior = requests.value; requests.choices = choices; requests.SetValueWithoutNotify(choices.Contains(prior) ? prior : choices.Count > 0 ? choices[0] : ""); rebuilding = false;
        }
        private void Refresh()
        {
            if (review == null) return;
            var available = CommandPolicy.CanOffer(SelectedSession(), ActionId, client.Connected, replay, HasCredential, DateTime.UtcNow);
            var request = SelectedRequest();
            var projectName = Array.Find(client.Snapshot?.projects ?? Array.Empty<LiveProject>(), item => item.projectId == projectId)?.name ?? "Projeto indisponível";
            panel.Q<Label>("command-target").text = "Alvo: " + projectName + (SelectedSession() == null ? " · sem sessão com capacidade" : " · " + SelectedSession().provider);
            requests.style.display = ActionId == "send_message" ? DisplayStyle.None : DisplayStyle.Flex;
            message.style.display = ActionId == "decide_permission" ? DisplayStyle.None : DisplayStyle.Flex;
            panel.Q<DropdownField>("command-decision").style.display = ActionId == "decide_permission" ? DisplayStyle.Flex : DisplayStyle.None;
            var requestValid = ActionId == "send_message" || (request != null && DateTime.TryParse(request.deadlineAt, null, DateTimeStyles.RoundtripKind, out var until) && until.ToUniversalTime() > DateTime.UtcNow);
            review.SetEnabled(!busy && available && requestValid && (ActionId == "decide_permission" || !string.IsNullOrWhiteSpace(message.value)));
            confirm.SetEnabled(!busy && available && requestValid && preview != null);
            sessions.SetEnabled(!busy); actions.SetEnabled(!busy); requests.SetEnabled(!busy); message.SetEnabled(!busy);
            panel.Q<DropdownField>("command-decision").SetEnabled(!busy);
            if (!busy) status.text = replay ? "REPLAY · comandos indisponíveis." : !client.Connected ? "Conexão indisponível · use o fluxo nativo do provedor." : !HasCredential ? "Credencial de comando não configurada." : !available ? "Capacidade sem prova válida para esta versão e sessão. Use o fluxo nativo do provedor." : actionError ?? (preview != null ? "Intenção revisada · aguardando sua confirmação." : "Revise alvo, pedido e consequência antes de confirmar.");
            if (preview == null && request != null) context.text = "Pedido original: " + request.originalContext + "\nOrigem: " + request.sourceRef + "\nPrazo: " + request.deadlineAt + "\nConsequência: " + request.consequence;
        }
        private UnityWebRequest Request(string route, string json = null)
        {
            var request = client.CreateCommandRequest(route);
            if (request == null) return null;
            if (HasCredential) request.SetRequestHeader("Authorization", "Bearer " + Environment.GetEnvironmentVariable("WR3D_COMMAND_TOKEN"));
            if (json != null) { request.method = "POST"; request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)); request.SetRequestHeader("Content-Type", "application/json"); }
            request.timeout = 15; request.redirectLimit = 0; return request;
        }
        private IEnumerator LoadCapabilities()
        {
            if (busy || !client.Connected || replay) yield break;
            busy = true; var version = generation;
            using (var request = Request("/v1/capabilities"))
            {
                if (request != null)
                {
                    yield return request.SendWebRequest();
                    if (version == generation)
                    {
                        try { capabilities = request.result == UnityWebRequest.Result.Success ? JsonUtility.FromJson<CommandCapabilities>(request.downloadHandler.text) : null; }
                        catch (Exception) { capabilities = null; }
                    }
                }
            }
            busy = false; refreshAt = Time.realtimeSinceStartup + 5;
            if (preview != null && !CommandPolicy.CanOffer(SelectedSession(), ActionId, client.Connected, replay, HasCredential, DateTime.UtcNow)) Invalidate();
            Rebuild();
        }
        private IEnumerator Review(string decision)
        {
            if (!review.enabledSelf || busy) yield break;
            var session = SelectedSession(); var original = SelectedRequest();
            CommandIntentFields intent = ActionId == "decide_permission" ? new DecisionIntent { payload = new DecisionPayload { decision = decision } } : (CommandIntentFields)new MessageIntent { payload = new MessagePayload { text = message.value } };
            intent.commandId = "command-" + Guid.NewGuid().ToString("N"); intent.idempotencyKey = "key-" + Guid.NewGuid().ToString("N");
            intent.projectId = projectId; intent.sessionKey = session.sessionKey; intent.provider = session.provider; intent.providerVersion = session.providerVersion;
            intent.action = ActionId; intent.requestId = original?.requestId;
            intent.deadlineAt = (original != null ? DateTime.Parse(original.deadlineAt, null, DateTimeStyles.RoundtripKind).ToUniversalTime() : DateTime.UtcNow.AddSeconds(60)).ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
            busy = true; var version = generation; Refresh();
            using (var request = Request("/v1/commands/preview", CommandPolicy.Serialize(intent)))
            {
                if (request != null)
                {
                    yield return request.SendWebRequest();
                    if (version == generation && request.result == UnityWebRequest.Result.Success)
                    {
                        CommandPreview received = null;
                        try { received = JsonUtility.FromJson<CommandPreview>(request.downloadHandler.text); } catch (Exception) { }
                        if (received != null && received.commandId == intent.commandId && received.sessionKey == intent.sessionKey && received.projectId == intent.projectId && !string.IsNullOrEmpty(received.confirmationId))
                        {
                            pending = intent; preview = received; pending.confirmationId = preview.confirmationId;
                            context.text = "Projeto: " + preview.projectId + "\nSessão: " + preview.sessionKey + "\nProvedor: " + preview.provider + " " + preview.providerVersion + "\nAção: " + actions.value +
                                (string.IsNullOrEmpty(preview.requestId) ? "" : "\nPedido: " + preview.requestId + "\nConteúdo original: " + preview.originalContext) +
                                (intent is MessageIntent outgoing ? "\nTexto a enviar: " + outgoing.payload.text : "\nDecisão: " + (preview.decision == "allow" ? "Permitir" : "Recusar")) +
                                "\nOrigem: " + preview.sourceRef + "\nPrazo: " + preview.deadlineAt + "\nConsequência: " + preview.consequence;
                        }
                    }
                }
            }
            busy = false; if (preview == null) actionError = "Prévia indisponível. Atualize as capacidades ou use o fluxo nativo."; Refresh();
        }
        private void Confirm()
        {
            if (!confirm.enabledSelf || pending == null || preview == null || busy) return;
            var intent = pending; commandId = intent.commandId; pending = null; preview = null; busy = true; Refresh();
            StartCoroutine(Submit(intent));
        }
        private IEnumerator Submit(CommandIntentFields intent)
        {
            using (var request = Request("/v1/commands", CommandPolicy.Serialize(intent)))
            {
                if (request != null)
                {
                    yield return request.SendWebRequest();
                    ShowResult(request);
                }
                else resultStatus.text = "Último comando: " + CommandPolicy.ResultLabel("unknown");
            }
            busy = false; inspect.SetEnabled(true); capabilities = null; Invalidate(); Refresh();
        }
        private IEnumerator Inspect()
        {
            if (busy || commandId == null || !client.Connected) yield break;
            busy = true;
            using (var request = Request("/v1/commands/" + commandId))
            { if (request != null) { yield return request.SendWebRequest(); ShowResult(request); } }
            busy = false; Refresh();
        }
        private void ShowResult(UnityWebRequest request)
        {
            CommandResult result = null;
            if (request.result == UnityWebRequest.Result.Success) try { result = JsonUtility.FromJson<CommandResult>(request.downloadHandler.text); } catch (Exception) { }
            resultStatus.text = "Último comando: " + CommandPolicy.ResultLabel(result != null && result.commandId == commandId ? result.state : "unknown");
        }
        private void OnDestroy()
        {
            if (client != null) { client.ConnectionChanged -= ConnectionChanged; client.SnapshotChanged -= SnapshotChanged; }
            if (history != null) history.ReplayChanged -= ReplayChanged;
        }
    }
}

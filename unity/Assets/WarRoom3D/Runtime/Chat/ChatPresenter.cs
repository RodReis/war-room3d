using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class ChatPresenter : MonoBehaviour
    {
        private LiveStateClient client;
        private CommandPresenter commands;
        private VisualElement page;
        private VisualElement messages;
        private Label scope, status;
        private Button more, refresh, interact, delete;
        private string projectId, sessionKey, agentKey;
        private long nextBefore;
        private int generation;
        private bool busy, replay, loadedOlder;
        private float refreshAt;
        private float deleteConfirmUntil;
        public bool LoadedPage { get; private set; }
        public int VisibleMessageCount => messages?.childCount ?? 0;
        public string CurrentSessionKey => sessionKey;

        public void Configure(VisualElement root, LiveStateClient liveClient, CommandPresenter commandPresenter)
        {
            client = liveClient; commands = commandPresenter;
            page = root.Q<VisualElement>("page-chat");
            messages = root.Q<VisualElement>("chat-messages");
            scope = root.Q<Label>("chat-scope"); status = root.Q<Label>("chat-status");
            more = root.Q<Button>("chat-more"); refresh = root.Q<Button>("chat-refresh");
            interact = root.Q<Button>("chat-interact");
            delete = root.Q<Button>("chat-delete");
            more.clicked += () => { if (nextBefore > 0) StartCoroutine(Load(nextBefore, false)); };
            refresh.clicked += () => StartCoroutine(Load(0, true));
            interact.clicked += () => commands.OpenForSession(projectId, sessionKey);
            delete.clicked += DeleteClicked;
            Clear("Selecione um agente observado para consultar sua sessão.");
        }

        public void SetTarget(string project, string session, string agent)
        {
            if (projectId == project && sessionKey == session && agentKey == agent) return;
            projectId = project; sessionKey = session; agentKey = agent; generation++;
            Clear(replay ? "REPRODUÇÃO · chat live indisponível." : string.IsNullOrEmpty(session)
                ? "Selecione um agente observado para consultar sua sessão." : "Histórico ainda não consultado.");
            if (!replay && !string.IsNullOrEmpty(session) && client.Connected && page.resolvedStyle.display != DisplayStyle.None)
                StartCoroutine(Load(0, true));
        }

        public void SetReplayMode(bool active)
        {
            replay = active; generation++;
            Clear(active ? "REPRODUÇÃO · chat live indisponível." : "Selecione um agente observado para consultar sua sessão.");
            if (!active && !string.IsNullOrEmpty(sessionKey) && client.Connected && page.resolvedStyle.display != DisplayStyle.None)
                StartCoroutine(Load(0, true));
        }

        private void Clear(string reason)
        {
            messages?.Clear(); nextBefore = 0; loadedOlder = false;
            deleteConfirmUntil = 0;
            LoadedPage = false;
            if (scope == null) return;
            scope.text = string.IsNullOrEmpty(sessionKey) ? "Sem sessão selecionada" : "Agente: " + agentKey + " · Sessão: " + sessionKey;
            status.text = reason;
            more.SetEnabled(false); interact.SetEnabled(!replay && !string.IsNullOrEmpty(sessionKey));
            delete.text = "Excluir histórico desta sessão";
            delete.SetEnabled(!replay && !string.IsNullOrEmpty(sessionKey) && commands.HasCredential);
        }

        private void DeleteClicked()
        {
            if (replay || busy || string.IsNullOrEmpty(sessionKey) || !commands.HasCredential) return;
            if (Time.realtimeSinceStartup > deleteConfirmUntil)
            {
                deleteConfirmUntil = Time.realtimeSinceStartup + 10;
                delete.text = "Confirmar exclusão desta sessão (10 s)";
                status.text = "Confirme a exclusão do conteúdo observado desta sessão. A ação não altera o provedor.";
                return;
            }
            deleteConfirmUntil = 0;
            delete.text = "Excluir histórico desta sessão";
            StartCoroutine(Delete());
        }

        private IEnumerator Delete()
        {
            var targetProject=projectId; var targetSession=sessionKey; var version=generation;
            busy=true; delete.SetEnabled(false);
            var route="/v1/conversations?projectId="+Uri.EscapeDataString(targetProject)+"&sessionKey="+Uri.EscapeDataString(targetSession);
            UnityWebRequest opened=null;
            try { opened=client.CreateConversationDeleteRequest(route,targetSession); } catch (ArgumentException) { }
            if (opened == null) { status.text="Exclusão indisponível nesta conexão."; busy=false; delete.SetEnabled(true); yield break; }
            using (var request=opened)
            {
                yield return request.SendWebRequest();
                if (version == generation && projectId == targetProject && sessionKey == targetSession)
                {
                    if (request.result == UnityWebRequest.Result.Success && request.responseCode == 200)
                    {
                        messages.Clear(); nextBefore=0; LoadedPage=false;
                        status.text="Conteúdo desta sessão excluído do serviço local.";
                    }
                    else status.text="Exclusão não confirmada; consulte novamente antes de repetir.";
                }
            }
            busy=false; delete.SetEnabled(!replay && !string.IsNullOrEmpty(sessionKey) && commands.HasCredential);
        }

        private void Update()
        {
            if (deleteConfirmUntil > 0 && Time.realtimeSinceStartup > deleteConfirmUntil)
            {
                deleteConfirmUntil = 0;
                delete.text = "Excluir histórico desta sessão";
            }
            if (page == null || replay || string.IsNullOrEmpty(sessionKey) || !client.Connected || busy || loadedOlder ||
                page.resolvedStyle.display == DisplayStyle.None || Time.realtimeSinceStartup < refreshAt) return;
            refreshAt = Time.realtimeSinceStartup + 5;
            StartCoroutine(Load(0, true));
        }

        private IEnumerator Load(long before, bool replace)
        {
            if (busy || replay || string.IsNullOrEmpty(projectId) || string.IsNullOrEmpty(sessionKey) || !client.Connected) yield break;
            var requestedProject = projectId; var requestedSession = sessionKey; var version = generation;
            busy = true; status.text = "Consultando histórico observado…";
            var route = "/v1/conversations?projectId=" + Uri.EscapeDataString(requestedProject) +
                "&sessionKey=" + Uri.EscapeDataString(requestedSession) + "&limit=20" + (before > 0 ? "&before=" + before : "");
            UnityWebRequest opened = null;
            try { opened = client.CreateConversationRequest(route); } catch (ArgumentException) { }
            if (opened == null)
            {
                status.text = "Histórico indisponível nesta conexão de teste.";
                busy = false;
                yield break;
            }
            using (var request = opened)
            {
                if (request != null)
                {
                    yield return request.SendWebRequest();
                    if (version == generation && requestedProject == projectId && requestedSession == sessionKey)
                    {
                        ChatPage data = null;
                        if (request.result == UnityWebRequest.Result.Success && request.responseCode == 200)
                            try { data = JsonUtility.FromJson<ChatPage>(request.downloadHandler.text); } catch (Exception) { }
                        if (data != null && data.schemaVersion == "1.0" && data.projectId == projectId && data.sessionKey == sessionKey && !data.receiptIsResponse)
                        {
                            if (replace) { messages.Clear(); loadedOlder = false; }
                            if (data.items != null)
                                for (int i = data.items.Length - 1; i >= 0; i--)
                                {
                                    var item = data.items[i];
                                    if (item == null || item.projectId != projectId || item.sessionKey != sessionKey) continue;
                                    var label = new Label((item.role == "assistant" ? "Agente" : "Usuário") + " · " + item.observedAt +
                                        " · " + item.provider + " · fonte " + item.sourceId +
                                        (string.IsNullOrEmpty(item.turnRef) ? " · turno sem vínculo" : " · turno " + item.turnRef) +
                                        " · retido até " + item.expiresAt + "\n" + item.content +
                                        (item.truncated ? "\n[Conteúdo truncado na captura]" : "")) { enableRichText = false };
                                    label.AddToClassList("chat-message");
                                    label.AddToClassList(item.role == "assistant" ? "chat-assistant" : "chat-user");
                                    messages.Insert(0, label);
                                }
                            nextBefore = data.nextBefore;
                            LoadedPage = true;
                            loadedOlder |= before > 0;
                            status.text = messages.childCount == 0 ? "Sem conteúdo de conversa autorizado/observado nesta sessão." :
                                "Histórico observado · " + messages.childCount + " mensagem(ns). Recibo de envio é separado da resposta.";
                            more.SetEnabled(nextBefore > 0);
                        }
                        else status.text = "Histórico indisponível; verifique fonte, escopo e conexão.";
                    }
                }
            }
            busy = false; refreshAt = version == generation ? Time.realtimeSinceStartup + 5 : 0;
        }
    }
}

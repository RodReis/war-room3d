#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    // Prova opt-in do G2; só roda com serviço sintético de desenvolvimento.
    public sealed class Issue35PlayerProof : MonoBehaviour
    {
        private string directory;

        [Serializable]
        private sealed class Result
        {
            public string status;
            public string reason;
            public bool synthetic;
            public bool agentAndActivity;
            public bool chat;
            public bool logAndEvidence;
            public bool sourceLossAndRecovery;
            public bool returnedToSector;
            public int width;
            public int height;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WR3D_35_PROOF_DIR"))) return;
            var client = FindAnyObjectByType<LiveStateClient>();
            if (client != null) client.gameObject.AddComponent<Issue35PlayerProof>();
        }

        private IEnumerator Start()
        {
            directory = Environment.GetEnvironmentVariable("WR3D_35_PROOF_DIR");
            Directory.CreateDirectory(directory);
            var client = GetComponent<LiveStateClient>();
            var hud = GetComponent<LiveHudPresenter>();
            var root = GetComponent<UIDocument>()?.rootVisualElement;
            var deadline = Time.realtimeSinceStartup + 20f;
            while ((client == null || !client.Connected || client.Snapshot == null || hud == null || root == null ||
                root.Q<VisualElement>("agent-list") == null) && Time.realtimeSinceStartup < deadline)
            {
                yield return null;
                client = GetComponent<LiveStateClient>();
                hud = GetComponent<LiveHudPresenter>();
                root = GetComponent<UIDocument>()?.rootVisualElement;
            }
            if (client?.Snapshot == null || hud == null || root == null ||
                !Array.Exists(client.Snapshot.projects, item => item.projectId == "lab-35") ||
                GetComponent<CommandPresenter>()?.HasCredential != false)
            { Fail("servico_sintetico_ou_bloqueio_de_comando_ausente"); yield break; }

            var result = new Result { status = "fail", synthetic = true, width = Screen.width, height = Screen.height };
            hud.SendMessage("SelectProjectForValidation", "lab-35");
            hud.SendMessage("EnterRoom");
            hud.SendMessage("SelectAgentForValidation", "agent-child");
            yield return new WaitForEndOfFrame();
            var detail = root.Q<Label>("evidence-body")?.text ?? "";
            var avatar = GetComponent<AgentPresenter>();
            result.agentAndActivity = hud.SelectedAgentKeyForValidation == "agent-child" &&
                avatar != null && avatar.VisibleCount == 3 && avatar.ParentLinkVisible &&
                detail.Contains("Revisar resposta sintética") && detail.Contains("Read") && detail.Contains("review");
            if (!result.agentAndActivity)
            {
                File.WriteAllText(Path.Combine(directory, "diagnostico-atividade.txt"),
                    "selected=" + hud.SelectedAgentKeyForValidation + " avatars=" + (avatar?.VisibleCount ?? -1) +
                    " parentLink=" + (avatar?.ParentLinkVisible ?? false) + " detail=" + detail);
                Fail("selecao_ou_atividade_ausente"); yield break;
            }
            yield return Capture("01-agente-atividade");

            hud.SendMessage("OpenChatForValidation");
            var chat = GetComponent<ChatPresenter>();
            deadline = Time.realtimeSinceStartup + 10f;
            while ((chat == null || !chat.LoadedPage) && Time.realtimeSinceStartup < deadline) yield return null;
            result.chat = chat != null && chat.LoadedPage && chat.CurrentSessionKey == "session-child" &&
                chat.VisibleMessageCount == 2 &&
                (root.Q<VisualElement>("chat-messages")?.Q<Label>()?.text ?? "").Contains("Pedido sintético") &&
                (root.Q<VisualElement>("chat-messages")?[1] as Label)?.text?.Contains("Resposta sintética") == true;
            if (!result.chat)
            {
                File.WriteAllText(Path.Combine(directory, "diagnostico-chat.txt"),
                    "loaded=" + (chat?.LoadedPage ?? false) + " session=" + chat?.CurrentSessionKey +
                    " count=" + (chat?.VisibleMessageCount ?? -1) +
                    " status=" + root.Q<Label>("chat-status")?.text +
                    " first=" + root.Q<VisualElement>("chat-messages")?.Q<Label>()?.text);
                yield return Capture("02-chat-falha");
                Fail("chat_da_sessao_ausente"); yield break;
            }
            yield return Capture("02-chat");

            hud.SendMessage("OpenLogsForValidation");
            var logs = GetComponent<RoomLogPresenter>();
            var category = root.Q<DropdownField>("log-category");
            category.value = "Logs de aplicação / infraestrutura";
            logs.SendMessage("Query");
            deadline = Time.realtimeSinceStartup + 10f;
            while (root.Q<VisualElement>("log-results").childCount == 0 && Time.realtimeSinceStartup < deadline)
                yield return null;
            logs.OpenFirstForValidation();
            deadline = Time.realtimeSinceStartup + 10f;
            while (!(root.Q<Label>("evidence-body")?.text?.Contains("request-35") ?? false) &&
                Time.realtimeSinceStartup < deadline) yield return null;
            var evidence = root.Q<Label>("evidence-body")?.text ?? "";
            result.logAndEvidence = evidence.Contains("request-35") && evidence.Contains("fixture://35/log-35") &&
                !evidence.Contains("synthetic-canary") && hud.SelectedAgentKeyForValidation == "agent-child";
            if (!result.logAndEvidence) { Fail("log_evidencia_ou_redacao_falhou"); yield break; }
            yield return Capture("03-log-evidencia");
            hud.SendMessage("CloseEvidenceForValidation");

            File.WriteAllText(Path.Combine(directory, "source-loss.request"), "1");
            deadline = Time.realtimeSinceStartup + 10f;
            while (!File.Exists(Path.Combine(directory, "source-loss.done")) && Time.realtimeSinceStartup < deadline)
                yield return null;
            deadline = Time.realtimeSinceStartup + 10f;
            while (!SourceHas(client, "source-codex", "indisponivel") && Time.realtimeSinceStartup < deadline)
                yield return null;
            var lost = SourceHas(client, "source-codex", "indisponivel") &&
                Array.Exists(client.Snapshot.agents, item => item.agentKey == "agent-child" && item.presence == "desconhecida");
            if (!lost) { Fail("perda_de_fonte_nao_projetada"); yield break; }
            yield return Capture("04-fonte-perdida");
            File.WriteAllText(Path.Combine(directory, "source-recovery.request"), "1");
            deadline = Time.realtimeSinceStartup + 10f;
            while (!File.Exists(Path.Combine(directory, "source-recovery.done")) && Time.realtimeSinceStartup < deadline)
                yield return null;
            deadline = Time.realtimeSinceStartup + 10f;
            while (!SourceHas(client, "source-codex", "atual") && Time.realtimeSinceStartup < deadline)
                yield return null;
            result.sourceLossAndRecovery = SourceHas(client, "source-codex", "atual") &&
                Array.Exists(client.Snapshot.agents, item => item.agentKey == "agent-child" && item.presence == "desconhecida");
            if (!result.sourceLossAndRecovery) { Fail("recuperacao_inventou_atividade"); yield break; }
            hud.SendMessage("ReturnToSector");
            yield return new WaitForEndOfFrame();
            result.returnedToSector = root.Q<Label>("room-label")?.text == "SELECIONE UMA SALA";
            if (!result.returnedToSector) { Fail("retorno_ao_quartel_falhou"); yield break; }
            yield return Capture("05-retorno-quartel");
            result.status = "pass";
            File.WriteAllText(Path.Combine(directory, "issue-35-result.json"), JsonUtility.ToJson(result, true));
            Application.Quit(0);
        }

        private static bool SourceHas(LiveStateClient client, string id, string status) =>
            client?.Snapshot?.sources != null && Array.Exists(client.Snapshot.sources,
                item => item.sourceId == id && item.status == status);

        private IEnumerator Capture(string name)
        {
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            if (texture == null) { Fail("captura_indisponivel"); yield break; }
            try { File.WriteAllBytes(Path.Combine(directory, name + ".png"), texture.EncodeToPNG()); }
            finally { Destroy(texture); }
        }

        private void Fail(string reason)
        {
            File.WriteAllText(Path.Combine(directory, "issue-35-result.json"),
                JsonUtility.ToJson(new Result { status = "fail", reason = reason, synthetic = true,
                    width = Screen.width, height = Screen.height }, true));
            Application.Quit(35);
        }
    }
}
#endif

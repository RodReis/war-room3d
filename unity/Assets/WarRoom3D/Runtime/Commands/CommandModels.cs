using System;
using UnityEngine;

namespace WarRoom3D
{
    [Serializable] public sealed class CommandCapabilities { public string schemaVersion; public CommandSession[] sessions; }
    [Serializable] public sealed class CommandSession
    {
        public string projectId, sessionKey, provider, providerVersion;
        public bool active;
        public CommandCapability[] capabilities;
        public CommandRequest[] requests;
    }
    [Serializable] public sealed class CommandCapability { public string action, reason; public bool available; public CapabilityProof proof; }
    [Serializable] public sealed class CapabilityProof { public string evidenceRef, adapterVersion, provenAt, validUntil; }
    [Serializable] public sealed class CommandRequest { public string requestId, sessionKey, projectId, action, originalContext, consequence, sourceRef, deadlineAt; }
    [Serializable] public sealed class CommandPreview
    {
        public string confirmationId, commandId, projectId, sessionKey, provider, providerVersion, action, requestId, deadlineAt;
        public string originalContext, consequence, sourceRef, decision, expiresAt;
    }
    [Serializable] public sealed class CommandResult { public string commandId, projectId, sessionKey, state, reason, updatedAt; }

    [Serializable] public class CommandIntentFields
    {
        public string schemaVersion = "1.0";
        public string commandId, idempotencyKey, mode = "live", projectId, sessionKey, provider, providerVersion, action, requestId, deadlineAt, confirmationId;
    }
    [Serializable] public sealed class MessageIntent : CommandIntentFields { public MessagePayload payload; }
    [Serializable] public sealed class DecisionIntent : CommandIntentFields { public DecisionPayload payload; }
    [Serializable] public sealed class MessagePayload { public string text; }
    [Serializable] public sealed class DecisionPayload { public string decision; }

    public static class CommandPolicy
    {
        public static bool CanOffer(CommandSession session, string action, bool connected, bool replay, bool hasCredential, DateTime now)
        {
            if (session == null || !session.active || !connected || replay || !hasCredential || session.capabilities == null) return false;
            var capability = Array.Find(session.capabilities, item => item != null && item.action == action);
            return capability != null && capability.available && capability.proof != null && !string.IsNullOrWhiteSpace(capability.proof.evidenceRef) &&
                DateTime.TryParse(capability.proof.validUntil, null, System.Globalization.DateTimeStyles.RoundtripKind, out var until) && until.ToUniversalTime() > now.ToUniversalTime();
        }
        public static string Serialize(CommandIntentFields intent)
        {
            // JsonUtility representa string nula como vazia em algumas versões; o contrato exige null explícito.
            return JsonUtility.ToJson(intent).Replace("\"requestId\":\"\"", "\"requestId\":null").Replace("\"confirmationId\":\"\"", "\"confirmationId\":null");
        }
        public static string ResultLabel(string state)
        {
            switch (state)
            {
                case "confirmed": return "Recebimento confirmado · a tarefa pode continuar em execução.";
                case "rejected": return "Comando recusado. Use o fluxo nativo do provedor se necessário.";
                case "expired": return "Prazo expirado · comando não enviado.";
                case "unknown": return "Resultado incerto · pode ter sido enviado. Confira no provedor antes de criar outra intenção.";
                default: return "Comando em processamento · consulte o resultado; não reenvie.";
            }
        }
    }
}

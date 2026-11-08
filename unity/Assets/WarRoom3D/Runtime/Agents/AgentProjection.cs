using System;
using System.Collections.Generic;

namespace WarRoom3D
{
    public sealed class AgentProjectionRecord
    {
        public string AgentKey;
        public string SessionKey;
        public string ParentAgentKey;
        public string ParentStatus;
        public string Provider;
        public string Presence;
        public string DisplayState;
        public string LastSeen;
        public bool Uncertain;
        public bool Ended;
        public bool Failure;
        public string Detail;
        public string Label;
    }

    // Única fonte de verdade para árvore textual e corpos na sala.
    public static class AgentProjection
    {
        public static List<AgentProjectionRecord> ForProject(LiveSnapshot snapshot, string projectId, bool connected)
        {
            var result = new List<AgentProjectionRecord>();
            if (snapshot == null || string.IsNullOrEmpty(projectId)) return result;
            var sessions = new Dictionary<string, LiveSession>();
            foreach (var session in snapshot.sessions)
                if (session != null && session.projectId == projectId && !string.IsNullOrEmpty(session.sessionKey))
                    sessions[session.sessionKey] = session;
            var keys = new HashSet<string>();
            foreach (var agent in snapshot.agents)
                if (agent != null && sessions.ContainsKey(agent.sessionKey) && !string.IsNullOrEmpty(agent.agentKey)) keys.Add(agent.agentKey);
            foreach (var agent in snapshot.agents)
            {
                if (agent == null || !sessions.TryGetValue(agent.sessionKey, out var session) || string.IsNullOrEmpty(agent.agentKey)) continue;
                bool ended = agent.presence == "encerrada" || session.presence == "encerrada";
                bool uncertain = !ended && (!connected || session.freshness != "atual" || session.presence == "desconhecida" ||
                    agent.presence == "desconhecida");
                bool child = !string.IsNullOrEmpty(agent.parentAgentKey) || agent.parentStatus == "vinculo_pendente";
                bool linked = child && agent.parentStatus == "vinculado" && keys.Contains(agent.parentAgentKey);
                bool failed = false;
                var tasks = new List<string>();
                var tools = new List<string>();
                var skills = new List<string>();
                if (snapshot.tasks != null) foreach (var item in snapshot.tasks)
                    if (item != null && item.sessionKey == agent.sessionKey && item.agentKey == agent.agentKey)
                    {
                        tasks.Add(item.title + " (" + item.status + "; " + item.provenance + ")");
                        if (item.status == "falha_observada") failed = true;
                    }
                if (snapshot.invocations != null) foreach (var item in snapshot.invocations)
                    if (item != null && item.sessionKey == agent.sessionKey && item.agentKey == agent.agentKey)
                    {
                        var entry = item.name + " (" + item.status + ")";
                        if (item.kind == "skill") skills.Add(entry);
                        else tools.Add(entry);
                        if (item.status == "falha_observada") failed = true;
                    }
                string provider = session.provider == "codex" ? "Codex" : session.provider == "claude" ? "Claude" : "Fonte desconhecida";
                string state = ended ? "Encerrado" : uncertain ? "Sem confirmação" : agent.presence == "trabalhando"
                    ? "Trabalhando" : agent.presence == "aguardando" ? "Aguardando" : "Presente";
                string role = child ? linked ? "Subagente" : "Subagente · vínculo pendente" : "Principal";
                string alias = agent.agentKey.Length > 6 ? agent.agentKey.Substring(agent.agentKey.Length - 6) : agent.agentKey;
                var row = new AgentProjectionRecord {
                    AgentKey = agent.agentKey, SessionKey = agent.sessionKey, ParentAgentKey = agent.parentAgentKey,
                    ParentStatus = child ? linked ? "vinculado" : "vinculo_pendente" : "principal",
                    Provider = session.provider, Presence = agent.presence, DisplayState = state,
                    LastSeen = session.lastSeen, Uncertain = uncertain, Ended = ended, Failure = failed,
                    Label = (child ? "↳ " : "") + role + " · " + provider + " · " + alias + " · " + state +
                        (failed && !uncertain ? " · falha observada" : "")
                };
                row.Detail = "Agente: " + agent.agentKey + "\nSessão: " + agent.sessionKey + "\nProvedor: " + provider +
                    "\nRelação: " + role + "\nEstado: " + state + "\nÚltimo sinal: " +
                    (string.IsNullOrEmpty(session.lastSeen) ? "não observado" : session.lastSeen) +
                    "\nFonte: " + (string.IsNullOrEmpty(session.sourceId) ? "não informada" : session.sourceId) +
                    " · " + (uncertain ? "desatualizada ou desconectada" : "atual") +
                    "\nTarefas: " + (tasks.Count > 0 ? string.Join("; ", tasks) : "não observadas") +
                    "\nFerramentas: " + (tools.Count > 0 ? string.Join("; ", tools) : "não observadas") +
                    "\nSkills: " + (skills.Count > 0 ? string.Join("; ", skills) : "não observadas");
                result.Add(row);
            }
            result.Sort((a, b) => string.CompareOrdinal(a.AgentKey, b.AgentKey));
            return OrderParentsFirst(result);
        }

        private static List<AgentProjectionRecord> OrderParentsFirst(List<AgentProjectionRecord> sorted)
        {
            var ordered = new List<AgentProjectionRecord>(sorted.Count);
            var seen = new HashSet<string>();
            foreach (var row in sorted)
            {
                if (!string.IsNullOrEmpty(row.ParentAgentKey)) continue;
                ordered.Add(row);
                seen.Add(row.AgentKey);
                foreach (var child in sorted)
                    if (child.ParentAgentKey == row.AgentKey && seen.Add(child.AgentKey)) ordered.Add(child);
            }
            foreach (var row in sorted)
                if (seen.Add(row.AgentKey)) ordered.Add(row);
            return ordered;
        }
    }
}

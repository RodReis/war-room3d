using System;
using System.Collections.Generic;
using UnityEngine;

namespace WarRoom3D
{
    [Serializable]
    public sealed class LiveSnapshot
    {
        public string schemaVersion;
        public string mode;
        public string layoutReference;
        public string infrastructureReference;
        public int revision;
        public long streamSequence;
        public LiveProject[] projects;
        public LiveRoomPlacement[] roomPlacements;
        public LiveSession[] sessions;
        public LiveAgent[] agents;
        public LiveTask[] tasks;
        public LiveInvocation[] invocations;
        public LiveSource[] sources;
        public LiveFeedItem[] feed;
        public LiveResource[] resources;
        public LiveProjectResource[] projectResources;
        public LiveResourceState[] resourceStates;
        public LiveIncident[] incidents;
        public ReplayCiIncident[] ciIncidents;
        public ReplayCoverage coverage;

        public static LiveSnapshot Parse(string json, string expectedMode = "live")
        {
            LiveSnapshot snapshot;
            try { snapshot = JsonUtility.FromJson<LiveSnapshot>(json); }
            catch (Exception) { throw new ArgumentException("Snapshot live inválido"); }
            if (snapshot == null || snapshot.schemaVersion != "1.0" || snapshot.mode != expectedMode || snapshot.streamSequence < 0 ||
                snapshot.projects == null || snapshot.roomPlacements == null || snapshot.sessions == null || snapshot.agents == null || snapshot.feed == null ||
                snapshot.resources == null || snapshot.projectResources == null || snapshot.resourceStates == null || snapshot.incidents == null)
                throw new ArgumentException("Contrato live incompatível");
            if (expectedMode == "replay" && (snapshot.coverage == null || snapshot.coverage.gaps == null || snapshot.ciIncidents == null ||
                (snapshot.infrastructureReference != "recorded" && snapshot.infrastructureReference != "unavailable")))
                throw new ArgumentException("Cobertura do replay incompatível");
            var projects = new HashSet<string>();
            foreach (var project in snapshot.projects)
                if (project == null || string.IsNullOrWhiteSpace(project.projectId) || string.IsNullOrWhiteSpace(project.name) || !projects.Add(project.projectId))
                    throw new ArgumentException("Projeto live inválido");
            var resources = new HashSet<string>();
            foreach (var resource in snapshot.resources)
                if (resource == null || string.IsNullOrWhiteSpace(resource.resourceId) || string.IsNullOrWhiteSpace(resource.environmentId) ||
                    string.IsNullOrWhiteSpace(resource.name) || !resources.Add(resource.resourceId))
                    throw new ArgumentException("Recurso live inválido");
            foreach (var link in snapshot.projectResources)
                if (link == null || !projects.Contains(link.projectId) || !resources.Contains(link.resourceId))
                    throw new ArgumentException("Vínculo de recurso live inválido");
            var states = new HashSet<string>();
            foreach (var state in snapshot.resourceStates)
            {
                if (state == null || !resources.Contains(state.resourceId) || !states.Add(state.resourceId) || state.dependentProjectIds == null ||
                    (state.health == "saudavel" && (state.freshness != "atual" || state.coverage != "atual" || string.IsNullOrWhiteSpace(state.observedAt))))
                    throw new ArgumentException("Estado live inválido ou saudável sem evidência atual");
                foreach (var projectId in state.dependentProjectIds)
                    if (!projects.Contains(projectId)) throw new ArgumentException("Dependência live aponta para projeto desconhecido");
            }
            foreach (var incident in snapshot.incidents)
                if (incident == null || !resources.Contains(incident.resourceId) || incident.projectIds == null)
                    throw new ArgumentException("Incidente live inválido");
                else foreach (var projectId in incident.projectIds)
                    if (!projects.Contains(projectId)) throw new ArgumentException("Incidente live aponta para projeto desconhecido");
            return snapshot;
        }
    }

    [Serializable] public sealed class LiveProject { public string projectId; public string name; }
    [Serializable] public sealed class LiveRoomPlacement { public string projectId; public string sectorId; public string slotId; }
    [Serializable] public sealed class LiveSession { public string sessionKey; public string projectId; public string provider; public string sourceId; public string presence; public string freshness; public string lastSeen; }
    [Serializable] public sealed class LiveAgent { public string agentKey; public string sessionKey; public string parentAgentKey; public string presence; public string parentStatus; }
    [Serializable] public sealed class LiveTask { public string taskId; public string sessionKey; public string agentKey; public string title; public string status; public string provenance; }
    [Serializable] public sealed class LiveInvocation { public string invocationId; public string sessionKey; public string agentKey; public string kind; public string name; public string status; }
    [Serializable] public sealed class LiveSource { public string sourceId; public string sourceVersion; public string status; public string errorCode; public string lastReceived; public string lastApplied; public string lastEvidenceAt; }
    [Serializable] public sealed class LiveFeedItem { public string eventId; public long streamSequence; public string type; public string projectId; public string sessionKey; public string agentKey; public string observedAt; public string provenance; }
    [Serializable] public sealed class LiveResource { public string resourceId; public string environmentId; public string kind; public string name; public string sourceId; }
    [Serializable] public sealed class LiveProjectResource { public string projectId; public string resourceId; public string origin; public string confidence; }
    [Serializable] public sealed class LiveResourceState
    {
        public string resourceId;
        public string[] dependentProjectIds;
        public string health;
        public string freshness;
        public string coverage;
        public string observedAt;
        public string sourceId;
        public string evidenceRef;
        public string indicator;
        public float value;
        public string unit;
    }
    [Serializable] public sealed class LiveIncident { public string incidentId; public string resourceId; public string[] projectIds; }
    [Serializable] public sealed class ReplayCoverage { public string status; public HistoryGap[] gaps; }
    [Serializable] public sealed class ReplayCiIncident { public string incidentId; public string projectId; public string repositoryId; public long workflowId; public string @ref; public string openedAt; }
}

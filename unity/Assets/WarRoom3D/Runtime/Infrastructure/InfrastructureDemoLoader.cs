using System;
using System.Collections.Generic;
using UnityEngine;

namespace WarRoom3D
{
    [Serializable]
    public sealed class InfrastructureDemo
    {
        public string schemaVersion;
        public string mode;
        public DemoInfrastructureResource[] resources;
        public DemoInfrastructureIncident[] incidents;
    }

    [Serializable]
    public sealed class DemoInfrastructureResource
    {
        public string resourceId;
        public string name;
        public string kind;
        public string environmentId;
        public string health;
        public string freshness;
        public string coverage;
        public string sourceId;
        public string observedAt;
        public string evidenceRef;
        public string indicator;
        public bool hasValue;
        public float value;
        public string unit;
        public string[] dependentProjectIds;
    }

    [Serializable]
    public sealed class DemoInfrastructureIncident
    {
        public string incidentId;
        public string resourceId;
        public string[] projectIds;
    }

    public sealed class InfrastructureDemoLoader : MonoBehaviour
    {
        [SerializeField] private TextAsset fixture;
        public InfrastructureDemo Snapshot { get; private set; }
        public string Error { get; private set; }

        private void Awake()
        {
            try { Snapshot = Parse(fixture); }
            catch (Exception exception) { Error = exception.Message; Debug.LogError($"Falha na demonstração M2: {Error}"); }
        }

        public static InfrastructureDemo Parse(TextAsset source)
        {
            if (source == null) throw new ArgumentException("Fixture M2 ausente");
            InfrastructureDemo snapshot;
            try { snapshot = JsonUtility.FromJson<InfrastructureDemo>(source.text); }
            catch (Exception) { throw new ArgumentException("JSON M2 inválido"); }
            if (snapshot == null || snapshot.schemaVersion != "1.0" || snapshot.mode != "demo" || snapshot.resources == null || snapshot.incidents == null)
                throw new ArgumentException("Contrato M2 incompatível");
            var ids = new HashSet<string>();
            foreach (var resource in snapshot.resources)
            {
                if (resource == null || string.IsNullOrWhiteSpace(resource.resourceId) || !ids.Add(resource.resourceId) ||
                    string.IsNullOrWhiteSpace(resource.name) || string.IsNullOrWhiteSpace(resource.environmentId) ||
                    string.IsNullOrWhiteSpace(resource.sourceId) || resource.dependentProjectIds == null ||
                    !IsKind(resource.kind) || !IsHealth(resource.health) || !IsFreshness(resource.freshness) || !IsCoverage(resource.coverage) ||
                    (resource.hasValue && (string.IsNullOrWhiteSpace(resource.indicator) || string.IsNullOrWhiteSpace(resource.unit) || float.IsNaN(resource.value) || float.IsInfinity(resource.value))) ||
                    (resource.health == "saudavel" && (resource.freshness != "atual" || resource.coverage != "atual" || string.IsNullOrWhiteSpace(resource.observedAt))))
                    throw new ArgumentException("Recurso M2 inválido ou saudável sem prova atual");
                var projects = new HashSet<string>();
                foreach (var projectId in resource.dependentProjectIds)
                    if (string.IsNullOrWhiteSpace(projectId) || !projects.Add(projectId)) throw new ArgumentException("Projeto dependente M2 inválido");
            }
            var incidents = new HashSet<string>();
            foreach (var incident in snapshot.incidents)
            {
                if (incident == null || string.IsNullOrWhiteSpace(incident.incidentId) || !incidents.Add(incident.incidentId) ||
                    !ids.Contains(incident.resourceId) || incident.projectIds == null)
                    throw new ArgumentException("Incidente M2 inválido");
                var resource = Array.Find(snapshot.resources, item => item.resourceId == incident.resourceId);
                foreach (var projectId in incident.projectIds)
                    if (Array.IndexOf(resource.dependentProjectIds, projectId) < 0) throw new ArgumentException("Incidente afeta projeto sem vínculo");
            }
            return snapshot;
        }

        private static bool IsKind(string value) => value == "host" || value == "docker" || value == "api" || value == "database";
        private static bool IsHealth(string value) => value == "saudavel" || value == "degradado" || value == "indisponivel" || value == "sem_dados";
        private static bool IsFreshness(string value) => value == "atual" || value == "expirada" || value == "sem_dados";
        private static bool IsCoverage(string value) => value == "atual" || value == "perdida" || value == "sem_dados";
    }
}

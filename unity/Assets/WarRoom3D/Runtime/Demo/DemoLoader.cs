using System;
using System.Collections.Generic;
using UnityEngine;

namespace WarRoom3D
{
    public sealed class DemoLoader : MonoBehaviour
    {
        [SerializeField] private TextAsset fixture;
        public DemoSnapshot Snapshot { get; private set; }
        public string Error { get; private set; }

        private void Awake()
        {
            try { Snapshot = Parse(fixture); }
            catch (Exception exception) { Error = exception.Message; Debug.LogError($"Falha ao carregar demonstração: {Error}"); }
        }

        public static DemoSnapshot Parse(TextAsset source)
        {
            if (source == null) throw new ArgumentException("Fixture ausente");
            DemoSnapshot snapshot;
            try { snapshot = JsonUtility.FromJson<DemoSnapshot>(source.text); }
            catch (Exception) { throw new ArgumentException("JSON inválido"); }
            if (snapshot == null || snapshot.schemaVersion != "1.0" || snapshot.mode != "demo" || snapshot.sectorId != "setor-01")
                throw new ArgumentException("Contrato de demonstração incompatível");
            if (snapshot.projects == null || snapshot.projects.Length != 6)
                throw new ArgumentException("A demonstração exige seis projetos");
            var projectIds = new HashSet<string>();
            var slots = new HashSet<string>();
            foreach (var project in snapshot.projects)
            {
                if (project == null || string.IsNullOrWhiteSpace(project.projectId) ||
                    string.IsNullOrWhiteSpace(project.name) || string.IsNullOrWhiteSpace(project.activity) ||
                    project.activeAgents < 0 || !projectIds.Add(project.projectId) ||
                    !slots.Add(project.slotId) || !IsSlot(project.slotId) ||
                    !IsProvider(project.provider) || !IsStatus(project.status))
                    throw new ArgumentException("Projeto ilustrativo inválido ou repetido");
            }
            if (!projectIds.Contains(snapshot.selectedProjectId))
                throw new ArgumentException("Projeto selecionado inexistente");
            return snapshot;
        }

        private static bool IsSlot(string value) =>
            value == "slot-01" || value == "slot-02" || value == "slot-03" ||
            value == "slot-04" || value == "slot-05" || value == "slot-06";
        private static bool IsProvider(string value) => value == "Codex" || value == "Claude" || value == "Ambos";
        private static bool IsStatus(string value) =>
            value == "trabalhando" || value == "aguardando" || value == "atencao" || value == "inativo";
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace WarRoom3D
{
    public sealed class DataCenterBuilder : MonoBehaviour
    {
        private bool built;
        private readonly Dictionary<string, Transform> racksByKind = new Dictionary<string, Transform>();
        private readonly List<GameObject> replayIndicators = new List<GameObject>();
        private readonly Material[] replayMaterials = new Material[4];
        public int RackCount { get; private set; }

        private void Awake() => Build();

        public void Build()
        {
            if (built) return;
            built = true;
            var rackMaterial = MaterialFor(new Color(0.09f, 0.16f, 0.22f));
            var lightMaterial = MaterialFor(new Color(0.08f, 0.76f, 0.86f), true);
            var warningMaterial = MaterialFor(new Color(0.94f, 0.52f, 0.22f), true);
            var locations = new[] { new Vector3(-3.3f, 0.95f, -2.15f), new Vector3(3.3f, 0.95f, -2.15f),
                new Vector3(-3.3f, 0.95f, 2.15f), new Vector3(3.3f, 0.95f, 2.15f) };
            var names = new[] { "Rack Host", "Rack Docker", "Rack API", "Rack Banco" };
            var kinds = new[] { "host", "docker", "api", "database" };
            for (int i = 0; i < locations.Length; i++)
            {
                var rack = new GameObject(names[i]).transform;
                rack.SetParent(transform, false);
                rack.localPosition = locations[i];
                Cube("Gabinete", rack, Vector3.zero, new Vector3(1.3f, 1.8f, 0.85f), rackMaterial);
                Cube("Sinalizador", rack, new Vector3(0, 0.72f, -0.46f), new Vector3(0.9f, 0.12f, 0.05f), i == 3 ? warningMaterial : lightMaterial);
                racksByKind.Add(kinds[i], rack);
                RackCount++;
            }
        }

        public void ShowReplayInfrastructure(LiveSnapshot state)
        {
            ClearReplayInfrastructure();
            Build();
            if (state == null || state.infrastructureReference != "recorded") return;
            foreach (var kind in new[] { "host", "docker", "api", "database" })
            {
                var severity = -1;
                foreach (var resource in state.resources)
                {
                    if (resource.kind != kind) continue;
                    var resourceState = Array.Find(state.resourceStates, item => item.resourceId == resource.resourceId);
                    severity = Math.Max(severity, ReplaySeverity(resourceState));
                }
                if (severity < 0 || !racksByKind.TryGetValue(kind, out var rack)) continue;
                var marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                marker.name = "ReplayInfraKind:" + kind;
                marker.transform.SetParent(rack, false);
                marker.transform.localPosition = new Vector3(0, 1.02f, -0.45f);
                marker.transform.localScale = new Vector3(0.4f, 0.08f, 0.4f);
                marker.GetComponent<Renderer>().sharedMaterial = ReplayMaterial(severity);
                Destroy(marker.GetComponent<Collider>());
                replayIndicators.Add(marker);
            }
        }

        public void ClearReplayInfrastructure()
        {
            foreach (var marker in replayIndicators)
                if (marker != null) { marker.SetActive(false); Destroy(marker); }
            replayIndicators.Clear();
        }

        private static int ReplaySeverity(LiveResourceState state)
        {
            if (state == null || state.freshness != "atual" || state.coverage != "atual") return 1;
            if (state.health == "indisponivel") return 3;
            if (state.health == "degradado") return 2;
            return state.health == "saudavel" ? 0 : 1;
        }

        private Material ReplayMaterial(int severity)
        {
            if (replayMaterials[severity] != null) return replayMaterials[severity];
            var colors = new[] { new Color(0.12f, 0.75f, 0.42f), new Color(0.4f, 0.45f, 0.52f),
                new Color(0.94f, 0.56f, 0.14f), new Color(0.94f, 0.2f, 0.18f) };
            return replayMaterials[severity] = MaterialFor(colors[severity], true);
        }

        private void OnDestroy()
        {
            ClearReplayInfrastructure();
            foreach (var material in replayMaterials)
                if (material != null) Destroy(material);
        }

        public void UseNeutralIndicators()
        {
            Build();
            var neutral = MaterialFor(new Color(0.22f, 0.29f, 0.36f));
            foreach (Transform rack in transform)
            {
                var indicator = rack.Find("Sinalizador");
                if (indicator != null) indicator.GetComponent<Renderer>().sharedMaterial = neutral;
            }
        }

        private static Material MaterialFor(Color color, bool emissive = false)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var material = new Material(shader) { color = color };
            if (emissive) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color); }
            return material;
        }

        private static void Cube(string name, Transform parent, Vector3 position, Vector3 scale, Material material)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = position;
            part.transform.localScale = scale;
            part.GetComponent<Renderer>().sharedMaterial = material;
        }
    }
}

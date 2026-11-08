using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace WarRoom3D
{
    // O rig é visual. Presença, vínculo e trabalho sempre chegam da projeção normalizada.
    public sealed class AgentView : MonoBehaviour
    {
        [SerializeField] private bool seated;
        private Renderer[] bodyRenderers;
        private Transform head;
        private Transform leftForearm;
        private Transform rightForearm;
        private Quaternion headRest;
        private Quaternion leftRest;
        private Quaternion rightRest;
        private GameObject selectionRing;
        private Renderer statusMarker;
        private Material indicatorMaterial;
        private MaterialPropertyBlock properties;
        private readonly Dictionary<Renderer, Color> baseColors = new Dictionary<Renderer, Color>();
        private string state;
        private bool reduced;
        private uint identityHash;

        public string AgentKey { get; private set; }
        public string SessionKey { get; private set; }
        public bool Uncertain { get; private set; }
        public bool Seated => seated;

        public void ConfigurePrefab(bool isSeated) => seated = isSeated;

        private void Awake()
        {
            properties = new MaterialPropertyBlock();
            bodyRenderers = GetComponentsInChildren<Renderer>();
            foreach (var renderer in bodyRenderers)
            {
                var material = renderer.sharedMaterial;
                baseColors[renderer] = material != null && material.HasProperty("_BaseColor")
                    ? material.GetColor("_BaseColor") : Color.white;
            }
            foreach (var bone in GetComponentsInChildren<Transform>())
            {
                if (bone.name == "Head") head = bone;
                else if (bone.name == "Forearm_L") leftForearm = bone;
                else if (bone.name == "Forearm_R") rightForearm = bone;
            }
            if (head != null) headRest = head.localRotation;
            if (leftForearm != null) leftRest = leftForearm.localRotation;
            if (rightForearm != null) rightRest = rightForearm.localRotation;
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            indicatorMaterial = new Material(shader);
            indicatorMaterial.name = "Indicador de agente";
            var marker = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            marker.name = "Estado observado";
            marker.transform.SetParent(transform, false);
            marker.transform.localPosition = new Vector3(0, seated ? 1.36f : 2.08f, 0);
            marker.transform.localScale = Vector3.one * .13f;
            Destroy(marker.GetComponent<Collider>());
            statusMarker = marker.GetComponent<Renderer>();
            statusMarker.sharedMaterial = indicatorMaterial;
            statusMarker.shadowCastingMode = ShadowCastingMode.Off;
            selectionRing = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            selectionRing.name = "Seleção";
            selectionRing.transform.SetParent(transform, false);
            selectionRing.transform.localPosition = new Vector3(0, seated ? -.86f : .025f, 0);
            selectionRing.transform.localScale = new Vector3(.65f, .015f, .65f);
            Destroy(selectionRing.GetComponent<Collider>());
            selectionRing.GetComponent<Renderer>().sharedMaterial = indicatorMaterial;
            selectionRing.SetActive(false);
        }

        public void Bind(string agentKey, string sessionKey, string provider, string presence, bool uncertain, bool failure, bool selected, bool reduceMotion)
        {
            AgentKey = agentKey;
            SessionKey = sessionKey;
            state = presence;
            Uncertain = uncertain;
            reduced = reduceMotion;
            identityHash = StableHash(agentKey + ":" + sessionKey);
            var providerColor = provider == "claude" ? new Color(1f, .55f, .24f) : new Color(.10f, .87f, .84f);
            var statusColor = uncertain ? new Color(1f, .7f, .25f) : failure ? new Color(1f, .27f, .32f) : presence == "trabalhando"
                ? new Color(.24f, .95f, .55f) : presence == "aguardando" ? new Color(.20f, .72f, .95f)
                : new Color(.46f, .69f, .74f);
            indicatorMaterial.SetColor("_BaseColor", statusColor);
            indicatorMaterial.EnableKeyword("_EMISSION");
            indicatorMaterial.SetColor("_EmissionColor", statusColor * (selected ? 1.2f : .35f));
            selectionRing.SetActive(selected);
            foreach (var renderer in bodyRenderers)
            {
                if (renderer == null) continue;
                Color color = baseColors[renderer];
                if (renderer.name == "Distintivo provedor") color = providerColor;
                else if (renderer.name.StartsWith("Cabelo", StringComparison.Ordinal) || renderer.name.StartsWith("Franja", StringComparison.Ordinal))
                    color = (identityHash & 1) == 0 ? new Color(.035f, .055f, .075f) : new Color(.16f, .095f, .07f);
                else if (renderer.name == "Cabeca" || renderer.name.StartsWith("Orelha", StringComparison.Ordinal) || renderer.name == "Nariz")
                    color = (identityHash & 2) == 0 ? new Color(.72f, .48f, .34f) : new Color(.42f, .27f, .19f);
                if (uncertain) color *= .42f;
                properties.Clear();
                properties.SetColor("_BaseColor", color);
                renderer.SetPropertyBlock(properties);
            }
            if (reduced || uncertain) RestorePose();
        }

        private void Update()
        {
            if (reduced || Uncertain) return;
            float phase = Time.unscaledTime * (state == "trabalhando" ? 5f : 1.2f) + (identityHash % 17) * .19f;
            float amplitude = state == "trabalhando" ? 8f : state == "aguardando" ? 2f : 1f;
            if (leftForearm != null) leftForearm.localRotation = leftRest * Quaternion.Euler(Mathf.Sin(phase) * amplitude, 0, 0);
            if (rightForearm != null) rightForearm.localRotation = rightRest * Quaternion.Euler(Mathf.Sin(phase + Mathf.PI) * amplitude, 0, 0);
            if (head != null) head.localRotation = headRest * Quaternion.Euler(Mathf.Sin(phase * .25f) * 1.4f, 0, 0);
        }

        private void RestorePose()
        {
            if (head != null) head.localRotation = headRest;
            if (leftForearm != null) leftForearm.localRotation = leftRest;
            if (rightForearm != null) rightForearm.localRotation = rightRest;
        }

        public bool Intersect(Ray ray, out float distance)
        {
            distance = float.PositiveInfinity;
            foreach (var renderer in bodyRenderers)
                if (renderer != null && renderer.enabled && renderer.bounds.IntersectRay(ray, out var hit) && hit < distance)
                    distance = hit;
            return !float.IsPositiveInfinity(distance);
        }

        private void OnDestroy()
        {
            if (indicatorMaterial != null) Destroy(indicatorMaterial);
        }

        private static uint StableHash(string value)
        {
            uint hash = 2166136261;
            foreach (char character in value) hash = (hash ^ character) * 16777619;
            return hash;
        }
    }
}

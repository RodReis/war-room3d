using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace WarRoom3D
{
    // O rig é visual. Presença, vínculo e trabalho sempre chegam da projeção normalizada.
    public sealed class AgentView : MonoBehaviour
    {
        private static readonly Color[] Cloth = { new Color(.62f,.27f,.13f), new Color(.10f,.32f,.42f),
            new Color(.34f,.20f,.49f), new Color(.16f,.35f,.23f) };
        private static readonly Color[] Panel = { new Color(.89f,.55f,.21f), new Color(.18f,.68f,.77f),
            new Color(.61f,.39f,.72f), new Color(.47f,.69f,.30f) };
        private static readonly Color[] Trousers = { new Color(.14f,.17f,.22f), new Color(.05f,.17f,.24f),
            new Color(.19f,.13f,.27f), new Color(.10f,.23f,.17f) };
        [SerializeField] private bool seated;
        private Renderer[] bodyRenderers;
        private Transform head;
        private Transform leftForearm;
        private Transform rightForearm;
        private Transform leftThigh;
        private Transform rightThigh;
        private Quaternion headRest;
        private Quaternion leftRest;
        private Quaternion rightRest;
        private Quaternion leftThighRest;
        private Quaternion rightThighRest;
        private GameObject selectionRing;
        private Renderer statusMarker;
        private TextMesh nameLabel;
        private Material indicatorMaterial;
        private Material accessoryMaterial;
        private GameObject accessory;
        private int accessoryStyle = -1;
        private MaterialPropertyBlock properties;
        private readonly Dictionary<Renderer, Color> baseColors = new Dictionary<Renderer, Color>();
        private readonly Dictionary<Renderer, Vector3> baseScales = new Dictionary<Renderer, Vector3>();
        private string state;
        private bool reduced;
        private bool traveling;
        private uint identityHash;

        public string AgentKey { get; private set; }
        public string SessionKey { get; private set; }
        public bool Uncertain { get; private set; }
        public bool Seated => seated;
        public int Style { get; private set; }
        public string LabelText => nameLabel != null ? nameLabel.text : "";

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
                baseScales[renderer] = renderer.transform.localScale;
            }
            foreach (var bone in GetComponentsInChildren<Transform>())
            {
                if (bone.name == "Head") head = bone;
                else if (bone.name == "Forearm_L") leftForearm = bone;
                else if (bone.name == "Forearm_R") rightForearm = bone;
                else if (bone.name == "Thigh_L") leftThigh = bone;
                else if (bone.name == "Thigh_R") rightThigh = bone;
            }
            if (head != null) headRest = head.localRotation;
            if (leftForearm != null) leftRest = leftForearm.localRotation;
            if (rightForearm != null) rightRest = rightForearm.localRotation;
            if (leftThigh != null) leftThighRest = leftThigh.localRotation;
            if (rightThigh != null) rightThighRest = rightThigh.localRotation;
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
            var label = new GameObject("Nome e estado do agente");
            label.transform.SetParent(transform, false);
            label.transform.localPosition = new Vector3(0, seated ? 1.58f : 2.30f, 0);
            nameLabel = label.AddComponent<TextMesh>();
            nameLabel.anchor = TextAnchor.LowerCenter;
            nameLabel.alignment = TextAlignment.Center;
            nameLabel.fontSize = 30;
            nameLabel.characterSize = .055f;
            nameLabel.color = new Color(.91f, .97f, .98f);
            selectionRing = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            selectionRing.name = "Seleção";
            selectionRing.transform.SetParent(transform, false);
            selectionRing.transform.localPosition = new Vector3(0, seated ? -.86f : .025f, 0);
            selectionRing.transform.localScale = new Vector3(.65f, .015f, .65f);
            Destroy(selectionRing.GetComponent<Collider>());
            selectionRing.GetComponent<Renderer>().sharedMaterial = indicatorMaterial;
            selectionRing.SetActive(false);
        }

        public void Bind(string agentKey, string sessionKey, string displayName, int style, string provider,
            string presence, bool uncertain, bool failure, bool selected, bool reduceMotion)
        {
            AgentKey = agentKey;
            SessionKey = sessionKey;
            state = presence;
            Uncertain = uncertain;
            reduced = reduceMotion;
            Style = Mathf.Clamp(style, 0, AgentLocalProfile.Styles.Length - 1);
            identityHash = StableHash(agentKey + ":" + sessionKey);
            var providerColor = provider == "claude" ? new Color(1f, .55f, .24f) : new Color(.10f, .87f, .84f);
            var statusColor = uncertain ? new Color(1f, .7f, .25f) : failure ? new Color(1f, .27f, .32f) : presence == "trabalhando"
                ? new Color(.24f, .95f, .55f) : presence == "aguardando" ? new Color(.20f, .72f, .95f)
                : new Color(.46f, .69f, .74f);
            indicatorMaterial.SetColor("_BaseColor", statusColor);
            indicatorMaterial.EnableKeyword("_EMISSION");
            indicatorMaterial.SetColor("_EmissionColor", statusColor * (selected ? 1.2f : .35f));
            selectionRing.SetActive(selected);
            var shortName = string.IsNullOrEmpty(displayName) ? "Agente" : displayName.Length > 18
                ? displayName.Substring(0, 17) + "…" : displayName;
            nameLabel.text = shortName + "\n" +
                (uncertain ? "◇ Sem confirmação" : failure ? "! Falha observada" : presence == "trabalhando"
                    ? "● Trabalhando" : presence == "aguardando" ? "○ Aguardando" : "◇ Presente");
            nameLabel.color = uncertain ? new Color(1f, .77f, .38f) : new Color(.91f, .97f, .98f);
            foreach (var renderer in bodyRenderers)
            {
                if (renderer == null) continue;
                Color color = baseColors[renderer];
                if (renderer.name == "Distintivo provedor") color = providerColor;
                else if (renderer.name == "Jaqueta facetada" || renderer.name.StartsWith("Braco ", StringComparison.Ordinal) ||
                    renderer.name.StartsWith("Antebraco ", StringComparison.Ordinal)) color = Cloth[Style];
                else if (renderer.name == "Placa toracica" || renderer.name == "Cinto" ||
                    renderer.name.StartsWith("Ombreira ", StringComparison.Ordinal) || renderer.name == "Gola") color = Panel[Style];
                else if (renderer.name == "Quadril" || renderer.name.StartsWith("Coxa ", StringComparison.Ordinal) ||
                    renderer.name.StartsWith("Canela ", StringComparison.Ordinal)) color = Trousers[Style];
                else if (renderer.name.StartsWith("Cabelo", StringComparison.Ordinal) || renderer.name.StartsWith("Franja", StringComparison.Ordinal))
                    color = (identityHash & 1) == 0 ? new Color(.035f, .055f, .075f) : new Color(.16f, .095f, .07f);
                else if (renderer.name == "Cabeca" || renderer.name.StartsWith("Orelha", StringComparison.Ordinal) || renderer.name == "Nariz")
                    color = (identityHash & 2) == 0 ? new Color(.72f, .48f, .34f) : new Color(.42f, .27f, .19f);
                var originalScale = baseScales[renderer];
                var feminine = Style == 0 || Style == 2;
                if (renderer.name == "Jaqueta facetada")
                    renderer.transform.localScale = Vector3.Scale(originalScale, new Vector3(feminine ? .84f : 1.13f, 1f, 1f));
                else if (renderer.name == "Quadril")
                    renderer.transform.localScale = Vector3.Scale(originalScale, new Vector3(feminine ? 1.16f : .92f, 1f, 1f));
                else if (renderer.name.StartsWith("Ombreira ", StringComparison.Ordinal))
                    renderer.transform.localScale = Vector3.Scale(originalScale, new Vector3(feminine ? .82f : 1.16f, 1f, 1f));
                else if (renderer.name == "Cabelo superior")
                    renderer.transform.localScale = Vector3.Scale(originalScale, new Vector3(1f, Style == 2 ? 1.46f : Style == 1 ? .60f : 1f, 1f));
                else renderer.transform.localScale = originalScale;
                if (uncertain) color *= .42f;
                properties.Clear();
                properties.SetColor("_BaseColor", color);
                renderer.SetPropertyBlock(properties);
            }
            EnsureAccessory(uncertain);
            if (reduced || uncertain) RestorePose();
        }

        public void SetTraveling(bool value)
        {
            traveling = value && !seated;
            if (!traveling) RestorePose();
        }

        private void EnsureAccessory(bool uncertain)
        {
            if (accessoryStyle != Style)
            {
                if (accessory != null) Destroy(accessory);
                if (accessoryMaterial != null) Destroy(accessoryMaterial);
                accessoryStyle = Style;
                accessory = GameObject.CreatePrimitive(Style == 2 ? PrimitiveType.Sphere : PrimitiveType.Cube);
                accessory.name = new[] { "Lenço âmbar", "Alça do colete", "Boina violeta", "Bolsa utilitária" }[Style];
                accessory.transform.SetParent(transform, false);
                Destroy(accessory.GetComponent<Collider>());
                if (Style == 0)
                {
                    accessory.transform.localPosition = new Vector3(0, seated ? .72f : 1.52f, -.19f);
                    accessory.transform.localScale = new Vector3(.40f, .09f, .10f);
                }
                else if (Style == 1)
                {
                    accessory.transform.localPosition = new Vector3(0, seated ? .52f : 1.32f, -.20f);
                    accessory.transform.localScale = new Vector3(.085f, .60f, .07f);
                    accessory.transform.localRotation = Quaternion.Euler(0, 0, 32f);
                }
                else if (Style == 2)
                {
                    accessory.transform.localPosition = new Vector3(0, seated ? 1.17f : 1.97f, .02f);
                    accessory.transform.localScale = new Vector3(.42f, .10f, .35f);
                }
                else
                {
                    accessory.transform.localPosition = new Vector3(.39f, seated ? .23f : 1.03f, -.05f);
                    accessory.transform.localScale = new Vector3(.22f, .26f, .15f);
                }
                var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                accessoryMaterial = new Material(shader) { name = "Acessório do agente" };
                accessory.GetComponent<Renderer>().sharedMaterial = accessoryMaterial;
            }
            accessoryMaterial.SetColor("_BaseColor", uncertain ? Panel[Style] * .42f : Panel[Style]);
        }

        private void Update()
        {
            if (nameLabel != null && Camera.main != null) nameLabel.transform.rotation = Camera.main.transform.rotation;
            if (reduced || Uncertain) return;
            if (traveling)
            {
                var stride = Mathf.Sin(Time.unscaledTime * 10f + (identityHash % 17) * .19f) * 16f;
                if (leftThigh != null) leftThigh.localRotation = leftThighRest * Quaternion.Euler(stride, 0, 0);
                if (rightThigh != null) rightThigh.localRotation = rightThighRest * Quaternion.Euler(-stride, 0, 0);
            }
            float phase = Time.unscaledTime * (state == "trabalhando" ? 5f : 1.2f) + (identityHash % 17) * .19f;
            float amplitude = traveling ? 12f : state == "trabalhando" ? 8f : state == "aguardando" ? 2f : 1f;
            if (leftForearm != null) leftForearm.localRotation = leftRest * Quaternion.Euler(Mathf.Sin(phase) * amplitude, 0, 0);
            if (rightForearm != null) rightForearm.localRotation = rightRest * Quaternion.Euler(Mathf.Sin(phase + Mathf.PI) * amplitude, 0, 0);
            if (head != null) head.localRotation = headRest * Quaternion.Euler(Mathf.Sin(phase * .25f) * 1.4f, 0, 0);
        }

        private void RestorePose()
        {
            if (head != null) head.localRotation = headRest;
            if (leftForearm != null) leftForearm.localRotation = leftRest;
            if (rightForearm != null) rightForearm.localRotation = rightRest;
            if (leftThigh != null) leftThigh.localRotation = leftThighRest;
            if (rightThigh != null) rightThigh.localRotation = rightThighRest;
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
            if (accessoryMaterial != null) Destroy(accessoryMaterial);
        }

        private static uint StableHash(string value)
        {
            uint hash = 2166136261;
            foreach (char character in value) hash = (hash ^ character) * 16777619;
            return hash;
        }
    }
}

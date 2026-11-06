using UnityEngine;

namespace WarRoom3D
{
    public sealed class DataCenterBuilder : MonoBehaviour
    {
        private bool built;
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
            for (int i = 0; i < locations.Length; i++)
            {
                var rack = new GameObject(names[i]).transform;
                rack.SetParent(transform, false);
                rack.localPosition = locations[i];
                Cube("Gabinete", rack, Vector3.zero, new Vector3(1.3f, 1.8f, 0.85f), rackMaterial);
                Cube("Sinalizador", rack, new Vector3(0, 0.72f, -0.46f), new Vector3(0.9f, 0.12f, 0.05f), i == 3 ? warningMaterial : lightMaterial);
                RackCount++;
            }
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

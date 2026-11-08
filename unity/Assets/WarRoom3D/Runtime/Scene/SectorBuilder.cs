using System.Collections.Generic;
using UnityEngine;

namespace WarRoom3D
{
    public sealed class SectorBuilder : MonoBehaviour
    {
        [SerializeField] private Material graphiteMaterial;
        [SerializeField] private Material floorMaterial;
        [SerializeField] private Material cyanMaterial;
        [SerializeField] private Material glassMaterial;
        [SerializeField] private Material goldMaterial;
        [SerializeField] private GameObject referenceRoomPrefab;
        private static readonly Vector3[] Positions = {
            new Vector3(-14, 0, 9), new Vector3(0, 0, 11), new Vector3(14, 0, 9),
            new Vector3(-14, 0, -9), new Vector3(0, 0, -11), new Vector3(14, 0, -9)
        };
        private readonly Dictionary<string, Transform> rooms = new Dictionary<string, Transform>();
        private Transform roomsRoot;
        public IReadOnlyDictionary<string, Transform> Rooms => rooms;

        private void Awake() => Build();

        public void Build()
        {
            if (roomsRoot != null) return;
            var graphite = graphiteMaterial != null ? graphiteMaterial : CreateMaterial(new Color(0.055f, 0.095f, 0.15f));
            var floor = floorMaterial != null ? floorMaterial : CreateMaterial(new Color(0.12f, 0.19f, 0.26f));
            var cyan = cyanMaterial != null ? cyanMaterial : CreateMaterial(new Color(0.06f, 0.72f, 0.83f), true);
            var glass = glassMaterial != null ? glassMaterial : CreateMaterial(new Color(0.12f, 0.30f, 0.38f));
            var gold = goldMaterial != null ? goldMaterial : CreateMaterial(new Color(0.88f, 0.58f, 0.18f), true);
            Cube("Base", transform, new Vector3(0, -0.48f, 0), new Vector3(41, 0.7f, 31), graphite);
            Cube("Corredor vertical", transform, new Vector3(0, -0.08f, 0), new Vector3(4, 0.08f, 31), floor);
            Cube("Corredor horizontal", transform, new Vector3(0, -0.07f, 0), new Vector3(41, 0.08f, 3.5f), floor);
            var core = new GameObject("Nucleo").transform;
            core.SetParent(transform, false);
            Cube("Plataforma", core, new Vector3(0, 0.05f, 0), new Vector3(8, 0.3f, 7), graphite);
            Cube("Mesa de comando", core, new Vector3(0, 0.8f, 0), new Vector3(4.6f, 0.55f, 2.4f), glass);
            Cube("Mapa luminoso", core, new Vector3(0, 1.2f, 0), new Vector3(3.9f, 0.08f, 1.9f), cyan);
            core.gameObject.AddComponent<DataCenterBuilder>();
            roomsRoot = new GameObject("Salas").transform;
            roomsRoot.SetParent(transform, false);
            for (int i = 0; i < Positions.Length; i++)
            {
                string id = $"slot-{i + 1:00}";
                var room = new GameObject(id).transform;
                room.SetParent(roomsRoot, false);
                room.localPosition = Positions[i];
                rooms.Add(id, room);
                if (i == 2 && referenceRoomPrefab != null)
                {
                    var reference = Instantiate(referenceRoomPrefab, room);
                    reference.name = "ReferenceRoom";
                    continue;
                }
                Cube("Piso", room, Vector3.zero, new Vector3(10, 0.2f, 7.6f), floor);
                Cube("Parede posterior", room, new Vector3(0, 0.9f, 3.7f), new Vector3(10, 1.8f, 0.22f), graphite);
                Cube("Parede esquerda", room, new Vector3(-4.9f, 0.9f, 0), new Vector3(0.22f, 1.8f, 7.6f), graphite);
                Cube("Parede direita", room, new Vector3(4.9f, 0.9f, 0), new Vector3(0.22f, 1.8f, 7.6f), graphite);
                Cube("Friso de luz", room, new Vector3(0, 1.78f, 3.55f), new Vector3(9.7f, 0.08f, 0.12f), cyan);
                Cube("Mesa", room, new Vector3(0, 0.8f, 0.4f), new Vector3(4.4f, 0.3f, 2), glass);
                for (int station = 0; station < 2; station++)
                {
                    float x = station == 0 ? -2.1f : 2.1f;
                    Cube($"Estacao {station + 1}", room, new Vector3(x, 0.65f, -1.65f), new Vector3(1.5f, 0.35f, 1), graphite);
                    Cube($"Tela {station + 1}", room, new Vector3(x, 1.28f, -1.25f), new Vector3(1.15f, 0.75f, 0.08f), cyan);
                }
                Cube("Marco da porta", room, new Vector3(0, 0.15f, -3.65f), new Vector3(3.5f, 0.12f, 0.25f), i == 5 ? gold : cyan);
            }
        }

        private static Material CreateMaterial(Color color, bool emissive = false)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            if (shader == null) throw new System.InvalidOperationException("Shader de cena indisponível");
            var material = new Material(shader) { color = color };
            if (emissive) { material.EnableKeyword("_EMISSION"); material.SetColor("_EmissionColor", color * 1.2f); }
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

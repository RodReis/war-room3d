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
        [SerializeField] private bool overviewLayout;
        private static readonly Vector3[] Positions = {
            new Vector3(-14, 0, 9), new Vector3(0, 0, 11), new Vector3(14, 0, 9),
            new Vector3(-14, 0, -9), new Vector3(0, 0, -11), new Vector3(14, 0, -9)
        };
        private static readonly Vector3[] OverviewPositions = {
            new Vector3(-7f, 0, 3.5f), new Vector3(7f, 0, 3.5f),
            new Vector3(-7f, 0, -9.5f), new Vector3(7f, 0, -9.5f),
            new Vector3(-19f, 0, 3.5f), new Vector3(19f, 0, 3.5f)
        };
        private readonly HashSet<string> occupied = new HashSet<string>();
        private readonly HashSet<string> incoming = new HashSet<string>();
        private string renderedSectorId;
        public string CurrentSectorId => renderedSectorId ?? "setor-01";
        private Material overviewFloor;
        private Material overviewGraphite;
        private Material overviewCyan;
        public string OverviewRoomsKey { get; private set; }
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
            if (overviewLayout && referenceRoomPrefab != null)
            {
                BuildOverview(graphite, floor, cyan, glass, gold);
                return;
            }
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

        public void ApplyOverviewPlacements(LiveRoomPlacement[] placements, string sectorId = "setor-01")
        {
            if (roomsRoot == null) return;
            incoming.Clear();
            if (placements != null)
                foreach (var placement in placements)
                    if (placement.sectorId == sectorId && rooms.ContainsKey(placement.slotId))
                        incoming.Add(placement.slotId);
            if (occupied.SetEquals(incoming) && renderedSectorId == sectorId) return;
            renderedSectorId = sectorId;

            occupied.Clear();
            var ordered = new List<string>();
            foreach (var entry in rooms)
            {
                bool show = incoming.Contains(entry.Key);
                var room = entry.Value;
                if (show)
                {
                    if (overviewLayout && overviewFloor != null && room.childCount == 0) BuildOverviewRoom(room);
                    occupied.Add(entry.Key);
                    ordered.Add(entry.Key);
                }
                room.gameObject.SetActive(show);
            }
            OverviewRoomsKey = sectorId + "/" + string.Join("/", ordered);
        }

        public void GetOverviewBounds(out Vector3 center, out float width, out float depth)
        {
            var bounds = new Bounds(new Vector3(0, 0, 0.5f), new Vector3(8, 0, 9));
            foreach (var slot in occupied)
            {
                var position = rooms[slot].position;
                bounds.Encapsulate(position + new Vector3(-5.6f, 0, -4.7f));
                bounds.Encapsulate(position + new Vector3(5.6f, 0, 4.7f));
            }
            center = bounds.center;
            width = Mathf.Max(17f, bounds.size.x);
            depth = bounds.size.z;
        }

        private void BuildOverview(Material graphite, Material floor, Material cyan, Material glass, Material gold)
        {
            overviewGraphite = graphite;
            overviewFloor = floor;
            overviewCyan = cyan;
            Cube("Base da circulação", transform, new Vector3(0, -.55f, .6f), new Vector3(27, .7f, 7.7f), graphite);
            Cube("Piso da circulação", transform, new Vector3(0, -.17f, .6f), new Vector3(26.8f, .16f, 7.55f), floor);
            for (int x = -6; x <= 6; x++)
                Cube("Junta da passarela", transform, new Vector3(x * 2f, -.077f, .6f), new Vector3(.035f, .012f, 7.55f), graphite);
            Cube("Linha de circulação", transform, new Vector3(0, -.064f, -3.05f), new Vector3(26.5f, .035f, .05f), cyan);
            Cube("Linha de circulação", transform, new Vector3(0, -.064f, 4.25f), new Vector3(26.5f, .035f, .05f), cyan);
            var core = new GameObject("Núcleo de operações").transform;
            core.SetParent(transform, false);
            Disc("Pedestal", core, .18f, 4.2f, .5f, graphite);
            Disc("Aro luminoso", core, .48f, 3.95f, .08f, cyan);
            Disc("Mesa de comando", core, .61f, 3.75f, .18f, glass);
            Disc("Projeção", core, .73f, 2.4f, .06f, cyan);
            Cube("Reserva oeste", transform, new Vector3(-11f, -.025f, -2.3f), new Vector3(1.4f, .05f, .08f), gold);
            Cube("Reserva leste", transform, new Vector3(11f, -.025f, -2.3f), new Vector3(1.4f, .05f, .08f), gold);
            core.gameObject.AddComponent<DataCenterBuilder>();
            roomsRoot = new GameObject("Salas").transform;
            roomsRoot.SetParent(transform, false);
            for (var index = 0; index < OverviewPositions.Length; index++)
            {
                var id = $"slot-{index + 1:00}";
                var room = new GameObject(id).transform;
                room.SetParent(roomsRoot, false);
                room.localPosition = OverviewPositions[index];
                room.gameObject.SetActive(false);
                rooms.Add(id, room);
            }
        }

        private void BuildOverviewRoom(Transform room)
        {
            Cube("Embasamento", room, new Vector3(0, -.36f, 0), new Vector3(11.05f, .58f, 8.6f), overviewGraphite);
            Cube("Guarnição", room, new Vector3(0, -.28f, -4.3f), new Vector3(10.85f, .045f, .055f), overviewCyan);
            Cube("Acesso", room, new Vector3(0, -.12f, -4.6f), new Vector3(3.25f, .15f, 1.2f), overviewFloor);
            var reference = Instantiate(referenceRoomPrefab, room);
            reference.name = "ReferenceRoom";
        }

        private static void Disc(string name, Transform parent, float height, float diameter, float thickness, Material material)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = new Vector3(0, height, 0);
            part.transform.localScale = new Vector3(diameter, thickness * .5f, diameter);
            part.GetComponent<Renderer>().sharedMaterial = material;
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

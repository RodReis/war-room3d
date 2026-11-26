using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace WarRoom3D.Editor
{
    // Geometria autoral, construída com primitivas Unity e a paleta já distribuída.
    public static class FixedSpaceAssetBuilder
    {
        private const string Folder = "Assets/WarRoom3D/Prefabs/FixedSpaces";
        private const string ScenePath = "Assets/WarRoom3D/Scenes/QuartelM2Live.unity";
        private static Material shell, floor, edge, seat, glass, cyan, warm, leaf;

        public static void Configure(SectorBuilder sector)
        {
            if (!AssetDatabase.IsValidFolder(Folder)) AssetDatabase.CreateFolder("Assets/WarRoom3D/Prefabs", "FixedSpaces");
            shell = Material("02_Shell"); floor = Material("04_Floor"); edge = Material("03_Edge");
            seat = Material("05_Seat"); glass = Material("06_Glass"); cyan = Material("07_Cyan");
            warm = Material("09_Warm"); leaf = Material("10_Leaf");
            var settings = new SerializedObject(sector);
            settings.FindProperty("cafeteriaPrefab").objectReferenceValue = Create(true);
            settings.FindProperty("meetingRoomPrefab").objectReferenceValue = Create(false);
            settings.ApplyModifiedPropertiesWithoutUndo();
        }

        [MenuItem("War-Room3D/Arte/Gerar espaços fixos")]
        public static void ConfigureScene()
        {
            var scene = EditorSceneManager.OpenScene(ScenePath);
            Configure(UnityEngine.Object.FindAnyObjectByType<SectorBuilder>());
            EditorSceneManager.SaveScene(scene);
            AssetDatabase.SaveAssets();
            Debug.Log("Espaços fixos #53 gerados e vinculados à cena live.");
        }

        private static GameObject Create(bool coffee)
        {
            var root = new GameObject(coffee ? "Cafeteria" : "Sala de reunião do PI");
            try
            {
                root.AddComponent<FixedSpaceView>().Configure(coffee ? "cafeteria" : "pi-meeting", root.name,
                    coffee ? "Um ponto de encontro do quartel, disponível com ou sem projetos ativos." :
                    "Espaço de reunião com lugar de referência do PI. O lugar marcado não informa presença ou atividade do usuário.");
                var t = root.transform;
                var accent = coffee ? warm : cyan;
                Box(t, "Embasamento", new Vector3(0, -.36f, 0), new Vector3(10.8f, .6f, 8.7f), shell);
                Box(t, "Piso", new Vector3(0, -.04f, 0), new Vector3(10.4f, .12f, 8.3f), floor);
                Box(t, "Soleira", new Vector3(0, .035f, -4.13f), new Vector3(3.1f, .07f, .14f), accent);
                foreach (float x in new[] { -4f, -2f, 0f, 2f, 4f })
                    Box(t, "Junta do piso", new Vector3(x, .025f, 0), new Vector3(.025f, .01f, 8.2f), edge);
                foreach (float z in new[] { -2f, 0f, 2f })
                    Box(t, "Junta do piso", new Vector3(0, .025f, z), new Vector3(10.3f, .01f, .025f), edge);
                Wall(t, "CUTAWAY_Rear", new Vector3(0, 1.45f, 4.1f), new Vector3(10.5f, 3f, .22f), accent);
                Wall(t, "CUTAWAY_Left", new Vector3(-5.15f, 1.45f, 0), new Vector3(.22f, 3f, 8.2f), accent);
                Wall(t, "CUTAWAY_Right", new Vector3(5.15f, 1.45f, 0), new Vector3(.22f, 3f, 8.2f), accent);
                foreach (float x in new[] { -3.4f, 3.4f })
                    Box(t, "Guarda de entrada", new Vector3(x, .38f, -4.05f), new Vector3(3.4f, .8f, .2f), glass);
                Sign(t, "Identificação", coffee ? "CAFETERIA" : "SALA DE REUNIÃO", new Vector3(0, 2.15f, 3.94f), .16f);
                if (coffee) Coffee(t); else Meeting(t);
                Plant(t, new Vector3(-4.3f, 0, -2.9f));
                Plant(t, new Vector3(4.3f, 0, 2.9f));
                var lightObject = new GameObject("Luz ambiente sala");
                lightObject.transform.SetParent(t, false);
                lightObject.transform.localPosition = new Vector3(0, 3.1f, 0);
                var light = lightObject.AddComponent<Light>();
                light.type = LightType.Point; light.range = 9f; light.intensity = 2.3f;
                light.color = coffee ? new Color(1, .78f, .52f) : new Color(.6f, .9f, 1);
                root.AddComponent<ReferenceRoomView>();
                return PrefabUtility.SaveAsPrefabAsset(root, Folder + (coffee ? "/Cafeteria.prefab" : "/PiMeeting.prefab"));
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }

        private static void Coffee(Transform t)
        {
            Box(t, "Balcão", new Vector3(-1.2f, .57f, 2.75f), new Vector3(6.3f, 1.1f, 1.35f), shell);
            Box(t, "Bancada", new Vector3(-1.2f, 1.17f, 2.75f), new Vector3(6.5f, .14f, 1.5f), edge);
            Box(t, "Friso quente", new Vector3(-1.2f, .92f, 2.05f), new Vector3(6.1f, .06f, .04f), warm);
            Box(t, "Máquina de café", new Vector3(-2.5f, 1.63f, 2.75f), new Vector3(1.15f, .8f, .72f), seat);
            Box(t, "Painel da máquina", new Vector3(-2.5f, 1.75f, 2.37f), new Vector3(.55f, .25f, .05f), cyan);
            for (int i = 0; i < 3; i++)
                Cylinder(t, "Xícara", new Vector3(-.6f + i * .35f, 1.33f, 2.4f), new Vector3(.18f, .13f, .18f), edge);
            for (int table = 0; table < 2; table++)
            {
                var x = table == 0 ? -2.5f : 2.5f;
                Cylinder(t, "Base da mesa", new Vector3(x, .49f, -.8f), new Vector3(.3f, .9f, .3f), shell);
                Cylinder(t, "Mesa de convivência", new Vector3(x, .97f, -.8f), new Vector3(2.2f, .12f, 2.2f), edge);
                Chair(t, new Vector3(x, 0, -2.45f), 0);
                Chair(t, new Vector3(x, 0, .85f), 180);
                Cylinder(t, "Vaso da mesa", new Vector3(x, 1.12f, -.8f), new Vector3(.25f, .2f, .25f), warm);
            }
        }

        private static void Meeting(Transform t)
        {
            Box(t, "Base da mesa", new Vector3(0, .48f, -.2f), new Vector3(1.4f, .9f, 3.6f), shell);
            Box(t, "Mesa de reunião", new Vector3(0, .98f, -.2f), new Vector3(3.2f, .18f, 5.3f), edge);
            Box(t, "Centro da mesa", new Vector3(0, 1.08f, -.2f), new Vector3(.8f, .04f, 3.7f), glass);
            for (int row = 0; row < 3; row++)
            {
                Chair(t, new Vector3(-2.3f, 0, -1.8f + row * 1.6f), 90);
                Chair(t, new Vector3(2.3f, 0, -1.8f + row * 1.6f), -90);
            }
            Chair(t, new Vector3(0, 0, -3.3f), 0);
            Box(t, "Lugar do PI", new Vector3(0, 1.17f, -2.35f), new Vector3(1.15f, .28f, .1f), shell);
            Sign(t, "Placa do PI", "LUGAR DO PI", new Vector3(0, 1.19f, -2.41f), .065f);
            Box(t, "Moldura da tela", new Vector3(0, 1.45f, 3.88f), new Vector3(3.5f, 1.65f, .15f), shell);
            Box(t, "Tela de reunião", new Vector3(0, 1.45f, 3.77f), new Vector3(3.22f, 1.39f, .06f), glass);
            Sign(t, "Tela sem presença", "QUARTEL / REUNIÃO", new Vector3(0, 1.5f, 3.71f), .095f);
        }

        private static void Chair(Transform parent, Vector3 position, float yaw)
        {
            var chair = new GameObject("Cadeira").transform;
            chair.SetParent(parent, false); chair.localPosition = position; chair.localRotation = Quaternion.Euler(0, yaw, 0);
            Box(chair, "Assento", new Vector3(0, .56f, 0), new Vector3(.82f, .2f, .8f), seat);
            Box(chair, "Encosto", new Vector3(0, 1.03f, -.32f), new Vector3(.82f, .88f, .16f), seat);
            Box(chair, "Base", new Vector3(0, .24f, 0), new Vector3(.14f, .48f, .14f), edge);
            Box(chair, "Pé", new Vector3(0, .045f, 0), new Vector3(.64f, .07f, .64f), shell);
        }

        private static void Plant(Transform t, Vector3 p)
        {
            Cylinder(t, "Vaso", p + Vector3.up * .28f, new Vector3(.7f, .55f, .7f), shell);
            Part(t, "Vegetação", PrimitiveType.Sphere, p + Vector3.up * .95f, new Vector3(.9f, 1.3f, .9f), leaf);
        }

        private static void Wall(Transform parent, string name, Vector3 p, Vector3 size, Material accent)
        {
            var wall = new GameObject(name).transform; wall.SetParent(parent, false);
            Box(wall, "Painel", p, size, shell);
            var trim = size; trim.y = .06f;
            Box(wall, "Linha de luz", new Vector3(p.x, 2.86f, p.z), trim + new Vector3(.03f, 0, .03f), accent);
        }

        private static Material Material(string name) => AssetDatabase.LoadAssetAtPath<Material>(
            "Assets/WarRoom3D/Art/ReferenceRoom/Materials/" + name + ".mat") ?? throw new InvalidOperationException("Material ausente: " + name);
        private static void Box(Transform t, string n, Vector3 p, Vector3 size, Material m) => Part(t, n, PrimitiveType.Cube, p, size, m);
        private static void Cylinder(Transform t, string n, Vector3 p, Vector3 size, Material m) => Part(t, n, PrimitiveType.Cylinder, p, new Vector3(size.x, size.y / 2, size.z), m);
        private static void Part(Transform parent, string name, PrimitiveType kind, Vector3 p, Vector3 scale, Material material)
        {
            var part = GameObject.CreatePrimitive(kind); part.name = name;
            part.transform.SetParent(parent, false); part.transform.localPosition = p; part.transform.localScale = scale;
            part.GetComponent<Renderer>().sharedMaterial = material;
            UnityEngine.Object.DestroyImmediate(part.GetComponent<Collider>());
        }

        private static void Sign(Transform parent, string name, string text, Vector3 p, float scale)
        {
            var sign = new GameObject(name); sign.transform.SetParent(parent, false); sign.transform.localPosition = p;
            var label = sign.AddComponent<TextMesh>(); label.text = text; label.anchor = TextAnchor.MiddleCenter;
            label.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); label.fontSize = 64; label.characterSize = scale;
            label.color = new Color(.86f, .96f, .95f);
            sign.GetComponent<MeshRenderer>().sharedMaterial = label.font.material;
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace WarRoom3D.Editor
{
    public static class ReferenceRoomAssetBuilder
    {
        private const string FbxPath = "Assets/WarRoom3D/Art/ReferenceRoom/ReferenceRoom.fbx";
        private const string PrefabPath = "Assets/WarRoom3D/Prefabs/ReferenceRoom.prefab";
        private const string MaterialFolder = "Assets/WarRoom3D/Art/ReferenceRoom/Materials";

        private readonly struct Surface
        {
            public readonly string Name;
            public readonly Color Color;
            public readonly float Metallic;
            public readonly float Smoothness;
            public readonly float Emission;
            public Surface(string name, Color color, float metallic, float smoothness, float emission = 0)
            { Name = name; Color = color; Metallic = metallic; Smoothness = smoothness; Emission = emission; }
        }

        private static readonly Surface[] Surfaces = {
            new Surface("01_Graphite", new Color(.047f,.077f,.10f), .55f,.68f),
            new Surface("02_Shell", new Color(.105f,.151f,.187f), .72f,.72f),
            new Surface("03_Edge", new Color(.215f,.304f,.345f), .75f,.78f),
            new Surface("04_Floor", new Color(.105f,.160f,.187f), .35f,.52f),
            new Surface("05_Seat", new Color(.073f,.111f,.145f), .12f,.30f),
            new Surface("06_Glass", new Color(.057f,.216f,.260f), .50f,.82f),
            new Surface("07_Cyan", new Color(.018f,.72f,.80f), .10f,.75f,1.4f),
            new Surface("08_Mint", new Color(.12f,.79f,.51f), .08f,.66f,.7f),
            new Surface("09_Warm", new Color(1f,.47f,.17f), .08f,.64f,.55f),
            new Surface("10_Leaf", new Color(.08f,.42f,.24f), 0f,.45f),
            new Surface("11_Screen", new Color(.022f,.13f,.17f), .2f,.72f,.1f)
        };

        [MenuItem("War-Room3D/Arte/Gerar prefab sala de referencia")]
        public static GameObject EnsurePrefab()
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(FbxPath);
            if (model == null) throw new InvalidOperationException("FBX da sala de referencia indisponivel: " + FbxPath);
            EnsureFolder("Assets/WarRoom3D/Prefabs");
            EnsureFolder(MaterialFolder);
            var palette = BuildPalette();
            var root = new GameObject("ReferenceRoom");
            try
            {
                var instance = (GameObject)PrefabUtility.InstantiatePrefab(model);
                instance.name = "Modelo";
                instance.transform.SetParent(root.transform, false);
                foreach (var renderer in instance.GetComponentsInChildren<Renderer>())
                {
                    var source = renderer.sharedMaterials;
                    for (int i = 0; i < source.Length; i++)
                    {
                        string name = source[i] != null ? source[i].name.Replace(" (Instance)", "") : "";
                        if (!palette.TryGetValue(name, out var material))
                            throw new InvalidOperationException("Material sem mapeamento: " + name);
                        source[i] = material;
                    }
                    renderer.sharedMaterials = source;
                }
                Anchor(root.transform, "CameraAnchorOverview", new Vector3(0,1.5f,-8));
                Anchor(root.transform, "CameraAnchorInterior", new Vector3(0,1.2f,-1.5f));
                Anchor(root.transform, "CameraAnchorOpposite", new Vector3(0,1.5f,8));
                Anchor(root.transform, "UIAnchor", new Vector3(0,3.1f,0));
                for (int i = 0; i < 4; i++)
                {
                    float a = (45 + i * 90) * Mathf.Deg2Rad;
                    Anchor(root.transform, "AgentAnchor_" + (i+1),
                        new Vector3(Mathf.Cos(a)*3.15f,.9f,Mathf.Sin(a)*2.15f+.15f));
                }
                Light(root.transform, "Luz ambiente sala", new Vector3(0,3.0f,0), new Color(.44f,.85f,.92f), 2.1f, 8f, LightType.Point);
                Light(root.transform, "Luz tarefa mesa", new Vector3(0,3.3f,.2f), new Color(.72f,1f,.96f), 2.4f, 6f, LightType.Spot);
                Light(root.transform, "Luz destaque verde", new Vector3(-3.7f,2.4f,2.6f), new Color(.24f,1f,.53f), 1.1f, 4f, LightType.Point);
                Light(root.transform, "Luz destaque quente", new Vector3(3.9f,2.0f,-2.5f), new Color(1f,.50f,.26f), .7f, 3f, LightType.Point);
                root.AddComponent<ReferenceRoomView>();
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
                if (prefab == null) throw new InvalidOperationException("Falha ao salvar prefab da sala");
                AssetDatabase.SaveAssets();
                return prefab;
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }

        private static Dictionary<string, Material> BuildPalette()
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("URP/Lit indisponivel");
            var result = new Dictionary<string, Material>();
            foreach (var surface in Surfaces)
            {
                string path = MaterialFolder + "/" + surface.Name + ".mat";
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (material == null)
                {
                    material = new Material(shader) { name = surface.Name };
                    AssetDatabase.CreateAsset(material, path);
                }
                material.SetColor("_BaseColor", surface.Color);
                material.SetFloat("_Metallic", surface.Metallic);
                material.SetFloat("_Smoothness", surface.Smoothness);
                if (surface.Emission > 0)
                {
                    material.EnableKeyword("_EMISSION");
                    material.SetColor("_EmissionColor", surface.Color * surface.Emission);
                }
                else
                {
                    material.DisableKeyword("_EMISSION");
                    material.SetColor("_EmissionColor", Color.black);
                }
                EditorUtility.SetDirty(material);
                result.Add(surface.Name, material);
            }
            return result;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            int slash = path.LastIndexOf('/');
            string parent = path.Substring(0, slash);
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, path.Substring(slash+1));
        }

        private static void Anchor(Transform parent, string name, Vector3 position)
        {
            var anchor = new GameObject(name).transform;
            anchor.SetParent(parent, false);
            anchor.localPosition = position;
        }

        private static void Light(Transform parent, string name, Vector3 position, Color color, float intensity, float range, LightType type)
        {
            var item = new GameObject(name);
            item.transform.SetParent(parent, false);
            item.transform.localPosition = position;
            if (type == LightType.Spot) item.transform.localRotation = Quaternion.Euler(90,0,0);
            var light = item.AddComponent<UnityEngine.Light>();
            light.type = type;
            light.color = color;
            light.intensity = intensity;
            light.range = range;
            light.shadows = name == "Luz tarefa mesa" ? LightShadows.Soft : LightShadows.None;
            if (type == LightType.Spot) light.spotAngle = 95f;
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace WarRoom3D.Editor
{
    public static class AgentAssetBuilder
    {
        private const string ArtFolder = "Assets/WarRoom3D/Art/Agents";
        private const string PrefabFolder = "Assets/Resources/Agents";
        private const string MaterialFolder = ArtFolder + "/Materials";
        private static readonly Dictionary<string, Color> Colors = new Dictionary<string, Color> {
            {"Agent_Skin", new Color(.72f,.48f,.34f)}, {"Agent_Hair", new Color(.035f,.055f,.075f)},
            {"Agent_Cloth", new Color(.075f,.20f,.27f)}, {"Agent_Panel", new Color(.15f,.28f,.32f)},
            {"Agent_Trim", new Color(.16f,.70f,.76f)}, {"Agent_Glove", new Color(.11f,.20f,.23f)},
            {"Agent_Sole", new Color(.035f,.07f,.09f)}, {"Agent_Badge", new Color(.10f,.87f,.84f)}
        };

        [MenuItem("War-Room3D/Arte/Gerar prefabs de agentes")]
        public static void EnsurePrefabs()
        {
            EnsureFolder(PrefabFolder);
            EnsureFolder(MaterialFolder);
            var materials = BuildMaterials();
            Build("AgentSeated", true, materials);
            Build("AgentStanding", false, materials);
            AssetDatabase.SaveAssets();
        }

        public static GameObject LoadPrefab(bool seated)
        {
            string name = seated ? "AgentSeated" : "AgentStanding";
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabFolder + "/" + name + ".prefab");
            if (prefab != null) return prefab;
            EnsurePrefabs();
            return AssetDatabase.LoadAssetAtPath<GameObject>(PrefabFolder + "/" + name + ".prefab");
        }

        private static void Build(string name, bool seated, Dictionary<string, Material> materials)
        {
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(ArtFolder + "/" + name + ".fbx");
            if (model == null) throw new InvalidOperationException("Modelo de agente ausente: " + name);
            var root = new GameObject(name);
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
                        string key = source[i] != null ? source[i].name.Replace(" (Instance)", "") : "";
                        if (!materials.TryGetValue(key, out var material))
                            throw new InvalidOperationException("Material de agente sem mapeamento: " + key);
                        source[i] = material;
                    }
                    renderer.sharedMaterials = source;
                }
                root.AddComponent<AgentView>().ConfigurePrefab(seated);
                if (PrefabUtility.SaveAsPrefabAsset(root, PrefabFolder + "/" + name + ".prefab") == null)
                    throw new InvalidOperationException("Falha ao salvar avatar: " + name);
            }
            finally { UnityEngine.Object.DestroyImmediate(root); }
        }

        private static Dictionary<string, Material> BuildMaterials()
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("URP/Lit indisponível");
            var result = new Dictionary<string, Material>();
            foreach (var pair in Colors)
            {
                string path = MaterialFolder + "/" + pair.Key + ".mat";
                var material = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (material == null)
                {
                    material = new Material(shader) { name = pair.Key };
                    AssetDatabase.CreateAsset(material, path);
                }
                material.SetColor("_BaseColor", pair.Value);
                material.SetFloat("_Metallic", 0);
                material.SetFloat("_Smoothness", .32f);
                EditorUtility.SetDirty(material);
                result.Add(pair.Key, material);
            }
            return result;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            int split = path.LastIndexOf('/');
            EnsureFolder(path.Substring(0, split));
            AssetDatabase.CreateFolder(path.Substring(0, split), path.Substring(split + 1));
        }
    }
}

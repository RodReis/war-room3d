#if DEVELOPMENT_BUILD && !UNITY_EDITOR
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Profiling;

namespace WarRoom3D
{
    // Ensaio opt-in de arte no Player. FPS interno e memoria do driver nao medem apresentacao/VRAM.
    public sealed class ReferenceRoomPlayerCapture : MonoBehaviour
    {
        [Serializable]
        private sealed class Report
        {
            public string unityVersion;
            public string graphicsDevice;
            public int graphicsMemoryCapacityMB;
            public int width;
            public int height;
            public long sceneTriangles;
            public long sceneMeshMemoryBytes;
            public long visualTotalAllocatedMemoryBytes;
            public long reducedTotalAllocatedMemoryBytes;
            public long visualGraphicsDriverAllocatedBytes;
            public long reducedGraphicsDriverAllocatedBytes;
            public float visualInternalP95Ms;
            public float reducedInternalP95Ms;
            public float visualGpuP95Ms;
            public float reducedGpuP95Ms;
            public int visualGpuSamples;
            public int reducedGpuSamples;
            public string note = "Player de desenvolvimento, dados ilustrativos; tempo interno nao substitui PresentMon. Capacidade de VRAM nao e uso de VRAM.";
        }

        private string captureDirectory;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            var directory = Environment.GetEnvironmentVariable("WR3D_REFERENCE_CAPTURE_DIR");
            if (string.IsNullOrWhiteSpace(directory)) return;
            var sector = FindAnyObjectByType<SectorBuilder>();
            if (sector == null || FindAnyObjectByType<HudPresenter>() == null) return;
            var capture = sector.gameObject.AddComponent<ReferenceRoomPlayerCapture>();
            capture.captureDirectory = directory;
        }

        private IEnumerator Start()
        {
            yield return null;
            yield return null;
            var sector = GetComponent<SectorBuilder>();
            var hud = FindAnyObjectByType<HudPresenter>();
            var orbit = FindAnyObjectByType<OrbitCamera>();
            if (sector == null || hud == null || orbit == null ||
                !sector.Rooms.TryGetValue("slot-03", out var room))
            {
                Debug.LogError("Captura #29: sala/camera/HUD indisponivel");
                Application.Quit(2);
                yield break;
            }
            var view = room.GetComponentInChildren<ReferenceRoomView>();
            if (view == null)
            {
                Debug.LogError("Captura #29: prefab nao instanciado em slot-03");
                Application.Quit(3);
                yield break;
            }
            Directory.CreateDirectory(captureDirectory);
            var report = new Report {
                unityVersion = Application.unityVersion,
                graphicsDevice = SystemInfo.graphicsDeviceName,
                graphicsMemoryCapacityMB = SystemInfo.graphicsMemorySize,
                width = Screen.width,
                height = Screen.height
            };
            var meshes = new HashSet<Mesh>();
            foreach (var filter in view.GetComponentsInChildren<MeshFilter>())
            {
                var mesh = filter.sharedMesh;
                if (mesh == null) continue;
                for (int sub = 0; sub < mesh.subMeshCount; sub++)
                    report.sceneTriangles += (long)mesh.GetIndexCount(sub) / 3;
                if (meshes.Add(mesh)) report.sceneMeshMemoryBytes += Profiler.GetRuntimeMemorySizeLong(mesh);
            }

            foreach (bool reduced in new[] { false, true })
            {
                view.SetReduced(reduced);
                string profile = reduced ? "reduced" : "visual";
                hud.SendMessage("ReturnToSector");
                yield return Capture(profile + "-quartel");
                hud.SendMessage("EnterRoom");
                yield return Capture(profile + "-interior");
                orbit.Orbit(180, 0);
                yield return Capture(profile + "-oposto");
                var samples = new List<float>(120);
                var gpuSamples = new List<float>(120);
                var timings = new FrameTiming[1];
                for (int i = 0; i < 120; i++)
                {
                    FrameTimingManager.CaptureFrameTimings();
                    yield return null;
                    samples.Add(Time.unscaledDeltaTime * 1000f);
                    if (FrameTimingManager.GetLatestTimings(1, timings) > 0 && timings[0].gpuFrameTime > 0)
                        gpuSamples.Add((float)timings[0].gpuFrameTime);
                }
                samples.Sort();
                gpuSamples.Sort();
                float p95 = samples[Mathf.CeilToInt(samples.Count * .95f) - 1];
                float gpuP95 = gpuSamples.Count > 0 ? gpuSamples[Mathf.CeilToInt(gpuSamples.Count * .95f) - 1] : 0;
                if (reduced)
                {
                    report.reducedInternalP95Ms = p95;
                    report.reducedGpuP95Ms = gpuP95;
                    report.reducedGpuSamples = gpuSamples.Count;
                    report.reducedTotalAllocatedMemoryBytes = Profiler.GetTotalAllocatedMemoryLong();
                    report.reducedGraphicsDriverAllocatedBytes = Profiler.GetAllocatedMemoryForGraphicsDriver();
                }
                else
                {
                    report.visualInternalP95Ms = p95;
                    report.visualGpuP95Ms = gpuP95;
                    report.visualGpuSamples = gpuSamples.Count;
                    report.visualTotalAllocatedMemoryBytes = Profiler.GetTotalAllocatedMemoryLong();
                    report.visualGraphicsDriverAllocatedBytes = Profiler.GetAllocatedMemoryForGraphicsDriver();
                }
            }
            File.WriteAllText(Path.Combine(captureDirectory, "report.json"), JsonUtility.ToJson(report, true));
            Debug.Log("Captura #29 concluida: " + captureDirectory);
            Application.Quit(0);
        }

        private IEnumerator Capture(string name)
        {
            yield return null;
            yield return null;
            yield return new WaitForEndOfFrame();
            var texture = ScreenCapture.CaptureScreenshotAsTexture();
            try { File.WriteAllBytes(Path.Combine(captureDirectory, name + ".png"), texture.EncodeToPNG()); }
            finally { Destroy(texture); }
        }
    }
}
#endif

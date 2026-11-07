using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UIElements;

namespace WarRoom3D
{
    public sealed class EffectDirector : MonoBehaviour
    {
        private readonly HashSet<string> shownCauses = new HashSet<string>();
        private LiveStateClient client;
        private HistoryHudPresenter history;
        private SectorBuilder sector;
        private Label banner;
        private Button toggle;
        private long cursor;
        private bool hasCursor;
        private bool fetching;
        private bool reduced;
        private float hideAt;
        private string activeType;
        private GameObject beacon;
        private Material beaconMaterial;

        public void Configure(VisualElement root, LiveStateClient liveClient, HistoryHudPresenter historyPresenter, SectorBuilder sectorBuilder)
        {
            client = liveClient ?? throw new ArgumentNullException(nameof(liveClient));
            history = historyPresenter ?? throw new ArgumentNullException(nameof(historyPresenter));
            sector = sectorBuilder ?? throw new ArgumentNullException(nameof(sectorBuilder));
            banner = root?.Q<Label>("effect-banner") ?? throw new ArgumentException("Banner de efeito ausente");
            toggle = root.Q<Button>("effects-toggle") ?? throw new ArgumentException("Controle de efeito ausente");
            banner.style.display = DisplayStyle.None;
            toggle.style.display = DisplayStyle.Flex;
            toggle.clicked += ToggleReduced;
            client.SnapshotChanged += OnSnapshot;
            client.ConnectionChanged += OnConnection;
            history.ReplayChanged += OnReplayChanged;
            if (client.Snapshot != null) { cursor = client.Snapshot.streamSequence; hasCursor = true; }
        }

        public static bool IsLiveEffect(HistoryEffect effect) => effect != null && effect.ingestionMode == "live" &&
            (effect.effectType == "merge.celebration" || effect.effectType == "ci.alarm") &&
            !string.IsNullOrEmpty(effect.causationId);

        private void ToggleReduced()
        {
            reduced = !reduced;
            toggle.text = reduced ? "Reduzir efeitos: sim" : "Reduzir efeitos: não";
            if (reduced && banner.style.display.value == DisplayStyle.Flex) hideAt = Time.realtimeSinceStartup + 1f;
        }

        private void OnConnection(bool connected, string _)
        {
            if (connected) return;
            hasCursor = false;
            Hide();
        }

        private void OnReplayChanged(bool _)
        {
            if (client.Snapshot != null) { cursor = client.Snapshot.streamSequence; hasCursor = true; }
            Hide();
        }

        private void OnSnapshot(LiveSnapshot snapshot)
        {
            if (!isActiveAndEnabled) { cursor = snapshot.streamSequence; hasCursor = true; return; }
            if (!hasCursor || history.IsReplaying)
            {
                cursor = snapshot.streamSequence;
                hasCursor = true;
                return;
            }
            if (snapshot.streamSequence > cursor && !fetching) StartCoroutine(FetchNewEffects());
        }

        private IEnumerator FetchNewEffects()
        {
            fetching = true;
            while (client.Connected && !history.IsReplaying && client.Snapshot != null && cursor < client.Snapshot.streamSequence)
            {
                var target = client.Snapshot.streamSequence;
                using (var request = client.CreateHistoryRequest("/v1/history/replay?cursor=" + cursor + "&limit=200"))
                {
                    yield return request.SendWebRequest();
                    if (request.result != UnityWebRequest.Result.Success || request.responseCode != 200) break;
                    HistoryReplayPage page;
                    try { page = HistoryReplayPage.Parse(request.downloadHandler.text); }
                    catch (ArgumentException) { break; }
                    foreach (var item in page.events)
                        if (item.effects != null) foreach (var effect in item.effects) Present(effect);
                    var next = page.hasMore ? page.nextCursor : Math.Max(page.throughSequence, target);
                    if (next <= cursor) break;
                    cursor = next;
                }
            }
            fetching = false;
        }

        public bool Present(HistoryEffect effect)
        {
            if (history == null || history.IsReplaying || !IsLiveEffect(effect) || !shownCauses.Add(effect.causationId)) return false;
            if (activeType == "ci.alarm" && effect.effectType != "ci.alarm" && Time.realtimeSinceStartup < hideAt) return false;
            activeType = effect.effectType;
            banner.text = effect.effectType == "ci.alarm" ? "CI falhou · verifique workflow e evidência" : "PR mergeado · marco confirmado";
            banner.EnableInClassList("effect-alarm", effect.effectType == "ci.alarm");
            banner.style.display = DisplayStyle.Flex;
            hideAt = Time.realtimeSinceStartup + (reduced ? 1f : Mathf.Clamp(effect.durationMs / 1000f, 1f, 60f));
            ShowBeacon(effect);
            return true;
        }

        private void Update()
        {
            if (beacon != null && !reduced)
                beacon.transform.localScale = Vector3.one * (0.55f + 0.12f * Mathf.Sin(Time.realtimeSinceStartup * 8f));
            if (banner != null && activeType != null && Time.realtimeSinceStartup >= hideAt) Hide();
        }

        private void ShowBeacon(HistoryEffect effect)
        {
            ClearBeacon();
            var snapshot = client.Snapshot;
            if (snapshot?.roomPlacements == null || string.IsNullOrEmpty(effect.projectId)) return;
            var placement = Array.Find(snapshot.roomPlacements, item => item.projectId == effect.projectId && item.sectorId == "setor-01");
            if (placement == null || !sector.Rooms.TryGetValue(placement.slotId, out var room)) return;
            beacon = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            beacon.name = "EffectBeacon:" + effect.projectId;
            beacon.transform.SetParent(room, false);
            beacon.transform.localPosition = new Vector3(0, 2.8f, 0);
            beacon.transform.localScale = Vector3.one * 0.55f;
            var collider = beacon.GetComponent<Collider>();
            if (collider != null) Destroy(collider);
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            if (shader == null) { ClearBeacon(); return; }
            var color = effect.effectType == "ci.alarm" ? new Color(0.95f, 0.14f, 0.08f) : new Color(1f, 0.72f, 0.18f);
            beaconMaterial = new Material(shader) { color = color };
            beaconMaterial.EnableKeyword("_EMISSION");
            beaconMaterial.SetColor("_EmissionColor", color * 1.4f);
            beacon.GetComponent<Renderer>().sharedMaterial = beaconMaterial;
        }

        private void ClearBeacon()
        {
            if (beacon != null) Destroy(beacon);
            if (beaconMaterial != null) Destroy(beaconMaterial);
            beacon = null;
            beaconMaterial = null;
        }

        private void Hide()
        {
            activeType = null;
            if (banner != null) { banner.style.display = DisplayStyle.None; banner.EnableInClassList("effect-alarm", false); }
            ClearBeacon();
        }

        private void OnDisable()
        {
            StopAllCoroutines();
            fetching = false;
            Hide();
        }

        private void OnDestroy()
        {
            if (client != null) { client.SnapshotChanged -= OnSnapshot; client.ConnectionChanged -= OnConnection; }
            if (history != null) history.ReplayChanged -= OnReplayChanged;
        }
    }
}

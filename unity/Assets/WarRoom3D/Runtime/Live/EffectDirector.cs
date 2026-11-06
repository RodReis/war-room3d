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
        private Label banner;
        private Button toggle;
        private long cursor;
        private bool hasCursor;
        private bool fetching;
        private bool reduced;
        private float hideAt;
        private string activeType;

        public void Configure(VisualElement root, LiveStateClient liveClient, HistoryHudPresenter historyPresenter)
        {
            client = liveClient ?? throw new ArgumentNullException(nameof(liveClient));
            history = historyPresenter ?? throw new ArgumentNullException(nameof(historyPresenter));
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
            return true;
        }

        private void Update()
        {
            if (banner != null && activeType != null && Time.realtimeSinceStartup >= hideAt) Hide();
        }

        private void Hide()
        {
            activeType = null;
            if (banner != null) { banner.style.display = DisplayStyle.None; banner.EnableInClassList("effect-alarm", false); }
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

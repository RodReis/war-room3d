using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace WarRoom3D
{
    // Projeta somente agentes observados na sala de referência. Não produz eventos.
    public sealed class AgentPresenter : MonoBehaviour
    {
        private GameObject seatedPrefab;
        private GameObject standingPrefab;
        private Transform room;
        private ReferenceRoomView roomView;
        private readonly Dictionary<string, AgentView> views = new Dictionary<string, AgentView>();
        private readonly Dictionary<string, int> slots = new Dictionary<string, int>();
        private readonly Dictionary<string, Coroutine> arrivals = new Dictionary<string, Coroutine>();
        private readonly List<AgentProjectionRecord> records = new List<AgentProjectionRecord>();
        private string selectedKey;
        private GameObject overflowMarker;
        private TextMesh overflowText;
        private LineRenderer parentLine;
        private Material lineMaterial;
        private bool reduced;

        public int VisibleCount => views.Count;
        public int OverflowCount { get; private set; }
        public bool ParentLinkVisible => parentLine != null && parentLine.enabled;

        public void Configure(GameObject seated, GameObject standing)
        {
            seatedPrefab = seated;
            standingPrefab = standing;
        }

        public void Show(Transform targetRoom, IList<AgentProjectionRecord> projection, string selection)
        {
            if (room != targetRoom)
            {
                Clear();
                room = targetRoom;
                roomView = room != null ? room.GetComponentInChildren<ReferenceRoomView>() : null;
            }
            records.Clear();
            if (projection != null) records.AddRange(projection);
            selectedKey = selection;
            Reconcile();
        }

        public bool TryPick(Camera camera, Vector2 position, out string agentKey)
        {
            agentKey = null;
            if (camera == null || room == null) return false;
            var ray = camera.ScreenPointToRay(position);
            float nearest = float.PositiveInfinity;
            foreach (var pair in views)
                if (pair.Value.Intersect(ray, out var hit) && hit < nearest)
                { nearest = hit; agentKey = pair.Key; }
            return agentKey != null;
        }

        public Transform FindAgent(string agentKey) => views.TryGetValue(agentKey ?? "", out var view) ? view.transform : null;

        private void Reconcile()
        {
            OverflowCount = 0;
            var desired = new HashSet<string>();
            var visible = new List<AgentProjectionRecord>();
            foreach (var record in records)
                if (!record.Ended)
                {
                    if (visible.Count < 12) { visible.Add(record); desired.Add(record.AgentKey); }
                    else if (roomView != null) OverflowCount++;
                }
            var remove = new List<string>();
            foreach (var pair in views)
                if (!desired.Contains(pair.Key) || pair.Value == null) remove.Add(pair.Key);
            foreach (var key in remove)
            {
                if (arrivals.TryGetValue(key, out var arrival)) { StopCoroutine(arrival); arrivals.Remove(key); }
                if (views[key] != null) Destroy(views[key].gameObject);
                views.Remove(key);
                slots.Remove(key);
            }
            var occupied = new HashSet<int>(slots.Values);
            foreach (var record in visible)
            {
                if (views.ContainsKey(record.AgentKey)) continue;
                int slot = 0;
                while (occupied.Contains(slot)) slot++;
                occupied.Add(slot);
                slots[record.AgentKey] = slot;
                if (roomView == null || seatedPrefab == null || standingPrefab == null) continue;
                bool seated = slot < 4;
                var destination = SlotPosition(slot);
                bool animate = !reduced && !record.Uncertain;
                var entry = animate ? new Vector3(-1.25f + (slot % 4) * .7f, .02f, -3.25f) : destination;
                var view = CreateView(record.AgentKey, slot, !animate && seated, entry);
                if (view == null) continue;
                views.Add(record.AgentKey, view);
                if (animate)
                {
                    view.SetTraveling(true);
                    arrivals[record.AgentKey] = StartCoroutine(AnimateArrival(record.AgentKey, slot, entry, destination, seated));
                }
            }
            foreach (var record in visible)
                if (views.TryGetValue(record.AgentKey, out var view))
                    view.Bind(record.AgentKey, record.SessionKey, record.DisplayName, record.Style, record.Provider, record.Presence,
                        record.Uncertain, record.Failure, record.AgentKey == selectedKey, reduced);
            UpdateOverflow();
            UpdateParentLine();
        }

        private AgentView CreateView(string agentKey, int slot, bool seated, Vector3 position)
        {
            var instance = Instantiate(seated ? seatedPrefab : standingPrefab, roomView.transform);
            instance.name = "Agente:" + agentKey;
            instance.transform.localPosition = position;
            instance.transform.localRotation = Quaternion.Euler(0, slot < 4 ? 180f + slot * 90f : 180f, 0);
            var view = instance.GetComponent<AgentView>();
            if (view == null) Destroy(instance);
            return view;
        }

        // Trajeto e troca de postura são composição visual, nunca um evento operacional.
        private IEnumerator AnimateArrival(string key, int slot, Vector3 entry, Vector3 destination, bool seatAtDesk)
        {
            var elapsed = 0f;
            while (elapsed < 1.35f && !reduced && records.Find(item => item.AgentKey == key)?.Uncertain != true &&
                views.TryGetValue(key, out var moving) && moving != null)
            {
                elapsed += Time.unscaledDeltaTime;
                var fraction = Mathf.SmoothStep(0, 1, Mathf.Clamp01(elapsed / 1.35f));
                moving.transform.localPosition = Vector3.Lerp(entry,
                    seatAtDesk ? new Vector3(destination.x, .02f, destination.z) : destination, fraction);
                yield return null;
            }
            if (views.TryGetValue(key, out var current) && current != null)
            {
                if (seatAtDesk)
                {
                    var seatedView = CreateView(key, slot, true, destination);
                    if (seatedView != null)
                    {
                        views[key] = seatedView;
                        Destroy(current.gameObject);
                        var record = records.Find(item => item.AgentKey == key);
                        if (record != null)
                            seatedView.Bind(record.AgentKey, record.SessionKey, record.DisplayName, record.Style,
                                record.Provider, record.Presence, record.Uncertain, record.Failure, key == selectedKey, reduced);
                    }
                }
                else { current.transform.localPosition = destination; current.SetTraveling(false); }
            }
            arrivals.Remove(key);
            UpdateParentLine();
        }

        private Vector3 SlotPosition(int slot)
        {
            if (slot < 4)
            {
                var anchor = FindNamed(roomView.transform, "AgentAnchor_" + (slot + 1));
                if (anchor != null) return roomView.transform.InverseTransformPoint(anchor.position);
            }
            int index = Mathf.Max(0, slot - 4);
            float angle = (15f + index * 45f) * Mathf.Deg2Rad;
            return new Vector3(Mathf.Cos(angle) * 4.1f, .02f, Mathf.Sin(angle) * 2.8f);
        }

        private void UpdateOverflow()
        {
            if (roomView == null || OverflowCount == 0)
            {
                if (overflowMarker != null) overflowMarker.SetActive(false);
                return;
            }
            if (overflowMarker == null)
            {
                overflowMarker = new GameObject("Agentes adicionais");
                overflowMarker.transform.SetParent(roomView.transform, false);
                overflowMarker.transform.localPosition = new Vector3(0, 2.3f, -3.05f);
                overflowText = overflowMarker.AddComponent<TextMesh>();
                overflowText.anchor = TextAnchor.MiddleCenter;
                overflowText.alignment = TextAlignment.Center;
                overflowText.fontSize = 28;
                overflowText.characterSize = .07f;
                overflowText.color = new Color(.52f, .96f, .92f);
            }
            overflowMarker.SetActive(true);
            overflowText.text = "+" + OverflowCount + " agentes\nver lista";
        }

        private void UpdateParentLine()
        {
            if (parentLine != null) parentLine.enabled = false;
            if (roomView == null || string.IsNullOrEmpty(selectedKey) || !views.TryGetValue(selectedKey, out var child)) return;
            AgentProjectionRecord selected = records.Find(item => item.AgentKey == selectedKey);
            if (selected == null || selected.ParentStatus != "vinculado" ||
                !views.TryGetValue(selected.ParentAgentKey, out var parent)) return;
            if (parentLine == null)
            {
                var line = new GameObject("Vínculo observado");
                line.transform.SetParent(roomView.transform, false);
                parentLine = line.AddComponent<LineRenderer>();
                parentLine.positionCount = 2;
                parentLine.startWidth = .04f;
                parentLine.endWidth = .04f;
                var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
                if (shader == null) { Destroy(line); parentLine = null; return; }
                lineMaterial = new Material(shader);
                lineMaterial.SetColor("_BaseColor", new Color(.34f, .94f, .9f));
                lineMaterial.EnableKeyword("_EMISSION");
                lineMaterial.SetColor("_EmissionColor", new Color(.20f, .65f, .62f));
                parentLine.sharedMaterial = lineMaterial;
            }
            parentLine.enabled = true;
            parentLine.SetPosition(0, child.transform.position + Vector3.up * .9f);
            parentLine.SetPosition(1, parent.transform.position + Vector3.up * .9f);
        }

        private void Update()
        {
            bool next = (roomView != null && roomView.Reduced) || GetComponent<EffectDirector>()?.Reduced == true;
            if (next != reduced) { reduced = next; Reconcile(); }
            if (parentLine != null && parentLine.enabled && views.TryGetValue(selectedKey ?? "", out var child))
            {
                var selected = records.Find(item => item.AgentKey == selectedKey);
                if (selected != null && views.TryGetValue(selected.ParentAgentKey ?? "", out var parent))
                {
                    parentLine.SetPosition(0, child.transform.position + Vector3.up * .9f);
                    parentLine.SetPosition(1, parent.transform.position + Vector3.up * .9f);
                }
            }
        }

        private static Transform FindNamed(Transform root, string name)
        {
            foreach (var child in root.GetComponentsInChildren<Transform>()) if (child.name == name) return child;
            return null;
        }

        private void Clear()
        {
            foreach (var arrival in arrivals.Values) if (arrival != null) StopCoroutine(arrival);
            arrivals.Clear();
            foreach (var view in views.Values) if (view != null) Destroy(view.gameObject);
            views.Clear();
            slots.Clear();
            OverflowCount = 0;
            if (overflowMarker != null) Destroy(overflowMarker);
            if (parentLine != null) Destroy(parentLine.gameObject);
            if (lineMaterial != null) Destroy(lineMaterial);
            overflowMarker = null;
            overflowText = null;
            parentLine = null;
            lineMaterial = null;
        }

        private void OnDestroy() => Clear();
    }
}

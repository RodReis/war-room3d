using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;

namespace WarRoom3D
{
    /// <summary>Somente apresentacao: recorte pela camera e custo de iluminacao da sala.</summary>
    public sealed class ReferenceRoomView : MonoBehaviour
    {
        private Transform rear;
        private Transform front;
        private Transform left;
        private Transform right;
        private Renderer[] rearRenderers;
        private Renderer[] frontRenderers;
        private Renderer[] leftRenderers;
        private Renderer[] rightRenderers;
        private Light[] roomLights;
        private Renderer[] roomRenderers;
        private bool reduced;
        public bool Reduced => reduced;

        private void Awake()
        {
            rear = FindNamed(transform, "CUTAWAY_Rear");
            front = FindNamed(transform, "CUTAWAY_Front");
            left = FindNamed(transform, "CUTAWAY_Left");
            right = FindNamed(transform, "CUTAWAY_Right");
            rearRenderers = rear != null ? rear.GetComponentsInChildren<Renderer>() : new Renderer[0];
            frontRenderers = front != null ? front.GetComponentsInChildren<Renderer>() : new Renderer[0];
            leftRenderers = left != null ? left.GetComponentsInChildren<Renderer>() : new Renderer[0];
            rightRenderers = right != null ? right.GetComponentsInChildren<Renderer>() : new Renderer[0];
            roomLights = GetComponentsInChildren<Light>();
            roomRenderers = GetComponentsInChildren<Renderer>();
            SetReduced(false);
        }

        private void Update()
        {
            if (Keyboard.current != null && Keyboard.current.f8Key.wasPressedThisFrame)
                SetReduced(!reduced);
        }

        private void LateUpdate()
        {
            var camera = Camera.main;
            if (camera == null) return;
            Vector3 p = transform.InverseTransformPoint(camera.transform.position);
            SetVisible(rearRenderers, p.z < 3.3f);
            SetVisible(frontRenderers, p.z > 3.3f);
            SetVisible(leftRenderers, p.x > -4.6f);
            SetVisible(rightRenderers, p.x < 4.6f);
        }

        public void SetReduced(bool value)
        {
            reduced = value;
            if (roomLights == null) roomLights = GetComponentsInChildren<Light>();
            if (roomRenderers == null) roomRenderers = GetComponentsInChildren<Renderer>();
            foreach (var light in roomLights)
            {
                light.enabled = !value || light.name == "Luz ambiente sala";
                light.shadows = !value && light.name == "Luz tarefa mesa"
                    ? LightShadows.Soft : LightShadows.None;
            }
            foreach (var renderer in roomRenderers)
                renderer.shadowCastingMode = value ? ShadowCastingMode.Off : ShadowCastingMode.On;
            Debug.Log(value ? "Sala de referencia: perfil reduzido" : "Sala de referencia: perfil visual");
        }

        private static void SetVisible(Renderer[] renderers, bool visible)
        {
            foreach (var renderer in renderers)
                if (renderer != null) renderer.enabled = visible;
        }

        private static Transform FindNamed(Transform parent, string name)
        {
            if (parent.name == name) return parent;
            foreach (Transform child in parent)
            {
                var found = FindNamed(child, name);
                if (found != null) return found;
            }
            return null;
        }
    }
}

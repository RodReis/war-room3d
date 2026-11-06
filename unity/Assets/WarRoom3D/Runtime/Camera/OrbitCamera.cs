using UnityEngine;
using UnityEngine.InputSystem;

namespace WarRoom3D
{
    public sealed class OrbitCamera : MonoBehaviour
    {
        private Vector3 focus;
        private float yaw;
        private float pitch;
        private float distance;
        private bool dragging;
        private HudPresenter hud;

        public float Yaw => yaw;
        public float Pitch => pitch;
        public float Distance => distance;
        public Vector3 Focus => focus;

        private void Awake() => ResetView();

        public void SetHud(HudPresenter presenter) => hud = presenter;

        public void FocusRoom(Transform room)
        {
            if (room == null) return;
            focus = room.position + Vector3.up;
            yaw = 35f;
            pitch = 37f;
            distance = 11f;
            ApplyPose();
        }

        public void FocusCore()
        {
            focus = new Vector3(0, 0.8f, 0);
            yaw = 40f;
            pitch = 42f;
            distance = 13f;
            ApplyPose();
        }

        public void ResetView()
        {
            focus = new Vector3(0, 0.7f, 0);
            yaw = 45f;
            pitch = 50f;
            distance = 54f;
            dragging = false;
            ApplyPose();
        }

        public void Orbit(float horizontal, float vertical)
        {
            yaw = Mathf.Repeat(yaw + horizontal, 360f);
            pitch = Mathf.Clamp(pitch + vertical, 20f, 75f);
            ApplyPose();
        }

        public void Zoom(float delta)
        {
            distance = Mathf.Clamp(distance - delta, 8f, 55f);
            ApplyPose();
        }

        private void Update()
        {
            var mouse = Mouse.current;
            if (mouse == null) return;
            if (mouse.rightButton.wasPressedThisFrame) dragging = hud == null || !hud.IsPointerOverHud(mouse.position.ReadValue());
            if (mouse.rightButton.wasReleasedThisFrame) dragging = false;
            if (dragging && mouse.rightButton.isPressed)
            {
                Vector2 delta = mouse.delta.ReadValue();
                Orbit(delta.x * 0.18f, -delta.y * 0.18f);
            }
            float scroll = mouse.scroll.ReadValue().y;
            if (Mathf.Abs(scroll) > 0.01f && (hud == null || !hud.IsPointerOverHud(mouse.position.ReadValue())))
                Zoom(scroll * 0.02f);
        }

        private void ApplyPose()
        {
            Quaternion rotation = Quaternion.Euler(pitch, yaw, 0);
            transform.position = focus + rotation * new Vector3(0, 0, -distance);
            transform.LookAt(focus);
        }
    }
}

using UnityEngine;
using UnityEngine.InputSystem;

namespace WarRoom3D
{
    public static class RoomSceneSelection
    {
        public static bool TryPickSlot(Camera camera, SectorBuilder sector, IHudPointerArea hud, out string slotId)
        {
            slotId = null;
            var mouse = Mouse.current;
            if (camera == null || sector == null || mouse == null || !mouse.leftButton.wasPressedThisFrame) return false;
            var position = mouse.position.ReadValue();
            if (hud != null && hud.IsPointerOverHud(position)) return false;
            var ray = camera.ScreenPointToRay(position);
            var nearest = float.PositiveInfinity;
            foreach (var room in sector.Rooms)
            {
                foreach (var renderer in room.Value.GetComponentsInChildren<Renderer>())
                {
                    if (!renderer.enabled || !renderer.bounds.IntersectRay(ray, out var distance) || distance >= nearest) continue;
                    nearest = distance;
                    slotId = room.Key;
                }
            }
            return slotId != null;
        }
    }
}

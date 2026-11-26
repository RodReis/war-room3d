using UnityEngine;
using UnityEngine.InputSystem;

namespace WarRoom3D
{
    public static class RoomSceneSelection
    {
        public static bool TryPickTarget(Camera camera, SectorBuilder sector, IHudPointerArea hud, out string targetId, out bool fixedSpace)
        {
            targetId = null;
            fixedSpace = false;
            var mouse = Mouse.current;
            if (camera == null || sector == null || mouse == null || !mouse.leftButton.wasPressedThisFrame) return false;
            var position = mouse.position.ReadValue();
            if (hud != null && hud.IsPointerOverHud(position)) return false;
            var ray = camera.ScreenPointToRay(position);
            var nearest = float.PositiveInfinity;
            foreach (var room in sector.Rooms)
                Consider(room.Value, room.Key, false, ray, ref nearest, ref targetId, ref fixedSpace);
            foreach (var space in sector.FixedSpaces.Values)
                Consider(space.transform, space.SpaceId, true, ray, ref nearest, ref targetId, ref fixedSpace);
            return targetId != null;
        }

        private static void Consider(Transform target, string id, bool isFixed, Ray ray, ref float nearest, ref string targetId, ref bool fixedSpace)
        {
            foreach (var renderer in target.GetComponentsInChildren<Renderer>())
            {
                if (!renderer.enabled || !renderer.bounds.IntersectRay(ray, out var distance) || distance >= nearest) continue;
                nearest = distance;
                targetId = id;
                fixedSpace = isFixed;
            }
        }

        public static bool TryPickSlot(Camera camera, SectorBuilder sector, IHudPointerArea hud, out string slotId)
        {
            var found = TryPickTarget(camera, sector, hud, out var targetId, out var fixedSpace);
            slotId = found && !fixedSpace ? targetId : null;
            return slotId != null;
        }
    }
}

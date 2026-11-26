using UnityEngine;

namespace WarRoom3D
{
    // Identidade arquitetônica; não representa projeto, sessão nem presença de usuário.
    public sealed class FixedSpaceView : MonoBehaviour
    {
        [SerializeField] private string spaceId;
        [SerializeField] private string title;
        [SerializeField] private string description;
        public string SpaceId => spaceId;
        public string Title => title;
        public string Description => description;

        public void Configure(string id, string displayTitle, string detail)
        {
            spaceId = id;
            title = displayTitle;
            description = detail;
        }
    }
}

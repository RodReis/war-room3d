using System;

namespace WarRoom3D
{
    [Serializable]
    public sealed class DemoSnapshot
    {
        public string schemaVersion;
        public string mode;
        public string sectorId;
        public string selectedProjectId;
        public DemoProject[] projects;
    }

    [Serializable]
    public sealed class DemoProject
    {
        public string projectId;
        public string name;
        public string slotId;
        public string provider;
        public int activeAgents;
        public string status;
        public string activity;
    }
}

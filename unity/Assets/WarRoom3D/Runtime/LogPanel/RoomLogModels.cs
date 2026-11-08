using System;

namespace WarRoom3D
{
    [Serializable] public sealed class SessionEventPage
    {
        public string projectId;
        public SessionEventItem[] items;
        public long nextBefore;
        public string coverage;
    }

    [Serializable] public sealed class SessionEventItem
    {
        public string eventId;
        public long streamSequence;
        public string projectId;
        public string sessionKey;
        public string agentKey;
        public string type;
        public string sourceId;
        public string observedAt;
        public string provenance;
        public int evidenceCount;
        public string[] evidenceRefs;
    }

    [Serializable] public sealed class OperationLogPage
    {
        public OperationLogItem[] items;
        public long nextCursor;
        public string coverage;
    }

    [Serializable] public sealed class OperationLogItem
    {
        public string observationId;
        public string sourceId;
        public string sourceVersion;
        public string environmentId;
        public string resourceId;
        public string observedAt;
        public string receivedAt;
        public string classification;
        public string confidence;
        public string evidenceRef;
        public string coverage;
        public LogCorrelation correlation;
        public LogFields fields;
    }

    [Serializable] public sealed class LogCorrelation { public string traceId; public string spanId; public string requestId; }
    [Serializable] public sealed class LogFields { public string message; public string severity; }
}

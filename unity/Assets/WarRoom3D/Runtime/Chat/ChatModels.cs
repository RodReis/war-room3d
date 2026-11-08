using System;

namespace WarRoom3D
{
    [Serializable]
    public sealed class ChatPage
    {
        public string schemaVersion;
        public string projectId;
        public string sessionKey;
        public ChatMessage[] items;
        public long nextBefore;
        public string provenance;
        public bool receiptIsResponse;
    }

    [Serializable]
    public sealed class ChatMessage
    {
        public long sequence;
        public string messageId;
        public string projectId;
        public string sessionKey;
        public string provider;
        public string role;
        public string content;
        public string observedAt;
        public string nativeRef;
        public string turnRef;
        public string sourceId;
        public string consentRef;
        public string expiresAt;
        public bool truncated;
    }
}

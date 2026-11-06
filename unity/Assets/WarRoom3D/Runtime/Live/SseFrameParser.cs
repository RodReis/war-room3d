using System;
using System.Collections.Generic;
using System.Text;

namespace WarRoom3D
{
    public sealed class SseFrame
    {
        public long Id { get; internal set; }
        public string Event { get; internal set; }
    }

    public sealed class SseFrameParser
    {
        private readonly StringBuilder pending = new StringBuilder();

        public IReadOnlyList<SseFrame> Push(string chunk)
        {
            if (chunk == null) throw new ArgumentNullException(nameof(chunk));
            pending.Append(chunk.Replace("\r\n", "\n"));
            var frames = new List<SseFrame>();
            while (true)
            {
                var text = pending.ToString();
                int end = text.IndexOf("\n\n", StringComparison.Ordinal);
                if (end < 0) break;
                if (end > 65536) throw new ArgumentException("Frame SSE acima do limite");
                pending.Remove(0, end + 2);
                var frame = new SseFrame();
                foreach (var line in text.Substring(0, end).Split('\n'))
                {
                    if (line.StartsWith("event: ", StringComparison.Ordinal)) frame.Event = line.Substring(7);
                    else if (line.StartsWith("id: ", StringComparison.Ordinal) && long.TryParse(line.Substring(4), out long id)) frame.Id = id;
                }
                if (!string.IsNullOrEmpty(frame.Event)) frames.Add(frame);
            }
            if (pending.Length > 65536) throw new ArgumentException("Frame SSE acima do limite");
            return frames;
        }
    }
}

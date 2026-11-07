import type { Readable, Writable } from 'node:stream';

export type JsonFrame = Record<string, unknown>;
export interface SessionChannel {
  readonly connectionId: string;
  readonly isOpen: boolean;
  exchange(frame: JsonFrame, matches: (frame: JsonFrame) => boolean, signal: AbortSignal): Promise<JsonFrame>;
}
interface Pending {
  matches: (frame: JsonFrame) => boolean;
  finish: (frame?: JsonFrame) => void;
}

/** Canal já aberto pelo host. Não cria processo, não retoma sessão e nunca faz retry. */
export class JsonlChannel implements SessionChannel {
  readonly connectionId: string;
  private readonly input: Writable;
  private readonly output: Readable;
  private readonly maxFrameBytes: number;
  private readonly timeoutMs: number;
  private buffer = Buffer.alloc(0);
  private pending = new Set<Pending>();
  private open = true;

  constructor(options: {input: Writable; output: Readable; connectionId: string; maxFrameBytes?: number; timeoutMs?: number}) {
    this.connectionId = options.connectionId;
    this.input = options.input;
    this.output = options.output;
    this.maxFrameBytes = options.maxFrameBytes ?? 65536;
    this.timeoutMs = options.timeoutMs ?? 10000;
    if (!this.connectionId || !Number.isSafeInteger(this.maxFrameBytes) || this.maxFrameBytes < 64 ||
        this.maxFrameBytes > 1048576 || !Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000)
      throw new Error('invalid_channel_options');
    this.output.on('data', this.onData);
    this.output.on('end', this.onClose);
    this.output.once('close', this.onOutputClosed);
    this.input.once('close', this.onInputClosed);
    this.input.on('finish', this.onClose);
    // Permanecem até o close dos streams para absorver EPIPE emitido após callback de escrita.
    this.output.on('error', this.onError);
    this.input.on('error', this.onError);
  }

  get isOpen(): boolean { return this.open && !this.input.destroyed && !this.output.destroyed && !this.input.writableEnded && !this.output.readableEnded; }
  get pendingCount(): number { return this.pending.size; }
  private onError = (): void => { this.close(); };
  private onClose = (): void => { this.close(); };
  private onOutputClosed = (): void => { this.close(); this.output.off('error', this.onError); };
  private onInputClosed = (): void => { this.close(); this.input.off('error', this.onError); };
  private onData = (chunk: Buffer | string): void => {
    if (!this.open) return;
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (bytes.length > this.maxFrameBytes * 4) { this.close(); return; }
    this.buffer = Buffer.concat([this.buffer, bytes]);
    let newline: number;
    while ((newline = this.buffer.indexOf(10)) >= 0) {
      if (newline > this.maxFrameBytes) { this.close(); return; }
      const line = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      if (!line.length) continue;
      let frame: JsonFrame;
      try {
        const parsed: unknown = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(line));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        frame = parsed as JsonFrame;
        for (const waiting of [...this.pending]) if (waiting.matches(frame)) waiting.finish(frame);
      } catch { this.close(); return; }
    }
    if (this.buffer.length > this.maxFrameBytes) this.close();
  };

  exchange(frame: JsonFrame, matches: Pending['matches'], signal: AbortSignal): Promise<JsonFrame> {
    if (!this.isOpen || signal.aborted || this.pending.size >= 32) return Promise.reject(new Error('channel_unavailable'));
    const bytes = Buffer.from(JSON.stringify(frame) + '\n');
    if (bytes.length > this.maxFrameBytes || this.input.writableLength + bytes.length > this.maxFrameBytes * 2)
      return Promise.reject(new Error('channel_unavailable'));
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (reply?: JsonFrame): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', aborted);
        this.pending.delete(waiting);
        if (reply) resolve(reply); else reject(new Error('delivery_unconfirmed'));
      };
      const aborted = (): void => finish();
      const waiting: Pending = {matches, finish};
      const timer = setTimeout(aborted, this.timeoutMs);
      this.pending.add(waiting);
      signal.addEventListener('abort', aborted, {once: true});
      try { this.input.write(bytes, error => { if (error) finish(); }); }
      catch { finish(); }
    });
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.output.off('data', this.onData);
    this.output.off('end', this.onClose);
    this.input.off('finish', this.onClose);
    this.buffer = Buffer.alloc(0);
    for (const waiting of [...this.pending]) waiting.finish();
  }
}

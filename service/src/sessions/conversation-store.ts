import type Database from 'better-sqlite3';

export interface ObservedMessage {
  messageId: string;
  projectId: string;
  sessionKey: string;
  sourceId: string;
  provider: 'claude' | 'codex';
  role: 'user' | 'assistant';
  content: string;
  observedAt: string;
  receivedAt: string;
  nativeRef: string | null;
  turnRef: string | null;
  consentRef: string;
  retentionDays: number;
  truncated: boolean;
}

interface MessageRow {
  sequence: number; message_id: string; project_id: string; session_key: string;
  source_id: string; provider: string; role: string; content: string;
  observed_at: string; native_ref: string | null; turn_ref: string | null; consent_ref: string; retention_days:number; expires_at: string; truncated: number;
}

export class ConversationStore {
  private readonly db: Database.Database;
  constructor(db: Database.Database) { this.db = db; this.purgeExpired(); }

  record(message: ObservedMessage): boolean {
    if (!message.consentRef || !message.content.trim() || message.content.length > 8000 ||
      !['user', 'assistant'].includes(message.role) || !Number.isFinite(Date.parse(message.observedAt)) ||
      !Number.isFinite(Date.parse(message.receivedAt)) ||
      !Number.isSafeInteger(message.retentionDays) || message.retentionDays < 1 || message.retentionDays > 30)
      throw new Error('Mensagem observada inválida');
    const expiresAt=new Date(Math.min(Date.parse(message.observedAt),Date.parse(message.receivedAt))+message.retentionDays*86400000).toISOString();
    this.purgeExpired();
    if (Date.parse(expiresAt)<=Date.now()) return false;
    const session = this.db.prepare('SELECT project_id, source_id, provider FROM sessions WHERE session_key = ?')
      .get(message.sessionKey) as {project_id:string;source_id:string;provider:string}|undefined;
    if (!session || session.project_id !== message.projectId || session.source_id !== message.sourceId || session.provider !== message.provider)
      throw new Error('Mensagem fora da sessão observada');
    const deletion=this.db.prepare('SELECT deleted_through FROM conversation_deletions WHERE project_id = ? AND session_key = ?')
      .get(message.projectId,message.sessionKey) as {deleted_through:string}|undefined;
    if (deletion && Date.parse(message.observedAt)<=Date.parse(deletion.deleted_through)) return false;
    const result = this.db.prepare(`INSERT OR IGNORE INTO conversation_messages
      (message_id,project_id,session_key,source_id,provider,role,content,observed_at,native_ref,turn_ref,consent_ref,retention_days,expires_at,truncated)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(message.messageId,message.projectId,message.sessionKey,message.sourceId,
        message.provider,message.role,message.content,message.observedAt,message.nativeRef,message.turnRef,message.consentRef,
        message.retentionDays,expiresAt,message.truncated?1:0);
    if (!result.changes) {
      const prior = this.db.prepare('SELECT * FROM conversation_messages WHERE message_id = ?').get(message.messageId) as MessageRow|undefined;
      if (!prior || prior.project_id !== message.projectId || prior.session_key !== message.sessionKey || prior.source_id !== message.sourceId ||
        prior.provider !== message.provider || prior.role !== message.role || prior.content !== message.content || prior.turn_ref !== message.turnRef ||
        prior.consent_ref !== message.consentRef || prior.retention_days !== message.retentionDays)
        throw new Error('messageId colide com outro conteúdo');
    }
    return result.changes > 0;
  }

  page(projectId: string, sessionKey: string, before: number | null, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      (before !== null && (!Number.isSafeInteger(before) || before < 1))) throw new Error('Página inválida');
    this.purgeExpired();
    const session = this.db.prepare('SELECT 1 FROM sessions WHERE project_id = ? AND session_key = ?').get(projectId,sessionKey);
    if (!session) return null;
    const rows = this.db.prepare(`SELECT * FROM conversation_messages WHERE project_id = ? AND session_key = ?
      AND (? IS NULL OR sequence < ?) ORDER BY sequence DESC LIMIT ?`)
      .all(projectId,sessionKey,before,before,limit+1) as MessageRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0,limit).reverse().map(row => ({sequence:row.sequence,messageId:row.message_id,
      projectId:row.project_id,sessionKey:row.session_key,provider:row.provider,role:row.role,content:row.content,
      observedAt:row.observed_at,nativeRef:row.native_ref,turnRef:row.turn_ref,sourceId:row.source_id,
      consentRef:row.consent_ref,expiresAt:row.expires_at,truncated:!!row.truncated}));
    return {schemaVersion:'1.0',projectId,sessionKey,items,nextBefore:hasMore?items[0].sequence:null,
      provenance:'observed',receiptIsResponse:false};
  }

  purgeExpired(now=Date.now()):number {
    return this.db.prepare('DELETE FROM conversation_messages WHERE expires_at <= ?').run(new Date(now).toISOString()).changes;
  }

  deleteSession(projectId:string,sessionKey:string):number|null {
    const session=this.db.prepare('SELECT 1 FROM sessions WHERE project_id = ? AND session_key = ?').get(projectId,sessionKey);
    if (!session) return null;
    return this.db.transaction(()=>{
      const deletedThrough=new Date().toISOString();
      this.db.prepare(`INSERT INTO conversation_deletions(project_id,session_key,deleted_through) VALUES(?,?,?)
        ON CONFLICT(project_id,session_key) DO UPDATE SET deleted_through = excluded.deleted_through`)
        .run(projectId,sessionKey,deletedThrough);
      return this.db.prepare('DELETE FROM conversation_messages WHERE project_id = ? AND session_key = ?').run(projectId,sessionKey).changes;
    })();
  }

  retainAuthorizedSources(sources:readonly {sourceId:string;conversationContent?:{consentRef:string;retentionDays:number}}[]):number {
    const allowed=new Map(sources.filter(source=>!!source.conversationContent).map(source=>[source.sourceId,source.conversationContent!]));
    const rows=this.db.prepare('SELECT DISTINCT source_id,consent_ref,retention_days FROM conversation_messages').all() as
      {source_id:string;consent_ref:string;retention_days:number}[];
    let removed=0;
    for(const row of rows)if(allowed.get(row.source_id)?.consentRef!==row.consent_ref ||
      allowed.get(row.source_id)?.retentionDays!==row.retention_days)
      removed+=this.db.prepare('DELETE FROM conversation_messages WHERE source_id = ? AND consent_ref = ? AND retention_days = ?')
        .run(row.source_id,row.consent_ref,row.retention_days).changes;
    return removed;
  }
}

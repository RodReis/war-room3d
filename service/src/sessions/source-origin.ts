// Declaração local de configuração; não é atestado da origem do processo.
export interface SessionOrigin {
  surface: 'desktop'|'cli'|'vscode'|'app-server-client';
  version: string;
  transport: 'hooks'|'app-server';
}

export function isSessionOrigin(value:unknown):value is SessionOrigin {
  if(!value || typeof value!=='object' || Array.isArray(value)) return false;
  const origin=value as Record<string,unknown>;
  return Object.keys(origin).length===3 && Object.keys(origin).every(k=>['surface','version','transport'].includes(k)) &&
    ['desktop','cli','vscode','app-server-client'].includes(String(origin.surface)) &&
    typeof origin.version==='string' && /^\d+\.\d+\.\d+(?:\.\d+)?(?:-[A-Za-z0-9.-]+)?$/.test(origin.version) &&
    origin.version.length<=80 && origin.transport===(origin.surface==='app-server-client'?'app-server':'hooks');
}

export function matchesSourceOrigin(origin:SessionOrigin|undefined,raw:unknown):boolean {
  if(!origin) return true; // Configurações anteriores não afirmam uma superfície.
  if(!isSessionOrigin(origin) || !raw || typeof raw!=='object' || Array.isArray(raw)) return false;
  const input=raw as Record<string,unknown>;
  return origin.transport==='hooks'
    ? typeof input.hook_event_name==='string' && input.method===undefined
    : typeof input.method==='string' && input.hook_event_name===undefined;
}

export function describeSourceOrigin(origin:SessionOrigin|undefined) {
  return {origin:origin ?? null,attribution:origin?'declared':'unknown',desktopProof:'not_run'};
}

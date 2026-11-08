import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CommandActor } from '../commands/types.ts';
import { OperationsStore, operationCategories } from '../operations/operations-store.ts';

function sendJson(response:ServerResponse,status:number,body:unknown):void {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(body));
}

function integer(value:string|null,fallback:number):number|null {
  if (value===null) return fallback;
  if (!/^(0|[1-9]\d*)$/.test(value)) return null;
  const parsed=Number(value); return Number.isSafeInteger(parsed)?parsed:null;
}

async function readBody(request:IncomingMessage):Promise<Record<string,unknown>|null> {
  const length=Number(request.headers['content-length']??0);
  if (!Number.isSafeInteger(length)||length<1||length>4096||request.headers['transfer-encoding']) return null;
  let raw='';
  for await (const chunk of request) { raw+=chunk.toString(); if (Buffer.byteLength(raw)>4096) return null; }
  try { const value=JSON.parse(raw); return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null; }
  catch { return null; }
}

export async function handleOperations(request:IncomingMessage,response:ServerResponse,store:OperationsStore,auth:{canRead:boolean;canCommand:boolean;actor:CommandActor}):Promise<boolean> {
  const url=new URL(request.url??'','http://127.0.0.1');
  const dataRoute=url.pathname==='/v1/logs'||url.pathname==='/v1/traces'||url.pathname==='/v1/network'||url.pathname==='/v1/security'||url.pathname==='/v1/security/reports';
  if (!url.pathname.startsWith('/v1/operations') && !dataRoute) return false;
  const queryKeys=[...url.searchParams.keys()];
  if (new Set(queryKeys).size!==queryKeys.length) { sendJson(response,400,{code:'invalid_query'}); return true; }
  if (request.method==='GET' && !auth.canRead) { response.writeHead(403).end(); return true; }
  if (request.method==='POST' && !auth.canCommand) { response.writeHead(403).end(); return true; }
  if (request.method!=='GET'&&request.method!=='POST') { response.writeHead(405,{Allow:'GET, POST'}).end(); return true; }
  if (request.method==='GET'&&(request.headers['content-length']||request.headers['transfer-encoding'])) { response.writeHead(400).end(); return true; }
  try {
    const query=[...url.searchParams.keys()];
    if (request.method==='GET'&&url.pathname==='/v1/operations/sources') {
      if (query.length!==1||query[0]!=='environmentId') { sendJson(response,400,{code:'invalid_query'}); return true; }
      const environmentId=url.searchParams.get('environmentId')!;
      sendJson(response,200,{environmentId,sources:store.sources(environmentId),coverage:Object.fromEntries(operationCategories.map(category=>[category,store.coverage(environmentId,category)]))}); return true;
    }
    if (request.method==='GET'&&dataRoute) {
      const traceRoute=url.pathname==='/v1/traces';
      const allowed=traceRoute?['environmentId','sourceId','resourceId','projectId','traceId','spanId','requestId','from','to','cursor','limit']:['environmentId','sourceId','resourceId','projectId','from','to','cursor','limit'];
      if (!url.searchParams.has('environmentId')||query.some(key=>!allowed.includes(key)) || (traceRoute&&!url.searchParams.has('traceId')&&!url.searchParams.has('spanId')&&!url.searchParams.has('requestId'))) { sendJson(response,400,{code:'invalid_query'}); return true; }
      const cursor=integer(url.searchParams.get('cursor'),0),limit=integer(url.searchParams.get('limit'),50);
      if (cursor===null||limit===null) { sendJson(response,400,{code:'invalid_query'}); return true; }
      const category=url.pathname==='/v1/logs'?'log':url.pathname==='/v1/traces'?'trace':url.pathname==='/v1/network'?'network':url.pathname==='/v1/security/reports'?'security_report':'security_detection';
      const result=store.query({environmentId:url.searchParams.get('environmentId')!,category,
        sourceId:url.searchParams.get('sourceId')??undefined,resourceId:url.searchParams.get('resourceId')??undefined,projectId:url.searchParams.get('projectId')??undefined,traceId:url.searchParams.get('traceId')??undefined,
        spanId:url.searchParams.get('spanId')??undefined,requestId:url.searchParams.get('requestId')??undefined,from:url.searchParams.get('from')??undefined,to:url.searchParams.get('to')??undefined,cursor,limit});
      sendJson(response,200,result); return true;
    }
    if (request.method==='GET'&&url.pathname==='/v1/operations/incidents') {
      if (!url.searchParams.has('environmentId')||query.some(key=>!['environmentId','projectId','status','severity'].includes(key))) { sendJson(response,400,{code:'invalid_query'}); return true; }
      const status=url.searchParams.get('status');
      const severity=url.searchParams.get('severity');
      if ((status!==null&&!['open','acknowledged','resolved'].includes(status)) || (severity!==null&&!['info','low','medium','high','critical'].includes(severity))) { sendJson(response,400,{code:'invalid_query'}); return true; }
      const statusFilter=status===null?undefined:status as 'open'|'acknowledged'|'resolved';
      const severityFilter=severity===null?undefined:severity as 'info'|'low'|'medium'|'high'|'critical';
      sendJson(response,200,{environmentId:url.searchParams.get('environmentId'),incidents:store.incidents(url.searchParams.get('environmentId')!,statusFilter,severityFilter,url.searchParams.get('projectId')??undefined)}); return true;
    }
    const mutation=url.pathname.match(/^\/v1\/operations\/incidents\/([A-Za-z0-9][A-Za-z0-9._:-]{0,159})\/(acknowledge|resolve)$/);
    if (request.method==='POST'&&mutation&&!url.search) {
      if (!store.actorCanAccessIncident(mutation[1]!,auth.actor.projectIds)) { response.writeHead(403).end(); return true; }
      const body=await readBody(request);
      if (!body) { sendJson(response,400,{code:'invalid_body'}); return true; }
      const at=new Date().toISOString();
      if (mutation[2]==='acknowledge'&&Object.keys(body).length===0) store.acknowledge(mutation[1]!,auth.actor.actorId,at);
      else if (mutation[2]==='resolve'&&Object.keys(body).length===1&&typeof body.reason==='string') store.resolve(mutation[1]!,auth.actor.actorId,body.reason,at);
      else { sendJson(response,400,{code:'invalid_body'}); return true; }
      sendJson(response,200,{incidentId:mutation[1],status:mutation[2]==='acknowledge'?'acknowledged':'resolved'}); return true;
    }
    response.writeHead(404).end(); return true;
  } catch (error) {
    const message=error instanceof Error?error.message:'';
    if (message==='Fonte fora do ambiente solicitado') sendJson(response,404,{code:'not_found'});
    else if (/inválid|desconhecida|não autorizad|sem permissão|indisponível|resolução|reconhecimento/.test(message)) sendJson(response,400,{code:'invalid_operation',message});
    else { sendJson(response,500,{code:'internal_error'}); }
    return true;
  }
}

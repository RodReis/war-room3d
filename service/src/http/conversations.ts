import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConversationStore } from '../sessions/conversation-store.ts';
import type { CommandActor } from '../commands/types.ts';

const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const send = (response:ServerResponse,status:number,body:unknown) =>
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(body));

export function handleConversations(request:IncomingMessage,response:ServerResponse,store:ConversationStore,
  access:{canRead:boolean;canCommand:boolean},actor:CommandActor):void {
  const authority=`127.0.0.1:${request.socket.localPort}`;
  if (request.headers.host!==authority || (request.headers.origin!==undefined && request.headers.origin!==`http://${authority}`) ||
    (request.headers['sec-fetch-site']!==undefined && request.headers['sec-fetch-site']!=='same-origin')) {
    send(response,403,{code:'origin_forbidden'});return;
  }
  if (!['GET','DELETE'].includes(request.method??'') ||
    (request.headers['content-length']!==undefined && request.headers['content-length']!=='0') || request.headers['transfer-encoding']) {
    send(response,405,{code:'method_forbidden'});return;
  }
  const url = new URL(request.url??'',`http://${authority}`);
  if (url.pathname!=='/v1/conversations' || [...url.searchParams.keys()].some(key=>!['projectId','sessionKey','before','limit'].includes(key)) ||
    [...url.searchParams.keys()].some(key=>url.searchParams.getAll(key).length!==1)) {
    send(response,400,{code:'invalid_query'});return;
  }
  const projectId=url.searchParams.get('projectId');const sessionKey=url.searchParams.get('sessionKey');
  const beforeText=url.searchParams.get('before');const limitText=url.searchParams.get('limit')??'20';
  if (!projectId || !sessionKey || !id.test(projectId) || !id.test(sessionKey) ||
    (beforeText!==null && !/^[1-9]\d*$/.test(beforeText)) || !/^[1-9]\d*$/.test(limitText) ||
    !Number.isSafeInteger(Number(limitText)) || Number(limitText)>50 ||
    (beforeText!==null && !Number.isSafeInteger(Number(beforeText)))) {
    send(response,400,{code:'invalid_query'});return;
  }
  if (!access.canRead && (!access.canCommand || !actor.projectIds.includes(projectId))) {
    send(response,403,{code:'project_forbidden'});return;
  }
  if (request.method==='DELETE') {
    if (beforeText!==null || url.searchParams.has('limit') || !access.canCommand || !actor.projectIds.includes(projectId) ||
      request.headers['x-wr3d-delete-confirm']!==sessionKey) {
      send(response,403,{code:'delete_forbidden'});return;
    }
    const removed=store.deleteSession(projectId,sessionKey);
    send(response,removed===null?404:200,removed===null?{code:'session_not_found'}:{projectId,sessionKey,removed});
    return;
  }
  const page=store.page(projectId,sessionKey,beforeText===null?null:Number(beforeText),Number(limitText));
  send(response,page?200:404,page??{code:'session_not_found'});
}

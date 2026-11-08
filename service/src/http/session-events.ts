import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventStore } from '../store/event-store.ts';

const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const time=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const send=(response:ServerResponse,status:number,body:unknown)=>
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(body));

export function handleSessionEvents(request:IncomingMessage,response:ServerResponse,store:EventStore,canRead:boolean):void {
  const authority=`127.0.0.1:${request.socket.localPort}`;
  if(request.headers.host!==authority||(request.headers.origin!==undefined&&request.headers.origin!==`http://${authority}`)||
    (request.headers['sec-fetch-site']!==undefined&&request.headers['sec-fetch-site']!=='same-origin')){
    send(response,403,{code:'origin_forbidden'});return;
  }
  if(!canRead){send(response,403,{code:'read_forbidden'});return;}
  if(request.method!=='GET'||(request.headers['content-length']!==undefined&&request.headers['content-length']!=='0')||request.headers['transfer-encoding']){
    send(response,405,{code:'method_forbidden'});return;
  }
  const url=new URL(request.url??'',`http://${authority}`);
  const detail=url.pathname.match(/^\/v1\/session-events\/([A-Za-z0-9][A-Za-z0-9._:-]{0,159})$/);
  const allowed=detail?['projectId']:['projectId','sessionKey','agentKey','from','to','before','limit'];
  if((!detail&&url.pathname!=='/v1/session-events')||[...url.searchParams.keys()].some(key=>!allowed.includes(key)||url.searchParams.getAll(key).length!==1)){
    send(response,400,{code:'invalid_query'});return;
  }
  const projectId=url.searchParams.get('projectId');
  const sessionKey=url.searchParams.get('sessionKey')??undefined;
  const agentKey=url.searchParams.get('agentKey')??undefined;
  const from=url.searchParams.get('from')??undefined,to=url.searchParams.get('to')??undefined;
  const beforeText=url.searchParams.get('before'),limitText=url.searchParams.get('limit')??'20';
  if(!projectId||!id.test(projectId)||(sessionKey!==undefined&&!id.test(sessionKey))||(agentKey!==undefined&&!id.test(agentKey))||
    (from!==undefined&&(!time.test(from)||!Number.isFinite(Date.parse(from))))||
    (to!==undefined&&(!time.test(to)||!Number.isFinite(Date.parse(to))))||
    (beforeText!==null&&!/^[1-9]\d*$/.test(beforeText))||!/^[1-9]\d*$/.test(limitText)||
    !Number.isSafeInteger(Number(limitText))||Number(limitText)>50||
    (beforeText!==null&&!Number.isSafeInteger(Number(beforeText)))){
    send(response,400,{code:'invalid_query'});return;
  }
  try{
    const result=detail?store.getSessionEvent(projectId,detail[1]!):store.pageSessionEvents({projectId,sessionKey,agentKey,from,to,
      before:beforeText===null?undefined:Number(beforeText),limit:Number(limitText)});
    send(response,result?200:404,result??{code:'not_found'});
  }catch{send(response,400,{code:'invalid_query'});}
}

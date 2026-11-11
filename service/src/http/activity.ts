import type { IncomingMessage, ServerResponse } from 'node:http';
import type { EventStore } from '../store/event-store.ts';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';

const activitySchema=JSON.parse(readFileSync(new URL('../../../contracts/schemas/activity.v1.schema.json',import.meta.url),'utf8'));
const validateActivity=new Ajv2020({strict:true}).compile(activitySchema);

const id=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const time=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/;
const send=(response:ServerResponse,status:number,body:unknown)=>
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(body));

export function handleActivity(request:IncomingMessage,response:ServerResponse,store:EventStore,canRead:boolean):void {
  const authority=`127.0.0.1:${request.socket.localPort}`;
  if(request.headers.host!==authority||(request.headers.origin!==undefined&&request.headers.origin!==`http://${authority}`)||
    (request.headers['sec-fetch-site']!==undefined&&request.headers['sec-fetch-site']!=='same-origin')){
    send(response,403,{code:'origin_forbidden'});return;
  }
  if(!canRead){send(response,403,{code:'read_forbidden'});return;}
  if(request.method!=='GET'||(request.headers['content-length']!==undefined&&request.headers['content-length']!=='0')||
    request.headers['transfer-encoding']){send(response,405,{code:'method_forbidden'});return;}
  const url=new URL(request.url??'',`http://${authority}`);
  if(url.pathname==='/v1/activity'&&!url.search){
    const hour=store.activity.hour();
    if(!validateActivity(hour)){send(response,503,{code:'activity_contract_invalid'});return;}
    send(response,200,hour);return;
  }
  if(url.pathname!=='/v1/activity/events'||[...url.searchParams.keys()].some(key=>
    !['projectId','from','to'].includes(key)||url.searchParams.getAll(key).length!==1)){
    send(response,400,{code:'invalid_query'});return;
  }
  const projectId=url.searchParams.get('projectId'),from=url.searchParams.get('from'),to=url.searchParams.get('to');
  if(!projectId||!id.test(projectId)||!from||!to||!time.test(from)||!time.test(to)){
    send(response,400,{code:'invalid_query'});return;
  }
  try{
    const page=store.activity.events(projectId,from,to);
    send(response,page?200:404,page?{projectId,from,to,...page}:{code:'not_found'});
  }catch{send(response,400,{code:'invalid_query'});}
}

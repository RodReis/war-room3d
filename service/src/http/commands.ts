import type { IncomingMessage, ServerResponse } from 'node:http';
import { CommandGateway } from '../commands/gateway.ts';
import { CommandError, type CommandActor, type CommandTarget } from '../commands/types.ts';

export interface CommandHttpOptions {gateway:CommandGateway;actor:CommandActor;targets:()=>CommandTarget[];}
export interface CommandHttpAccess {canRead:boolean;canCommand:boolean;}
const json=(response:ServerResponse,status:number,body:unknown)=>response.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(body));
export function isCommandRoute(url:string):boolean {
  const pathname=url.split('?')[0];return pathname==='/v1/capabilities' || pathname==='/v1/commands' || pathname.startsWith('/v1/commands/');
}
async function body(request:IncomingMessage):Promise<unknown> {
  const size=Number(request.headers['content-length']);
  if(!Number.isSafeInteger(size) || size<1 || size>32768 || request.headers['transfer-encoding'])throw new CommandError('body_too_large',413);
  if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers['content-type']??''))throw new CommandError('invalid_content_type',415);
  let total=0;const chunks:Buffer[]=[];
  for await(const chunk of request){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=buffer.length;if(total>32768)throw new CommandError('body_too_large',413);chunks.push(buffer);}
  if(total!==size)throw new CommandError('invalid_body',400);
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new CommandError('invalid_body',400);}
}
export async function handleCommands(request:IncomingMessage,response:ServerResponse,options:CommandHttpOptions,access:CommandHttpAccess,readCapabilities:()=>unknown):Promise<void> {
  try {
    const authority=`127.0.0.1:${request.socket.localPort}`;
    if(request.headers.host!==authority || (request.headers.origin!==undefined && request.headers.origin!==`http://${authority}`) ||
      (request.headers['sec-fetch-site']!==undefined && request.headers['sec-fetch-site']!=='same-origin'))throw new CommandError('origin_forbidden',403);
    if(request.url==='/v1/capabilities' && request.method==='GET'){
      if(!access.canRead && !access.canCommand)throw new CommandError('command_forbidden',403);
      if(request.headers['content-length'] || request.headers['transfer-encoding'])throw new CommandError('invalid_body',400);
      const targets=options.targets();
      const visible=access.canRead?targets:targets.filter(target=>options.actor.projectIds.includes(target.projectId));
      json(response,200,{...options.gateway.capabilities(visible),capabilities:access.canRead?readCapabilities():[]});return;
    }
    if(!access.canCommand)throw new CommandError('command_forbidden',403);
    if(request.method==='GET' && /^\/v1\/commands\/[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(request.url??'')){
      if(request.headers['content-length'] || request.headers['transfer-encoding'])throw new CommandError('invalid_body',400);
      const result=options.gateway.get(request.url!.slice('/v1/commands/'.length),options.actor);
      json(response,result?200:404,result??{code:'command_not_found'});return;
    }
    if(request.method==='POST' && (request.url==='/v1/commands' || request.url==='/v1/commands/preview')){
      const input=await body(request);
      const result=request.url.endsWith('/preview')?options.gateway.preview(input,options.actor):await options.gateway.submit(input,options.actor);
      json(response,200,result);return;
    }
    json(response,404,{code:'route_not_found'});
  } catch(error){
    if(!response.headersSent && !response.destroyed)json(response,error instanceof CommandError?error.status:503,{code:error instanceof CommandError?error.code:'service_unavailable'});
  }
}

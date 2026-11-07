import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { JsonlChannel } from '../../src/commands/providers/jsonl-channel.ts';

function setup(t:{after(fn:()=>void):void},onWrite:(frame:any)=>void=()=>{}) {
  const output=new PassThrough();const writes:any[]=[];
  const input=new Writable({write(chunk,_encoding,done){const frame=JSON.parse(chunk.toString());writes.push(frame);onWrite(frame);done();}});
  const channel=new JsonlChannel({input,output,connectionId:'connection-lab',timeoutMs:20,maxFrameBytes:256});
  t.after(()=>{channel.close();output.destroy();input.destroy();});
  return {channel,output,writes};
}

test('JSONL correlaciona resposta síncrona e preserva caracteres UTF-8 fragmentados',async t=>{
  let output:PassThrough;
  const lab=setup(t,frame=>{const bytes=Buffer.from(JSON.stringify({id:frame.id,result:{text:'ação'}})+'\n');
    const split=bytes.indexOf(Buffer.from('ç'))+1;output.write(bytes.subarray(0,split));output.write(bytes.subarray(split));});
  output=lab.output;
  const answer=await lab.channel.exchange({id:'rpc-1',method:'turn/start'},frame=>frame.id==='rpc-1',new AbortController().signal);
  assert.equal((answer.result as any).text,'ação');assert.equal(lab.writes.length,1);
});

test('ID alheio não confirma; cancelamento não reenvia e remove espera',async t=>{
  const lab=setup(t);const controller=new AbortController();
  const pending=lab.channel.exchange({id:'rpc-1'},frame=>frame.id==='rpc-1',controller.signal);
  lab.output.write('{"id":"outro","result":{}}\n');controller.abort();
  await assert.rejects(pending,/delivery_unconfirmed/);assert.equal(lab.writes.length,1);
  assert.equal(lab.channel.pendingCount,0);
  const cancelled=new AbortController();cancelled.abort();
  await assert.rejects(lab.channel.exchange({id:'rpc-2'},()=>true,cancelled.signal),/channel_unavailable/);
  assert.equal(lab.writes.length,1);
});

test('linha excedida ou JSON inválido encerra canal e não revela conteúdo bruto',async t=>{
  for(const raw of ['x'.repeat(300),'{"segredo": inválido}\n']){
    const lab=setup(t);const pending=lab.channel.exchange({id:'rpc-1'},()=>false,new AbortController().signal);
    lab.output.write(raw);await assert.rejects(pending,/delivery_unconfirmed/);
    assert.equal(lab.channel.isOpen,false);
    await assert.rejects(lab.channel.exchange({id:'rpc-2'},()=>true,new AbortController().signal),/channel_unavailable/);
    assert.equal(lab.writes.length,1);
  }
});

test('timeout e perda de stdout não geram retry nem resposta tardia bem-sucedida',async t=>{
  const lab=setup(t);
  await assert.rejects(lab.channel.exchange({id:'rpc-1'},()=>false,new AbortController().signal),/delivery_unconfirmed/);
  assert.equal(lab.channel.pendingCount,0);assert.equal(lab.writes.length,1);
  const pending=lab.channel.exchange({id:'rpc-2'},()=>false,new AbortController().signal);
  lab.output.end();await assert.rejects(pending,/delivery_unconfirmed/);assert.equal(lab.channel.isOpen,false);
});

test('EPIPE do transporte falha sem emitir erro bruto ou manter esperas pendentes',async t=>{
  const input=new Writable({write(_chunk,_encoding,done){done(new Error('credencial-privada-EPIPE'));}});
  const output=new PassThrough();
  const channel=new JsonlChannel({input,output,connectionId:'broken',timeoutMs:50});
  t.after(()=>{channel.close();input.destroy();output.destroy();});
  await assert.rejects(channel.exchange({id:'rpc-1'},()=>true,new AbortController().signal),error=>{
    assert.equal((error as Error).message,'delivery_unconfirmed');return true;
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(channel.isOpen,false);assert.equal(channel.pendingCount,0);
});

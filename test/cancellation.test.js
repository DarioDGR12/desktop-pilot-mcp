import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, output, envelope } from '../src/engine.js';
import { Chat } from '../src/chat.js';
import { createServer } from '../src/server.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const snapshot=output({ok:true,data:{complete:true,window:{id:'w',pid:1},tree:{role:'window',children:[{role:'textfield',name:'Message',value:'',ref_id:'@s:e1'}]}}});
const write={app:'Test',target:{role:'textfield',name:'Message'},text:'Hello',request_id:'request-1'};
function engine(fn){const e=new Engine({callTool:fn,close:async()=>{}});e.tools=['desktop_status','pilot_act','pilot_chat_write','pilot_chat_wait','pilot_request_status'].map(name=>({name}));return e;}
test('cancellation after observation prevents the subsequent write',async()=>{
 const controller=new AbortController();const calls=[];
 const e=engine(async({name})=>{calls.push(name);controller.abort();return snapshot;});
 const result=await e.call('pilot_chat_write',write,{signal:controller.signal});
 assert.equal(result.isError,true);assert.deepEqual(calls,['desktop_snapshot']);
 assert.equal(envelope(await e.call('pilot_request_status',{request_id:'request-1'})).state,'finished');
});
test('cancelled queued request never reaches upstream',async()=>{
 const gate=deferred();const entered=deferred();let calls=0;
 const e=engine(async()=>{calls++;entered.resolve();await gate.promise;return output({ok:true});});
 const first=e.call('desktop_status');await entered.promise;
 const c=new AbortController();const queued=e.call('desktop_status',{}, {signal:c.signal});const rejected=assert.rejects(queued);c.abort();gate.resolve();await first;await rejected;assert.equal(calls,1);
});
test('in-flight cancellation holds the serialization lock until upstream returns',async()=>{
 const gate=deferred(),entered=deferred();let calls=0;
 const e=engine(async()=>{calls++;if(calls===1){entered.resolve();await gate.promise;}return output({ok:true});});
 const c=new AbortController();const first=e.call('desktop_status',{}, {signal:c.signal});const rejected=assert.rejects(first);await entered.promise;c.abort();
 const next=e.call('desktop_status');await Promise.resolve();assert.equal(calls,1);gate.resolve();await rejected;await next;assert.equal(calls,2);
});
test('transport failure pauses further dispatch until a new server session',async()=>{
 let calls=0;const e=engine(async()=>{calls++;throw new Error('transport lost');});
 await assert.rejects(e.call('desktop_status'));await assert.rejects(e.call('desktop_status'),/pausado/);assert.equal(calls,1);
 assert.equal(envelope(await e.call('pilot_request_status',{request_id:'unknown'})).state,'unknown');
});
test('request lookup is immediate while an upstream operation is pending',async()=>{
 const gate=deferred(),entered=deferred();const e=engine(async()=>{entered.resolve();await gate.promise;return snapshot;});
 const pending=e.call('pilot_chat_write',write);await entered.promise;
 const result=envelope(await e.call('pilot_request_status',{request_id:'request-1'}));assert.equal(result.state,'running');assert.equal(result.result,undefined);gate.resolve();await pending;
});
test('queue is bounded and shutdown prevents queued dispatches',async()=>{
 const gate=deferred(),entered=deferred();let calls=0;const e=engine(async()=>{calls++;entered.resolve();await gate.promise;return output({ok:true});});
 const jobs=Array.from({length:32},()=>e.call('desktop_status').catch(()=>{}));await entered.promise;
 await assert.rejects(e.call('desktop_status'),/QUEUE_FULL/);const closed=e.close();gate.resolve();await Promise.all(jobs);await closed;assert.equal(calls,1);
});
test('polling wait reacts to cancellation during its delay',async()=>{
 const c=new AbortController();let reads=0;
 const chat=new Chat(async()=>{reads++;return snapshot;},undefined,async(ms,value,{signal})=>{c.abort();signal.throwIfAborted();});
 await assert.rejects(chat.call('pilot_chat_wait',{app:'Test',region:{role:'text',name:'Response'},timeout_ms:1000,stable_ms:200,require_change:true},c.signal));assert.equal(reads,1);
});
test('MCP cancellation notification reaches the production request handler',async()=>{
 const entered=deferred(),cancelled=deferred();
 const server=createServer({tools:[{name:'test',inputSchema:{type:'object'}}],call:async(name,args,{signal})=>{entered.resolve();await new Promise(resolve=>signal.addEventListener('abort',()=>{cancelled.resolve();resolve();},{once:true}));return output({ok:false});}});
 const client=new Client({name:'cancel-test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();
 await server.connect(a);await client.connect(b);
 try {const c=new AbortController();const result=client.callTool({name:'test',arguments:{}},undefined,{signal:c.signal});const rejected=assert.rejects(result);await entered.promise;c.abort();await rejected;await cancelled.promise;}
 finally {await client.close();await server.close();}
});

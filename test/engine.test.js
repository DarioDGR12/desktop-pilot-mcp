import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,output} from '../src/engine.js';
const node=(role,name,value,ref_id)=>({role,name,value,ref_id});
const snapshot=(children,extras={})=>output({ok:true,data:{complete:true,window:{id:'window-1',pid:42,process_instance:'process-1'},tree:{role:'window',children},...extras}});
function fixture(before,after,action=output({ok:true,data:{}})){
 const calls=[];let count=0;
 const client={callTool:async({name,arguments:args})=>{calls.push({name,args});return name==='desktop_snapshot'?(count++?after:before):action;}};
 const engine=new Engine(client);engine.tools=[{name:'pilot_act'}];return{engine,calls};
}
const args={app:'Fixture',target:{role:'button',name:'Save'},action:'click',expect:{role:'text',name:'Saved'}};
test('acts once and verifies against the same window',async()=>{const{engine,calls}=fixture(snapshot([node('button','Save',null,'@s1:e1')]),snapshot([node('text','Saved')]));const r=await engine.call('pilot_act',args);assert.equal(r.isError,false);assert.equal(calls[1].args.ref_id,'@s1:e1');assert.equal(calls[2].args.window_id,'window-1');});
test('ambiguous targets never execute',async()=>{const n=node('button','Save',null,'@s1:e1');const{engine,calls}=fixture(snapshot([n,n]),snapshot([]));assert.equal((await engine.call('pilot_act',args)).isError,true);assert.equal(calls.length,1);});
test('partial observations never execute',async()=>{const{engine,calls}=fixture(snapshot([],{complete:false}),snapshot([]));await engine.call('pilot_act',args);assert.equal(calls.length,1);});
test('successful dispatch without postcondition is not verified and never retried',async()=>{const{engine,calls}=fixture(snapshot([node('button','Save',null,'@s1:e1')]),snapshot([]));assert.equal((await engine.call('pilot_act',args)).isError,true);assert.equal(calls.filter(c=>c.name==='desktop_click').length,1);});
test('process replacement prevents verification',async()=>{const{engine}=fixture(snapshot([node('button','Save',null,'@s1:e1')]),snapshot([node('text','Saved')],{window:{id:'window-1',pid:43}}));assert.equal((await engine.call('pilot_act',args)).isError,true);});
test('unknown delivery does not trigger a retry',async()=>{const{engine,calls}=fixture(snapshot([node('button','Save',null,'@s1:e1')]),snapshot([node('text','Saved')]),output({ok:false,error:{disposition:{retry:'unsafe'}}},true));assert.equal((await engine.call('pilot_act',args)).isError,true);assert.equal(calls.filter(c=>c.name==='desktop_click').length,1);});
test('paused engine rejects queued actions',async()=>{const{engine,calls}=fixture(snapshot([]),snapshot([]));engine.paused=true;await assert.rejects(engine.call('pilot_act',args),/pausado/);assert.equal(calls.length,0);});
test('engine serializes concurrent clients',async()=>{let busy=0,max=0;const e=new Engine({callTool:async()=>{busy++;max=Math.max(max,busy);await new Promise(r=>setTimeout(r,10));busy--;return output({ok:true});}});e.tools=[{name:'desktop_status'}];await Promise.all([e.call('desktop_status'),e.call('desktop_status')]);assert.equal(max,1);});
test('vision observations return native MCP image content',async()=>{
 const e=new Engine({callTool:async({name})=>name==='desktop_snapshot'?snapshot([]):output({ok:true,data:{data:'aW1hZ2U=',format:'png'}})});
 e.tools=[{name:'pilot_observe'}];const r=await e.call('pilot_observe',{app:'Fixture',vision:true});assert.equal(r.content[1].type,'image');assert.equal(r.content[1].data,'aW1hZ2U=');
});
test('raw screenshots become image blocks instead of base64 text sent to the model',async()=>{
 const e=new Engine({callTool:async()=>output({ok:true,data:{data:'aW1hZ2U=',width:10,height:10,format:'png'}})});e.tools=[{name:'desktop_screenshot'}];
 const r=await e.call('desktop_screenshot',{});assert.equal(r.content[1].type,'image');assert.equal(JSON.parse(r.content[0].text).data.data,undefined);
});

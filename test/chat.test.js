import test from 'node:test';
import assert from 'node:assert/strict';
import {Chat,chatSchemas} from '../src/chat.js';
import {output,envelope} from '../src/observation.js';
const owner={id:'w1',pid:5,process_instance:'p1'};
const field=(value='')=>({role:'textfield',name:'Message',value,ref_id:'@s:e1'});
const button={role:'button',name:'Send',ref_id:'@s:e2'};
const snap=(children,extra={})=>output({ok:true,data:{complete:true,window:owner,tree:{role:'window',name:'Chat',children},...extra}});
const base={app:'Chat',target:{role:'textfield',name:'Message'},text:'Hello\nworld',request_id:'r1',replace:false};
function fixture(snapshots,action=output({ok:true,data:{}})){
 const calls=[];let index=0;
 const chat=new Chat(async(name,args)=>{calls.push({name,args});return name==='desktop_snapshot'?snapshots[Math.min(index++,snapshots.length-1)]:typeof action==='function'?action():action;});
 return {chat,calls};
}
test('multiline draft is verified without implicit submission',async()=>{const {chat,calls}=fixture([snap([field(),button]),snap([field(base.text),button])]);const r=envelope(await chat.call('pilot_chat_write',base));assert.equal(r.status,'draft_verified');assert.deepEqual(calls.filter(c=>c.name!=='desktop_snapshot').map(c=>c.name),['desktop_set_value']);assert.equal(calls[1].args.value,base.text);});
test('preserves existing draft by default',async()=>{const {chat,calls}=fixture([snap([field('unfinished')])]);assert.equal(envelope(await chat.call('pilot_chat_write',base)).error.code,'EXISTING_DRAFT');assert.equal(calls.length,1);});
test('sends once after exact verification and deduplicates request',async()=>{const {chat,calls}=fixture([snap([field(),button]),snap([field(base.text),button])]);const a={...base,send:{role:'button',name:'Send'}};const first=await chat.call('pilot_chat_write',a);assert.equal(envelope(first).status,'send_dispatched');assert.deepEqual(await chat.call('pilot_chat_write',a),first);assert.equal(calls.filter(c=>c.name==='desktop_click').length,1);});
test('request id cannot be reused for different text',async()=>{const {chat}=fixture([snap([field()]),snap([field(base.text)])]);await chat.call('pilot_chat_write',base);assert.equal(envelope(await chat.call('pilot_chat_write',{...base,text:'different'})).error.code,'REQUEST_ID_CONFLICT');});
test('write mismatch prevents sending',async()=>{const {chat,calls}=fixture([snap([field(),button]),snap([field('partial'),button])]);assert.equal((await chat.call('pilot_chat_write',{...base,send:{role:'button',name:'Send'}})).isError,true);assert(!calls.some(c=>c.name==='desktop_click'));});
test('process replacement prevents sending',async()=>{const {chat,calls}=fixture([snap([field(),button]),snap([field(base.text),button],{window:{...owner,process_instance:'p2'}})]);await chat.call('pilot_chat_write',{...base,send:{role:'button',name:'Send'}});assert(!calls.some(c=>c.name==='desktop_click'));});
test('terminal without accessible composer is refused',async()=>{const {chat,calls}=fixture([snap([{role:'terminal',name:'CLI',ref_id:'@s:e3',value:''}])]);assert.equal(envelope(await chat.call('pilot_chat_write',{...base,target:{role:'terminal',name:'CLI'}})).error.code,'UNSUPPORTED_COMPOSER');assert.equal(calls.length,1);});
test('unreadable draft and ambiguous send fail closed',async()=>{const {chat}=fixture([snap([{...field(),value:undefined}])]);assert.equal(envelope(await chat.call('pilot_chat_write',base)).error.code,'DRAFT_NOT_READABLE');const other=fixture([snap([field()]),snap([field(base.text),button,button])]);await other.chat.call('pilot_chat_write',{...base,send:{role:'button',name:'Send'}});assert(!other.calls.some(c=>c.name==='desktop_click'));});
test('uncertain transport failure is cached and not repeated',async()=>{const {chat,calls}=fixture([snap([field()])],()=>{throw new Error('Transport timeout');});const r=await chat.call('pilot_chat_write',base);assert.equal(envelope(r).error.retry,'unsafe');await chat.call('pilot_chat_write',base);assert.equal(calls.filter(c=>c.name==='desktop_set_value').length,1);});
test('read reports truncation and observed composers',async()=>{const {chat}=fixture([snap([field('x'.repeat(300))])]);const r=envelope(await chat.call('pilot_chat_read',{app:'Chat',max_chars:100}));assert.equal(r.text.length,100);assert.equal(r.truncated,true);assert.equal(r.composers.length,1);});
function waiter(texts,extra={}){let time=0,index=0;const chat=new Chat(async()=>snap([{role:'text',name:'Answer',value:texts[Math.min(index++,texts.length-1)]}],extra),()=>time,async ms=>{time+=ms;});return chat;}
const waitArgs={app:'Chat',region:{role:'text',name:'Answer'},require_change:true,stable_ms:400,timeout_ms:1200};
test('streaming text must change and settle',async()=>{const r=envelope(await waiter(['old','part','new','new','new']).call('pilot_chat_wait',waitArgs));assert.equal(r.status,'text_stable');assert.equal(r.generation_complete,'unknown');assert.equal(r.text,'Answer\nnew');});
test('unchanged old answer does not satisfy wait',async()=>{assert.equal(envelope(await waiter(['old']).call('pilot_chat_wait',waitArgs)).error.code,'WAIT_TIMEOUT');});
test('explicit baseline supports a response that finished before polling',async()=>{assert.equal(envelope(await waiter(['new']).call('pilot_chat_wait',{...waitArgs,baseline:'Answer\nold'})).status,'text_stable');});
test('wrong content and incomplete observation never report completion',async()=>{assert.equal(envelope(await waiter(['old','new']).call('pilot_chat_wait',{...waitArgs,contains:'missing'})).error.code,'WAIT_TIMEOUT');assert.equal((await waiter(['new'],{complete:false}).call('pilot_chat_wait',waitArgs)).isError,true);});
test('schemas bound payload and time budget',()=>{assert.equal(chatSchemas.pilot_chat_write.safeParse({...base,text:'x'.repeat(10001)}).success,false);assert.equal(chatSchemas.pilot_chat_wait.safeParse({...waitArgs,timeout_ms:60000}).success,false);});

test('wait permits a response region to appear after submission',async()=>{
 let time=0,reads=0;const chat=new Chat(async()=>snap(reads++===0?[]:[{role:'text',name:'Answer',value:'new'}]),()=>time,async ms=>{time+=ms;});
 assert.equal(envelope(await chat.call('pilot_chat_wait',waitArgs)).status,'text_stable');
});

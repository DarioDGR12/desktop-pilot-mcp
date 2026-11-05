import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
export function desktopBinary() {
  if (process.env.AGENT_DESKTOP_BIN) return process.env.AGENT_DESKTOP_BIN;
  const platform = require('agent-desktop/lib/platform.js').resolve(process.platform, process.arch);
  if (!platform?.released) throw new Error('Unsupported agent-desktop platform');
  return join(dirname(require.resolve('agent-desktop/package.json')), 'bin', platform.binaryName);
}
import { z } from 'zod';

const selector = z.object({role:z.string().min(1),name:z.string(),value:z.string().optional()}).strict();
const scope = {app:z.string().min(1),window_id:z.string().min(1).optional()};
const schemas = {
  pilot_observe:z.object({...scope,vision:z.boolean().default(false)}).strict(),
  pilot_act:z.object({...scope,target:selector,action:z.enum(['click','set_value','type','check','uncheck','expand','collapse']),text:z.string().optional(),expect:selector}).strict(),
};
export const pilotTools = Object.entries(schemas).map(([name,schema])=>({name,inputSchema:z.toJSONSchema(schema),description:name==='pilot_observe'?'Observe a desktop window using accessibility and optionally an image.':'Resolve one unique target in a fresh complete snapshot, act once, and check a unique postcondition in the same window. Never retries a mutation.'}));
export function envelope(result) {
  if (result.structuredContent?.ok !== undefined) return result.structuredContent;
  for (const c of result.content ?? []) if (c.type==='text') {try {const x=JSON.parse(c.text);if(typeof x.ok==='boolean')return x;}catch{}}
  throw new Error('Upstream response has no agent-desktop envelope');
}
export const output = (data,isError=false)=>({content:[{type:'text',text:JSON.stringify(data)}],isError});
export function nodes(tree) {return tree ? [tree,...(tree.children??[]).flatMap(nodes)] : [];}
export function matches(tree,s) {return nodes(tree).filter(n=>n.role===s.role && n.name===s.name && (s.value===undefined || n.value===s.value));}
export class Engine {
  constructor(client) {this.client=client;this.tools=[];this.tail=Promise.resolve();this.events=[];this.paused=false;}
  async connect() {
    if(!this.client){
      this.client=new Client({name:'desktop-pilot',version:'0.1.0'});
      await this.client.connect(new StdioClientTransport({command:desktopBinary(),args:['mcp',...(process.env.PILOT_HEADED==='1'?['--headed']:[])]}));
    }
    let cursor;
    do {const page=await this.client.listTools({cursor});this.tools.push(...page.tools);cursor=page.nextCursor;}while(cursor);
    this.tools.push(...pilotTools);
    this.guides=[];
    for(const name of ['desktop','platform']) this.guides.push(envelope(await this.raw('desktop_skills_get',{name})).data?.content??'');
  }
  record(event){this.events.push({time:new Date().toISOString(),...event});if(this.events.length>100)this.events.shift();}
  async raw(name,args){
    const result=await this.client.callTool({name,arguments:args},undefined,{timeout:45000});
    return result;
  }
  call(name,args={}) {
    const work=this.tail.then(async()=>{
      if(this.paused)throw new Error('Motor pausado.');
      if(!this.tools.some(t=>t.name===name))throw new Error('Herramienta desconocida');
      const start=Date.now();
      try {
        const result=schemas[name]?await this.enhanced(name,schemas[name].parse(args)):await this.raw(name,args);
        if(name==='desktop_screenshot'){
          const shot=envelope(result);
          if(shot.ok&&shot.data.data){
            const {data,...metadata}=shot.data;
            result.content=[{type:'text',text:JSON.stringify({...shot,data:metadata})},{type:'image',mimeType:'image/png',data}];
          }
        }
        let ok=!result.isError;try{ok=ok&&envelope(result).ok;}catch{}
        this.record({tool:name,ok,ms:Date.now()-start});return result;
      }catch(e){this.record({tool:name,ok:false,ms:Date.now()-start,error:e.message});throw e;}
    });
    this.tail=work.catch(()=>{});return work;
  }
  async enhanced(name,a){
    const {app,window_id}=a;
    const before=await this.raw('desktop_snapshot',{app,...(window_id?{window_id}:{}),include_bounds:true});
    const snap=envelope(before);
    if(!snap.ok)return before;
    if(name==='pilot_observe'){
      if(!a.vision)return before;
      const shot=await this.raw('desktop_screenshot',{app,window_id:snap.data.window?.id||window_id});
      const s=envelope(shot);
      return s.ok?{content:[...before.content,{type:'image',mimeType:'image/png',data:s.data.data}]}:output({ok:true,snapshot:snap,screenshot_error:s.error});
    }
    if(!snap.data.complete)return output({ok:false,error:'INCOMPLETE_OBSERVATION'},true);
    const id=snap.data.window?.id;
    if(!id)return output({ok:false,error:'WINDOW_SCOPE_REQUIRED'},true);
    const target=matches(snap.data.tree,a.target);
    if(target.length!==1 || !target[0].ref_id)return output({ok:false,error:'TARGET_NOT_UNIQUE_OR_ACTIONABLE',matches:target.length},true);
    if(['type','set_value'].includes(a.action)&&a.text===undefined)throw new Error('text is required for this action');
    const args={ref_id:target[0].ref_id};
    if(a.action==='type')args.text=a.text;
    if(a.action==='set_value')args.value=a.text;
    const action=await this.raw('desktop_'+a.action,args);
    const delivered=envelope(action);
    const after=envelope(await this.raw('desktop_snapshot',{app,window_id:id}));
    const sameOwner=after.ok && after.data.window?.id===id && after.data.window?.pid===snap.data.window.pid && after.data.window?.process_instance===snap.data.window.process_instance;
    const verified=!!(sameOwner&&after.data.complete&&matches(after.data.tree,a.expect).length===1);
    return output({ok:delivered.ok&&verified,action:delivered,verification:{verified,expected:a.expect},observation:after},!delivered.ok||!verified);
  }
  async close(){await this.tail;await this.client.close();}
}

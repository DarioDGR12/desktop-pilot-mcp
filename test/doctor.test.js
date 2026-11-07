import test from 'node:test';
import assert from 'node:assert/strict';
import { doctor } from '../src/doctor.js';
test('doctor uses only status and excludes private state paths',async()=>{
 const report=await doctor(async(binary,args)=>{assert.equal(binary,'fixture');assert.deepEqual(args,['status']);return{stdout:JSON.stringify({ok:true,data:{version:'1.2',platform:'linux',permissions:{accessibility:{state:'granted'}},state_root:'/private/home'}})};},()=> 'fixture');
 assert.equal(report.ok,true);assert(!JSON.stringify(report).includes('/private/home'));
});
test('missing binary produces actionable failure without throwing',async()=>{
 const report=await doctor(async()=>{throw Object.assign(new Error('private path'),{code:'ENOENT'});},()=> 'missing');
 assert.equal(report.ok,false);assert.match(report.next,/setup:desktop/);assert(!JSON.stringify(report).includes('private path'));
});
test('malformed status fails closed',async()=>{const report=await doctor(async()=>({stdout:'not-json'}),()=> 'fixture');assert.equal(report.ok,false);});

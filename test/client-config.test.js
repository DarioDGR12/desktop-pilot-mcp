import test from 'node:test';
import assert from 'node:assert/strict';
import {clientConfig,selectTools} from '../src/client-config.js';
test('OpenCode uses argv arrays and environment, preserving spaces',()=>{const config=clientConfig('opencode','/node path/node','/project path/mcp.js');assert.deepEqual(config.mcp['desktop-pilot'].command,['/node path/node','/project path/mcp.js']);assert.equal(config.mcp['desktop-pilot'].environment.PILOT_TOOLSET,'chat');});
test('Claude Code uses stdio with env',()=>{const config=clientConfig('claude-code','node','/repo/mcp.js');assert.equal(config.mcpServers['desktop-pilot'].type,'stdio');assert.deepEqual(config.mcpServers['desktop-pilot'].args,['/repo/mcp.js']);});
test('ChatGPT reports required tunnel setup instead of claiming direct import',()=>{const config=clientConfig('chatgpt');assert.equal(config.connection,'tunnel');assert(config.setup_required.length>0);});
test('chat toolset filters unavailable calls consistently',()=>{assert.deepEqual(selectTools([{name:'desktop_close_app'},{name:'pilot_chat_read'},{name:'desktop_snapshot'}],'chat').map(t=>t.name),['pilot_chat_read','desktop_snapshot']);assert.throws(()=>selectTools([],'typo'));});

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const client = new Client({ name: 'standalone-smoke', version: '0.1.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, env: { PILOT_TOOLSET: process.env.PILOT_TOOLSET || 'full' }, args: [fileURLToPath(new URL('../src/mcp.js', import.meta.url))] }));
  const { tools } = await client.listTools();
  assert(tools.some(t => t.name === 'pilot_act'));
  assert(tools.some(t => t.name === 'pilot_observe'));
  assert(tools.some(t => t.name === 'pilot_chat_write'));
  const cached = await client.callTool({name: 'pilot_request_status', arguments: {request_id: 'smoke-unknown'}});
  assert.equal(JSON.parse(cached.content[0].text).state, 'unknown');
  if (process.env.PILOT_TOOLSET === 'chat') {
    assert.equal(tools.length, 18);
    const denied = await client.callTool({ name: 'desktop_close_app', arguments: { app: 'Never executed' } });
    assert.equal(denied.isError, true);
  }
  const result = await client.callTool({ name: 'desktop_status', arguments: {} });
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.ok, true);
  const invalid = await client.callTool({ name: 'pilot_act', arguments: {} });
  assert.equal(invalid.isError, true);
  console.log(JSON.stringify({ tools: tools.length, platform: status.data.platform, standalone: 'passed', validation: 'passed' }));
} finally { await client.close(); }

#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Engine, output } from './engine.js';

const engine = new Engine();
const server = new Server(
  { name: 'desktop-pilot-mcp', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions: 'Read desktop_skills_get with name desktop and platform before operating. Prefer pilot_observe and pilot_act. Commands are serialized within this server. A failed postcondition does not prove the action was not delivered. Retry mutations only when the upstream disposition.retry is safe. Physical input requires explicit operator enablement via PILOT_HEADED=1.'
  }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: engine.tools }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try { return await engine.call(params.name, params.arguments ?? {}); }
  catch (error) { return output({ ok: false, error: error.message }, true); }
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  engine.paused = true;
  try { await engine.close(); } finally { await server.close(); }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => close().finally(() => process.exit(0)));
server.onclose = () => { close().catch(error => console.error(error.message)); };
try {
  await engine.connect();
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(`desktop-pilot-mcp: ${error.message}`);
  await close().catch(() => {});
  process.exitCode = 1;
}

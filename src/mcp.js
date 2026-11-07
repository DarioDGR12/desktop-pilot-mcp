#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Engine, output } from './engine.js';
import { clientConfig } from './client-config.js';

if (process.argv.includes('--print-config')) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--print-config') throw new Error('Usage: desktop-pilot-mcp --print-config opencode|claude-code|chatgpt');
    console.log(JSON.stringify(clientConfig(process.argv[3]), null, 2));
    process.exit(0);
  } catch (error) { console.error(error.message); process.exit(1); }
}

const engine = new Engine();
const server = new Server(
  { name: 'desktop-pilot-mcp', version: '0.2.0' },
  {
    capabilities: { tools: {} },
    instructions: 'Read desktop_skills_get with name desktop and platform before operating. Prefer pilot_observe and pilot_act. For chats use pilot_chat_read, pilot_chat_write and pilot_chat_wait. Never assume terminal surfaces expose a composer. Writing does not send unless a send button is explicitly supplied. Reuse request_id after uncertain delivery; never resend with a new id without inspecting state. Stable text is not proof that generation finished. Commands are serialized within this server. A failed postcondition does not prove the action was not delivered. Retry mutations only when the upstream disposition.retry is safe. Physical input requires explicit operator enablement via PILOT_HEADED=1.'
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

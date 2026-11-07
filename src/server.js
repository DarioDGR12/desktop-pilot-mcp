import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { output } from './observation.js';
export function createServer(engine) {
const server = new Server(
  { name: 'desktop-pilot-mcp', version: '0.3.0' },
  {
    capabilities: { tools: {} },
    instructions: 'Read desktop_skills_get with name desktop and platform before operating. Prefer pilot_observe and pilot_act. For chats use pilot_chat_read, pilot_chat_write and pilot_chat_wait. Never assume terminal surfaces expose a composer. Writing does not send unless a send button is explicitly supplied. Use pilot_request_status to inspect a cached write without replaying it. Reuse request_id after uncertain delivery; never resend with a new id without inspecting state. Stable text is not proof that generation finished. Commands are serialized within this server. A failed postcondition does not prove the action was not delivered. Retry mutations only when the upstream disposition.retry is safe. Physical input requires explicit operator enablement via PILOT_HEADED=1.'
  }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: engine.tools }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
  try { return await engine.call(params.name, params.arguments ?? {}, { signal: extra.signal }); }
  catch (error) { return output({ ok: false, error: error.message }, true); }
});
  return server;
}

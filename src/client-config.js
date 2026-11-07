import { desktopEnvironment } from './environment.js';
import { fileURLToPath } from 'node:url';
export function clientConfig(client, node = process.execPath, script = fileURLToPath(new URL('./mcp.js', import.meta.url))) {
  const env = { ...desktopEnvironment(), PILOT_TOOLSET: 'chat' };
  const stdio = { type: 'stdio', command: node, args: [script], env };
  if (client === 'opencode') return { $schema: 'https://opencode.ai/config.json', mcp: { 'desktop-pilot': { type: 'local', command: [node, script], environment: env, enabled: true, timeout: 60000 } } };
  if (client === 'claude-code') return { mcpServers: { 'desktop-pilot': stdio } };
  if (client === 'chatgpt') return {
    connection: 'tunnel',
    local_server: stdio,
    setup_required: ['Install the official tunnel-client', 'Create or select a tunnel associated with your ChatGPT workspace', 'Supply CONTROL_PLANE_API_KEY locally', 'Configure the tunnel to launch local_server', 'Add a custom MCP server in ChatGPT using the tunnel and verify a tool call'],
    documentation: 'https://developers.openai.com/api/docs/guides/secure-mcp-tunnels',
    note: 'This is a setup plan, not a JSON file importable directly into ChatGPT. No tunnel or account permission is created by printing it.'
  };
  throw new Error('Unknown client. Use opencode, claude-code or chatgpt.');
}
export const chatUpstream = new Set(['desktop_status', 'desktop_list_apps', 'desktop_list_windows', 'desktop_snapshot', 'desktop_screenshot', 'desktop_skills_get', 'desktop_find', 'desktop_get', 'desktop_is', 'desktop_wait', 'desktop_press', 'desktop_focus']);
export function selectTools(tools, mode = 'full') {
  if (!['full', 'chat'].includes(mode)) throw new Error('PILOT_TOOLSET must be full or chat');
  return mode === 'full' ? tools : tools.filter(t => t.name.startsWith('pilot_') || chatUpstream.has(t.name));
}

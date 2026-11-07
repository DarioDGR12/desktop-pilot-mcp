#!/usr/bin/env node
import { createServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Engine } from './engine.js';
import { clientConfig } from './client-config.js';

if (process.argv.includes('--print-config')) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--print-config') throw new Error('Usage: desktop-pilot-mcp --print-config opencode|claude-code|chatgpt');
    console.log(JSON.stringify(clientConfig(process.argv[3]), null, 2));
    process.exit(0);
  } catch (error) { console.error(error.message); process.exit(1); }
}

if (process.argv[2] === '--doctor' && process.argv.length === 3) {
  const { doctor } = await import('./doctor.js');
  const report = await doctor();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
if (process.argv.length > 2) { console.error('Unknown arguments. Use --doctor or --print-config CLIENT.'); process.exit(1); }

const engine = new Engine();
const server = createServer(engine);
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

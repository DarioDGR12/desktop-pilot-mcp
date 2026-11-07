import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { desktopBinary } from './engine.js';
import { desktopEnvironment } from './environment.js';
const run = promisify(execFile);
export async function doctor(execute = run, binary = desktopBinary) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const report = {
    ok: false,
    runtime: { node: process.versions.node, supported: major > 22 || (major === 22 && minor >= 9), platform: process.platform, arch: process.arch },
    session: Object.fromEntries(Object.keys(desktopEnvironment()).map(key => [key, true])),
    toolset: process.env.PILOT_TOOLSET || 'full',
    headed: process.env.PILOT_HEADED === '1'
  };
  try {
    const { stdout } = await execute(binary(), ['status'], { env: { ...getDefaultEnvironment(), ...desktopEnvironment() }, timeout: 8000, maxBuffer: 1024 * 1024, windowsHide: true });
    const status = JSON.parse(stdout);
    report.engine = status.ok ? { version: status.data.version, platform: status.data.platform, permissions: status.data.permissions, supported_surfaces: status.data.supported_surfaces } : { error: status.error?.code || 'STATUS_FAILED' };
    report.ok = report.runtime.supported && ['full', 'chat'].includes(report.toolset) && status.ok === true;
    report.next = report.ok ? 'Test an observation in your target application; status alone does not verify UI access.' : 'Check runtime, PILOT_TOOLSET and engine permissions.';
  } catch (error) {
    report.engine = { error: error.code || 'INVALID_STATUS' };
    report.next = error.code === 'ENOENT' ? 'Run npm run setup:desktop or set AGENT_DESKTOP_BIN to an installed binary.' : 'Check the agent-desktop installation and desktop session; no input was sent.';
  }
  return report;
}

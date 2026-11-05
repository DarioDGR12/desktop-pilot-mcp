const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [require.resolve('agent-desktop/scripts/postinstall.js')], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);

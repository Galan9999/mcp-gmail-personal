// Habla con el binario compilado por stdio, como lo haria Claude Code. Falla si alguna
// herramienta sale sin anotaciones o sin descripcion. Es la ultima puerta de `pnpm check`.
import { spawn } from 'node:child_process';

const p = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
let out = '';
p.stdout.on('data', (d) => (out += d));
const timer = setTimeout(() => {
  p.kill();
  console.error('smoke: el servidor no respondio en 8s');
  process.exit(1);
}, 8000);

p.on('exit', () => {
  clearTimeout(timer);
  const msgs = out
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const init = msgs.find((m) => m.id === 1)?.result;
  const tools = msgs.find((m) => m.id === 2)?.result?.tools ?? [];
  if (!init || tools.length === 0) {
    console.error('smoke: sin initialize o sin herramientas', out);
    process.exit(1);
  }
  const bad = tools.filter(
    (t) =>
      !t.description ||
      typeof t.annotations?.readOnlyHint !== 'boolean' ||
      typeof t.annotations?.destructiveHint !== 'boolean',
  );
  console.log(`smoke: ${init.serverInfo.name} (${init.protocolVersion}) → ${tools.length} herramientas`);
  if (bad.length) {
    console.error('smoke: sin description/annotations completas:', bad.map((t) => t.name).join(', '));
    process.exit(1);
  }
});

for (const m of [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
])
  p.stdin.write(JSON.stringify(m) + '\n');
p.stdin.end();

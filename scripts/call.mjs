// Llama a una herramienta del binario compilado por stdio, como lo haria Claude Code:
//   pnpm call list_labels '{}'
// Es la "llamada real por el protocolo" que cierra la verificacion de un cambio.
import { spawn } from 'node:child_process';

const [name, rawArgs = '{}'] = process.argv.slice(2);
if (!name) {
  console.error('uso: pnpm call <herramienta> [json-argumentos]');
  process.exit(2);
}
const p = spawn('node', ['dist/index.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
let out = '';
p.stdout.on('data', (d) => (out += d));
const timer = setTimeout(() => {
  p.kill();
  console.error('call: sin respuesta en 15s');
  process.exit(1);
}, 15000);
p.on('exit', () => {
  clearTimeout(timer);
  const reply = out
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((m) => m.id === 2);
  if (!reply) {
    console.error('call: sin respuesta', out);
    process.exit(1);
  }
  if (reply.error) {
    console.error('error de protocolo:', JSON.stringify(reply.error, null, 2));
    process.exit(1);
  }
  for (const c of reply.result.content ?? []) console.log(c.type === 'text' ? c.text : JSON.stringify(c));
  if (reply.result.isError) {
    console.error('(isError: true)');
    process.exit(1);
  }
});
for (const m of [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'call', version: '0' } },
  },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: JSON.parse(rawArgs) } },
])
  p.stdin.write(JSON.stringify(m) + '\n');
p.stdin.end();

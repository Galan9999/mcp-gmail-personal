import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { voiceGuide } from '../style.js';

export function registerVoicePrompt(server: McpServer): void {
  server.registerPrompt(
    'mi_voz',
    {
      title: 'Redactar con mi voz',
      description:
        'Las reglas de como escribo correos: que idioma elijo segun el interlocutor, los dos ' +
        'registros, que hago siempre y que no hago nunca. Leelo antes de redactar un borrador.',
    },
    async () => ({
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: await voiceGuide() } }],
    }),
  );
}

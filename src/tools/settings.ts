import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmailSignature, setGmailSignature } from '../gmail/settings.js';
import { signatureHtml } from '../style.js';
import { run } from './result.js';

export function registerSettings(server: McpServer): void {
  server.registerTool(
    'get_gmail_signature',
    {
      title: 'Leer la firma de Gmail',
      description:
        'Devuelve la firma configurada en los ajustes de Gmail para cada direccion de envio. ' +
        'Es la que Gmail añade sola en la web y el movil, distinta de la que adjunta create_draft.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => run(() => getGmailSignature()),
  );

  server.registerTool(
    'set_gmail_signature',
    {
      title: 'Escribir la firma de Gmail',
      description:
        'Sustituye la firma de la direccion principal en los ajustes de Gmail. Afecta a todo lo que ' +
        'envies desde cualquier cliente, no solo a lo que cree este servidor. Sin argumento usa ' +
        'style/firma.html del proyecto. La firma anterior no se guarda: leela antes con get_gmail_signature.',
      inputSchema: {
        html: z.string().optional().describe('HTML de la firma. Si se omite, usa style/firma.html'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      // Afecta a todos los clientes de correo del usuario: que Claude Code pregunte siempre.
      _meta: { 'anthropic/requiresUserInteraction': true },
    },
    async ({ html }) => run(async () => setGmailSignature(html ?? (await signatureHtml()))),
  );
}

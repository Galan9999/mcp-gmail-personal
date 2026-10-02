import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createFilter, deleteFilter, listFilters } from '../gmail/filters.js';
import { run } from './result.js';

export function registerFilters(server: McpServer): void {
  server.registerTool(
    'list_filters',
    {
      title: 'Listar los filtros de Gmail',
      description:
        'Las reglas permanentes de la cuenta: a que remitente o consulta aplican y que etiqueta ponen.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => run(() => listFilters()),
  );

  server.registerTool(
    'create_filter',
    {
      title: 'Crear un filtro de Gmail',
      description:
        'Crea una regla permanente que etiqueta el correo QUE LLEGUE A PARTIR DE AHORA. No toca lo ya ' +
        'recibido: para eso usa bulk_label. Pasa `remove` con INBOX si quieres que ademas no pare ' +
        'en Recibidos. Se deshace con delete_filter, pero las etiquetas ya puestas se quedan.',
      inputSchema: {
        from: z.string().optional().describe('Remitente o dominio, p. ej. wikiloc.com'),
        query: z
          .string()
          .optional()
          .describe('Consulta en sintaxis de Gmail, para casos que `from` no cubre'),
        subject: z.string().optional().describe('Texto que debe contener el asunto'),
        add: z.array(z.string()).default([]).describe('ids de etiqueta a poner'),
        remove: z.array(z.string()).default([]).describe('ids a quitar. INBOX archiva directamente'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ from, query, subject, add, remove }) =>
      run(() => {
        if (!from && !query && !subject) {
          throw new Error('Un filtro sin criterio casaria con todo. Pasa from, query o subject.');
        }
        return createFilter({ from, query, subject }, add, remove);
      }),
  );

  server.registerTool(
    'delete_filter',
    {
      title: 'Borrar un filtro',
      description:
        'Elimina una regla. Las etiquetas que ya puso siguen en los mensajes. Se rehace con create_filter.',
      inputSchema: { filter_id: z.string().describe('id devuelto por list_filters') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ filter_id }) => run(() => deleteFilter(filter_id)),
  );
}

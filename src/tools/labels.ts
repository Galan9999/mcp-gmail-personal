import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GMAIL_LABEL_COLORS } from '../generated/palette.js';
import {
  bulkModify,
  createLabel,
  listLabels,
  modifyLabels,
  renameLabel,
  setLabelColor,
} from '../gmail/labels.js';
import { listMessageIds } from '../gmail/messages.js';
import { labelPalette } from '../style.js';
import { run } from './result.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ADDITIVE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Gmail solo acepta una paleta cerrada; validar aqui ahorra una llamada que fallaria con un 400 opaco. */
function paletteColor(field: string, value: string): string {
  const hex = value.toLowerCase();
  if (!GMAIL_LABEL_COLORS.includes(hex)) {
    throw new Error(`${field}="${value}" no esta en la paleta de Gmail. Llama a list_label_colors.`);
  }
  return hex;
}

export function registerLabels(server: McpServer): void {
  server.registerTool(
    'list_labels',
    {
      title: 'Listar etiquetas',
      description: 'Lista las etiquetas de la cuenta, con su id y su nombre.',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => run(() => listLabels()),
  );

  server.registerTool(
    'list_label_colors',
    {
      title: 'Colores que Gmail acepta',
      description:
        'Gmail no acepta cualquier hex en una etiqueta: solo una paleta cerrada. Devuelve esa lista ' +
        'junto a la paleta con significado del proyecto (style/paleta.json).',
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () =>
      run(async () => {
        const { leyenda, etiquetas } = await labelPalette();
        return { permitidos: GMAIL_LABEL_COLORS, total: GMAIL_LABEL_COLORS.length, leyenda, etiquetas };
      }),
  );

  server.registerTool(
    'create_label',
    {
      title: 'Crear una etiqueta',
      description:
        'Crea una etiqueta nueva, opcionalmente con color. Una barra en el nombre la anida: ' +
        '"Ruido/Aerolineas" cuelga de "Ruido". Los colores deben estar en la paleta de Gmail.',
      inputSchema: {
        name: z.string().describe('Nombre. Usa / para anidar'),
        background_color: z.string().optional().describe('Hex de fondo, de la paleta permitida'),
        text_color: z.string().optional().describe('Hex de texto, de la paleta permitida'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ name, background_color, text_color }) =>
      run(() => {
        const color =
          background_color && text_color
            ? {
                backgroundColor: paletteColor('background_color', background_color),
                textColor: paletteColor('text_color', text_color),
              }
            : undefined;
        return createLabel(name, color);
      }),
  );

  server.registerTool(
    'rename_label',
    {
      title: 'Renombrar una etiqueta',
      description:
        'Cambia el nombre de una etiqueta conservando su id, su color y los mensajes que la llevan. ' +
        'Quitar o poner una barra la saca o la mete de otra: "Ruido/Aerolineas" -> "Aerolineas" la sube ' +
        'a primer nivel.',
      inputSchema: {
        label_id: z.string().describe('id de la etiqueta, p. ej. Label_7'),
        name: z.string().describe('Nombre nuevo. / anida'),
      },
      annotations: ADDITIVE,
    },
    async ({ label_id, name }) => run(() => renameLabel(label_id, name)),
  );

  server.registerTool(
    'set_label_color',
    {
      title: 'Colorear una etiqueta',
      description:
        'Cambia el color de una etiqueta tuya. Los dos colores deben estar en la paleta cerrada de ' +
        'Gmail: usa list_label_colors. Las etiquetas de sistema (INBOX, SENT, CATEGORY_*) no admiten color.',
      inputSchema: {
        label_id: z.string().describe('id de la etiqueta, p. ej. Label_4 (de list_labels)'),
        background_color: z.string().describe('Hex de fondo, de la paleta permitida'),
        text_color: z.string().describe('Hex de texto, de la paleta permitida'),
      },
      annotations: ADDITIVE,
    },
    async ({ label_id, background_color, text_color }) =>
      run(() =>
        setLabelColor(label_id, {
          backgroundColor: paletteColor('background_color', background_color),
          textColor: paletteColor('text_color', text_color),
        }),
      ),
  );

  server.registerTool(
    'modify_labels',
    {
      title: 'Poner y quitar etiquetas',
      description:
        'Aplica o retira etiquetas de un mensaje, por id de etiqueta (Label_4, no "Trabajo" — usa ' +
        'list_labels para traducir). Es reversible: lo que pongas se quita con la llamada inversa.',
      inputSchema: {
        message_id: z.string().describe('id del mensaje'),
        add: z.array(z.string()).default([]).describe('ids de etiqueta a poner'),
        remove: z.array(z.string()).default([]).describe('ids de etiqueta a quitar'),
      },
      annotations: ADDITIVE,
    },
    async ({ message_id, add, remove }) => run(() => modifyLabels(message_id, add, remove)),
  );

  server.registerTool(
    'bulk_label',
    {
      title: 'Etiquetar en bloque lo ya recibido',
      description:
        'Aplica etiquetas a TODO lo que case con una consulta de Gmail, en lotes de 1000 por llamada. ' +
        'Actua sobre el correo que YA tienes, al reves que create_filter, que solo mira lo que llegue. ' +
        'Con `dry_run` (por defecto) solo cuenta, no toca nada. Ponlo a false para aplicar.',
      inputSchema: {
        query: z.string().describe('Consulta en sintaxis de Gmail, p. ej. from:wikiloc.com'),
        add: z.array(z.string()).default([]).describe('ids de etiqueta a poner'),
        remove: z.array(z.string()).default([]).describe('ids a quitar. INBOX archiva'),
        dry_run: z.boolean().default(true).describe('true: solo cuenta cuantos casarian'),
      },
      annotations: ADDITIVE,
    },
    async ({ query, add, remove, dry_run }) =>
      run(async () => {
        const ids = await listMessageIds(query);
        if (dry_run) return { aplicado: false, casarian: ids.length, query };
        return { aplicado: true, modificados: await bulkModify(ids, add, remove), query };
      }),
  );
}

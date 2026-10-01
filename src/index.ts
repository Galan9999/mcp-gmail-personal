#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  createDraft,
  createFilter,
  createLabel,
  deleteFilter,
  getGmailSignature,
  listFilters,
  listLabels,
  modifyLabels,
  readDraft,
  readMessage,
  renameLabel,
  searchMessages,
  searchPage,
  sendDraft,
  setGmailSignature,
  setLabelColor,
  trashMessage,
  untrashMessage,
} from './gmail.js';
import { labelPalette, signatureHtml, voiceGuide } from './style.js';
import { GMAIL_LABEL_COLORS } from './generated/palette.js';

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const pendingSends = new Map<string, { draftId: string; to: string; expiresAt: number }>();

function stashConfirmation(draftId: string, to: string): string {
  const token = randomUUID();
  pendingSends.set(token, { draftId, to, expiresAt: Date.now() + CONFIRMATION_TTL_MS });
  return token;
}

function claimConfirmation(token: string): { draftId: string; to: string } {
  const entry = pendingSends.get(token);
  if (!entry) throw new Error('Token de confirmacion desconocido. Vuelve a llamar sin token para previsualizar.');
  pendingSends.delete(token);
  if (Date.now() > entry.expiresAt) {
    throw new Error('El token caduco a los 5 minutos. Vuelve a llamar sin token para previsualizar de nuevo.');
  }
  return entry;
}

const server = new McpServer({ name: 'gmail-personal', version: '0.1.0' });

function asText(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function asError(err: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
  };
}

server.registerTool(
  'search_emails',
  {
    title: 'Buscar correos',
    description:
      'Busca en la segunda cuenta de Gmail con la sintaxis nativa de Gmail ' +
      '(from:, subject:, is:unread, newer_than:7d...). Devuelve cabeceras y snippet, no el cuerpo.',
    inputSchema: {
      query: z.string().describe('Consulta en sintaxis de Gmail, p. ej. "is:unread from:banco"'),
      max_results: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, max_results }) => {
    try {
      return asText(await searchMessages(query, max_results));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'read_email',
  {
    title: 'Leer un correo',
    description: 'Devuelve el cuerpo completo en texto plano de un mensaje por su id.',
    inputSchema: { message_id: z.string().describe('id devuelto por search_emails') },
    annotations: { readOnlyHint: true },
  },
  async ({ message_id }) => {
    try {
      return asText(await readMessage(message_id));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'list_labels',
  {
    title: 'Listar etiquetas',
    description: 'Lista las etiquetas de la cuenta, con su id y su nombre.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      return asText(await listLabels());
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'create_draft',
  {
    title: 'Crear borrador',
    description:
      'Crea un borrador en la cuenta. No envia nada: el envio queda siempre en manos del humano. ' +
      'Pasa `html` para un correo maquetado (se manda multipart/alternative, con el texto plano ' +
      'como alternativa). La firma se adjunta sola salvo que pidas lo contrario. ' +
      'Antes de redactar, lee el prompt `mi_voz` para el idioma, registro y cierre.',
    inputSchema: {
      to: z.string().describe('Destinatario'),
      subject: z.string(),
      body: z.string().describe('Cuerpo en texto plano'),
      html: z.string().optional().describe('Cuerpo en HTML. Solo estilos inline: Gmail ignora <style>'),
      with_signature: z.boolean().default(true),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ to, subject, body, html, with_signature }) => {
    try {
      return asText({ draft_id: await createDraft(to, subject, body, html, with_signature) });
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'get_gmail_signature',
  {
    title: 'Leer la firma de Gmail',
    description:
      'Devuelve la firma configurada en los ajustes de Gmail para cada direccion de envio. ' +
      'Es la que Gmail añade sola en la web y el movil, distinta de la que adjunta create_draft.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      return asText(await getGmailSignature());
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'set_gmail_signature',
  {
    title: 'Escribir la firma de Gmail',
    description:
      'Sustituye la firma de la direccion principal en los ajustes de Gmail. Afecta a todo lo que ' +
      'envies desde cualquier cliente, no solo a lo que cree este servidor. Sin argumento usa ' +
      'style/firma.html del proyecto.',
    inputSchema: {
      html: z.string().optional().describe('HTML de la firma. Si se omite, usa style/firma.html'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  async ({ html }) => {
    try {
      return asText(await setGmailSignature(html ?? (await signatureHtml())));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'trash_email',
  {
    title: 'Mover un correo a la papelera',
    description:
      'Mueve un mensaje a la papelera de Gmail, igual que el boton de borrar de la interfaz. ' +
      'Es reversible: Gmail lo conserva 30 dias y untrash_email lo devuelve a su sitio. ' +
      'Este servidor no puede borrar de forma permanente.',
    inputSchema: { message_id: z.string().describe('id devuelto por search_emails') },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  },
  async ({ message_id }) => {
    try {
      return asText(await trashMessage(message_id));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'untrash_email',
  {
    title: 'Sacar un correo de la papelera',
    description: 'Deshace un trash_email: devuelve el mensaje desde la papelera a su ubicacion previa.',
    inputSchema: { message_id: z.string().describe('id del mensaje que esta en la papelera') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ message_id }) => {
    try {
      return asText(await untrashMessage(message_id));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'send_email',
  {
    title: 'Enviar un correo (dos fases)',
    description:
      'Envia un correo, en dos pasos obligatorios. SIN `confirmation_token` no envia nada: crea el ' +
      'borrador, lo devuelve para que el humano lo lea y entrega un token que caduca en 5 minutos. ' +
      'Solo una segunda llamada CON ese token envia, y envia exactamente ese borrador. ' +
      'Enviar no tiene vuelta atras: un correo no se puede retirar.',
    inputSchema: {
      to: z.string().optional().describe('Destinatario. Obligatorio en la primera fase'),
      subject: z.string().optional(),
      body: z.string().optional().describe('Cuerpo en texto plano'),
      html: z.string().optional().describe('Cuerpo en HTML opcional'),
      confirmation_token: z
        .string()
        .optional()
        .describe('Token devuelto por la primera fase. Solo pasalo si el humano ha dicho que si'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ to, subject, body, html, confirmation_token }) => {
    try {
      if (confirmation_token) {
        const { draftId, to: destino } = claimConfirmation(confirmation_token);
        const sent = await sendDraft(draftId);
        return asText({ enviado: true, a: destino, message_id: sent.messageId });
      }

      if (!to || !subject || !body) {
        return asError(new Error('Para previsualizar hacen falta to, subject y body.'));
      }

      const draftId = await createDraft(to, subject, body, html);
      const preview = await readDraft(draftId);
      return asText({
        enviado: false,
        aviso: 'NADA SE HA ENVIADO. Enseña esto al humano y espera su visto bueno explicito.',
        borrador: preview,
        confirmation_token: stashConfirmation(draftId, preview.to),
        caduca_en: '5 minutos',
      });
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'list_label_colors',
  {
    title: 'Colores que Gmail acepta',
    description:
      'Gmail no acepta cualquier hex en una etiqueta: solo una paleta cerrada. Devuelve esa lista ' +
      'junto a la paleta con significado del proyecto (style/paleta.json).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const { leyenda, etiquetas } = await labelPalette();
      return asText({ permitidos: GMAIL_LABEL_COLORS, total: GMAIL_LABEL_COLORS.length, leyenda, etiquetas });
    } catch (err) {
      return asError(err);
    }
  },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ label_id, background_color, text_color }) => {
    try {
      for (const [campo, valor] of [['background_color', background_color], ['text_color', text_color]] as const) {
        if (!GMAIL_LABEL_COLORS.includes(valor.toLowerCase())) {
          return asError(
            new Error(`${campo}="${valor}" no esta en la paleta de Gmail. Llama a list_label_colors.`),
          );
        }
      }
      return asText(await setLabelColor(label_id, background_color.toLowerCase(), text_color.toLowerCase()));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'search_page',
  {
    title: 'Buscar correos, pagina a pagina',
    description:
      'Como search_emails pero paginado: devuelve `next_page_token` cuando hay mas resultados. ' +
      'Pasalo en la siguiente llamada para seguir. Sin token, empieza por el principio.',
    inputSchema: {
      query: z.string(),
      max_results: z.number().int().min(1).max(100).default(50),
      page_token: z.string().optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, max_results, page_token }) => {
    try {
      const r = await searchPage(query, max_results, page_token);
      return asText({ mensajes: r.messages, next_page_token: r.nextPageToken ?? null });
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'modify_labels',
  {
    title: 'Poner y quitar etiquetas',
    description:
      'Aplica o retira etiquetas de un mensaje, por id de etiqueta (Label_4, no "Trabajo" — usa ' +
      'list_labels para traducir). Es reversible: lo que pongas se quita con la llamada inversa.',
    inputSchema: {
      message_id: z.string(),
      add: z.array(z.string()).default([]).describe('ids de etiqueta a poner'),
      remove: z.array(z.string()).default([]).describe('ids de etiqueta a quitar'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ message_id, add, remove }) => {
    try {
      return asText(await modifyLabels(message_id, add, remove));
    } catch (err) {
      return asError(err);
    }
  },
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
      background_color: z.string().optional(),
      text_color: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ name, background_color, text_color }) => {
    try {
      for (const v of [background_color, text_color]) {
        if (v && !GMAIL_LABEL_COLORS.includes(v.toLowerCase())) {
          return asError(new Error(`"${v}" no esta en la paleta de Gmail. Llama a list_label_colors.`));
        }
      }
      return asText(await createLabel(name, background_color?.toLowerCase(), text_color?.toLowerCase()));
    } catch (err) {
      return asError(err);
    }
  },
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ label_id, name }) => {
    try {
      return asText(await renameLabel(label_id, name));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'list_filters',
  {
    title: 'Listar los filtros de Gmail',
    description: 'Las reglas permanentes de la cuenta: a que remitente o consulta aplican y que etiqueta ponen.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      return asText(await listFilters());
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'create_filter',
  {
    title: 'Crear un filtro de Gmail',
    description:
      'Crea una regla permanente que etiqueta el correo QUE LLEGUE A PARTIR DE AHORA. No toca lo ya ' +
      'recibido: para eso usa modify_labels. Pasa `remove` con INBOX si quieres que ademas no pare ' +
      'en Recibidos. Se deshace con delete_filter, pero las etiquetas ya puestas se quedan.',
    inputSchema: {
      from: z.string().optional().describe('Remitente o dominio, p. ej. wikiloc.com'),
      query: z.string().optional().describe('Consulta en sintaxis de Gmail, para casos que `from` no cubre'),
      subject: z.string().optional(),
      add: z.array(z.string()).default([]).describe('ids de etiqueta a poner'),
      remove: z.array(z.string()).default([]).describe('ids a quitar. INBOX archiva directamente'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ from, query, subject, add, remove }) => {
    try {
      if (!from && !query && !subject) {
        return asError(new Error('Un filtro sin criterio casaria con todo. Pasa from, query o subject.'));
      }
      return asText(await createFilter({ from, query, subject }, add, remove));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerTool(
  'delete_filter',
  {
    title: 'Borrar un filtro',
    description: 'Elimina una regla. Las etiquetas que ya puso siguen en los mensajes.',
    inputSchema: { filter_id: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  async ({ filter_id }) => {
    try {
      return asText(await deleteFilter(filter_id));
    } catch (err) {
      return asError(err);
    }
  },
);

server.registerPrompt(
  'mi_voz',
  {
    title: 'Redactar con mi voz',
    description:
      'Las reglas de como escribo correos: que idioma elijo segun el interlocutor, los dos ' +
      'registros, que hago siempre y que no hago nunca. Leelo antes de redactar un borrador.',
  },
  async () => ({
    messages: [
      {
        role: 'user' as const,
        content: { type: 'text' as const, text: await voiceGuide() },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());

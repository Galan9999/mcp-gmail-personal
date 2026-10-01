#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createDraft,
  listLabels,
  readMessage,
  searchMessages,
  sendMessage,
  trashMessage,
  untrashMessage,
} from './gmail.js';

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
      'Crea un borrador en la cuenta. No envia nada: el envio queda siempre en manos del humano.',
    inputSchema: {
      to: z.string().describe('Destinatario'),
      subject: z.string(),
      body: z.string(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  async ({ to, subject, body }) => {
    try {
      return asText({ draft_id: await createDraft(to, subject, body) });
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
    title: 'Enviar un correo',
    description:
      'Envia un correo inmediatamente desde la cuenta. No tiene vuelta atras: una vez enviado ' +
      'no se puede retirar. Para dejarlo revisable por el humano, usa create_draft en su lugar.',
    inputSchema: {
      to: z.string().describe('Destinatario'),
      subject: z.string(),
      body: z.string(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ to, subject, body }) => {
    try {
      return asText(await sendMessage(to, subject, body));
    } catch (err) {
      return asError(err);
    }
  },
);

await server.connect(new StdioServerTransport());

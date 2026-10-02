import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createDraft, readDraft, sendDraft } from '../gmail/drafts.js';
import { createConfirmation } from './confirm.js';
import { run } from './result.js';

export function registerSend(server: McpServer): void {
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
        subject: z.string().describe('Asunto'),
        body: z.string().describe('Cuerpo en texto plano'),
        html: z.string().optional().describe('Cuerpo en HTML. Solo estilos inline: Gmail ignora <style>'),
        with_signature: z.boolean().default(true).describe('Adjuntar style/firma.html'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ to, subject, body, html, with_signature }) =>
      run(async () => ({
        draft_id: await createDraft({ to, subject, body, html, withSignature: with_signature }),
      })),
  );

  const pendingSends = createConfirmation<{ draftId: string; to: string }>();

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
        subject: z.string().optional().describe('Asunto. Obligatorio en la primera fase'),
        body: z.string().optional().describe('Cuerpo en texto plano. Obligatorio en la primera fase'),
        html: z.string().optional().describe('Cuerpo en HTML opcional'),
        confirmation_token: z
          .string()
          .optional()
          .describe('Token devuelto por la primera fase. Solo pasalo si el humano ha dicho que si'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      // Lo unico irreversible del servidor: Claude Code muestra el prompt de permiso en CADA llamada.
      _meta: { 'anthropic/requiresUserInteraction': true },
    },
    async ({ to, subject, body, html, confirmation_token }) =>
      run(async () => {
        if (confirmation_token) {
          const { draftId, to: destino } = pendingSends.claim(confirmation_token);
          const sent = await sendDraft(draftId);
          return { enviado: true, a: destino, message_id: sent.messageId };
        }
        if (!to || !subject || !body) throw new Error('Para previsualizar hacen falta to, subject y body.');
        const draftId = await createDraft({ to, subject, body, html });
        const preview = await readDraft(draftId);
        return {
          enviado: false,
          aviso: 'NADA SE HA ENVIADO. Enseña esto al humano y espera su visto bueno explicito.',
          borrador: preview,
          confirmation_token: pendingSends.stash({ draftId, to: preview.to }),
          caduca_en: '5 minutos',
        };
      }),
  );
}

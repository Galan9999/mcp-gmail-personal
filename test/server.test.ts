import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

// Cliente y servidor en el mismo proceso, unidos por un transporte en memoria.
// Pasa por serializacion, validacion de esquema y handshake: es el protocolo de verdad,
// sin levantar un proceso ni tocar Gmail (gmailClient() es perezoso y aqui nadie lo llama).
const client = new Client({ name: 'test', version: '0.0.0' });
const server = createServer();

beforeAll(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  await client.connect(clientSide);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const first = (result.content as { type: string; text?: string }[])[0];
  return first?.text ?? '';
}

describe('tools/list', () => {
  it('expone las 19 herramientas y todas declaran readOnlyHint', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(19);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, `${tool.name} sin readOnlyHint`).toBeTypeOf('boolean');
    }
  });

  it('toda herramienta declara los cuatro hints', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        expect(tool.annotations?.[hint], `${tool.name} sin ${hint}`).toBeTypeOf('boolean');
      }
    }
  });

  it('solo send_email sale de la cuenta (openWorldHint)', async () => {
    const { tools } = await client.listTools();
    expect(tools.filter((t) => t.annotations?.openWorldHint).map((t) => t.name)).toEqual(['send_email']);
  });

  it('lo irreversible o global exige interaccion humana en Claude Code', async () => {
    const { tools } = await client.listTools();
    const flagged = tools
      .filter((t) => t._meta?.['anthropic/requiresUserInteraction'] === true)
      .map((t) => t.name);
    expect(flagged.toSorted()).toEqual(['send_email', 'set_gmail_signature']);
  });

  it('send_email se declara destructiva y no idempotente', async () => {
    const { tools } = await client.listTools();
    const send = tools.find((t) => t.name === 'send_email');
    expect(send?.annotations).toMatchObject({ destructiveHint: true, idempotentHint: false });
  });
});

describe('tools/call sin Gmail', () => {
  it('list_label_colors devuelve la paleta cerrada y la leyenda del proyecto', async () => {
    const result = await client.callTool({ name: 'list_label_colors', arguments: {} });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(text(result)) as { permitidos: string[]; leyenda: string };
    expect(payload.permitidos.length).toBeGreaterThan(0);
    expect(payload.leyenda).toBeTypeOf('string');
  });

  it('send_email rechaza un token desconocido sin enviar nada', async () => {
    const result = await client.callTool({
      name: 'send_email',
      arguments: { confirmation_token: 'no-existe' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/desconocido/);
  });

  it('send_email sin token exige to, subject y body', async () => {
    const result = await client.callTool({ name: 'send_email', arguments: { to: 'a@b.c' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/to, subject y body/);
  });

  it('set_label_color rechaza un hex fuera de la paleta antes de llamar a Gmail', async () => {
    const result = await client.callTool({
      name: 'set_label_color',
      arguments: { label_id: 'Label_1', background_color: '#123456', text_color: '#000000' },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/list_label_colors/);
  });

  it('create_filter sin criterio no crea un filtro que case con todo', async () => {
    const result = await client.callTool({ name: 'create_filter', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/from, query o subject/);
  });
});

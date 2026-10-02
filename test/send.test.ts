import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type * as GmailModule from '../src/gmail/drafts.js';

// Doblamos solo la capa que habla con Gmail. El servidor, el protocolo y la logica
// de dos fases son los de verdad.
vi.mock('../src/gmail/drafts.js', async (importOriginal) => ({
  ...(await importOriginal<typeof GmailModule>()),
  createDraft: vi.fn(async () => 'draft_1'),
  readDraft: vi.fn(async () => ({ to: 'ana@example.com', subject: 'Hola', preview: 'Cuerpo' })),
  sendDraft: vi.fn(async () => ({ messageId: 'msg_1', threadId: 'thr_1' })),
}));

const { createServer } = await import('../src/server.js');
const gmail = await import('../src/gmail/drafts.js');

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

async function call(args: Record<string, unknown>) {
  const result = await client.callTool({ name: 'send_email', arguments: args });
  const raw = (result.content as { text?: string }[])[0]?.text ?? '';
  // Los errores de negocio llegan como texto plano; los exitos, como JSON.
  const payload: unknown = result.isError ? null : JSON.parse(raw);
  return { isError: Boolean(result.isError), raw, payload };
}

describe('send_email en dos fases', () => {
  it('sin token crea el borrador, no envia y devuelve un token', async () => {
    const { isError, payload } = await call({ to: 'ana@example.com', subject: 'Hola', body: 'Cuerpo' });
    expect(isError).toBe(false);
    expect(payload).toMatchObject({ enviado: false, borrador: { to: 'ana@example.com' } });
    expect((payload as { confirmation_token: string }).confirmation_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(gmail.sendDraft).not.toHaveBeenCalled();
  });

  it('con el token envia exactamente ese borrador, y el token se consume', async () => {
    const first = await call({ to: 'ana@example.com', subject: 'Hola', body: 'Cuerpo' });
    const token = (first.payload as { confirmation_token: string }).confirmation_token;

    const second = await call({ confirmation_token: token });
    expect(second.isError).toBe(false);
    expect(second.payload).toMatchObject({ enviado: true, a: 'ana@example.com', message_id: 'msg_1' });
    expect(gmail.sendDraft).toHaveBeenCalledWith('draft_1');

    const third = await call({ confirmation_token: token });
    expect(third.isError).toBe(true);
    expect(third.raw).toMatch(/desconocido/);
  });
});

import { google, type gmail_v1 } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';

export type MessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

let cached: gmail_v1.Gmail | null = null;

export async function gmailClient(): Promise<gmail_v1.Gmail> {
  if (!cached) {
    cached = google.gmail({ version: 'v1', auth: await getAuthenticatedClient() });
  }
  return cached;
}

function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  const match = payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return match?.value ?? '';
}

function decode(data: string | null | undefined): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function flattenBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  const fromChildren = (part.parts ?? []).map(flattenBody).filter(Boolean);
  if (fromChildren.length > 0) return fromChildren.join('\n\n');
  if (part.mimeType === 'text/html' && part.body?.data) {
    return decode(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

export async function searchMessages(query: string, maxResults: number): Promise<MessageSummary[]> {
  const gmail = await gmailClient();
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));

  return Promise.all(
    ids.map(async (id) => {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      return {
        id,
        threadId: data.threadId ?? '',
        from: header(data.payload, 'From'),
        subject: header(data.payload, 'Subject'),
        date: header(data.payload, 'Date'),
        snippet: data.snippet ?? '',
      };
    }),
  );
}

export async function readMessage(messageId: string): Promise<MessageSummary & { body: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return {
    id: messageId,
    threadId: data.threadId ?? '',
    from: header(data.payload, 'From'),
    subject: header(data.payload, 'Subject'),
    date: header(data.payload, 'Date'),
    snippet: data.snippet ?? '',
    body: flattenBody(data.payload),
  };
}

export async function listLabels(): Promise<{ id: string; name: string }[]> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  return (data.labels ?? []).map((l) => ({ id: l.id ?? '', name: l.name ?? '' }));
}

export async function createDraft(to: string, subject: string, body: string): Promise<string> {
  const gmail = await gmailClient();
  const mime = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw: Buffer.from(mime, 'utf8').toString('base64url') } },
  });
  return data.id ?? '';
}

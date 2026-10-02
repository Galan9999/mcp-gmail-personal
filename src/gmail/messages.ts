import type { gmail_v1 } from 'googleapis';
import { gmailClient, mapLimited, rateLimited, withRetry } from './client.js';
import { flattenBody, header } from './mime.js';

export type MessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

export type MessagePage = { messages: MessageSummary[]; nextPageToken?: string };

async function summarize(gmail: gmail_v1.Gmail, id: string): Promise<MessageSummary> {
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
}

export async function searchPage(
  query: string,
  maxResults: number,
  pageToken?: string,
): Promise<MessagePage> {
  const gmail = await gmailClient();
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults, pageToken });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  const messages = await mapLimited(ids, (id) => summarize(gmail, id));
  return { messages, nextPageToken: list.data.nextPageToken ?? undefined };
}

export async function searchMessages(query: string, maxResults: number): Promise<MessageSummary[]> {
  return (await searchPage(query, maxResults)).messages;
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

/** Todos los ids que casan con la consulta, pagina a pagina. Solo ids: cuesta 5 unidades por pagina. */
export async function listMessageIds(query: string): Promise<string[]> {
  const gmail = await gmailClient();
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await withRetry(() =>
      rateLimited(() => gmail.users.messages.list({ userId: 'me', q: query, maxResults: 500, pageToken })),
    );
    for (const m of data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

export async function trashMessage(messageId: string): Promise<{ id: string; labels: string[] }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.messages.trash({ userId: 'me', id: messageId });
  return { id: messageId, labels: data.labelIds ?? [] };
}

export async function untrashMessage(messageId: string): Promise<{ id: string; labels: string[] }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.messages.untrash({ userId: 'me', id: messageId });
  return { id: messageId, labels: data.labelIds ?? [] };
}

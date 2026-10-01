import { google, type gmail_v1 } from 'googleapis';
import { getAuthenticatedClient } from './auth.js';
import { signatureHtml, signatureText } from './style.js';

export type MessageSummary = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};



// Gmail limita a 250 unidades de cuota por usuario y segundo, y un messages.get cuesta 5.
// Reintentar no arregla pasarse de ritmo: hay que espaciar las peticiones.
const UNITS_PER_SECOND = 100;
const UNITS_PER_READ = 5;
const MIN_GAP_MS = Math.ceil(1000 / (UNITS_PER_SECOND / UNITS_PER_READ));

let nextSlot = 0;

async function rateLimited<R>(fn: () => Promise<R>): Promise<R> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  return fn();
}

const MAX_CONCURRENT = 5;

async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await withRetry(() => rateLimited(() => fn(items[i] as T)));
    }
  });
  await Promise.all(workers);
  return out;
}

async function withRetry<R>(fn: () => Promise<R>, attempts = 4): Promise<R> {
  let waitMs = 1000;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: number }).code;
      const quota = code === 429 || code === 403;
      if (!quota || i >= attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, waitMs));
      waitMs *= 2;
    }
  }
}

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

  return mapLimited(ids, async (id) => {
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
  });
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

function encodeMessage(to: string, subject: string, body: string): string {
  const mime = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

export async function createDraft(
  to: string,
  subject: string,
  body: string,
  html?: string,
  withSignature = true,
): Promise<string> {
  const gmail = await gmailClient();
  const boundary = `lp_${Date.now().toString(36)}`;

  const plain = withSignature ? `${body}\n\n--\n${await signatureText()}` : body;
  const rich = html
    ? withSignature
      ? `${html}\n<br>\n${await signatureHtml()}`
      : html
    : undefined;

  const headers = [
    `To: ${to}`,
    `Subject: =?utf-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
  ];

  const mime = rich
    ? [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        plain,
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202124;line-height:1.5;">${rich}</div>`,
        `--${boundary}--`,
      ].join('\r\n')
    : [...headers, 'Content-Type: text/plain; charset=utf-8', '', plain].join('\r\n');

  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw: Buffer.from(mime, 'utf8').toString('base64url') } },
  });
  return data.id ?? '';
}

export async function getGmailSignature(): Promise<{ email: string; signature: string }[]> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' });
  return (data.sendAs ?? []).map((a) => ({
    email: a.sendAsEmail ?? '',
    signature: a.signature ?? '',
  }));
}

export async function setGmailSignature(html: string): Promise<{ email: string; length: number }> {
  const gmail = await gmailClient();
  const { data: list } = await gmail.users.settings.sendAs.list({ userId: 'me' });
  const primary = (list.sendAs ?? []).find((a) => a.isPrimary) ?? (list.sendAs ?? [])[0];
  if (!primary?.sendAsEmail) throw new Error('No encuentro la direccion principal de envio.');
  const { data } = await gmail.users.settings.sendAs.patch({
    userId: 'me',
    sendAsEmail: primary.sendAsEmail,
    requestBody: { signature: html },
  });
  return { email: primary.sendAsEmail, length: (data.signature ?? '').length };
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

export async function sendDraft(draftId: string): Promise<{ messageId: string; threadId: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
  return { messageId: data.id ?? '', threadId: data.threadId ?? '' };
}

export async function readDraft(draftId: string): Promise<{ to: string; subject: string; preview: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'full' });
  const payload = data.message?.payload;
  return {
    to: header(payload, 'To'),
    subject: header(payload, 'Subject'),
    preview: flattenBody(payload).slice(0, 400),
  };
}

export async function setLabelColor(
  labelId: string,
  backgroundColor: string,
  textColor: string,
): Promise<{ id: string; name: string; backgroundColor: string; textColor: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.patch({
    userId: 'me',
    id: labelId,
    requestBody: { color: { backgroundColor, textColor } },
  });
  return {
    id: data.id ?? labelId,
    name: data.name ?? '',
    backgroundColor: data.color?.backgroundColor ?? '',
    textColor: data.color?.textColor ?? '',
  };
}

export async function modifyLabels(
  messageId: string,
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<{ id: string; labels: string[] }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
  return { id: messageId, labels: data.labelIds ?? [] };
}

export async function searchPage(
  query: string,
  maxResults: number,
  pageToken?: string,
): Promise<{ messages: MessageSummary[]; nextPageToken?: string }> {
  const gmail = await gmailClient();
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults, pageToken });
  const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));

  const messages = await mapLimited(ids, async (id) => {
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
  });
  return { messages, nextPageToken: list.data.nextPageToken ?? undefined };
}

export async function createLabel(
  name: string,
  backgroundColor?: string,
  textColor?: string,
): Promise<{ id: string; name: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
      ...(backgroundColor && textColor ? { color: { backgroundColor, textColor } } : {}),
    },
  });
  return { id: data.id ?? '', name: data.name ?? name };
}

export async function renameLabel(labelId: string, name: string): Promise<{ id: string; name: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody: { name } });
  return { id: data.id ?? labelId, name: data.name ?? name };
}

export type FilterSummary = {
  id: string;
  from?: string;
  query?: string;
  addLabelIds: string[];
  removeLabelIds: string[];
};

function toSummary(f: gmail_v1.Schema$Filter): FilterSummary {
  return {
    id: f.id ?? '',
    from: f.criteria?.from ?? undefined,
    query: f.criteria?.query ?? undefined,
    addLabelIds: f.action?.addLabelIds ?? [],
    removeLabelIds: f.action?.removeLabelIds ?? [],
  };
}

export async function listFilters(): Promise<FilterSummary[]> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.settings.filters.list({ userId: 'me' });
  return (data.filter ?? []).map(toSummary);
}

export async function createFilter(
  criteria: { from?: string; query?: string; subject?: string },
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<FilterSummary> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.settings.filters.create({
    userId: 'me',
    requestBody: { criteria, action: { addLabelIds, removeLabelIds } },
  });
  return toSummary(data);
}

export async function deleteFilter(filterId: string): Promise<{ id: string }> {
  const gmail = await gmailClient();
  await gmail.users.settings.filters.delete({ userId: 'me', id: filterId });
  return { id: filterId };
}

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

export async function bulkModify(
  ids: string[],
  addLabelIds: string[],
  removeLabelIds: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const gmail = await gmailClient();
  for (let i = 0; i < ids.length; i += 1000) {
    const lote = ids.slice(i, i + 1000);
    await withRetry(() =>
      gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: lote, addLabelIds, removeLabelIds },
      }),
    );
  }
  return ids.length;
}

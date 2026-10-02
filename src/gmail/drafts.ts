import { signatureHtml, signatureText } from '../style.js';
import { gmailClient } from './client.js';
import { buildMime, flattenBody, header } from './mime.js';

export type DraftInput = {
  to: string;
  subject: string;
  body: string;
  html?: string;
  withSignature?: boolean;
};
export type DraftPreview = { to: string; subject: string; preview: string };

export async function createDraft({
  to,
  subject,
  body,
  html,
  withSignature = true,
}: DraftInput): Promise<string> {
  const gmail = await gmailClient();
  const text = withSignature ? `${body}\n\n--\n${await signatureText()}` : body;
  const rich = html && withSignature ? `${html}\n<br>\n${await signatureHtml()}` : html;
  const { data } = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { raw: buildMime({ to, subject, text, html: rich }) } },
  });
  return data.id ?? '';
}

export async function readDraft(draftId: string): Promise<DraftPreview> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.drafts.get({ userId: 'me', id: draftId, format: 'full' });
  const payload = data.message?.payload;
  return {
    to: header(payload, 'To'),
    subject: header(payload, 'Subject'),
    preview: flattenBody(payload).slice(0, 400),
  };
}

export async function sendDraft(draftId: string): Promise<{ messageId: string; threadId: string }> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
  return { messageId: data.id ?? '', threadId: data.threadId ?? '' };
}

import { gmailClient } from './client.js';

export async function getGmailSignature(): Promise<{ email: string; signature: string }[]> {
  const gmail = await gmailClient();
  const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' });
  return (data.sendAs ?? []).map((a) => ({ email: a.sendAsEmail ?? '', signature: a.signature ?? '' }));
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

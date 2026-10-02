import type { gmail_v1 } from 'googleapis';

// Construir y leer MIME. Es la unica parte de la capa Gmail que no llama a la red: se testea sola.

export type MimeInput = { to: string; subject: string; text: string; html?: string };

const HTML_WRAPPER_STYLE =
  'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#202124;line-height:1.5;';

function encodeSubject(subject: string): string {
  return `=?utf-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

/**
 * Mensaje en base64url como lo espera drafts.create: texto plano, o multipart/alternative
 * con el texto plano como alternativa cuando hay html.
 */
export function buildMime(
  { to, subject, text, html }: MimeInput,
  boundary = `lp_${Date.now().toString(36)}`,
): string {
  const headers = [`To: ${to}`, `Subject: ${encodeSubject(subject)}`, 'MIME-Version: 1.0'];
  const lines = html
    ? [
        ...headers,
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        text,
        `--${boundary}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        `<div style="${HTML_WRAPPER_STYLE}">${html}</div>`,
        `--${boundary}--`,
      ]
    : [...headers, 'Content-Type: text/plain; charset=utf-8', '', text];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

export function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  const match = payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return match?.value ?? '';
}

export function decode(data: string | null | undefined): string {
  return data ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

/** Aplana un multipart a texto plano; si solo hay html, le quita las etiquetas. */
export function flattenBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
  const fromChildren = (part.parts ?? []).map(flattenBody).filter(Boolean);
  if (fromChildren.length > 0) return fromChildren.join('\n\n');
  if (part.mimeType === 'text/html' && part.body?.data) {
    return decode(part.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

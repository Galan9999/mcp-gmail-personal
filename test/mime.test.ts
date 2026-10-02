import { describe, expect, it } from 'vitest';
import { buildMime, flattenBody } from '../src/gmail/mime.js';

const b64 = (s: string) => Buffer.from(s).toString('base64url');

function decodeMime(raw: string): string {
  return Buffer.from(raw, 'base64url').toString('utf8');
}

describe('buildMime', () => {
  it('texto plano: cabeceras, asunto codificado en utf-8 y cuerpo', () => {
    const mime = decodeMime(buildMime({ to: 'ana@example.com', subject: 'Año nuevo', text: 'Hola' }));
    expect(mime).toContain('To: ana@example.com');
    expect(mime).toContain(`Subject: =?utf-8?B?${Buffer.from('Año nuevo').toString('base64')}?=`);
    expect(mime).toContain('Content-Type: text/plain; charset=utf-8\r\n\r\nHola');
    expect(mime).not.toContain('multipart');
  });

  it('con html: multipart/alternative con el texto plano como primera alternativa', () => {
    const mime = decodeMime(
      buildMime({ to: 'a@b.c', subject: 'x', text: 'plano', html: '<b>rico</b>' }, 'B1'),
    );
    expect(mime).toContain('Content-Type: multipart/alternative; boundary="B1"');
    expect(mime.indexOf('plano')).toBeLessThan(mime.indexOf('<b>rico</b>'));
    expect(mime).toContain('--B1--');
  });
});

describe('flattenBody', () => {
  it('prefiere text/plain y une las partes', () => {
    const body = flattenBody({
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64('uno') } },
        { mimeType: 'text/html', body: { data: b64('<p>dos</p>') } },
      ],
    });
    expect(body).toBe('uno\n\ndos');
  });

  it('si solo hay html, descarta el CSS y los comentarios enteros, no solo sus etiquetas', () => {
    const html =
      '<html><head><style>body { margin: 0; } a:hover { color: red; }</style></head>' +
      '<body><!-- preheader -->&nbsp;&zwnj;&nbsp;<p>Hello Carles,</p><script>track()</script><p>confirm your occupation.</p></body></html>';
    expect(flattenBody({ mimeType: 'text/html', body: { data: b64(html) } })).toBe(
      'Hello Carles, confirm your occupation.',
    );
  });

  it('si solo hay html, quita las etiquetas', () => {
    expect(flattenBody({ mimeType: 'text/html', body: { data: b64('<p>Hola  <b>mundo</b></p>') } })).toBe(
      'Hola mundo',
    );
  });
});

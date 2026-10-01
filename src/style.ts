import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STYLE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'style');

async function load(name: string): Promise<string> {
  return (await readFile(join(STYLE_DIR, name), 'utf8')).trim();
}

export async function voiceGuide(): Promise<string> {
  return load('voz.md');
}

export async function signatureHtml(): Promise<string> {
  const raw = await load('firma.html');
  return raw.replace(/<!--[\s\S]*?-->/g, '').trim();
}

export async function signatureText(): Promise<string> {
  const html = await signatureHtml();
  return html
    .replace(/<a [^>]*href="mailto:([^"]+)"[^>]*>.*?<\/a>/gi, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;|·/g, '·')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

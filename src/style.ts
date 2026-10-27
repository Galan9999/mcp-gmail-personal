import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STYLE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'style');

// Primero el .local (tus datos, fuera de git), si no la plantilla versionada.
async function load(name: string): Promise<string> {
  const local = name.replace(/\.([^.]+)$/, '.local.$1');
  for (const candidate of [local, name]) {
    try {
      return (await readFile(join(STYLE_DIR, candidate), 'utf8')).trim();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  throw new Error(`No encuentro style/${name} ni style/${local}`);
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

export type PaletteEntry = { backgroundColor: string; textColor: string; porque: string };

export async function labelPalette(): Promise<{ leyenda: string; etiquetas: Record<string, PaletteEntry> }> {
  const raw = JSON.parse(await load('paleta.json')) as {
    _leyenda: string;
    etiquetas: Record<string, PaletteEntry>;
  };
  return { leyenda: raw._leyenda, etiquetas: raw.etiquetas };
}

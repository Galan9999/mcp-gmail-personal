import { google, type gmail_v1 } from 'googleapis';
import { getAuthenticatedClient } from '../auth.js';

// Gmail limita a 250 unidades de cuota por usuario y segundo, y un messages.get cuesta 5.
// Reintentar no arregla pasarse de ritmo: hay que espaciar las peticiones EN ORIGEN.
const UNITS_PER_SECOND = 100;
const UNITS_PER_READ = 5;
const MIN_GAP_MS = Math.ceil(1000 / (UNITS_PER_SECOND / UNITS_PER_READ));
const MAX_CONCURRENT = 5;

let nextSlot = 0;

/** Reserva un hueco en la linea de tiempo y espera hasta el. Una sola cola para todo el proceso. */
export async function rateLimited<R>(fn: () => Promise<R>): Promise<R> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + MIN_GAP_MS;
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
  return fn();
}

/** Reintenta solo errores de cuota (429/403) con espera exponencial. Lo demas se propaga tal cual. */
export async function withRetry<R>(fn: () => Promise<R>, attempts = 4): Promise<R> {
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

/** map con concurrencia acotada; cada llamada pasa por el limitador y los reintentos. */
export async function mapLimited<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
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

let cached: gmail_v1.Gmail | null = null;

/** Cliente autenticado, creado la primera vez que se necesita: arrancar el servidor no toca Gmail. */
export async function gmailClient(): Promise<gmail_v1.Gmail> {
  if (!cached) {
    cached = google.gmail({ version: 'v1', auth: await getAuthenticatedClient() });
  }
  return cached;
}

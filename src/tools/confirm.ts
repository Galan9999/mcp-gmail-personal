import { randomUUID } from 'node:crypto';

/**
 * Confirmacion en dos fases para lo irreversible. Sin token: previsualiza y devuelve un token.
 * Con token: ejecuta exactamente lo previsualizado. El token es opaco (UUID), caduca y se consume.
 * Protege frente al modelo; para que una persona vea siempre el prompt, la herramienta lleva
 * ademas `_meta: { 'anthropic/requiresUserInteraction': true }`.
 */
export function createConfirmation<T>(ttlMs = 5 * 60 * 1000) {
  const pending = new Map<string, { payload: T; expiresAt: number }>();
  const minutes = Math.round(ttlMs / 60_000);
  return {
    stash(payload: T): string {
      const token = randomUUID();
      pending.set(token, { payload, expiresAt: Date.now() + ttlMs });
      return token;
    },
    claim(token: string): T {
      const entry = pending.get(token);
      if (!entry)
        throw new Error('Token de confirmacion desconocido. Vuelve a llamar sin token para previsualizar.');
      pending.delete(token);
      if (Date.now() > entry.expiresAt) {
        throw new Error(
          `El token caduco a los ${minutes} minutos. Vuelve a llamar sin token para previsualizar de nuevo.`,
        );
      }
      return entry.payload;
    },
  };
}

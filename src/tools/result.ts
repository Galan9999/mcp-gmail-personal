import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function asText(payload: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

export function asError(err: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
  };
}

/**
 * El unico try/catch del proyecto. Un error de negocio vuelve como `isError: true` con un
 * mensaje que diga que hacer a continuacion: el modelo lo lee y se corrige.
 */
export async function run(fn: () => unknown): Promise<CallToolResult> {
  try {
    return asText(await fn());
  } catch (err) {
    return asError(err);
  }
}

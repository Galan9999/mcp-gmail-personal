import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerVoicePrompt } from './prompts/voice.js';
import { registerFilters } from './tools/filters.js';
import { registerLabels } from './tools/labels.js';
import { registerMessages } from './tools/messages.js';
import { registerSend } from './tools/send.js';
import { registerSettings } from './tools/settings.js';

export const SERVER_NAME = 'gmail-personal';
export const SERVER_VERSION = '0.1.0';

/** Monta el servidor con cada dominio. Es una funcion para que los tests lo conecten a un transporte en memoria. */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerMessages(server);
  registerLabels(server);
  registerFilters(server);
  registerSettings(server);
  registerSend(server);
  registerVoicePrompt(server);
  return server;
}

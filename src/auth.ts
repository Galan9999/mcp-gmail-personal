import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];

const CONFIG_DIR = join(homedir(), '.config', 'mcp-gmail-personal');
const TOKEN_PATH = join(CONFIG_DIR, 'token.json');
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH ?? join(CONFIG_DIR, 'credentials.json');
const REDIRECT_PORT = 4477;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

type InstalledCredentials = {
  installed?: { client_id: string; client_secret: string };
  web?: { client_id: string; client_secret: string };
};

async function buildClient(): Promise<OAuth2Client> {
  const raw = await readFile(CREDENTIALS_PATH, 'utf8').catch(() => {
    throw new Error(
      `No encuentro las credenciales OAuth en ${CREDENTIALS_PATH}. ` +
        'Descarga el JSON del cliente OAuth desde Google Cloud Console y guardalo ahi.',
    );
  });
  const parsed = JSON.parse(raw) as InstalledCredentials;
  const keys = parsed.installed ?? parsed.web;
  if (!keys) throw new Error(`${CREDENTIALS_PATH} no tiene la clave "installed" ni "web".`);
  return new google.auth.OAuth2(keys.client_id, keys.client_secret, REDIRECT_URI);
}

async function readToken(): Promise<Record<string, unknown> | null> {
  const raw = await readFile(TOKEN_PATH, 'utf8').catch(() => null);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

async function persistToken(token: unknown): Promise<void> {
  await mkdir(dirname(TOKEN_PATH), { recursive: true });
  await writeFile(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
}

export async function authorizeInteractively(): Promise<void> {
  const client = await buildClient();
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404).end();
        return;
      }
      const received = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<p>${received ? 'Listo, ya puedes cerrar esta pestana.' : `Error: ${error}`}</p>`);
      server.close();
      received ? resolve(received) : reject(new Error(error ?? 'sin codigo'));
    });
    server.listen(REDIRECT_PORT, () => {
      console.log('\nAbre esta URL en el navegador con la SEGUNDA cuenta de Gmail:\n');
      console.log(authUrl + '\n');
    });
  });

  const { tokens } = await client.getToken(code);
  await persistToken(tokens);
  console.log(`Token guardado en ${TOKEN_PATH}`);
}

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const client = await buildClient();
  const token = await readToken();
  if (!token) {
    throw new Error('Sin token. Ejecuta `pnpm build && pnpm auth` para autorizar la cuenta.');
  }
  client.setCredentials(token);
  client.on('tokens', (fresh) => {
    void persistToken({ ...token, ...fresh });
  });
  return client;
}

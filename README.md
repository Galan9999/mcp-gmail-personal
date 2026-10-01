# mcp-gmail-personal

Servidor MCP propio, escrito desde cero en TypeScript, que expone una **segunda cuenta de Gmail**
como herramientas de Claude Code. No es un conector de Anthropic ni de Google: es código tuyo,
arrancado como proceso local y hablando el protocolo por stdio.

## Por qué existe

El Gmail que ya tienes conectado es un MCP remoto de Google (`gmailmcp.googleapis.com`) con una
sola cuenta por OAuth. Este proyecto resuelve la segunda cuenta y, de paso, sirve para aprender
cómo se construye un MCP por dentro.

## Anatomía

| Fichero | Qué hace |
|---|---|
| `src/index.ts` | El servidor MCP. Declara las 4 herramientas con `registerTool` y se conecta por `StdioServerTransport`. |
| `src/gmail.ts` | Envoltorio fino sobre la Gmail API. Decodifica base64url y aplana los `multipart` a texto plano. |
| `src/auth.ts` | OAuth2 con loopback en `localhost:4477`. Guarda el token en `~/.config/mcp-gmail-personal/token.json` con permisos `600`. |
| `src/auth-cli.ts` | El `pnpm auth`: abre el consentimiento una sola vez. |

Las tres piezas del protocolo que conviene mirar en el código:

1. **Transport** — stdio. El cliente lanza tu proceso y hablan JSON-RPC línea a línea por las
   tuberías. Por eso `console.log` en `index.ts` rompería el canal: los logs van a `stderr`.
2. **`tools/list`** — el SDK deriva el JSON Schema de cada herramienta desde el `inputSchema` de
   Zod. Lo que escribas en `description` es literalmente lo que el modelo lee para decidir.
3. **`tools/call`** — el callback devuelve `content[]`. Un fallo se marca con `isError: true`, no
   lanzando una excepción.

## Puesta en marcha

Hay un paso que no puede hacer nadie más que tú, porque es tu cuenta de Google:

1. [Google Cloud Console](https://console.cloud.google.com/) → crea un proyecto (p. ej. `mcp-gmail-personal`).
2. **APIs y servicios → Biblioteca** → habilita **Gmail API**.
3. **Pantalla de consentimiento OAuth** → tipo *Externo* → añade tu segunda cuenta en *Usuarios de prueba*.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo **Aplicación de escritorio**.
5. Añade el URI de redirección `http://localhost:4477/oauth2callback`.
6. Descarga el JSON y guárdalo en `~/.config/mcp-gmail-personal/credentials.json`.

Luego:

```bash
pnpm install
pnpm build
pnpm auth        # abre la URL con la SEGUNDA cuenta y acepta
```

## Herramientas

| Herramienta | Alcance |
|---|---|
| `search_emails` | Lectura. Sintaxis nativa de Gmail (`is:unread`, `from:`, `newer_than:7d`). |
| `read_email` | Lectura. Cuerpo completo en texto plano. |
| `list_labels` | Lectura. |
| `create_draft` | Escritura, pero **solo borradores**. Enviar se queda fuera a propósito: el envío lo decide un humano. |

Los scopes pedidos son `gmail.readonly` y `gmail.compose`. No se pide `gmail.send` ni
`gmail.modify`, así que el servidor no puede enviar ni borrar aunque se lo pidas.

## Depurar

```bash
pnpm inspect     # MCP Inspector: ver tools/list y llamar a mano
```

## Siguientes pasos para aprender

- Añadir un **resource** (`server.registerResource`) que exponga un hilo como documento.
- Añadir un **prompt** (`server.registerPrompt`), p. ej. "resume mi bandeja de hoy".
- Paginar `search_emails` con `nextPageToken` en vez de un `max_results` tope.
